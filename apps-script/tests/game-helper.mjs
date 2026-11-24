import { createGame, applyRoll } from '../../packages/engine/src/engine.ts';
import { DEFAULT_BOARD } from '../../packages/engine/src/board.ts';

/** Plays a full game with the REAL shared engine and a seeded dice sequence; returns backend-shaped data. */
export function playGame({ players = 2, seed = 1, maxTurns = 5000, stopAfter = Infinity } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const colors = ['red', 'green', 'yellow', 'purple'].slice(0, players);
  let state = createGame({ id: 'T', players: colors.map((c, i) => ({ id: 'p' + i, name: 'P' + i, color: c, isAI: false })), board: DEFAULT_BOARD });
  const moves = [];
  let n = 0;
  while (state.status === 'active' && n < maxTurns && moves.length < stopAfter) {
    const seat = state.current;
    const dice = 1 + Math.floor(rnd() * 6);
    const { next, events } = applyRoll(state, seat, dice);
    const ev = events.find((e) => e.type === 'move');
    moves.push({ seat, dice, fromPos: ev.from, toPos: ev.to, kind: ev.kind });
    state = next;
    n++;
  }
  return {
    moves,
    winnerSeat: state.winnerIndex ?? -1,
    positions: state.players.map((p) => p.position),
    colors
  };
}

/** Builds the payload of server.recordGame from a played game. */
export function recordPayload(g, playerIds, extra = {}) {
  const order = g.positions.map((pos, seat) => ({ seat, pos }))
    .sort((a, b) => (b.seat === g.winnerSeat ? 1000 : b.pos) - (a.seat === g.winnerSeat ? 1000 : a.pos));
  const placement = {};
  order.forEach((o, i) => { placement[o.seat] = i + 1; });
  return {
    gameId: 'game-' + Math.random().toString(36).slice(2, 10),
    roomCode: 'ABC234',
    forfeited: false,
    winnerSeat: g.winnerSeat,
    players: g.positions.map((pos, seat) => ({
      seat, playerId: playerIds[seat] ?? '', name: 'P' + seat, color: g.colors[seat], finalPosition: pos, placement: placement[seat]
    })),
    moves: JSON.parse(JSON.stringify(g.moves)),
    ...extra
  };
}
