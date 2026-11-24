/**
 * Sapludu board configuration and validation.
 * The default board is balanced: 7 ladders, 9 snakes, no chains, nothing touching square 100.
 */

import type { BoardConfig, BoardConnection } from "./types";

/** The production board used for every game mode (local, AI, online). */
export const DEFAULT_BOARD: BoardConfig = {
  ladders: [
    { from: 4, to: 25 },
    { from: 13, to: 46 },
    { from: 33, to: 49 },
    { from: 42, to: 63 },
    { from: 50, to: 69 },
    { from: 62, to: 81 },
    { from: 74, to: 92 },
  ],
  snakes: [
    { from: 27, to: 5 },
    { from: 40, to: 19 },
    { from: 54, to: 31 },
    { from: 60, to: 38 },
    { from: 70, to: 48 },
    { from: 87, to: 24 },
    { from: 93, to: 68 },
    { from: 96, to: 45 },
    { from: 99, to: 72 },
  ],
};

export const WINNING_SQUARE = 100;
export const BOARD_SIZE = 100;

export interface BoardValidationIssue {
  code: string;
  message: string;
}

/**
 * Validate a board configuration:
 * - ladders must go strictly upward, snakes strictly downward
 * - all squares within 2..99 (start and goal untouched)
 * - no duplicate start squares
 * - no square is both a snake head and a ladder foot
 * - no chains (a snake tail must not be a ladder foot, a ladder top must not be a snake head)
 */
export function validateBoard(board: BoardConfig): BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = [];
  const ladderStarts = new Set<number>();
  const ladderEnds = new Set<number>();
  const snakeStarts = new Set<number>();
  const snakeEnds = new Set<number>();

  for (const l of board.ladders) {
    if (l.from >= l.to) {
      issues.push({ code: "LADDER_NOT_UPWARD", message: `Ladder ${l.from}→${l.to} must go upward` });
    }
    if (!inPlayableRange(l.from) || !inPlayableRange(l.to)) {
      issues.push({ code: "LADDER_OUT_OF_RANGE", message: `Ladder ${l.from}→${l.to} outside 2..99` });
    }
    if (ladderStarts.has(l.from)) {
      issues.push({ code: "DUPLICATE_LADDER_START", message: `Square ${l.from} starts two ladders` });
    }
    ladderStarts.add(l.from);
    ladderEnds.add(l.to);
  }

  for (const s of board.snakes) {
    if (s.from <= s.to) {
      issues.push({ code: "SNAKE_NOT_DOWNWARD", message: `Snake ${s.from}→${s.to} must go downward` });
    }
    if (!inPlayableRange(s.from) || !inPlayableRange(s.to)) {
      issues.push({ code: "SNAKE_OUT_OF_RANGE", message: `Snake ${s.from}→${s.to} outside 2..99` });
    }
    if (snakeStarts.has(s.from)) {
      issues.push({ code: "DUPLICATE_SNAKE_START", message: `Square ${s.from} has two snakes` });
    }
    snakeStarts.add(s.from);
    snakeEnds.add(s.to);
  }

  for (const sq of ladderStarts) {
    if (snakeStarts.has(sq)) {
      issues.push({ code: "SQUARE_CONFLICT", message: `Square ${sq} is both snake head and ladder foot` });
    }
  }
  // chains: snake tail on ladder foot, or ladder top on snake head
  for (const sq of snakeEnds) {
    if (ladderStarts.has(sq)) {
      issues.push({ code: "CHAIN_SNAKE_TO_LADDER", message: `Snake tail ${sq} lands on a ladder foot (chain)` });
    }
  }
  for (const sq of ladderEnds) {
    if (snakeStarts.has(sq)) {
      issues.push({ code: "CHAIN_LADDER_TO_SNAKE", message: `Ladder top ${sq} lands on a snake head (chain)` });
    }
  }

  return issues;
}

function inPlayableRange(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n <= BOARD_SIZE - 1;
}

/** Fast lookup map: square -> destination. */
export function buildJumpMap(board: BoardConfig): Map<number, number> {
  const map = new Map<number, number>();
  for (const l of board.ladders) map.set(l.from, l.to);
  for (const s of board.snakes) map.set(s.from, s.to);
  return map;
}

export type SquareType = "normal" | "ladder" | "snake" | "goal" | "start";

export function squareType(board: BoardConfig, square: number): SquareType {
  if (square === 1) return "start";
  if (square === WINNING_SQUARE) return "goal";
  if (board.ladders.some((l) => l.from === square)) return "ladder";
  if (board.snakes.some((s) => s.from === square)) return "snake";
  return "normal";
}

/**
 * Convert a square number (1..100) to grid coordinates (row, col) with the
 * traditional boustrophedon (zigzag) numbering: bottom row left→right, next row right→left…
 * Row 0 is the bottom row (squares 1..10).
 */
export function squareToGrid(square: number): { row: number; col: number } {
  const idx = square - 1;
  const row = Math.floor(idx / 10);
  const forward = row % 2 === 0;
  const col = forward ? idx % 10 : 9 - (idx % 10);
  return { row, col };
}

/** Convert grid coordinates back to a square number. */
export function gridToSquare(row: number, col: number): number {
  const forward = row % 2 === 0;
  const idx = row * 10 + (forward ? col : 9 - col);
  return idx + 1;
}

/**
 * Normalized center position of a square inside the board, in percentages.
 * {x: 0..100, y: 0..100} with y measured from the TOP (CSS friendly).
 */
export function squareCenter(square: number): { x: number; y: number } {
  const { row, col } = squareToGrid(square);
  // grid row 0 is bottom → CSS y measured from top: row 9 (squares 91..100) is top
  const y = (9 - row) * 10 + 5;
  const x = col * 10 + 5;
  return { x, y };
}
