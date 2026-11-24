/**
 * Sapludu — static board preview thumbnail.
 *
 * A lightweight, NON-interactive rendering of a board theme: same 10×10
 * zigzag checkerboard, same snake/ladder geometry (simplified strokes for
 * performance), same pawn style. Used by the board gallery and the setup
 * screens. No fx-store subscriptions, no animations — 10 previews stay cheap
 * even on low-end Android devices.
 */
"use client";

import { useMemo } from "react";
import { DEFAULT_BOARD, squareCenter } from "@sapludu/engine/board";
import { getLadderGeom, getSnakeSpine } from "@sapludu/engine/board-geometry";
import { hexLuminance, squareColorAt, type BoardTheme } from "@/lib/board-themes";

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Simplified snake silhouette (single tapered stroke + head). */
function PreviewSnake({
  from,
  to,
  seed,
  theme,
}: {
  from: number;
  to: number;
  seed: number;
  theme: BoardTheme;
}) {
  const pal = theme.snakePalettes[seed % theme.snakePalettes.length];
  const d = useMemo(() => {
    const geo = getSnakeSpine(from, to, seed);
    return geo.samples
      .filter((_, i) => i % 6 === 0)
      .map((s, i) => `${i === 0 ? "M" : "L"} ${fmt(s.x)} ${fmt(s.y)}`)
      .join(" ");
  }, [from, to, seed]);
  const head = useMemo(() => squareCenter(from), [from]);

  return (
    <g aria-hidden>
      <path d={d} fill="none" stroke={pal.outline} strokeWidth="2.6" strokeLinecap="round" />
      <path d={d} fill="none" stroke={pal.base1} strokeWidth="1.7" strokeLinecap="round" />
      <path d={d} fill="none" stroke={pal.light} strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />
      {/* head */}
      <circle cx={fmt(head.x)} cy={fmt(head.y)} r="1.7" fill={pal.base1} stroke={pal.outline} strokeWidth="0.35" />
      <circle cx={fmt(head.x + 0.45)} cy={fmt(head.y - 0.35)} r="0.3" fill="#fff" />
      <circle cx={fmt(head.x + 0.5)} cy={fmt(head.y - 0.33)} r="0.14" fill="#1f2937" />
    </g>
  );
}

/** Simplified ladder (two rails + rungs) in the theme's ladder colors. */
function PreviewLadder({ from, to, theme }: { from: number; to: number; theme: BoardTheme }) {
  const g = useMemo(() => getLadderGeom(from, to), [from, to]);
  const t = theme.ladders;
  const dx = g.b.x - g.a.x;
  const dy = g.b.y - g.a.y;
  const rail = g.railWidth / 2;
  const rungs = useMemo(() => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 1; i < g.rungCount; i++) {
      const k = i / g.rungCount;
      const px = g.a.x + dx * k;
      const py = g.a.y + dy * k;
      out.push({
        x1: px + g.nx * rail,
        y1: py + g.ny * rail,
        x2: px - g.nx * rail,
        y2: py - g.ny * rail,
      });
    }
    return out;
  }, [g, dx, dy, rail]);

  const railA = {
    x1: fmt(g.a.x + g.nx * rail),
    y1: fmt(g.a.y + g.ny * rail),
    x2: fmt(g.b.x + g.nx * rail),
    y2: fmt(g.b.y + g.ny * rail),
  };
  const railB = {
    x1: fmt(g.a.x - g.nx * rail),
    y1: fmt(g.a.y - g.ny * rail),
    x2: fmt(g.b.x - g.nx * rail),
    y2: fmt(g.b.y - g.ny * rail),
  };

  return (
    <g strokeLinecap="round" aria-hidden>
      {rungs.map((r, i) => (
        <line key={i} x1={fmt(r.x1)} y1={fmt(r.y1)} x2={fmt(r.x2)} y2={fmt(r.y2)} stroke={t.rungB} strokeWidth="0.75" />
      ))}
      <line {...railA} stroke={t.railDark} strokeWidth="1.15" />
      <line {...railA} stroke={t.woodB} strokeWidth="0.8" />
      <line {...railB} stroke={t.railDark} strokeWidth="1.15" />
      <line {...railB} stroke={t.woodB} strokeWidth="0.8" />
    </g>
  );
}

