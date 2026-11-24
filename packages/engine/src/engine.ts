/**
 * Sapludu — pure, deterministic game engine.
 *
 * Rules implemented (defaults per MASTER_SPECIFICATION):
 * - 100 squares, start at 1, exact roll required to finish on 100.
 * - Overshooting 100 leaves the player at the current position.
 * - Rolling a 6 grants exactly one extra turn (also after landing via snake/ladder).
 * - Ladders move up, snakes move down, immediately after the dice movement.
 * - Tokens co-exist on squares (no blocking).
 *
 * Randomness is fully separated: applyRoll() receives the dice value; callers own the RNG
 * (crypto.randomInt online, Math.random locally). The engine itself never generates numbers,
 * which makes every transition reproducible and testable with predetermined dice.
 */

import { buildJumpMap, WINNING_SQUARE } from "./board";
import type {
  BoardConfig,
  GameEvent,
  GameState,
  MoveKind,
  PlayerState,
  RollOutcome,
} from "./types";

export interface CreateGameOptions {
  id: string;
  players: Omit<PlayerState, "position">[];
  board?: BoardConfig;
}

export function createGame(opts: CreateGameOptions): GameState {
  if (opts.players.length < 2 || opts.players.length > 4) {
    throw new EngineError("INVALID_PLAYER_COUNT", "Sapludu requires 2 to 4 players");
  }
  const colors = opts.players.map((p) => p.color);
  const unique = new Set(colors);
  if (unique.size !== colors.length) {
    throw new EngineError("DUPLICATE_COLORS", "Each player needs a distinct token color");
  }
  return {
    id: opts.id,
    players: opts.players.map((p) => ({ ...p, position: 1 })),
    current: 0,
    status: "active",
    winnerIndex: null,
    turnCount: 0,
    lastDice: null,
    board: opts.board ?? { snakes: [], ladders: [] },
    moves: [],
    version: 0,
  };
}

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function restoreGameState(json: string): GameState {
  const parsed = JSON.parse(json) as GameState;
  if (!parsed || !Array.isArray(parsed.players) || typeof parsed.current !== "number") {
    throw new EngineError("CORRUPT_STATE", "Serialized game state is malformed");
  }
  return parsed;
}

/**
 * Validate whether `playerIndex` may roll right now.
 * Returns null when valid, otherwise a machine-readable rejection code.
 */
export function validateTurn(state: GameState, playerIndex: number): string | null {
  if (state.status !== "active") return "GAME_NOT_ACTIVE";
  if (playerIndex < 0 || playerIndex >= state.players.length) return "INVALID_PLAYER";
  if (state.current !== playerIndex) return "NOT_YOUR_TURN";
  return null;
}

/**
 * Apply one dice roll atomically.
 * The dice value MUST come from a trusted source (server crypto online, local RNG offline).
 */
export function applyRoll(prev: GameState, playerIndex: number, dice: number): RollOutcome {
  const invalid = validateTurn(prev, playerIndex);
  if (invalid) throw new EngineError(invalid, `Roll rejected: ${invalid}`);
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) {
    throw new EngineError("INVALID_DICE", "Dice value must be an integer 1..6");
  }

  const events: GameEvent[] = [];
  const player = prev.players[playerIndex];
  const jumps = buildJumpMap(prev.board);

  const from = player.position;
  const rawTarget = from + dice;
  const overshoot = rawTarget > WINNING_SQUARE;

  let finalPos = from;
  let kind: MoveKind = "normal";
  const path: number[] = [];

  if (overshoot) {
    // Rule: player remains at the current position.
    kind = "overshoot";
    finalPos = from;
    path.push(from);
  } else {
    // Step-by-step hop path for animation fidelity: exactly `dice` squares.
    for (let s = from + 1; s <= rawTarget; s++) path.push(s);
    let pos = rawTarget;

    const jump = jumps.get(pos);
    if (jump !== undefined) {
      if (jump > pos) {
        kind = "ladder";
      } else {
        kind = "snake";
      }
      pos = jump;
      // append the jump destination only for real snake/ladder transitions —
      // the last hop square is already in the path for plain moves
      path.push(pos);
    }
    finalPos = pos;
  }

  const won = !overshoot && finalPos === WINNING_SQUARE;

  const nextPlayers = prev.players.map((p, i) =>
    i === playerIndex ? { ...p, position: finalPos } : p
  );

  const record = {
    playerIndex,
    playerName: player.name,
    dice,
    fromPos: from,
    toPos: finalPos,
    kind,
    at: prev.turnCount + 1,
  };

  const base: GameState = {
    ...prev,
    players: nextPlayers,
    lastDice: dice,
    turnCount: prev.turnCount + 1,
    moves: [...prev.moves, record],
    version: prev.version + 1,
  };

  events.push({
    type: "move",
    playerIndex,
    dice,
    from,
    to: finalPos,
    path,
    kind,
  });

  if (won) {
    events.push({ type: "win", playerIndex });
    const next: GameState = {
      ...base,
      status: "completed",
      winnerIndex: playerIndex,
      version: base.version + 1,
    };
    events.push({ type: "turnSwitch", playerIndex, reason: "win" });
    return { next, events };
  }

  if (dice === 6) {
    events.push({ type: "extraTurn", playerIndex, dice });
    return { next: base, events }; // current stays
  }

  const nextIdx = (playerIndex + 1) % prev.players.length;
  events.push({ type: "turnSwitch", playerIndex: nextIdx, reason: "no-six" });
  return { next: { ...base, current: nextIdx }, events };
}

/** Convenience used by servers: run a full match with a predetermined dice sequence (deterministic simulation). */
export function simulateMatch(
  state: GameState,
  diceSequence: number[]
): { state: GameState; events: GameEvent[][]; rolls: number } {
  let cur = state;
  const allEvents: GameEvent[][] = [];
  let i = 0;
  while (cur.status === "active" && i < diceSequence.length) {
    const dice = diceSequence[i];
    const outcome = applyRoll(cur, cur.current, dice);
    cur = outcome.next;
    allEvents.push(outcome.events);
    i++;
  }
  return { state: cur, events: allEvents, rolls: i };
}

export function getPlacements(state: GameState) {
  return [...state.players]
    .map((p, i) => ({ playerIndex: i, name: p.name, position: p.position }))
    .sort((a, b) => b.position - a.position);
}
