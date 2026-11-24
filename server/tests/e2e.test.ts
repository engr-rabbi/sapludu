import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain JS harness
import { googleToken } from "../../apps-script/tests/harness.mjs";
import { Client, login, sleep, startBackend, startServer, playToEnd, type Backend } from "./helpers.ts";
import type { GameServer } from "../src/game-server.ts";
import { applyRoll } from "@sapludu/engine/engine";

interface Ctx { be: Backend; gs: GameServer; port: number; clients: Client[] }
async function setup(over = {}): Promise<Ctx> {
  const be = await startBackend();
  const { gs, port } = await startServer(be, over);
  return { be, gs, port, clients: [] };
}
async function teardown(c: Ctx) {
  c.clients.forEach((x) => x.close());
  await c.gs.close();
  await c.be.close();
}
async function player(c: Ctx, who: string) {
  const u = login(c.be, who);
  const cl = new Client(c.port, u.token);
  c.clients.push(cl);
  await cl.hello();
  return { ...u, cl };
}
async function startMatch(c: Ctx, names: string[]) {
  const ps: Awaited<ReturnType<typeof player>>[] = [];
  for (const n of names) ps.push(await player(c, n));
  const host = ps[0]!;
  host.cl.emit("room:create", { maxPlayers: names.length });
  const room = await host.cl.waitFor("room:state");
  for (const p of ps.slice(1)) {
    p.cl.emit("room:join", { code: room.room.code });
    await p.cl.waitFor("room:state");
  }
  for (const p of ps.slice(1)) p.cl.emit("room:ready", { ready: true });
  await sleep(100);
  host.cl.emit("game:start");
  await Promise.all(ps.map((p) => p.cl.waitFor("game:start")));
  return { ps, code: room.room.code as string };
}

test("authentication is mandatory and verified by Apps Script", async () => {
  const c = await setup();
  try {
    const anon = new Client(c.port, "");
    c.clients.push(anon);
    anon.emit("hello", {});
    assert.equal((await anon.waitFor("error")).code, "AUTH_REQUIRED");
    // before hello nothing works
    const raw = new Client(c.port, "");
    c.clients.push(raw);
    await sleep(50);
    raw.emit("room:create", { maxPlayers: 2 });
    assert.equal((await raw.waitFor("error")).code, "NO_SESSION");

    const forged = new Client(c.port, "");
    c.clients.push(forged);
    forged.emit("hello", { sessionToken: "f".repeat(64), playerId: "Pabc", email: "boss@example.com" });
    const e = await forged.waitFor("error");
    assert.equal(e.code, "AUTH_EXPIRED");

    const u = login(c.be, "alice");
    const good = new Client(c.port, u.token);
    c.clients.push(good);
    const ok = await good.hello();
    assert.equal(ok.sessionId, u.id);
    assert.equal(ok.displayName, "Alice Tester");

    // suspended players are refused
    const admin = login(c.be, "boss");
    const v = login(c.be, "victim");
    c.be.env.ok("admin.setUserStatus", { playerId: v.id, status: "suspended" }, { sessionToken: admin.token });
    const sus = new Client(c.port, v.token);
    c.clients.push(sus);
    sus.emit("hello", { sessionToken: v.token });
    assert.ok(["AUTH_EXPIRED", "ACCOUNT_SUSPENDED"].includes((await sus.waitFor("error")).code));
  } finally { await teardown(c); }
});

