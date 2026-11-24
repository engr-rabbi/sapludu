/**
 * Sapludu — board animation sequencer.
 *
 * Drives the *visual* choreography for moves using requestAnimationFrame
 * timelines. These functions NEVER touch game logic: the authoritative
 * positions are applied by the stores (game-store / online-store) before and
 * after the sequence, so animation progress can never influence game rules.
 *
 * Movement style (v0.6.0): GROUND-LEVEL GLIDE.
 * The token stays visually attached to the board surface at all times:
 * - it slides square by square along the exact board path (straight lines
 *   between square centers — horizontal and vertical segments only),
 * - constant size (scale 1) and constant orientation (rotation 0),
 * - NO vertical arc, NO squash & stretch, NO landing bounce, NO bobbing —
 *   the old "hop up and drop down onto the square" feel is gone,
 * - a short, consistent still pause separates consecutive squares,
 * - the square a token just reached briefly illuminates so every step is
 *   countable, and the "Step k of N" counter announces each arrival.
 *
 * Special choreography (kept, drop-free):
 * - playLadderClimb  — token aligns to the ladder and glides along the true
 *   ladder line rung by rung (no vertical bouncing), then settles on top.
 * - playSnakeSwallow — the snake head excites, opens its mouth, the token
 *   slips in, a visible bulge travels down the body, and the token emerges
 *   from the tail and settles on the destination square. Family-friendly.
 *
 * Accessibility: sequences are skipped entirely when the user picks the
 * "reduced" animation setting or the OS prefers-reduced-motion is set.
 */

"use client";

import { useBoardFxStore } from "@/components/board/fx-store";
import { getLadderGeom, getSnakeSpine, headOutward, sampleSpine } from "@sapludu/engine/board-geometry";
import { squareCenter } from "@sapludu/engine/board";
import {
  DICE_TUMBLE_MS,
  FAST_SPEED,
  HOP_MS,
  LANDING_PAUSE_MS,
  MOVE_SETTLE_MS,
  STEP_PAUSE_MS,
} from "@/lib/animation/timings";
import { sound } from "@/lib/sound";
import { useUiStore } from "@/stores/ui-store";

type AbortCheck = () => boolean;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function prefersOsReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Resolve the effective motion preference (explicit setting + OS setting). */
export function isReducedMotion(): boolean {
  const setting = useUiStore.getState().animation;
  if (setting === "reduced") return true;
  if (setting === "fast") return false;
  return prefersOsReducedMotion();
}

function speedScale(): number {
  return useUiStore.getState().animation === "fast" ? FAST_SPEED : 1;
}

/** Constant soft ground shadow — keeps the pawn grounded without any air/depth tricks. */
const GROUNDED_SHADOW = 0.26;

/* ------------------------------------------------------------------ */
/* Square-by-square ground glide                                       */
/* ------------------------------------------------------------------ */

/**
 * Walk the token along the engine-confirmed hop path, one square at a time,
 * gliding ACROSS THE BOARD SURFACE (never through the air).
 *
 * Visual choreography only — the authoritative GameState is applied by the
 * calling store AFTER this resolves (or is aborted). Per frame the moving
 * token is driven through the fx tokenOverride channel, so no other board
 * element re-renders.
 *
 * Per step:
 *   - position glides from the current square center to the next with a
 *     symmetric ease (smooth departure, smooth arrival),
 *   - the token keeps size 1 and rotation 0 for its whole journey,
 *   - a soft constant shadow stays directly under the pawn,
 *   - a step sound plays when the pawn leaves each square,
 *   - the reached square briefly illuminates so every step is countable,
 *   - the "Step k of N" counter is announced for every square,
 *   - a short consistent pause (STEP_PAUSE_MS) separates consecutive squares,
 *   - the move ends with a still settle (no bounce, no drop).
 *
 * @param dice   the engine dice value for this move — used only for the
 *               visual "Step k of N" counter; never influences positions
 */
