/**
 * Sapludu shared game-engine types.
 * Pure data contracts shared by the web client (local/AI modes) and the
 * server-authoritative Socket.IO game service (online mode).
 */

export type TokenColor = "red" | "green" | "yellow" | "purple";

export interface BoardConnection {
  from: number; // 2..99
  to: number; // 2..99
}

export interface BoardConfig {
  snakes: BoardConnection[]; // from > to (downward)
  ladders: BoardConnection[]; // from < to (upward)
}

export interface PlayerState {
  id: string; // stable id (userId, guest id, or ai id)
  name: string;
  color: TokenColor;
  position: number; // 1..100
  /** true for computer-controlled players (never gets special dice) */
  isAI: boolean;
  /** difficulty for AI players */
  aiLevel?: "easy" | "normal" | "hard";
  /** online-only connection flag */
  connected?: boolean;
}

export type MoveKind = "normal" | "ladder" | "snake" | "overshoot";

/** Atomic event emitted by a single applyRoll() transition. */
export type GameEvent =
  | {
      type: "move";
      playerIndex: number;
      dice: number;
      from: number;
      to: number;
      /** every intermediate square after each hop, ending with the final square */
      path: number[];
      kind: MoveKind;
    }
  | { type: "extraTurn"; playerIndex: number; dice: number }
  | { type: "turnSwitch"; playerIndex: number; reason: "no-six" | "win" }
  | { type: "win"; playerIndex: number };

export interface MoveRecord {
  playerIndex: number;
  playerName: string;
  dice: number;
  fromPos: number;
  toPos: number;
  kind: MoveKind;
  at: number; // logical move number
}

export type GameStatus = "active" | "completed";

export interface GameState {
  id: string;
  players: PlayerState[];
  /** index of the player whose turn it is */
  current: number;
  status: GameStatus;
  winnerIndex: number | null;
  turnCount: number;
  lastDice: number | null;
  board: BoardConfig;
  moves: MoveRecord[];
  /** monotonically increasing version for online sync */
  version: number;
}

export interface RollOutcome {
  next: GameState; // new state (immutably produced)
  events: GameEvent[]; // ordered events for UI animation
}

export interface GameOverResult {
  winnerIndex: number;
  placements: { playerIndex: number; name: string; position: number }[];
}