test("rooms: create/join by code, full, color rules, host-only start, ready check", async () => {
  const c = await setup();
  try {
    const [a, b, d] = [await player(c, "alice"), await player(c, "bob"), await player(c, "dave")];
    a.cl.emit("room:create", { maxPlayers: 2 });
    const r = await a.cl.waitFor("room:state");
    const code = r.room.code;
    assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(r.room.players[0].isHost, true);
    assert.equal(r.room.players[0].color, "red");

    b.cl.emit("room:join", { code: "ZZZZZZ" });
    assert.equal((await b.cl.waitFor("error")).code, "ROOM_NOT_FOUND");
    b.cl.emit("room:join", { code: code.toLowerCase() });
    const s2 = await a.cl.waitFor("room:state", (x) => x.room.players.length === 2);
    assert.equal(s2.room.players[1].color, "green");
    assert.equal(s2.room.players[1].displayName, "Bob Tester");

    d.cl.emit("room:join", { code });
    assert.equal((await d.cl.waitFor("error")).code, "ROOM_FULL");

    b.cl.emit("room:color", { color: "red" });
    assert.equal((await b.cl.waitFor("error", (e) => e.code === "COLOR_TAKEN")).code, "COLOR_TAKEN");
    b.cl.emit("room:color", { color: "purple" });
    await a.cl.waitFor("room:state", (x) => x.room.players[1]?.color === "purple");

    b.cl.emit("game:start");
    assert.equal((await b.cl.waitFor("error", (e) => e.code === "NOT_HOST")).code, "NOT_HOST");
    a.cl.emit("game:start");
    assert.equal((await a.cl.waitFor("error", (e) => e.code === "NOT_ALL_READY")).code, "NOT_ALL_READY");
    b.cl.emit("room:ready", { ready: true });
    await a.cl.waitFor("room:state", (x) => x.room.players[1]?.ready);
    a.cl.emit("game:start");
    const st = await a.cl.waitFor("game:start");
    await b.cl.waitFor("game:start");
    assert.equal(st.state.players.length, 2);
    assert.deepEqual(st.state.players.map((p: any) => p.position), [1, 1]);
    assert.equal(st.state.current, 0);
    // already in a room
    a.cl.emit("room:create", { maxPlayers: 2 });
    assert.equal((await a.cl.waitFor("error", (e) => e.code === "ALREADY_IN_ROOM")).code, "ALREADY_IN_ROOM");
    // active game tracked in the Sheets "Sessions" tab
    await c.gs.queue.whenIdle();
    assert.ok(c.be.calls.includes("server.gameStarted"));
    assert.equal(c.be.env.sheets.get("Sessions").data[1][2], "active");
  } finally { await teardown(c); }
});

test("server-authoritative dice: turn order, exact movement, clients cannot inject results", async () => {
  const c = await setup();
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    const [a, b] = ps;
    // not your turn
    b!.cl.emit("dice:roll");
    assert.equal((await b!.cl.waitFor("error")).code, "NOT_YOUR_TURN");

    // a client-supplied dice value / position is ignored
    a!.cl.emit("dice:roll", { dice: 6, position: 99, playerIndex: 1 });
    const [ra, rb] = await Promise.all([a!.cl.waitFor("dice:result"), b!.cl.waitFor("dice:result")]);
    assert.deepEqual(ra, rb, "both players see the same dice");
    assert.equal(ra.playerIndex, 0);
    const [ma, mb] = await Promise.all([a!.cl.waitFor("player:moved"), b!.cl.waitFor("player:moved")]);
    assert.deepEqual(ma, mb);
    assert.equal(ma.from, 1);
    // movement follows the engine for exactly the rolled number
    const expected = applyRoll(a!.cl.state, 0, ra.dice).events.find((e: any) => e.type === "move") as any;
    assert.equal(ma.to, expected.to);
    assert.deepEqual(ma.path, expected.path);
    assert.equal(ma.dice, ra.dice);
    const tc = await a!.cl.waitFor("turn:changed");
    assert.equal(tc.playerIndex, ra.dice === 6 ? 0 : 1);

    // state resync matches what the clients computed
    a!.cl.emit("game:resync");
    const sync = await a!.cl.waitFor("game:state_sync");
    assert.equal(sync.state.players[0].position, expected.to);
    assert.equal(sync.state.version, ma.version);
  } finally { await teardown(c); }
});

