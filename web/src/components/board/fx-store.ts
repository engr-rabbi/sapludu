/**
 * Sapludu — board FX store.
 *
 * Holds *visual-only* animation state (per-frame token overrides, snake mouth /
 * bulge progress, ladder highlight). Completely decoupled from the authoritative
 * GameState: positions computed here are never used by the engine, and the
 * store is cleared whenever a real state sync arrives.
 *
 * The tiny selectors mean only the one snake / one token being animated
 * re-renders per frame — the rest of the board stays untouched (performance).
 */

import { create } from "zustand";

export interface SnakeFx {
  /** square where the snake head sits (unique per snake) */
  from: number;
  /** 0 = closed … 1 = fully open */
  mouthOpen: number;
  /** normalized position of the swallowed token bulge along the spine (null = none) */
  bulgeT: number | null;
  /** 0 = idle … 1 = excited (head sway / eye focus on the token) */
  excite: number;
}

export interface TokenOverride {
  playerIndex: number;
  /** token center, board percentages */
  x: number;
  y: number;
  /** rotation in degrees (ladder alignment) */
  rotation: number;
  scale: number;
  /** true while the token is "inside" the snake (represented by the bulge) */
  hidden: boolean;
  /**
   * Ground contact point for the drop shadow (board %) — stays on the square
   * while the pawn arcs through the air, selling depth. Defaults to y.
   */
  shadowY?: number;
  /** drop shadow strength 0..1 (0 = none). Defaults to 0. */
  shadowStrength?: number;
}

export interface LadderFx {
  /** ladder foot square (unique per ladder) */
  from: number;
}

export interface TokenPulse {
  playerIndex: number;
  kind: "shake" | "bounce";
  /** increments so repeated pulses re-trigger the animation */
  id: number;
}

/** Visual-only illumination of a square as the moving token lands on it. */
export interface SquareGlow {
  square: number;
  /** increments each pulse so back-to-back squares re-trigger the animation */
  id: number;
}

/**
 * Live progress of a square-by-square move — drives the on-board "Step k of N"
 * counter so players can literally read how many squares the dice pays for.
 * Visual-only: it never feeds back into game state.
 */
export interface MoveProgress {
  playerIndex: number;
  /** step the token just landed on (1-based) */
  step: number;
  /** total squares this dice roll pays for */
  total: number;
  /** the dice value that produced this move */
  dice: number;
}

interface BoardFxState {
  snakeFx: SnakeFx | null;
  tokenOverride: TokenOverride | null;
  ladderFx: LadderFx | null;
  tokenPulse: TokenPulse | null;
  squareGlow: SquareGlow | null;
  moveProgress: MoveProgress | null;

  setSnakeFx: (fx: SnakeFx | null) => void;
  setTokenOverride: (o: TokenOverride | null) => void;
  setLadderFx: (fx: LadderFx | null) => void;
  pulseToken: (playerIndex: number, kind: TokenPulse["kind"]) => void;
  pulseSquare: (square: number) => void;
  setMoveProgress: (p: MoveProgress | null) => void;
  clearFx: () => void;
}

let pulseId = 0;
let glowId = 0;

export const useBoardFxStore = create<BoardFxState>()((set) => ({
  snakeFx: null,
  tokenOverride: null,
  ladderFx: null,
  tokenPulse: null,
  squareGlow: null,
  moveProgress: null,

  setSnakeFx: (snakeFx) => set({ snakeFx }),
  setTokenOverride: (tokenOverride) => set({ tokenOverride }),
  setLadderFx: (ladderFx) => set({ ladderFx }),
  pulseToken: (playerIndex, kind) => set({ tokenPulse: { playerIndex, kind, id: ++pulseId } }),
  pulseSquare: (square) => set({ squareGlow: { square, id: ++glowId } }),
  setMoveProgress: (moveProgress) => set({ moveProgress }),
  clearFx: () =>
    set({
      snakeFx: null,
      tokenOverride: null,
      ladderFx: null,
      tokenPulse: null,
      squareGlow: null,
      moveProgress: null,
    }),
}));
