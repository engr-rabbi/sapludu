/**
 * Sapludu — ladder renderer with climb highlight.
 * Rails, rungs and shading are drawn from deterministic ladder geometry so the
 * climbing token can follow the exact same path. Colors come from the active
 * board theme (wood, gold, neon, metal…), geometry never changes.
 */
"use client";

import { useMemo } from "react";
import { getLadderGeom, type LadderGeometry } from "@sapludu/engine/board-geometry";
import { useBoardFxStore } from "./fx-store";
import type { LadderTheme } from "@/lib/board-themes";

export type { LadderTheme };

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

interface RungGeom {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function buildRungs(g: LadderGeometry): RungGeom[] {
  const dx = g.b.x - g.a.x;
  const dy = g.b.y - g.a.y;
  const rail = g.railWidth / 2;
  const rungs: RungGeom[] = [];
  for (let i = 1; i < g.rungCount; i++) {
    const t = i / g.rungCount;
    const px = g.a.x + dx * t;
    const py = g.a.y + dy * t;
    rungs.push({
      x1: px + g.nx * rail,
      y1: py + g.ny * rail,
      x2: px - g.nx * rail,
      y2: py - g.ny * rail,
    });
  }
  return rungs;
}

export function Ladder({ from, to, style }: { from: number; to: number; style?: LadderTheme }) {
  const g = useMemo(() => getLadderGeom(from, to), [from, to]);
  const rungs = useMemo(() => buildRungs(g), [g]);
  const active = useBoardFxStore((s) => (s.ladderFx && s.ladderFx.from === from ? true : false));
  const uid = `l${from}`;

  const t = style ?? DEFAULT_LADDER;

  const railA = {
    x1: g.a.x + g.nx * (g.railWidth / 2),
    y1: g.a.y + g.ny * (g.railWidth / 2),
    x2: g.b.x + g.nx * (g.railWidth / 2),
    y2: g.b.y + g.ny * (g.railWidth / 2),
  };
  const railB = {
    x1: g.a.x - g.nx * (g.railWidth / 2),
    y1: g.a.y - g.ny * (g.railWidth / 2),
    x2: g.b.x - g.nx * (g.railWidth / 2),
    y2: g.b.y - g.ny * (g.railWidth / 2),
  };

  const glow = active ? { filter: `drop-shadow(0 0 1.6px ${t.glow})` } : undefined;

  return (
    <g data-ladder={`${from}-${to}`} style={glow} strokeLinecap="round" aria-hidden>
      <defs>
        {/* rail gradient for the active theme */}
        <linearGradient id={`wood-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.woodA} />
          <stop offset="0.45" stopColor={t.woodB} />
          <stop offset="1" stopColor={t.woodC} />
        </linearGradient>
        <linearGradient id={`rung-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.rungA} />
          <stop offset="0.5" stopColor={t.rungB} />
          <stop offset="1" stopColor={t.rungC} />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <line {...railA} stroke={t.shadow} strokeWidth="1.3" transform="translate(0.45 0.55)" />
      <line {...railB} stroke={t.shadow} strokeWidth="1.3" transform="translate(0.45 0.55)" />

      {/* rungs */}
      {rungs.map((r, i) => (
        <g key={i}>
          <line {...r} stroke={t.shadow} strokeWidth="0.95" transform="translate(0.3 0.4)" />
          <line {...r} stroke={`url(#rung-${uid})`} strokeWidth="0.8" />
          <line
            x1={r.x1}
            y1={r.y1 - 0.14}
            x2={r.x2}
            y2={r.y2 - 0.14}
            stroke={t.rungLight}
            strokeWidth="0.24"
            opacity="0.85"
          />
        </g>
      ))}

      {/* rails — dark edge, core gradient, pale top highlight */}
      <line {...railA} stroke={t.railDark} strokeWidth="1.3" />
      <line {...railA} stroke={`url(#wood-${uid})`} strokeWidth="0.95" />
      <line {...railA} stroke={t.rungLight} strokeWidth="0.26" opacity="0.9" transform="translate(-0.1 -0.22)" />
      <line {...railB} stroke={t.railDark} strokeWidth="1.3" />
      <line {...railB} stroke={`url(#wood-${uid})`} strokeWidth="0.95" />
      <line {...railB} stroke={t.rungLight} strokeWidth="0.26" opacity="0.9" transform="translate(-0.1 -0.22)" />

      {/* rail end caps */}
      <circle cx={railA.x1} cy={railA.y1} r="0.52" fill={t.cap} stroke={t.capDark} strokeWidth="0.14" />
      <circle cx={railB.x1} cy={railB.y1} r="0.52" fill={t.cap} stroke={t.capDark} strokeWidth="0.14" />
      <circle cx={railA.x2} cy={railA.y2} r="0.52" fill={t.cap} stroke={t.capDark} strokeWidth="0.14" />
      <circle cx={railB.x2} cy={railB.y2} r="0.52" fill={t.cap} stroke={t.capDark} strokeWidth="0.14" />
    </g>
  );
}

/** Fallback used when no theme is provided (hero decorations etc.). */
const DEFAULT_LADDER: LadderTheme = {
  railDark: "#5d3a10",
  woodA: "#a16207",
  woodB: "#c98a3b",
  woodC: "#8a5a1f",
  rungA: "#e8b268",
  rungB: "#b45309",
  rungC: "#7c3d0d",
  rungLight: "#f2c98a",
  cap: "#a16207",
  capDark: "#5d3a10",
  shadow: "rgba(50,30,10,0.18)",
  glow: "rgba(253,224,71,0.95)",
};
