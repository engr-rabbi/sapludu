/**
 * Sapludu — realistic SVG snake renderer.
 *
 * Each snake is generated procedurally from its deterministic spine:
 * - 3D tube shading built from stacked width-scaled body outlines
 *   (dark belly edge → base → mid → dorsal light → spine highlight)
 * - scale texture + dorsal pattern clipped to the exact body outline
 * - articulated, fierce head (angry brows, golden slit-pupil eyes, nostrils,
 *   curved fangs, gaping jaws) aligned exactly with the head square
 * - animated mouth that opens when swallowing, plus a travelling bulge along
 *   the body representing the swallowed token
 * - gentle idle life: staggered body sway, head bob and forked-tongue flicks
 *   (all disabled for reduced motion)
 *
 * All static geometry is memoized; only mouth/bulge/excite values re-render.
 * Colors come from the active board theme (see board-themes.ts) — geometry
 * and square alignment are identical in every theme.
 */
"use client";

import { useMemo } from "react";
import { getSnakeSpine, headOutward, sampleSpine, type SnakeGeometry } from "@sapludu/engine/board-geometry";
import { useBoardFxStore, type SnakeFx } from "./fx-store";
import { CLASSIC_SNAKE_PALETTES, type SnakePalette } from "@/lib/board-themes";

export type { SnakePalette };
export { CLASSIC_SNAKE_PALETTES as SNAKE_PALETTES } from "@/lib/board-themes";

const BODY_SAMPLES = 88;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Build the closed body outline path from the tapered spine samples. */
function buildBodyPath(g: SnakeGeometry): string {
  const left: string[] = [];
  const right: string[] = [];
  for (const s of g.samples) {
    left.push(`${fmt(s.x + s.nx * s.w)},${fmt(s.y + s.ny * s.w)}`);
    right.push(`${fmt(s.x - s.nx * s.w)},${fmt(s.y - s.ny * s.w)}`);
  }
  // rounded tail tip: join the two sides at the last sample
  const pts = [...left, ...right.reverse()];
  return `M ${pts[0]} L ${pts.slice(1).join(" L ")} Z`;
}

/**
 * Body outline scaled to a fraction of the full width — used to stack the
 * 3D tube shading layers (each narrower layer rides on the spine).
 */
function buildBodyPathAt(g: SnakeGeometry, wf: number): string {
  const left: string[] = [];
  const right: string[] = [];
  for (const s of g.samples) {
    const w = s.w * wf;
    left.push(`${fmt(s.x + s.nx * w)},${fmt(s.y + s.ny * w)}`);
    right.push(`${fmt(s.x - s.nx * w)},${fmt(s.y - s.ny * w)}`);
  }
  const pts = [...left, ...right.reverse()];
  return `M ${pts[0]} L ${pts.slice(1).join(" L ")} Z`;
}

function buildSpinePath(g: SnakeGeometry): string {
  return g.samples.map((s, i) => `${i === 0 ? "M" : "L"} ${fmt(s.x)} ${fmt(s.y)}`).join(" ");
}

interface Blotch {
  path: string;
}

function buildBlotches(g: SnakeGeometry, palette: SnakePalette): Blotch[] {
  const out: Blotch[] = [];
  const step = 5;
  for (let i = 8; i < BODY_SAMPLES - 10; i += step) {
    const s = g.samples[i];
    const shrink = 0.55 + 0.45 * (1 - i / BODY_SAMPLES); // tighter toward tail
    if (palette.band) {
      // full-width band (krait / milk snake style)
      const halfLen = 0.8;
      const a = { x: s.x + s.tx * halfLen, y: s.y + s.ty * halfLen };
      const b = { x: s.x - s.tx * halfLen, y: s.y - s.ty * halfLen };
      const l = { x: s.x + s.nx * s.w * 0.96, y: s.y + s.ny * s.w * 0.96 };
      const r = { x: s.x - s.nx * s.w * 0.96, y: s.y - s.ny * s.w * 0.96 };
      out.push({
        path: `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(l.x)} ${fmt(l.y)} L ${fmt(b.x)} ${fmt(b.y)} L ${fmt(r.x)} ${fmt(r.y)} Z`,
      });
    } else {
      // diamond dorsal blotch with a lighter rim for depth
      const halfLen = 1.5 * shrink;
      const tip = { x: s.x + s.tx * halfLen, y: s.y + s.ty * halfLen };
      const back = { x: s.x - s.tx * halfLen, y: s.y - s.ty * halfLen };
      const side1 = { x: s.x + s.nx * s.w * 0.82, y: s.y + s.ny * s.w * 0.82 };
      const side2 = { x: s.x - s.nx * s.w * 0.82, y: s.y - s.ny * s.w * 0.82 };
      out.push({
        path: `M ${fmt(tip.x)} ${fmt(tip.y)} L ${fmt(side1.x)} ${fmt(side1.y)} L ${fmt(back.x)} ${fmt(back.y)} L ${fmt(side2.x)} ${fmt(side2.y)} Z`,
      });
    }
  }
  return out;
}

