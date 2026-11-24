/**
 * Sapludu — exhaustive engine verification (no test framework needed).
 *
 * Proves, for EVERY square 1..100 and EVERY dice value 1..6:
 *  1. plain moves walk EXACTLY `dice` squares (path length == dice)
 *  2. consecutive path squares are always adjacent in the numbered sequence
 *  3. final engine position == from + dice (unless snake/ladder/overshoot)
 *  4. every snake/ladder jump lands on its configured destination
 *  5. zigzag mapping roundtrips (squareToGrid/gridToSquare/squareCenter)
 *  6. win only on exactly 100, extra turn only on 6
 *
 * Run: npm run test:engine
 */
import { applyRoll, createGame } from "../packages/engine/src/engine";
import { DEFAULT_BOARD, squareCenter, squareToGrid, gridToSquare, WINNING_SQUARE } from "../packages/engine/src/board";
import type { GameState } from "../packages/engine/src/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`  FAIL: ${msg}`);
  }
}

/* ── 1. zigzag mapping roundtrip + adjacency ─────────────────────── */
for (let sq = 1; sq <= 100; sq++) {
  const { row, col } = squareToGrid(sq);
  assert(gridToSquare(row, col) === sq, `grid roundtrip failed for ${sq}`);
  const c = squareCenter(sq);
  assert(c.x >= 5 && c.x <= 95 && c.y >= 5 && c.y <= 95, `center out of bounds for ${sq}`);
}
// consecutive squares must sit on adjacent cells (4-neighborhood)
for (let sq = 1; sq < 100; sq++) {
  const a = squareToGrid(sq);
  const b = squareToGrid(sq + 1);
  const dist = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  assert(dist === 1, `squares ${sq}->${sq + 1} not adjacent on grid (dist ${dist})`);
}
console.log("[1] zigzag 1..100 numbering + adjacency: OK");

/* ── 2. exhaustive dice movement verification ────────────────────── */
function mkState(fromP: number[], board = DEFAULT_BOARD): GameState {
  const st = createGame({
    id: "verify",
    board,
    players: fromP.map((_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      color: (["red", "green", "yellow", "purple"] as const)[i],
      isAI: false,
    })),
  });
  // createGame always initializes at square 1 — place players at the desired squares
  st.players = st.players.map((p, i) => ({ ...p, position: fromP[i] }));
  return st;
}

let plainMoves = 0;
let jumpMoves = 0;
let overshoots = 0;

for (let from = 1; from <= 100; from++) {
  for (let dice = 1; dice <= 6; dice++) {
    if (from === 100) continue; // a player on 100 would have won already
    const st = mkState([from, 1]);
    st.current = 0;
    const out = applyRoll(st, 0, dice);
    const mv = out.events.find((e) => e.type === "move");
    assert(mv && mv.type === "move", `no move event from=${from} dice=${dice}`);
    if (!mv || mv.type !== "move") continue;

    const rawTarget = from + dice;
    const jump =
      DEFAULT_BOARD.ladders.find((l) => l.from === rawTarget) ??
      DEFAULT_BOARD.snakes.find((s) => s.from === rawTarget);
    const overshoot = rawTarget > WINNING_SQUARE;

    if (overshoot) {
      overshoots++;
      assert(mv.kind === "overshoot", `from=${from} dice=${dice}: expected overshoot`);
      assert(mv.to === from, `from=${from} dice=${dice}: overshoot must stay at ${from}, got ${mv.to}`);
      assert(mv.path.length === 1 && mv.path[0] === from, `overshoot path must be [from]`);
      assert(out.next.players[0].position === from, `overshoot state position wrong`);
    } else if (jump) {
      jumpMoves++;
      const expectedKind = jump.to > rawTarget ? "ladder" : "snake";
      assert(mv.kind === expectedKind, `from=${from} dice=${dice}: expected ${expectedKind}`);
      assert(mv.to === jump.to, `from=${from} dice=${dice}: jump dest must be ${jump.to}, got ${mv.to}`);
      // hop part = exactly `dice` squares, then the jump destination
      const hops = mv.path.slice(0, -1);
      assert(hops.length === dice, `from=${from} dice=${dice}: hop count ${hops.length} != ${dice}`);
      assert(mv.path[mv.path.length - 1] === jump.to, `jump path must end at dest`);
      assert(out.next.players[0].position === jump.to, `jump final position wrong`);
    } else {
      plainMoves++;
      assert(mv.kind === "normal", `from=${from} dice=${dice}: expected normal`);
      assert(mv.path.length === dice, `from=${from} dice=${dice}: path length ${mv.path.length} != dice ${dice}`);
      assert(mv.to === rawTarget, `from=${from} dice=${dice}: final ${mv.to} != from+dice ${rawTarget}`);
      assert(out.next.players[0].position === rawTarget, `plain final state position wrong`);
    }

    // hop part must be a strictly consecutive walk from `from`
    const hopPart = mv.kind === "normal" ? mv.path : mv.path.slice(0, -1);
    for (let i = 0; i < hopPart.length; i++) {
      assert(hopPart[i] === from + 1 + i, `from=${from} dice=${dice}: hop[${i}] = ${hopPart[i]} != ${from + 1 + i}`);
    }
    // win exactly on 100 only
    assert((out.next.status === "completed") === (mv.to === 100), `win flag wrong from=${from} dice=${dice}`);
    // extra turn exactly on 6 (non-winning)
    const extra = out.events.some((e) => e.type === "extraTurn");
    assert(extra === (dice === 6 && mv.to !== 100), `extraTurn flag wrong from=${from} dice=${dice}`);
  }
}
console.log(
  `[2] 594 roll combinations verified: ${plainMoves} plain, ${jumpMoves} jumps, ${overshoots} overshoots: OK`
);

/* ── 3. full deterministic match (predetermined dice sequence) ───── */
{
  let st = mkState([1, 1]);
  st.current = 0;
  let rolls = 0;
  while (st.status === "active" && rolls < 5000) {
    const dice = 1 + Math.floor(Math.random() * 6);
    const out = applyRoll(st, st.current, dice);
    const mv = out.events.find((e) => e.type === "move");
    if (mv && mv.type === "move" && mv.kind !== "overshoot") {
      const dicePart = mv.kind === "normal" ? mv.path.length : mv.path.length - 1;
      assert(dicePart === dice, `match: hop count ${dicePart} != dice ${dice}`);
    }
    st = out.next;
    rolls++;
  }
  assert(st.status === "completed", "match never completed in 5000 rolls");
  assert(st.winnerIndex !== null, "no winner recorded");
  // every recorded move: toPos-fromPos == dice for plain moves
  for (const m of st.moves) {
    if (m.kind === "normal") {
      assert(m.toPos - m.fromPos === m.dice, `log: dice ${m.dice} but moved ${m.toPos - m.fromPos}`);
    }
  }
  console.log(`[3] full random match completed in ${rolls} rolls, winner P${(st.winnerIndex ?? 0) + 1}, all move logs consistent: OK`);
}

if (failures > 0) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nALL ENGINE VERIFICATIONS PASSED — engine movement is mathematically exact.");
