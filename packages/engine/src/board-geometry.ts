/**
 * Sapludu — deterministic board overlay geometry.
 *
 * Pure math shared by the board renderer and the animation sequencer:
 * - Snake spines: smooth Catmull-Rom winding curves from the head square to the
 *   tail square with natural tapering width. Deterministic per connection, so
 *   every client (web/Android, online multiplayer) renders identical snakes.
 * - Ladder geometry: rails, rung count, tilt angle for climbing animations.
 *
 * Units: board percentages (0..100), matching `squareCenter()`.
 * The engine never uses this module — it is presentation-only.
 */

import { squareCenter } from "./board";

export interface Pt {
  x: number;
  y: number;
}

export interface SpineSample extends Pt {
  /** unit tangent (direction of travel head -> tail) */
  tx: number;
  ty: number;
  /** unit normal (perpendicular) */
  nx: number;
  ny: number;
  /** half body width at this sample */
  w: number;
}

export interface SnakeGeometry {
  head: SpineSample;
  tail: SpineSample;
  samples: SpineSample[];
  /** approximate arc length in board units */
  length: number;
}

export interface LadderGeometry {
  a: Pt; // foot (lower square center)
  b: Pt; // top (upper square center)
  /** unit normal (perpendicular to ladder direction) */
  nx: number;
  ny: number;
  /** distance between the two rails (full width) */
  railWidth: number;
  rungCount: number;
  /** token tilt in degrees that aligns the pawn with the ladder */
  tiltDeg: number;
  pointAt: (t: number) => Pt;
}

/* ------------------------------------------------------------------ */
/* Deterministic PRNG (mulberry32) — identical output on all clients.  */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/* ------------------------------------------------------------------ */
/* Snake spine generation                                              */
/* ------------------------------------------------------------------ */

/** Body half-width profile along the spine (t: 0 = head, 1 = tail tip). */
function widthAt(t: number): number {
  const maxW = 1.8;
  const neck = 0.64;
  if (t < 0.16) {
    return maxW * (neck + (1 - neck) * smoothstep(t / 0.16));
  }
  const k = (t - 0.16) / 0.84;
  return maxW * Math.max(0.07, Math.pow(1 - k, 0.58) * 0.97 + 0.03);
}

/** Catmull-Rom smoothing through control points. */
function catmullRom(pts: Pt[], perSegment: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2];
    for (let j = 0; j < perSegment; j++) {
      const t = j / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Resample a polyline to `n` points evenly spaced by arc length. */
function resample(points: Pt[], n: number): { pts: Pt[]; length: number } {
  const d: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = d[d.length - 1] || 1;
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (seg < d.length - 2 && d[seg + 1] < target) seg++;
    const segLen = d[seg + 1] - d[seg] || 1;
    const t = clamp((target - d[seg]) / segLen, 0, 1);
    out.push({
      x: points[seg].x + (points[seg + 1].x - points[seg].x) * t,
      y: points[seg].y + (points[seg + 1].y - points[seg].y) * t,
    });
  }
  return { pts: out, length: total };
}

const SPINE_SAMPLES = 88;

function buildSnakeGeometry(from: number, to: number, seedIndex: number): SnakeGeometry {
  const a = squareCenter(from);
  const b = squareCenter(to);
  const rnd = mulberry32(from * 733 + to * 1913 + seedIndex * 97);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / dist;
  const ny = dx / dist;

  // number of winding bends grows with travel distance
  const bends = dist > 52 ? 3 : dist > 26 ? 2 : 1;
  const control: Pt[] = [{ ...a }];
  for (let i = 1; i <= bends; i++) {
    const t = i / (bends + 1);
    const baseX = a.x + dx * t;
    const baseY = a.y + dy * t;
    const sideFlip = (i % 2 === 1 ? 1 : -1) * (seedIndex % 2 === 0 ? 1 : -1);
    const amp = Math.min(15.5, dist * (0.16 + rnd() * 0.1)) * sideFlip;
    const jitter = (rnd() - 0.5) * 4.5;
    const along = (rnd() - 0.5) * dist * 0.09;
    control.push({
      x: clamp(baseX + nx * amp + nx * jitter + (dx / dist) * along, 5.5, 94.5),
      y: clamp(baseY + ny * amp + ny * jitter + (dy / dist) * along, 5.5, 94.5),
    });
  }
  control.push({ ...b });

  const dense = catmullRom(control, 20);
  const { pts, length } = resample(dense, SPINE_SAMPLES);

  const samples: SpineSample[] = pts.map((pt, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const t = i / (pts.length - 1);
    return { x: pt.x, y: pt.y, tx, ty, nx: -ty, ny: tx, w: widthAt(t) };
  });

  return { head: samples[0], tail: samples[samples.length - 1], samples, length };
}

const snakeCache = new Map<string, SnakeGeometry>();

/** Cached, deterministic spine for a snake connection. */
export function getSnakeSpine(from: number, to: number, seedIndex = 0): SnakeGeometry {
  const key = `${from}:${to}:${seedIndex}`;
  let geo = snakeCache.get(key);
  if (!geo) {
    geo = buildSnakeGeometry(from, to, seedIndex);
    snakeCache.set(key, geo);
  }
  return geo;
}

/** Sample the spine at normalized position t (0 = head mouth, 1 = tail tip). */
export function sampleSpine(g: SnakeGeometry, t: number): SpineSample {
  const n = g.samples.length;
  const i = Math.round(clamp(t, 0, 1) * (n - 1));
  return g.samples[i];
}

/** Outward direction the snake head faces (away from its body). */
export function headOutward(g: SnakeGeometry): Pt {
  return { x: -g.head.tx, y: -g.head.ty };
}

/* ------------------------------------------------------------------ */
/* Ladder geometry                                                     */
/* ------------------------------------------------------------------ */

const ladderCache = new Map<string, LadderGeometry>();

function buildLadderGeometry(from: number, to: number): LadderGeometry {
  const a = squareCenter(from);
  const b = squareCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const railWidth = 3.4;
  const rungCount = Math.max(3, Math.round(len / 5));
  // tilt of the token so it visually aligns with the ladder direction
  const tiltDeg = clamp((Math.atan2(dx, -dy) * 180) / Math.PI, -40, 40);
  return {
    a,
    b,
    nx,
    ny,
    railWidth,
    rungCount,
    tiltDeg,
    pointAt: (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t }),
  };
}

/** Cached, deterministic ladder geometry for a connection. */
export function getLadderGeom(from: number, to: number): LadderGeometry {
  const key = `${from}:${to}`;
  let geo = ladderCache.get(key);
  if (!geo) {
    geo = buildLadderGeometry(from, to);
    ladderCache.set(key, geo);
  }
  return geo;
}