export async function playMoveHops(
  playerIndex: number,
  fromSq: number,
  hops: number[],
  abort: AbortCheck,
  onStep?: (square: number) => void,
  dice = hops.length
): Promise<void> {
  // accessibility: reduced motion = place the token on the confirmed square
  // instantly, without any choreography
  const { setTokenOverride, pulseSquare, setMoveProgress } = useBoardFxStore.getState();
  if (isReducedMotion()) {
    if (!abort() && hops.length > 0) onStep?.(hops[hops.length - 1]);
    return;
  }
  if (hops.length === 0 || abort()) return;

  // one counter for the whole move: total squares this dice pays for
  setMoveProgress({ playerIndex, step: 0, total: hops.length, dice });
  const glideMs = HOP_MS * speedScale();
  const pauseMs = STEP_PAUSE_MS * speedScale();
  const start = squareCenter(fromSq);
  let aborted = false;

  try {
    // park the token exactly on the start square — grounded, full size
    setTokenOverride({
      playerIndex,
      x: start.x,
      y: start.y,
      rotation: 0,
      scale: 1,
      hidden: false,
      shadowY: start.y + 0.9,
      shadowStrength: GROUNDED_SHADOW,
    });

    let current = start;
    for (let i = 0; i < hops.length; i++) {
      if (abort()) {
        aborted = true;
        return;
      }
      const target = squareCenter(hops[i]);

      sound.play("hop");

      await timeline(glideMs, (t) => {
        const k = easeInOut(t);
        const x = lerp(current.x, target.x, k);
        const y = lerp(current.y, target.y, k);
        setTokenOverride({
          playerIndex,
          x,
          y,
          rotation: 0,
          scale: 1,
          hidden: false,
          shadowY: y + 0.9,
          shadowStrength: GROUNDED_SHADOW,
        });
      }, abort);
      if (abort()) {
        aborted = true;
        return;
      }
      current = target;

      // arrived: illuminate the square, announce the step, notify listeners
      pulseSquare(hops[i]);
      setMoveProgress({ playerIndex, step: i + 1, total: hops.length, dice });
      onStep?.(hops[i]);

      // consistent still beat between squares so players can count every step
      if (i < hops.length - 1) {
        const done = await timeline(pauseMs, () => {
          /* still pause — the pawn stays planted on the square */
        }, abort);
        if (!done) {
          aborted = true;
          return;
        }
      }
    }

    if (abort()) {
      aborted = true;
      return;
    }

    // arrival moment: a still settle on the final square — no bounce, no drop.
    // The final square glow + LANDING_PAUSE give the arrival its weight.
    await timeline(MOVE_SETTLE_MS * speedScale(), () => {}, abort);
    if (abort()) {
      aborted = true;
      return;
    }

    // brief, consistent landing beat so the final square registers before
    // any banner / celebration choreography begins
    await timeline(LANDING_PAUSE_MS * speedScale(), () => {}, abort);
    if (abort()) aborted = true;
  } finally {
    setMoveProgress(null);
    // On success the override is intentionally LEFT in place at the final
    // square: the calling store applies the authoritative state and releases
    // the override in the same tick, so there is never a frame where the
    // pawn flickers back to its pre-move square. On abort we clean up.
    if (aborted) clearTokenFor(playerIndex);
  }
}

/** Wait for the dice tumble to land before the movement choreography starts. */
export async function waitForDiceLanding(abort: AbortCheck): Promise<void> {
  const reduced = isReducedMotion();
  const ms = reduced ? 80 : DICE_TUMBLE_MS * speedScale();
  if (ms <= 0) return;
  await timeline(ms, () => {
    /* passive wait — the Dice3D component owns the tumble visuals */
  }, abort);
}


/**
 * rAF timeline. Calls onFrame(0..1) each frame, resolves true when completed
 * or false when the abort check fires (game resync / new game).
 */