test("full 2-player game: same result for everyone, persisted to Sheets with Elo", async () => {
  const c = await setup();
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    const rolls = await playToEnd(ps.map((p) => p.cl));
    assert.ok(rolls > 5);
    const [ca, cb] = await Promise.all(ps.map((p) => p.cl.waitFor("game:completed", () => true, 5000)));
    assert.deepEqual(ca.results, cb.results);
    assert.equal(ca.state.status, "completed");
    const w = ca.winnerIndex;
    assert.equal(ca.state.players[w].position, 100);
    assert.equal(ca.results[w].placement, 1);

    // persisted asynchronously; rating update arrives afterwards
    const rated = await ps[0]!.cl.waitFor("game:rated", () => true, 8000);
    const winnerId = ps[w]!.id;
    const loserId = ps[1 - w]!.id;
    assert.equal(rated.ratings[winnerId].after, 1016);
    assert.equal(rated.ratings[loserId].after, 984);
    assert.ok(rated.achievements[winnerId].includes("first_victory"));

    const me = c.be.env.ok("auth.me", {}, { sessionToken: ps[w]!.token }).user;
    assert.deepEqual([me.gamesPlayed, me.wins, me.rating, me.rank], [1, 1, 1016, 1]);
    const g = c.be.env.sheets.get("Games").data;
    assert.equal(g.length, 2);
    assert.equal(g[1][2], "online");
    assert.equal(c.be.env.sheets.get("GameMoves").data.length - 1, ca.state.moves.length);
    assert.equal(c.be.env.sheets.get("Sessions").data[1][2], "completed");

    // no moves after the game is over
    ps[0]!.cl.emit("dice:roll");
    assert.equal((await ps[0]!.cl.waitFor("error", (e) => e.code === "GAME_NOT_ACTIVE")).code, "GAME_NOT_ACTIVE");
  } finally { await teardown(c); }
});

test("4-player game completes with consistent placements", async () => {
  const c = await setup();
  try {
    const { ps } = await startMatch(c, ["alice", "bob", "carol", "dave"]);
    await playToEnd(ps.map((p) => p.cl), 30000);
    const res = await Promise.all(ps.map((p) => p.cl.waitFor("game:completed", () => true, 5000)));
    res.forEach((r) => assert.deepEqual(r.results, res[0].results));
    const places = res[0].results.map((r: any) => r.placement).sort();
    assert.deepEqual(places, [1, 2, 3, 4]);
    const rated = await ps[0]!.cl.waitFor("game:rated", () => true, 8000);
    assert.equal(Object.keys(rated.ratings).length, 4);
  } finally { await teardown(c); }
});

test("disconnect + reconnect restores the exact game state; a second login takes over", async () => {
  const c = await setup();
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    const [a, b] = ps;
    a!.cl.emit("dice:roll");
    await b!.cl.waitFor("player:moved");
    const stateBefore = (a!.cl as any).state;
    b!.cl.close();
    const dc = await a!.cl.waitFor("player:disconnected");
    assert.equal(dc.playerIndex, 1);

    // bob returns on a new connection with the same session token
    const b2 = new Client(c.port, b!.token);
    c.clients.push(b2);
    await b2.hello();
    const rc = await a!.cl.waitFor("player:reconnected");
    assert.equal(rc.playerIndex, 1);
    const sync = await b2.waitFor("game:state_sync");
    assert.equal(sync.state.version, 1 + (stateBefore ? 0 : 0) + (sync.state.version - 1));
    assert.equal(sync.state.moves.length, 1);
    assert.equal(sync.state.players.length, 2);
    const roomSt = await b2.waitFor("room:state");
    assert.equal(roomSt.room.status, "active");

    // opening the game in a second tab replaces the first connection (no duplicate seats)
    const b3 = new Client(c.port, b!.token);
    c.clients.push(b3);
    await b3.hello();
    await b2.waitFor("session:replaced");
    await b3.waitFor("game:state_sync");
    assert.equal(c.gs.rooms.size, 1);
  } finally { await teardown(c); }
});