/** Heads read small at phone sizes; a 30% larger skull keeps the eyes, fangs and tongue clearly visible. */
const HEAD_SCALE = 1.3;

function Head({
  geo,
  palette,
  uid,
  mouthOpen,
  excited,
  reduced,
}: {
  geo: SnakeGeometry;
  palette: SnakePalette;
  uid: string;
  mouthOpen: number;
  excited: boolean;
  reduced: boolean;
}) {
  const h = geo.head;
  const out = headOutward(geo);
  const ang = (Math.atan2(out.y, out.x) * 180) / Math.PI;
  const extend = excited ? 0.32 : 0;
  const hx = h.x + out.x * extend;
  const hy = h.y + out.y * extend;
  // idle snakes keep the jaws slightly parted with fangs peeking out —
  // fierce at rest, wide open while swallowing
  const m = Math.max(0.12, Math.min(1, mouthOpen));
  const mouthRy = 0.34 + 0.52 * m;
  const mouthRx = 0.52 + 0.42 * m;
  const fangs = m > 0.1;

  // head silhouette (pointing +x), slightly spade-shaped with a snout
  const headPath =
    "M -1.55 -0.92 C -0.7 -1.44, 0.5 -1.52, 1.3 -1.04 C 1.78 -0.74, 1.94 -0.36, 1.94 0 " +
    "C 1.94 0.36, 1.78 0.74, 1.3 1.04 C 0.5 1.52, -0.7 1.44, -1.55 0.92 C -1.9 0.6, -1.9 -0.6, -1.55 -0.92 Z";

  const pupilShift = m > 0.25 ? 0.1 : 0;

  return (
    <g transform={`translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(ang)}) scale(${HEAD_SCALE})`}>
      {/* soft ground shadow */}
      <ellipse cx="0.25" cy="0.55" rx="2.1" ry="1.15" fill="rgba(50,30,10,0.16)" />
      <g className={excited && !reduced ? "sapludu-head-sway" : !reduced ? "sapludu-head-idle" : undefined}>
        {/* neck blend */}
        <ellipse cx="-1.45" cy="0" rx="0.85" ry="1" fill={palette.base2} opacity="0.85" />
        {/* skull */}
        <path d={headPath} fill={`url(#g-${uid})`} stroke={palette.outline} strokeWidth="0.2" strokeLinejoin="round" />
        {/* dorsal light on the skull crown */}
        <path
          d="M -1.35 -0.5 C -0.5 -1.05, 0.6 -1.1, 1.35 -0.6"
          fill="none"
          stroke={palette.light}
          strokeWidth="0.22"
          opacity="0.4"
          strokeLinecap="round"
        />

        {/* angry brow ridges — angled down toward the snout */}
        <path
          d="M -0.15 -1.18 L 0.85 -0.52 L 0.72 -0.4 L -0.2 -1.02 Z"
          fill={palette.outline}
          opacity="0.85"
        />
        <path
          d="M -0.15 1.18 L 0.85 0.52 L 0.72 0.4 L -0.2 1.02 Z"
          fill={palette.outline}
          opacity="0.85"
        />

        {/* gaping jaws (top-down view: spreading mouth floor) */}
        {m > 0.04 && (
          <g>
            <ellipse
              cx="0.82"
              cy="0"
              rx={fmt(mouthRx)}
              ry={fmt(mouthRy)}
              fill={`url(#mouth-${uid})`}
              stroke={palette.outline}
              strokeWidth="0.14"
            />
            {/* throat + tongue hint inside the mouth */}
            <ellipse cx="0.82" cy="0" rx={fmt(mouthRx * 0.55)} ry={fmt(mouthRy * 0.5)} fill="#7f1d1d" opacity="0.75" />
            <path
              d={`M ${fmt(0.55)} 0 L ${fmt(0.55 + mouthRx * 0.6)} 0.14 M ${fmt(0.55 + mouthRx * 0.6)} 0.14 L ${fmt(0.55 + mouthRx * 0.85)} -0.08`}
              fill="none"
              stroke="#e11d48"
              strokeWidth="0.13"
              strokeLinecap="round"
              opacity="0.9"
            />
            {/* curved upper fangs — prominent but rounded, family friendly */}
            {fangs && (
              <g>
                <path
                  d={`M ${fmt(0.5)} ${fmt(-mouthRy * 0.82)} q 0.22 0.34 0.5 0.4`}
                  fill="none"
                  stroke="#fff7e0"
                  strokeWidth="0.17"
                  strokeLinecap="round"
                />
                <path
                  d={`M ${fmt(0.5)} ${fmt(mouthRy * 0.82)} q 0.22 -0.34 0.5 -0.4`}
                  fill="none"
                  stroke="#fff7e0"
                  strokeWidth="0.17"
                  strokeLinecap="round"
                />
                {/* small lower teeth */}
                <path
                  d={`M ${fmt(1.06)} ${fmt(-mouthRy * 0.6)} l 0.13 0.18 l 0.13 -0.18 Z M ${fmt(1.06)} ${fmt(mouthRy * 0.6)} l 0.13 -0.18 l 0.13 0.18 Z`}
                  fill="#fff7e0"
                  opacity="0.9"
                />
              </g>
            )}
            {/* jaw line */}
            <path
              d={`M ${fmt(0.82 - mouthRx)} 0 C ${fmt(0.82 - mouthRx * 0.4)} ${fmt(-mouthRy - 0.08)}, ${fmt(0.82 + mouthRx * 0.55)} ${fmt(-mouthRy - 0.05)}, ${fmt(0.82 + mouthRx)} ${fmt(-mouthRy * 0.4)}`}
              fill="none"
              stroke={palette.outline}
              strokeWidth="0.12"
              opacity="0.5"
            />
            <path
              d={`M ${fmt(0.82 - mouthRx)} 0 C ${fmt(0.82 - mouthRx * 0.4)} ${fmt(mouthRy + 0.08)}, ${fmt(0.82 + mouthRx * 0.55)} ${fmt(mouthRy + 0.05)}, ${fmt(0.82 + mouthRx)} ${fmt(mouthRy * 0.4)}`}
              fill="none"
              stroke={palette.outline}
              strokeWidth="0.12"
              opacity="0.5"
            />
          </g>
        )}

        {/* eyes — golden with vertical slit pupils, focus on the token while capturing */}
        <g>
          <ellipse cx="0.35" cy="-0.74" rx="0.34" ry="0.28" fill="#f5b83d" stroke={palette.outline} strokeWidth="0.09" />
          <ellipse cx="0.35" cy="0.74" rx="0.34" ry="0.28" fill="#f5b83d" stroke={palette.outline} strokeWidth="0.09" />
          <ellipse cx={fmt(0.38 + pupilShift)} cy="-0.74" rx="0.1" ry="0.19" fill="#171310" />
          <ellipse cx={fmt(0.38 + pupilShift)} cy="0.74" rx="0.1" ry="0.19" fill="#171310" />
          <circle cx="0.27" cy="-0.82" r="0.07" fill="#ffffff" opacity="0.9" />
          <circle cx="0.27" cy="0.66" r="0.07" fill="#ffffff" opacity="0.9" />
        </g>

        {/* nostrils */}
        <circle cx="1.5" cy="-0.3" r="0.075" fill={palette.outline} opacity="0.65" />
        <circle cx="1.5" cy="0.3" r="0.075" fill={palette.outline} opacity="0.65" />

        {/* forked tongue (idle only; retracts while the mouth works) */}
        {m < 0.2 && !reduced && (
          <g className="sapludu-tongue">
            <path
              d="M 1.92 0 L 2.75 0.02 M 2.75 0.02 L 3.18 -0.24 M 2.75 0.02 L 3.18 0.3"
              fill="none"
              stroke="#e11d48"
              strokeWidth="0.16"
              strokeLinecap="round"
            />
          </g>
        )}
        {m < 0.2 && reduced && (
          <path
            d="M 1.92 0 L 2.75 0.02 M 2.75 0.02 L 3.18 -0.24 M 2.75 0.02 L 3.18 0.3"
            fill="none"
            stroke="#e11d48"
            strokeWidth="0.16"
            strokeLinecap="round"
            opacity="0"
          />
        )}
      </g>
    </g>
  );
}