function timeline(durationMs: number, onFrame: (t: number) => void, abort: AbortCheck): Promise<boolean> {
  return new Promise((resolve) => {
    if (durationMs <= 0) {
      if (!abort()) onFrame(1);
      resolve(!abort());
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      if (abort()) {
        resolve(false);
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      onFrame(t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve(true);
      }
    };
    requestAnimationFrame(step);
  });
}

function clearTokenFor(playerIndex: number) {
  const st = useBoardFxStore.getState();
  if (st.tokenOverride?.playerIndex === playerIndex) st.setTokenOverride(null);
}

/* ------------------------------------------------------------------ */
/* Ladder climb                                                        */
/* ------------------------------------------------------------------ */

export async function playLadderClimb(playerIndex: number, footSq: number, topSq: number, abort: AbortCheck): Promise<void> {
  // accessibility: skip the choreography entirely for reduced motion
  if (isReducedMotion()) return;
  const geo = getLadderGeom(footSq, topSq);
  const { setTokenOverride, setLadderFx } = useBoardFxStore.getState();
  const foot = squareCenter(footSq);
  const top = squareCenter(topSq);
  const s = speedScale();

  const alignMs = 140 * s;
  const perRungMs = 170 * s;
  const settleMs = 200 * s;

  setLadderFx({ from: footSq });
  try {
    // 1) align: token tilts to match the ladder angle (orientation only)
    await timeline(alignMs, (t) => {
      setTokenOverride({
        playerIndex,
        x: foot.x,
        y: foot.y,
        rotation: geo.tiltDeg * easeOut(t),
        scale: 1,
        hidden: false,
        shadowY: foot.y + 0.9,
        shadowStrength: GROUNDED_SHADOW,
      });
    }, abort);

    // 2) climb: glide smoothly ALONG the ladder line, rung sound per rung.
    //    No vertical hop, no sway — the pawn rides the rails exactly.
    let lastRung = -1;
    await timeline(perRungMs * geo.rungCount, (t) => {
      const prog = easeInOut(t) * geo.rungCount;
      const rung = Math.floor(prog);
      if (rung > lastRung && rung < geo.rungCount) {
        lastRung = rung;
        sound.play("rung");
      }
      const along = clamp01(prog / geo.rungCount);
      const p = geo.pointAt(along);
      setTokenOverride({
        playerIndex,
        x: p.x,
        y: p.y,
        rotation: geo.tiltDeg,
        scale: 1,
        hidden: false,
        shadowY: p.y + 0.9,
        shadowStrength: GROUNDED_SHADOW,
      });
    }, abort);

    // 3) settle: straighten up on the top square — still, no squash
    await timeline(settleMs, (t) => {
      setTokenOverride({
        playerIndex,
        x: top.x,
        y: top.y,
        rotation: geo.tiltDeg * (1 - easeOut(t)),
        scale: 1,
        hidden: false,
        shadowY: top.y + 0.9,
        shadowStrength: GROUNDED_SHADOW,
      });
    }, abort);
  } finally {
    const st = useBoardFxStore.getState();
    if (st.ladderFx?.from === footSq) st.setLadderFx(null);
    // On success the override stays parked exactly on the top square; the
    // calling store applies the authoritative state and releases the override
    // in the same tick (never a frame where the pawn slides back down).
    if (abort()) clearTokenFor(playerIndex);
  }
}

/* ------------------------------------------------------------------ */
/* Snake swallow                                                       */
/* ------------------------------------------------------------------ */

export async function playSnakeSwallow(playerIndex: number, headSq: number, tailSq: number, abort: AbortCheck): Promise<void> {
  // accessibility: skip the choreography entirely for reduced motion
  if (isReducedMotion()) return;
  const geo = getSnakeSpine(headSq, tailSq);
  const { setSnakeFx, setTokenOverride } = useBoardFxStore.getState();
  const out = headOutward(geo);
  const head = geo.head;
  const mouth = { x: head.x + out.x * 0.95, y: head.y + out.y * 0.95 };
  const tailTip = { x: geo.tail.x, y: geo.tail.y };
  const nearTail = sampleSpine(geo, 0.955);
  const s = speedScale();

  const T = {
    excite: 430 * s,
    capture: 330 * s,
    travel: 1250 * s,
    emerge: 430 * s,
    settle: 260 * s,
  };

  try {
    // 1) excite: the snake notices the token — head sways, mouth starts opening
    await timeline(T.excite, (t) => {
      setSnakeFx({ from: headSq, mouthOpen: easeOut(t) * 0.55, bulgeT: null, excite: 1 });
    }, abort);

    // 2) capture: mouth opens fully, the token slips into the jaws
    await timeline(T.capture, (t) => {
      setSnakeFx({ from: headSq, mouthOpen: 0.55 + easeInOut(t) * 0.45, bulgeT: null, excite: 0.85 });
      const k = easeInOut(t);
      setTokenOverride({
        playerIndex,
        x: lerp(head.x, mouth.x, k),
        y: lerp(head.y, mouth.y, k),
        rotation: 0,
        scale: 1 - 0.42 * k,
        hidden: false,
      });
    }, abort);
    sound.play("gulp");

    // 3) travel: token is inside — a bulge glides along the body toward the tail
    await timeline(T.travel, (t) => {
      setSnakeFx({
        from: headSq,
        mouthOpen: Math.max(0, 1 - t * 2.8),
        bulgeT: 0.05 + easeInOut(t) * 0.9,
        excite: Math.max(0, 0.85 - t * 2),
      });
      setTokenOverride({
        playerIndex,
        x: mouth.x,
        y: mouth.y,
        rotation: 0,
        scale: 0.58,
        hidden: true,
      });
    }, abort);

    // 4) emerge: the token slides out of the tail tip and regains full size
    await timeline(T.emerge, (t) => {
      setSnakeFx({
        from: headSq,
        mouthOpen: 0,
        bulgeT: t < 0.35 ? 0.96 - t * 0.04 : null,
        excite: 0,
      });
      const k = easeOut(t);
      setTokenOverride({
        playerIndex,
        x: lerp(nearTail.x, tailTip.x, k),
        y: lerp(nearTail.y, tailTip.y, k),
        rotation: 0,
        scale: 0.4 + 0.6 * k,
        hidden: false,
      });
    }, abort);
    if (!abort()) sound.play("emerge");

    // 5) settle: still on the destination square — no squash, no drop
    await timeline(T.settle, (t) => {
      setTokenOverride({
        playerIndex,
        x: tailTip.x,
        y: tailTip.y,
        rotation: 0,
        scale: 1,
        hidden: false,
      });
      void t;
    }, abort);
  } finally {
    const st = useBoardFxStore.getState();
    if (st.snakeFx?.from === headSq) st.setSnakeFx(null);
    // On success the override stays parked exactly on the tail square; the
    // calling store applies the authoritative state and releases the override
    // in the same tick (never a frame where the pawn jumps back to the head).
    if (abort()) clearTokenFor(playerIndex);
  }
}