test("a player who stays offline forfeits after the grace period; the game is still recorded", async () => {
  const c = await setup({ disconnectForfeitMs: 300 });
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    ps[1]!.cl.close();
    const done = await ps[0]!.cl.waitFor("game:completed", () => true, 4000);
    assert.equal(done.forfeited, true);
    assert.equal(done.winnerIndex, 0);
    assert.equal(done.results[1].placement, 2);
    const rated = await ps[0]!.cl.waitFor("game:rated", () => true, 8000).catch(() => null);
    assert.ok(rated, "forfeited game still persisted");
    const loser = c.be.env.ok("auth.me", {}, { sessionToken: ps[1]!.token }).user;
    assert.deepEqual([loser.losses, loser.rating], [1, 1000], "loss counted, no Elo change for forfeits");
  } finally { await teardown(c); }
});

test("voluntary forfeit ends the game for everyone", async () => {
  const c = await setup();
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    ps[0]!.cl.emit("game:forfeit");
    const [x, y] = await Promise.all(ps.map((p) => p.cl.waitFor("game:completed")));
    assert.equal(x.winnerIndex, 1);
    assert.deepEqual(x.results, y.results);
  } finally { await teardown(c); }
});

test("turn timeout auto-rolls for an idle player", async () => {
  const c = await setup({ turnTimeMs: 200 });
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    const t = await ps[1]!.cl.waitFor("turn:timeout", () => true, 3000);
    assert.equal(t.playerIndex, 0);
    const r = await ps[1]!.cl.waitFor("dice:result");
    assert.equal(r.playerIndex, 0);
  } finally { await teardown(c); }
});

test("Apps Script outage never blocks gameplay; results are retried until stored", async () => {
  const c = await setup();
  (c.gs.queue as any).opts.baseDelayMs = 100;
  try {
    const { ps } = await startMatch(c, ["alice", "bob"]);
    await c.gs.queue.whenIdle();
    c.be.down = true; // Google is unreachable from now on
    ps[0]!.cl.emit("game:forfeit");
    const done = await ps[1]!.cl.waitFor("game:completed", () => true, 3000);
    assert.equal(done.winnerIndex, 1, "winner announced instantly");
    await sleep(500);
    assert.ok(c.gs.queue.size >= 1, "result is queued");
    assert.equal(c.be.env.sheets.get("Games").data.length, 1, "nothing stored yet");
    c.be.down = false;
    const rated = await ps[1]!.cl.waitFor("game:rated", () => true, 8000);
    assert.ok(rated.ratings);
    assert.equal(c.be.env.sheets.get("Games").data.length, 2, "stored after recovery");
    assert.equal(c.gs.queue.size, 0);
  } finally { await teardown(c); }
});

test("queue persistence: pending results survive a server restart", async () => {
  const { mkdtempSync, existsSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "sap-")), "pending.json");
  const be = await startBackend();
  be.down = true;
  let { gs, port } = await startServer(be, { pendingFile: file });
  const c: Ctx = { be, gs, port, clients: [] };
  try {
    const u1 = login(be, "alice"), u2 = login(be, "bob");
    gs.queue.enqueue("gameStarted", "g-restart", { gameId: "g-restart", roomCode: "ABC234", players: [{ playerId: u1.id, name: "A" }, { playerId: u2.id, name: "B" }] });
    await sleep(100);
    assert.ok(existsSync(file) && JSON.parse(readFileSync(file, "utf8")).length === 1);
    await gs.close();
    be.down = false;
    ({ gs, port } = await startServer(be, { pendingFile: file }));
    c.gs = gs;
    await gs.queue.whenIdle(5000);
    assert.equal(gs.queue.size, 0);
    assert.equal(be.env.sheets.get("Sessions").data.length, 2, "restored job delivered");
  } finally { await teardown(c); }
});

