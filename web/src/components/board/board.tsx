/**
 * Sapludu board — 10x10 zigzag checkerboard with realistic SVG snakes,
 * themed ladders and animated player tokens.
 *
 * Rendering layers (bottom → top):
 *   squares → theme décor (stars/grid) → ladders → snakes → goal →
 *   step-glow → vignette → tokens
 *
 * The active board theme (board-themes.ts) only changes COLORS and décor —
 * square numbering (1–100, zigzag), snake/ladder geometry, token coordinates
 * and every game rule are identical in all ten designs.
 *
 * Animation visuals are driven by the isolated fx-store; the authoritative
 * GameState positions are never derived from animation progress.
 */
"use client";

import { useMemo } from "react";
import { DEFAULT_BOARD, squareCenter } from "@sapludu/engine/board";
import type { GameState } from "@sapludu/engine/types";
import { getBoardTheme, hexLuminance, squareColorAt } from "@/lib/board-themes";
import { useT } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { useBoardFxStore } from "./fx-store";
import { Snake } from "./snake";
import { Ladder } from "./ladder";
import { Token, TOKEN_COLORS } from "./token";

export { TOKEN_COLORS };

/** Deterministic PRNG (module scope — pure, no render-phase reassignment). */
function starRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 4294967296) / 4294967296;
  };
}

/** Deterministic star field for the space theme (same dots on every client). */
function StarField() {
  const stars = useMemo(() => {
    const rnd = starRng(20260114);
    return Array.from({ length: 46 }, () => ({
      x: rnd() * 98 + 1,
      y: rnd() * 98 + 1,
      r: rnd() * 0.32 + 0.1,
      o: rnd() * 0.5 + 0.25,
      warm: rnd() > 0.82,
    }));
  }, []);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[9] h-full w-full"
      aria-hidden
    >
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill={st.warm ? "#fde68a" : "#e2e8f0"} opacity={st.o} />
      ))}
      {/* two small "planets" for flavor */}
      <circle cx="88.5" cy="10.5" r="3.4" fill="#7c3aed" opacity="0.5" />
      <circle cx="88.5" cy="10.5" r="3.4" fill="none" stroke="#c4b5fd" strokeWidth="0.22" opacity="0.55" />
      <circle cx="10.5" cy="88.5" r="2.2" fill="#f472b6" opacity="0.45" />
    </svg>
  );
}

/** Static neon grid décor for the neon theme (pure CSS, zero repaint cost). */
function NeonGrid() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[9]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(34,197,94,0.06) 0px, rgba(34,197,94,0.06) 1px, transparent 1px, transparent 10%), repeating-linear-gradient(90deg, rgba(34,197,94,0.06) 0px, rgba(34,197,94,0.06) 1px, transparent 1px, transparent 10%)",
      }}
      aria-hidden
    />
  );
}

/** Snakes + ladders SVG layer, colored by the active theme. */
function OverlaysSvg({ reduced }: { reduced: boolean }) {
  const themeId = useUiStore((s) => s.boardTheme);
  const theme = useMemo(() => getBoardTheme(themeId), [themeId]);
  const { snakes, ladders } = DEFAULT_BOARD;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden
    >
      {/* ladders under snakes (matching the classic board layering) */}
      {ladders.map((l) => (
        <Ladder key={`l${l.from}`} from={l.from} to={l.to} style={theme.ladders} />
      ))}
      {snakes.map((s, i) => (
        <Snake
          key={`s${s.from}`}
          from={s.from}
          to={s.to}
          paletteIndex={i}
          palette={theme.snakePalettes[i % theme.snakePalettes.length]}
          reduced={reduced}
        />
      ))}
    </svg>
  );
}

/**
 * Step illumination — briefly lights the square a token just landed on so
 * every hop of a move is clearly countable. Visual-only (fx-store driven).
 * The CSS animation fades itself out (`forwards`), so no local state or
 * timers are needed: a new pulse simply remounts the element via its key.
 */
function SquareGlowOverlay() {
  const glow = useBoardFxStore((s) => s.squareGlow);
  if (!glow) return null;
  const c = squareCenter(glow.square);
  return (
    <div
      key={glow.id}
      className="sapludu-step-glow pointer-events-none absolute z-[13] rounded-[18%]"
      style={{
        left: `${c.x}%`,
        top: `${c.y}%`,
        width: "10%",
        height: "10%",
        transform: "translate(-50%, -50%)",
      }}
      aria-hidden
    />
  );
}

/**
 * "Step k of N" counter — announces every square a move covers, so players
 * can literally READ that a dice of 4 moves exactly 4 squares. Visual-only
 * (fx-store driven); rendered as a floating chip pinned to the board top.
 */
