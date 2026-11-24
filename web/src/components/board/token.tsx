/**
 * Sapludu — player token with professional board-game movement.
 *
 * Movement style (v0.6.0): GROUND-LEVEL GLIDE.
 * - the pawn is always visually attached to the board surface — no vertical
 *   translation, no scaling, no bounce, no drop-from-above at any point
 * - normal movement: position glides square by square (driven by the fx
 *   sequencer via the tokenOverride channel)
 * - ladder/snake choreography: position is overridden per-frame by the fx
 *   sequencer (board-fx) and rendered directly without springs
 * - active player: pulsing halo + rotating dashed ring (surface-level ring
 *   around the pawn — no vertical motion)
 * - overshoot: comic head-shake (rotation only — no vertical translation)
 */
"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { animMs, useUiStore } from "@/stores/ui-store";
import { useBoardFxStore } from "./fx-store";
import type { TokenColor } from "@sapludu/engine/types";

export const TOKEN_COLORS: Record<TokenColor, { base: string; dark: string; ring: string }> = {
  red: { base: "#ef4444", dark: "#b91c1c", ring: "#fecaca" },
  green: { base: "#22c55e", dark: "#15803d", ring: "#bbf7d0" },
  yellow: { base: "#facc15", dark: "#a16207", ring: "#fef08a" },
  purple: { base: "#a855f7", dark: "#7e22ce", ring: "#e9d5ff" },
};

const STACK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-1.6, -1.1],
  [1.6, -1.1],
  [0, -2.2],
];

function PawnSvg({ color, active }: { color: TokenColor; active: boolean }) {
  const c = TOKEN_COLORS[color];
  return (
    <svg viewBox="0 0 40 44" className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
      <ellipse cx="20" cy="41" rx="12" ry="3" fill="rgba(0,0,0,0.25)" />
      {/* glossy pawn body */}
      <path
        d="M20 6c5 0 9 4 9 9 0 3.4-1.9 6.3-4.7 7.9C28.5 25.6 31 29.5 32 36H8c1-6.5 3.5-10.4 7.7-13.1A9 9 0 0 1 11 15c0-5 4-9 9-9z"
        fill={c.base}
        stroke={active ? "#fff" : c.dark}
        strokeWidth={active ? 3 : 2}
      />
      {/* subtle side shading */}
      <path
        d="M23.4 8.1A9 9 0 0 1 26 22.9C29.6 25.7 31.2 30 32 36h-4.4c-.7-5.4-2.3-9.3-5.4-12.1A8.9 8.9 0 0 0 23.4 8.1z"
        fill={c.dark}
        opacity="0.35"
      />
      {/* friendly face */}
      <circle cx="16.5" cy="13.5" r="2.2" fill="#fff" opacity="0.9" />
      <circle cx="23.5" cy="13.5" r="2.2" fill="#fff" opacity="0.9" />
      <circle cx="17" cy="14" r="1.1" fill="#1f2937" />
      <circle cx="24" cy="14" r="1.1" fill="#1f2937" />
      <path d="M20 17.5l-2 1.6h4z" fill="#be123c" />
      {active && (
        <circle cx="20" cy="20" r="17" fill="none" stroke={c.ring} strokeWidth="2.5" strokeDasharray="4 3" className="sapludu-halo">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 20 20"
            to="360 20 20"
            dur="6s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}

export function Token({
  index,
  color,
  x,
  y,
  position,
  stacked,
  active,
}: {
  index: number;
  color: TokenColor;
  x: number; // percent
  y: number; // percent
  /** square number — syncs the ref when the authoritative state changes */
  position: number;
  stacked: number; // stacking offset index
  active: boolean;
}) {
  const speed = useUiStore((s) => s.animation);
  const glideMs = animMs(speed, 175);

  // fx override (glide / ladder climb / snake swallow) — token follows the sequencer
  const override = useBoardFxStore((s) => (s.tokenOverride && s.tokenOverride.playerIndex === index ? s.tokenOverride : null));
  const pulse = useBoardFxStore((s) => (s.tokenPulse && s.tokenPulse.playerIndex === index ? s.tokenPulse : null));

  const controls = useAnimationControls();
  const lastPos = useRef<number>(position);

  // keep the ref in sync when the authoritative state moves the pawn while
  // this component was NOT overridden (state syncs, new games, corrections).
  // NOTE: intentionally NO squash/bounce/hop keyframes here — the pawn must
  // never translate vertically or deform outside of ground-level gliding.
  useEffect(() => {
    lastPos.current = position;
  }, [position]);

  // overshoot shake — rotation only, stays flat on the board
  useEffect(() => {
    if (!pulse) return;
    if (pulse.kind === "shake") {
      void controls.start({
        rotate: [0, -8, 8, -8, 0],
        transition: { duration: 0.45, ease: "easeInOut" },
      });
    }
    // "bounce" is intentionally not animated anymore (no vertical movement)
  }, [pulse, controls]);

  const size = 6.4; // percent of board
  const [dx, dy] = STACK_OFFSETS[stacked % STACK_OFFSETS.length];

  if (override) {
    // sequencer-driven rendering (no spring, exact per-frame coordinates)
    const px = override.x - size / 2;
    const py = override.y - size * 0.78;
    // grounded shadow: rides exactly under the pawn along the board surface
    const shadowY = override.shadowY ?? override.y;
    const strength = override.shadowStrength ?? 0;
    return (
      <>
        {strength > 0.01 && !override.hidden && (
          <div
            className="pointer-events-none absolute z-30 rounded-full bg-black/45 blur-[2px]"
            style={{
              left: `${override.x - size * 0.3}%`,
              top: `${shadowY - size * 0.12}%`,
              width: `${size * 0.6}%`,
              height: `${size * 0.24}%`,
              opacity: strength,
              willChange: "opacity, transform",
            }}
            aria-hidden
          />
        )}
        <div
          className="absolute z-40"
          style={{
            left: `${px}%`,
            top: `${py}%`,
            width: `${size}%`,
            height: `${size}%`,
            transform: `scale(${override.scale}) rotate(${override.rotation}deg)`,
            transformOrigin: "50% 78%",
            opacity: override.hidden ? 0 : 1,
            willChange: "transform",
          }}
          aria-hidden
        >
          <PawnSvg color={color} active={active} />
        </div>
      </>
    );
  }

  const px = x + dx - size / 2;
  const py = y + dy - size * 0.78;

  // This branch MOUNTS a brand-new element every time the fx sequencer hands the pawn back (end of a move) and when
  // the board first renders. A freshly mounted absolutely-positioned element has no left/top yet, so without an
  // explicit `initial` Framer Motion starts from the container's top-left corner and animates down to the square —
  // the "pawn falls from the sky" glitch. Mounting exactly where the glide ended (the square centre, without the
  // fan-out offset) means nothing travels in from anywhere; only the tiny stack fan-out offset (if any) eases in.
  const startX = x - size / 2;
  const startY = y - size * 0.78;

  return (
    <motion.div
      initial={{ left: `${startX}%`, top: `${startY}%` }}
      animate={{ left: `${px}%`, top: `${py}%` }}
      transition={{ duration: Math.max(glideMs, 120) / 1000, ease: "easeInOut" }}
      className="absolute z-20"
      style={{ width: `${size}%`, height: `${size}%`, willChange: "left, top" }}
      aria-hidden
    >
      <motion.div animate={controls} className="h-full w-full" style={{ transformOrigin: "50% 90%" }}>
        <PawnSvg color={color} active={active} />
      </motion.div>
    </motion.div>
  );
}