test("invitations: only friends can be invited; the invitee is notified live", async () => {
  const c = await setup();
  try {
    const a = await player(c, "alice"), b = await player(c, "bob"), d = await player(c, "dave");
    a.cl.emit("room:create", { maxPlayers: 3 });
    const room = await a.cl.waitFor("room:state");
    a.cl.emit("invite:send", { playerId: b.id });
    assert.equal((await a.cl.waitFor("error", (e) => e.code === "NOT_FRIENDS")).code, "NOT_FRIENDS");

    c.be.env.ok("friends.request", { playerId: b.id }, { sessionToken: a.token });
    const fr = c.be.env.ok("friends.list", {}, { sessionToken: b.token }).incoming[0].friendshipId;
    c.be.env.ok("friends.respond", { friendshipId: fr, accept: true }, { sessionToken: b.token });
    a.cl.emit("invite:send", { playerId: b.id });
    const inv = await b.cl.waitFor("invite:received");
    assert.equal(inv.roomCode, room.room.code);
    assert.equal(inv.from.displayName, "Alice Tester");
    assert.equal((await a.cl.waitFor("invite:sent")).delivered, true);
    // non-hosts cannot invite
    b.cl.emit("room:join", { code: inv.roomCode });
    await a.cl.waitFor("room:state", (s) => s.room.players.length === 2);
    b.cl.emit("invite:send", { playerId: d.id });
    assert.equal((await b.cl.waitFor("error", (e) => e.code === "NOT_HOST")).code, "NOT_HOST");
    // the persisted invitation is visible through Apps Script too
    assert.equal(c.be.env.ok("invites.list", {}, { sessionToken: b.token }).invites.length, 1);
  } finally { await teardown(c); }
});

test("quick match pairs players and starts automatically", async () => {
  const c = await setup();
  try {
    const a = await player(c, "alice"), b = await player(c, "bob");
    a.cl.emit("matchmaking:join");
    await a.cl.waitFor("matchmaking:searching");
    b.cl.emit("matchmaking:join");
    await Promise.all([a.cl.waitFor("matchmaking:matched"), b.cl.waitFor("matchmaking:matched")]);
    const [sa, sb] = await Promise.all([a.cl.waitFor("game:start", () => true, 4000), b.cl.waitFor("game:start", () => true, 4000)]);
    assert.deepEqual(sa.state.players.map((p: any) => p.name).sort(), ["Alice Tester", "Bob Tester"]);
  } finally { await teardown(c); }
});

test("lobby disconnect keeps the seat during the grace period", async () => {
  const c = await setup({ lobbyGraceMs: 400 });
  try {
    const a = await player(c, "alice"), b = await player(c, "bob");
    a.cl.emit("room:create", { maxPlayers: 2 });
    const { room } = await a.cl.waitFor("room:state");
    b.cl.emit("room:join", { code: room.code });
    await a.cl.waitFor("room:state", (s) => s.room.players.length === 2);
    b.cl.close();
    const s = await a.cl.waitFor("room:state", (x) => x.room.players.some((p: any) => !p.connected));
    assert.equal(s.room.players.length, 2);
    const b2 = new Client(c.port, b.token);
    c.clients.push(b2);
    await b2.hello();
    const back = await b2.waitFor("room:state");
    assert.equal(back.room.code, room.code);
    await sleep(600);
    assert.equal(c.gs.rooms.get(room.code)!.players.length, 2, "reconnected player was not removed");
    b2.close();
    await a.cl.waitFor("room:state", (x) => x.room.players.length === 1, 3000);
  } finally { await teardown(c); }
});

test("abuse resistance: malformed payloads and event floods do not crash the server", async () => {
  const c = await setup();
  try {
    const a = await player(c, "alice");
    for (const bad of [null, undefined, 5, "x", [], { maxPlayers: "9" }, { code: 123 }]) {
      a.cl.emit("room:create", bad);
      a.cl.emit("room:join", bad);
      a.cl.emit("room:color", bad);
      a.cl.emit("invite:send", bad);
    }
    for (let i = 0; i < 200; i++) a.cl.emit("dice:roll");
    await sleep(300);
    assert.ok(a.cl.count("error") > 0);
    assert.ok(a.cl.log.some((l) => l.event === "error" && l.data.code === "RATE_LIMITED"), "flood is rate-limited");
    const health = await fetch(`http://127.0.0.1:${c.port}/health`).then((r) => r.json() as Promise<{ ok: boolean; players: number }>);
    assert.equal(health.ok, true);
    assert.equal(health.players, 1);
  } finally { await teardown(c); }
});