function MoveProgressChip({ players }: { players: GameState["players"] }) {
  const progress = useBoardFxStore((s) => s.moveProgress);
  const t = useT();
  if (!progress) return null;
  const color = players[progress.playerIndex]?.color ?? "red";
  const c = TOKEN_COLORS[color];
  const done = progress.total > 0 && progress.step >= progress.total;
  const countText = done
    ? t("game.arrivedMoved").replace("{n}", String(progress.total))
    : t("game.stepOf")
        .replace("{k}", String(Math.max(progress.step, 1)))
        .replace("{n}", String(progress.total));
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1.5 z-[16] -translate-x-1/2"
      aria-live="polite"
      aria-label={`Step ${progress.step} of ${progress.total}`}
    >
      <div
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black shadow-lg backdrop-blur sm:text-xs ${
          done ? "bg-emerald-600/95 text-white" : "bg-white/95 text-gray-800"
        }`}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80"
          style={{ backgroundColor: c.base }}
          aria-hidden
        />
        <span>{countText}</span>
        {!done && (
          <span className="font-semibold text-gray-500">
            {t("game.stepDice").replace("{n}", String(progress.dice))}
          </span>
        )}
      </div>
    </div>
  );
}

export function Board({ state }: { state: GameState }) {
  const animationSetting = useUiStore((s) => s.animation);
  const themeId = useUiStore((s) => s.boardTheme);
  const reducedFx = animationSetting === "reduced";
  const theme = useMemo(() => getBoardTheme(themeId), [themeId]);

  // group tokens per square for stacking offsets
  const bySquare = useMemo(() => {
    const map = new Map<number, number[]>(); // square -> playerIndexes
    state.players.forEach((p, i) => {
      const arr = map.get(p.position) ?? [];
      arr.push(i);
      map.set(p.position, arr);
    });
    return map;
  }, [state.players]);

  const squares = useMemo(() => Array.from({ length: 100 }, (_, i) => i + 1), []);

  // traditional zigzag: square 100 sits at the TOP-LEFT corner (row 10 runs
  // right→left) — markers must sit on the true square centers, not the corner
  const goal = squareCenter(100);
  const start = squareCenter(1);

  return (
    <div
      className="w-full rounded-3xl p-1.5 sm:p-2"
      style={{ background: theme.backdrop }}
      data-board-theme={theme.id}
    >
      <div
        className={`@container relative aspect-square w-full overflow-hidden rounded-2xl border-4 ${
          reducedFx ? "fx-reduced" : ""
        }`}
        style={{
          borderColor: theme.frame.border,
          background: theme.frame.bg,
          boxShadow: theme.frame.shadow,
        }}
        role="img"
        aria-label="Sapludu 10 by 10 game board"
      >
        {/* squares */}
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
          {squares.map((sq) => {
            // display numbering bottom-up: row index in CSS grid = 9 - engine row
            const engineRow = Math.floor((sq - 1) / 10);
            const forward = engineRow % 2 === 0;
            const col = forward ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
            const gridIdx = (9 - engineRow) * 10 + col;
            const color = squareColorAt(theme, sq);
            const lightText = hexLuminance(color) < 0.5;
            return (
              <div
                key={sq}
                data-square={sq}
                style={{
                  order: gridIdx,
                  backgroundColor: color,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset -1px -1px 2px rgba(0,0,0,0.10)",
                }}
                className="relative flex items-start justify-end"
              >
              </div>
            );
          })}
        </div>

        {/* theme décor under the graphics */}
        {theme.fx?.stars && <StarField />}
        {theme.fx?.neon && <NeonGrid />}

        <OverlaysSvg reduced={reducedFx} />

        {/* square numbers sit ABOVE snakes and ladders (with a halo) so every number stays readable */}
        <div className="pointer-events-none absolute inset-0 z-[11] grid grid-cols-10 grid-rows-10" aria-hidden>
          {squares.map((sq) => {
            const engineRow = Math.floor((sq - 1) / 10);
            const forward = engineRow % 2 === 0;
            const col = forward ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
            const gridIdx = (9 - engineRow) * 10 + col;
            const lightText = hexLuminance(squareColorAt(theme, sq)) < 0.5;
            return (
              <div key={sq} style={{ order: gridIdx }} className="flex items-start justify-end">
                <span
                  className="select-none pr-1 pt-0.5 font-bold leading-none text-[clamp(8px,2cqw,12px)]"
                  style={{
                    color: lightText ? "rgba(255,255,255,0.96)" : "rgba(17,24,39,0.9)",
                    textShadow: lightText
                      ? "0 0 2px rgba(0,0,0,0.7), 0 0 3px rgba(0,0,0,0.5)"
                      : "0 0 2px rgba(255,255,255,0.95), 0 0 4px rgba(255,255,255,0.8)",
                  }}
                >
                  {sq}
                </span>
              </div>
            );
          })}
        </div>

        {/* step illumination while the token walks its path */}
        <SquareGlowOverlay />

        {/* "Step k of N" counter for the moving token */}
        <MoveProgressChip players={state.players} />

        {/* goal marker — pinned to square 100's true center (top-left) */}
        <div
          className="pointer-events-none absolute z-[15] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `${goal.x}%`, top: `${goal.y}%`, width: "8.6%", height: "8.6%" }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full"
            style={{
              backgroundImage: `linear-gradient(to bottom right, ${theme.goal.from}, ${theme.goal.to})`,
              boxShadow: `0 2px 6px ${theme.goal.shadow}, 0 0 0 2px ${theme.goal.ring}, inset 0 1px 2px rgba(255,255,255,0.6)`,
            }}
          >
            <span className="text-sm drop-shadow sm:text-base" title="Goal 100">🏆</span>
          </div>
        </div>

        {/* start marker on square 1 */}
        <div
          className="pointer-events-none absolute z-[14] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${start.x}%`, top: `${start.y + 3.2}%` }}
        >
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide shadow-sm sm:text-[9px]"
            style={{ backgroundColor: theme.startBadge.bg, color: theme.startBadge.text }}
          >
            start
          </span>
        </div>

        {/* ambient depth vignette — sits under tokens, above the graphics */}
        {theme.vignette && (
          <div
            className="pointer-events-none absolute inset-0 z-[12]"
            style={{ background: theme.vignette }}
            aria-hidden
          />
        )}

        {/* tokens */}
        {state.players.map((p, i) => {
          const center = squareCenter(p.position);
          const stackIndex = (bySquare.get(p.position) ?? []).indexOf(i);
          const active = state.status === "active" && state.current === i;
          return (
            <Token
              key={p.id}
              index={i}
              color={p.color}
              x={center.x}
              y={center.y}
              position={p.position}
              stacked={stackIndex}
              active={active}
            />
          );
        })}
      </div>
    </div>
  );
}