export function Snake({
  from,
  to,
  paletteIndex,
  palette,
  reduced,
}: {
  from: number;
  to: number;
  /** geometry seed — keeps every snake's winding shape deterministic per connection */
  paletteIndex: number;
  /** theme colors; falls back to the classic palette set */
  palette?: SnakePalette;
  reduced: boolean;
}) {
  const pal = palette ?? CLASSIC_SNAKE_PALETTES[paletteIndex % CLASSIC_SNAKE_PALETTES.length];
  const uid = `s${from}`;

  // fx subscription is snake-scoped: only this snake re-renders while animated
  const fx = useBoardFxStore((s) => (s.snakeFx && s.snakeFx.from === from ? s.snakeFx : null));
  const mouthOpen = fx?.mouthOpen ?? 0;
  const bulgeT = fx?.bulgeT ?? null;
  const excited = (fx?.excite ?? 0) > 0.15;

  const geo = useMemo(() => getSnakeSpine(from, to, paletteIndex), [from, to, paletteIndex]);
  const bodyPath = useMemo(() => buildBodyPath(geo), [geo]);
  const bodyBase = useMemo(() => buildBodyPathAt(geo, 0.9), [geo]);
  const bodyMid = useMemo(() => buildBodyPathAt(geo, 0.62), [geo]);
  const bodyLight = useMemo(() => buildBodyPathAt(geo, 0.34), [geo]);
  const spinePath = useMemo(() => buildSpinePath(geo), [geo]);
  const blotches = useMemo(() => buildBlotches(geo, pal), [geo, pal]);

  const bulge = useMemo(() => {
    if (bulgeT === null) return null;
    const s = sampleSpine(geo, bulgeT);
    const ang = (Math.atan2(s.ty, s.tx) * 180) / Math.PI;
    return { x: s.x, y: s.y, ang, rx: 1.75, ry: s.w + 1.02 };
  }, [geo, bulgeT]);

  // stagger the idle sway so the nine snakes never move in lockstep
  const idleDelay = `${((from * 137) % 100) / 100 * 6}s`;

  return (
    <g data-snake={`${from}-${to}`}>
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={pal.base1} />
          <stop offset="1" stopColor={pal.base2} />
        </linearGradient>
        <radialGradient id={`mouth-${uid}`} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#9f2b2b" />
          <stop offset="1" stopColor="#4c0713" />
        </radialGradient>
        <pattern id={`sc-${uid}`} width="2.1" height="1.85" patternUnits="userSpaceOnUse">
          <path d="M -1.05 1.85 a 1.05 0.85 0 0 1 2.1 0" fill="none" stroke={pal.scale} strokeWidth="0.13" opacity="0.5" />
          <path d="M 1.05 1.85 a 1.05 0.85 0 0 1 2.1 0" fill="none" stroke={pal.scale} strokeWidth="0.13" opacity="0.5" />
          <path d="M 0 0.92 a 1.05 0.85 0 0 1 2.1 0" fill="none" stroke={pal.scale} strokeWidth="0.13" opacity="0.35" />
        </pattern>
        <clipPath id={`clip-${uid}`}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <g className={reduced ? undefined : "sapludu-snake-idle"} style={{ animationDelay: idleDelay }}>
        {/* soft drop shadow under the body */}
        <path d={bodyPath} fill="none" stroke="rgba(50,30,10,0.2)" strokeWidth="0.7" transform="translate(0.5 0.65)" />

        {/* 3D tube shading — stacked width-scaled outlines */}
        <path d={bodyPath} fill={pal.outline} />
        <path d={bodyBase} fill={pal.base2} />
        <path d={bodyMid} fill={`url(#g-${uid})`} />
        <path d={bodyLight} fill={pal.light} opacity="0.85" />

        {/* dorsal pattern + scale texture, clipped to the exact body outline */}
        <g clipPath={`url(#clip-${uid})`}>
          {blotches.map((b, i) => (
            <path key={i} d={b.path} fill={pal.blotch} opacity={pal.band ? 0.85 : 0.78} />
          ))}
          <path d={bodyPath} fill={`url(#sc-${uid})`} opacity="0.55" />
          {/* scale texture on the light ridge too */}
          <path d={bodyLight} fill={`url(#sc-${uid})`} opacity="0.35" />
        </g>

        {/* spine highlight for roundness */}
        <path d={spinePath} fill="none" stroke={pal.belly} strokeWidth="0.4" strokeLinecap="round" opacity="0.35" />

        {/* body outline */}
        <path d={bodyPath} fill="none" stroke={pal.outline} strokeWidth="0.24" opacity="0.9" />

        {/* travelling swallow bulge */}
        {bulge && (
          <g transform={`translate(${fmt(bulge.x)} ${fmt(bulge.y)}) rotate(${fmt(bulge.ang)})`}>
            <ellipse rx={fmt(bulge.rx)} ry={fmt(bulge.ry)} fill={`url(#g-${uid})`} stroke={pal.outline} strokeWidth="0.2" opacity="0.97" />
            <ellipse rx={fmt(bulge.rx * 0.92)} ry={fmt(bulge.ry * 0.9)} fill={`url(#sc-${uid})`} opacity="0.9" />
            <ellipse rx={fmt(bulge.rx * 0.4)} ry={fmt(bulge.ry * 0.5)} fill={pal.belly} opacity="0.22" />
          </g>
        )}

        <Head geo={geo} palette={pal} uid={uid} mouthOpen={mouthOpen} excited={excited} reduced={reduced} />
      </g>
    </g>
  );
}