/** Tiny pawn matching the in-game token silhouette. */
function PreviewPawn({ square, fill, dark }: { square: number; fill: string; dark: string }) {
  const c = squareCenter(square);
  return (
    <g transform={`translate(${fmt(c.x)} ${fmt(c.y + 1.1)}) scale(0.62)`} aria-hidden>
      <ellipse cx="0" cy="0" rx="2.4" ry="0.8" fill="rgba(0,0,0,0.22)" />
      <path
        d="M0 -7.2c1.9 0 3.4 1.5 3.4 3.4 0 1.3-0.7 2.4-1.8 3 1.6 1 2.6 2.5 2.9 5.1h-9c0.3-2.6 1.3-4.1 2.9-5.1a3.4 3.4 0 0 1-1.8-3c0-1.9 1.5-3.4 3.4-3.4z"
        fill={fill}
        stroke={dark}
        strokeWidth="0.7"
      />
      <circle cx="-1.3" cy="-4.6" r="0.7" fill="#fff" opacity="0.92" />
      <circle cx="1.3" cy="-4.6" r="0.7" fill="#fff" opacity="0.92" />
      <circle cx="-1.15" cy="-4.45" r="0.35" fill="#1f2937" />
      <circle cx="1.15" cy="-4.45" r="0.35" fill="#1f2937" />
    </g>
  );
}

export function BoardPreview({
  theme,
  className,
  decor = true,
}: {
  theme: BoardTheme;
  className?: string;
  /** show decorative pawns (off for very small thumbnails) */
  decor?: boolean;
}) {
  const squares = useMemo(() => Array.from({ length: 100 }, (_, i) => i + 1), []);
  const goal = squareCenter(100);

  return (
    <div
      className={`relative aspect-square w-full select-none overflow-hidden rounded-xl border-2 ${className ?? ""}`}
      style={{
        borderColor: theme.frame.border,
        background: theme.frame.bg,
        boxShadow: theme.frame.shadow,
      }}
      role="img"
      aria-label={`${theme.id} board preview`}
    >
      <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
        {squares.map((sq) => {
          const engineRow = Math.floor((sq - 1) / 10);
          const forward = engineRow % 2 === 0;
          const col = forward ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
          const gridIdx = (9 - engineRow) * 10 + col;
          const color = squareColorAt(theme, sq);
          const lightText = hexLuminance(color) < 0.5;
          return (
            <div
              key={sq}
              style={{
                order: gridIdx,
                backgroundColor: color,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset -1px -1px 2px rgba(0,0,0,0.10)",
              }}
              className="relative flex items-start justify-end"
            >
              <span
                className={`select-none pr-0.5 pt-0.5 text-[clamp(5px,1.5cqw,9px)] font-bold leading-none ${
                  lightText ? "text-white/90" : "text-gray-900/80"
                }`}
              >
                {sq}
              </span>
            </div>
          );
        })}
      </div>

      {/* theme décor */}
      {theme.fx?.stars && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(226,232,240,0.9) 0 0.8px, transparent 1px), radial-gradient(circle at 78% 12%, rgba(253,230,138,0.9) 0 0.9px, transparent 1.2px), radial-gradient(circle at 30% 72%, rgba(226,232,240,0.8) 0 0.7px, transparent 1px), radial-gradient(circle at 62% 40%, rgba(226,232,240,0.7) 0 0.6px, transparent 1px), radial-gradient(circle at 88% 62%, rgba(196,181,253,0.9) 0 1px, transparent 1.2px), radial-gradient(circle at 45% 8%, rgba(226,232,240,0.8) 0 0.7px, transparent 1px), radial-gradient(circle at 18% 48%, rgba(226,232,240,0.7) 0 0.6px, transparent 1px), radial-gradient(circle at 70% 85%, rgba(226,232,240,0.8) 0 0.8px, transparent 1px)",
          }}
          aria-hidden
        />
      )}
      {theme.fx?.neon && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(34,197,94,0.08) 0px, rgba(34,197,94,0.08) 1px, transparent 1px, transparent 10%), repeating-linear-gradient(90deg, rgba(34,197,94,0.08) 0px, rgba(34,197,94,0.08) 1px, transparent 1px, transparent 10%)",
          }}
          aria-hidden
        />
      )}

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        aria-hidden
      >
        {DEFAULT_BOARD.ladders.map((l) => (
          <PreviewLadder key={`pl${l.from}`} from={l.from} to={l.to} theme={theme} />
        ))}
        {DEFAULT_BOARD.snakes.map((s, i) => (
          <PreviewSnake key={`ps${s.from}`} from={s.from} to={s.to} seed={i} theme={theme} />
        ))}
        {/* goal badge */}
        <circle
          cx={goal.x}
          cy={goal.y}
          r="3.6"
          fill={theme.goal.to}
          stroke={theme.goal.ring}
          strokeWidth="0.7"
        />
        <text x={goal.x} y={goal.y + 1.4} textAnchor="middle" fontSize="4.4" fill="#fff" fontWeight="800">
          100
        </text>
        {decor && (
          <>
            <PreviewPawn square={3} fill="#ef4444" dark="#b91c1c" />
            <PreviewPawn square={13} fill="#22c55e" dark="#15803d" />
            <PreviewPawn square={69} fill="#facc15" dark="#a16207" />
            <PreviewPawn square={92} fill="#a855f7" dark="#7e22ce" />
          </>
        )}
      </svg>

      {theme.vignette && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{ background: theme.vignette }}
          aria-hidden
        />
      )}
    </div>
  );
}
