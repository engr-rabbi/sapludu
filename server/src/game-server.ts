/**
 * SAPLUDU real-time game server (Socket.IO).
 *
 * The server is the single authority for online games:
 *   - identities come from Google Apps Script (session token → verified player), never from the browser
 *   - dice come from crypto.randomInt, every move goes through the shared pure engine
 *   - clients only send intents (roll, ready, join…); they can never submit a result
 *   - finished games are persisted to Google Sheets (via Apps Script) asynchronously with retries, so a slow
 *     Apps Script never delays the winner announcement
 *
 * Active rooms live in memory (single instance). Sheets is the durable store for users, games and ratings.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes, randomInt, createHash } from "node:crypto";
import { Server as IOServer, type Socket } from "socket.io";
import { createGame, applyRoll, EngineError } from "@sapludu/engine/engine";
import { DEFAULT_BOARD } from "@sapludu/engine/board";
import type { GameState, TokenColor } from "@sapludu/engine/types";
import type { ServerConfig } from "./config.ts";
import { GasError, ResultQueue, type GasClient, type RecordGamePayload, type VerifiedUser } from "./gas.ts";

const COLORS: TokenColor[] = ["red", "green", "yellow", "purple"];
/** 6-char room codes without confusing characters (no I, L, O, 0, 1). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MM_START_DELAY_MS = 1200;
const MAX_NAME_LEN = 60;

type Timer = ReturnType<typeof setTimeout>;

interface Session {
  playerId: string;
  displayName: string;
  picture: string;
  role: string;
  socketId: string;
  roomCode: string | null;
  mmQueued: boolean;
  /** token bucket */
  tokens: number;
  tokensAt: number;
  lastRollAt: number;
}

interface RoomPlayer {
  playerId: string;
  displayName: string;
  picture: string;
  color: TokenColor;
  ready: boolean;
  connected: boolean;
}

interface Room {
  code: string;
  hostId: string;
  maxPlayers: number;
  status: "lobby" | "active" | "completed";
  players: RoomPlayer[];
  autoReady: boolean;
  game: { id: string; state: GameState; turnTimer: Timer | null; startedAt: number } | null;
  matchReported: boolean;
  timers: Map<string, Timer>; // playerId → disconnect / lobby-grace timer
  deleteTimer: Timer | null;
}

interface CompletedResult {
  playerIndex: number;
  name: string;
  userId: string | null;
  placement: number;
  position: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface GameServer {
  io: IOServer;
  http: HttpServer;
  queue: ResultQueue;
  rooms: Map<string, Room>;
  listen(): Promise<number>;
  close(): Promise<void>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const isColor = (v: unknown): v is TokenColor => typeof v === "string" && (COLORS as string[]).includes(v);

export function createGameServer(cfg: ServerConfig, gas: GasClient, logger: (m: string) => void = console.log): GameServer {
  const log = (m: string) => logger(m);

  const sessions = new Map<string, Session>(); // socketId → Session
  const byPlayer = new Map<string, string>(); // playerId → socketId
  const playerRoom = new Map<string, string>(); // playerId → room code (survives reconnects)
  const rooms = new Map<string, Room>();
  const mmQueue: string[] = []; // playerIds
  const verifyCache = new Map<string, { user: VerifiedUser; until: number }>();

  const queue = new ResultQueue(gas, { file: cfg.pendingFile, log });
  const http = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, service: "sapludu-game-server", rooms: rooms.size, players: sessions.size, pendingJobs: queue.size }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("sapludu-game-server");
  });

  const io = new IOServer(http, {
    cors: { origin: cfg.corsOrigins.length ? cfg.corsOrigins : false, methods: ["GET", "POST"] },
    pingTimeout: 30_000,
    pingInterval: 20_000,
    maxHttpBufferSize: 16_384,
  });

  // ───────────── utilities ─────────────

  function newCode(): string {
    for (let i = 0; i < 64; i++) {
      let c = "";
      for (let k = 0; k < 6; k++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    return randomBytes(3).toString("hex").toUpperCase();
  }

  const fail = (socket: Socket, code: string, message: string): void => void socket.emit("error", { code, message });

  function requireSession(socket: Socket): Session | null {
    const s = sessions.get(socket.id);
    if (!s) {
      fail(socket, "NO_SESSION", "Sign in first (hello)");
      return null;
    }
    return s;
  }

  const socketOf = (playerId: string): Socket | undefined => {
    const id = byPlayer.get(playerId);
    return id ? io.sockets.sockets.get(id) : undefined;
  };

  const roomOf = (s: Session): Room | null => (s.roomCode ? (rooms.get(s.roomCode) ?? null) : null);
  const indexIn = (room: Room, playerId: string) => room.players.findIndex((p) => p.playerId === playerId);
  const freeColor = (room: Room): TokenColor => {
    const taken = new Set(room.players.map((p) => p.color));
    return COLORS.find((c) => !taken.has(c)) ?? "red";
  };

  function roomPayload(room: Room) {
    return {
      room: {
        code: room.code,
        maxPlayers: room.maxPlayers,
        status: room.status,
        players: room.players.map((p) => ({
          sessionId: p.playerId,
          userId: p.playerId,
          displayName: p.displayName,
          picture: p.picture,
          color: p.color,
          ready: p.ready,
          connected: p.connected,
          isHost: p.playerId === room.hostId,
        })),
      },
    };
  }
  const emitRoom = (room: Room) => io.to(room.code).emit("room:state", roomPayload(room));

  function clearTimers(room: Room) {
    stopTurnTimer(room);
    for (const t of room.timers.values()) clearTimeout(t);
    room.timers.clear();
  }

  function deleteRoom(room: Room, reason: string) {
    if (room.deleteTimer) clearTimeout(room.deleteTimer);
    clearTimers(room);
    for (const p of room.players) if (playerRoom.get(p.playerId) === room.code) playerRoom.delete(p.playerId);
    rooms.delete(room.code);
    log(`[room] ${room.code} deleted (${reason})`);
  }

  // ───────────── turns & dice ─────────────

  function stopTurnTimer(room: Room) {
    if (room.game?.turnTimer) {
      clearTimeout(room.game.turnTimer);
      room.game.turnTimer = null;
    }
  }
  function startTurnTimer(room: Room) {
    stopTurnTimer(room);
    if (room.status !== "active" || !room.game) return;
    room.game.turnTimer = setTimeout(() => onTurnTimeout(room), cfg.turnTimeMs);
  }
  function onTurnTimeout(room: Room) {
    if (room.game) room.game.turnTimer = null;
    if (room.status !== "active" || !room.game) return;
    const idx = room.game.state.current;
    io.to(room.code).emit("turn:timeout", { playerIndex: idx });
    performRoll(room, idx, null);
  }

  /** Used by `dice:roll` and the turn-timeout auto roll. Synchronous ⇒ duplicate rolls are impossible. */
  function performRoll(room: Room, playerIndex: number, sender: Socket | null) {
    if (!room.game || room.status !== "active") return;
    const dice = randomInt(1, 7); // the ONLY source of randomness for online games
    try {
      const outcome = applyRoll(room.game.state, playerIndex, dice);
      const move = outcome.events.find((e) => e.type === "move");
      io.to(room.code).emit("dice:result", { playerIndex, dice });
      if (move && move.type === "move") {
        io.to(room.code).emit("player:moved", {
          playerIndex: move.playerIndex,
          playerName: room.game.state.players[playerIndex]?.name ?? `P${playerIndex}`,
          dice,
          from: move.from,
          to: move.to,
          path: move.path,
          kind: move.kind,
          version: outcome.next.version,
        });
      }
      room.game.state = outcome.next;

      if (outcome.events.some((e) => e.type === "win")) {
        stopTurnTimer(room);
        completeMatch(room, false, null);
        return;
      }
      if (outcome.events.some((e) => e.type === "extraTurn")) {
        io.to(room.code).emit("turn:changed", { playerIndex, reason: "extra-turn" });
      } else {
        io.to(room.code).emit("turn:changed", { playerIndex: outcome.next.current, reason: "no-six" });
      }
      startTurnTimer(room);
    } catch (err) {
      const target = sender ?? io.to(room.code);
      if (err instanceof EngineError) target.emit("error", { code: err.code, message: err.message });
      else {
        log(`[game] ${room.code} roll crashed: ${String(err)}`);
        target.emit("error", { code: "INTERNAL", message: "Internal server error" });
      }
    }
  }

  function startGame(room: Room): boolean {
    if (room.status !== "lobby" || room.game || room.players.length < 2) return false;
    let state: GameState;
    const gameId = "g-" + randomBytes(8).toString("hex");
    try {
      state = createGame({
        id: gameId,
        players: room.players.map((p) => ({ id: p.playerId, name: p.displayName.slice(0, MAX_NAME_LEN), color: p.color, isAI: false, connected: true })),
        board: DEFAULT_BOARD,
      });
    } catch (err) {
      io.to(room.code).emit("error", err instanceof EngineError ? { code: err.code, message: err.message } : { code: "INTERNAL", message: "Failed to start the game" });
      return false;
    }
    room.game = { id: gameId, state, turnTimer: null, startedAt: Date.now() };
    room.status = "active";
    emitRoom(room);
    io.to(room.code).emit("game:start", { state });
    startTurnTimer(room);
    queue.enqueue("gameStarted", gameId, {
      gameId,
      roomCode: room.code,
      players: room.players.map((p) => ({ playerId: p.playerId, name: p.displayName })),
    });
    log(`[game] ${room.code} started (${gameId}) — ${state.players.map((p) => `${p.name}(${p.color})`).join(", ")}`);
    return true;
  }

  // ───────────── completion (win / forfeit) ─────────────

  function completeMatch(room: Room, forfeited: boolean, forfeiterIndex: number | null) {
    if (room.status === "completed" || room.matchReported) return; // idempotent
    const game = room.game;
    if (!game) return;
    clearTimers(room);
    room.status = "completed";
    room.matchReported = true;
    const state = game.state;
    const n = state.players.length;

    let winnerIndex: number;
    let finalState = state;
    const placementOf = new Map<number, number>();
    if (forfeited && forfeiterIndex !== null) {
      const others = state.players.map((p, i) => ({ i, pos: p.position, connected: room.players[i]?.connected ?? false })).filter((x) => x.i !== forfeiterIndex);
      const pool = others.filter((x) => x.connected).length ? others.filter((x) => x.connected) : others;
      pool.sort((a, b) => b.pos - a.pos);
      winnerIndex = pool[0]?.i ?? forfeiterIndex;
      finalState = { ...state, status: "completed", winnerIndex, version: state.version + 1 };
      game.state = finalState;
      others.sort((a, b) => (a.i === winnerIndex ? 1000 : b.i === winnerIndex ? -1000 : 0) || b.pos - a.pos);
      others.forEach((o, rank) => placementOf.set(o.i, rank + 1));
      placementOf.set(forfeiterIndex, n);
    } else {
      winnerIndex = state.winnerIndex ?? 0;
      [...state.players.keys()]
        .sort((a, b) => (b === winnerIndex ? 1000 : state.players[b]!.position) - (a === winnerIndex ? 1000 : state.players[a]!.position))
        .forEach((idx, rank) => placementOf.set(idx, rank + 1));
    }

    const results: CompletedResult[] = state.players.map((p, i) => ({
      playerIndex: i,
      name: p.name,
      userId: room.players[i]?.playerId ?? null,
      placement: placementOf.get(i) ?? i + 1,
      position: p.position,
      ratingBefore: null,
      ratingAfter: null,
    }));

    // 1) tell everybody immediately — never wait for Google
    io.to(room.code).emit("game:completed", { state: finalState, results, winnerIndex, forfeited });
    log(`[match] ${room.code} completed — winner p${winnerIndex}${forfeited ? " (forfeit)" : ""}, ${state.moves.length} moves`);

    // 2) persist asynchronously with retries
    const payload: RecordGamePayload = {
      gameId: game.id,
      roomCode: room.code,
      forfeited,
      winnerSeat: winnerIndex,
      startedAt: new Date(game.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      players: results.map((r) => ({
        seat: r.playerIndex,
        playerId: r.userId ?? "",
        name: r.name.slice(0, MAX_NAME_LEN),
        color: state.players[r.playerIndex]!.color,
        finalPosition: r.position,
        placement: r.placement,
      })),
      moves: state.moves.map((m) => ({ seat: m.playerIndex, dice: m.dice, fromPos: m.fromPos, toPos: m.toPos, kind: m.kind })),
    };
    queue.enqueue("recordGame", game.id, payload);

    room.deleteTimer = setTimeout(() => {
      if (rooms.get(room.code) === room) deleteRoom(room, "TTL after completion");
    }, cfg.completedRoomTtlMs);
  }

  queue.onDone = (job, result) => {
    if (job.kind !== "recordGame") return;
    const p = job.payload as RecordGamePayload;
    const r = result as { ratings?: Record<string, { before: number; after: number }>; achievements?: Record<string, string[]> };
    io.to(p.roomCode).emit("game:rated", { gameId: p.gameId, ratings: r.ratings ?? {}, achievements: r.achievements ?? {} });
  };

  // ───────────── lobby helpers ─────────────

  function removeFromLobby(room: Room, playerId: string) {
    const idx = indexIn(room, playerId);
    if (idx >= 0) room.players.splice(idx, 1);
    const t = room.timers.get(playerId);
    if (t) clearTimeout(t);
    room.timers.delete(playerId);
    if (playerRoom.get(playerId) === room.code) playerRoom.delete(playerId);
    if (room.players.length === 0) return deleteRoom(room, "lobby empty");
    if (room.hostId === playerId) room.hostId = room.players[0]!.playerId;
    emitRoom(room);
  }

  function releaseCompleted(s: Session) {
    const room = roomOf(s);
    s.roomCode = null;
    playerRoom.delete(s.playerId);
    if (!room || room.status !== "completed") return;
    const idx = indexIn(room, s.playerId);
    if (idx >= 0) room.players.splice(idx, 1);
    socketOf(s.playerId)?.leave(room.code);
    if (room.players.length === 0) deleteRoom(room, "empty after completed release");
    else emitRoom(room);
  }

  function ensureFree(s: Session, socket: Socket): boolean {
    if (!s.roomCode) return true;
    const room = rooms.get(s.roomCode);
    if (!room) {
      s.roomCode = null;
      return true;
    }
    if (room.status === "completed") {
      releaseCompleted(s);
      return true;
    }
    fail(socket, "ALREADY_IN_ROOM", "You are already in a room");
    return false;
  }

  function newRoom(host: Session, maxPlayers: number, autoReady: boolean): Room {
    const room: Room = {
      code: newCode(), hostId: host.playerId, maxPlayers, status: "lobby", players: [], autoReady, game: null,
      matchReported: false, timers: new Map(), deleteTimer: null,
    };
    rooms.set(room.code, room);
    return room;
  }

  function seat(room: Room, s: Session, socket: Socket) {
    room.players.push({ playerId: s.playerId, displayName: s.displayName, picture: s.picture, color: freeColor(room), ready: room.autoReady, connected: true });
    s.roomCode = room.code;
    playerRoom.set(s.playerId, room.code);
    socket.join(room.code);
  }

  // ───────────── matchmaking ─────────────

  const removeFromQueue = (id: string) => {
    const i = mmQueue.indexOf(id);
    if (i >= 0) mmQueue.splice(i, 1);
  };

  function tryMatchmaking() {
    while (mmQueue.length >= 2) {
      const group = mmQueue.splice(0, 4);
      const entries: { s: Session; socket: Socket }[] = [];
      for (const pid of group) {
        const socket = socketOf(pid);
        const s = socket ? sessions.get(socket.id) : undefined;
        if (s && socket && s.mmQueued && !s.roomCode) entries.push({ s, socket });
      }
      if (entries.length < 2) {
        for (const e of entries.reverse()) mmQueue.unshift(e.s.playerId);
        return;
      }
      const room = newRoom(entries[0]!.s, entries.length, true);
      for (const { s, socket } of entries) {
        seat(room, s, socket);
        s.mmQueued = false;
        socket.emit("matchmaking:matched");
      }
      emitRoom(room);
      log(`[mm] matched ${entries.length} players into ${room.code}`);
      setTimeout(() => {
        if (rooms.get(room.code) === room && room.status === "lobby") {
          if (room.players.length < 2) {
            io.to(room.code).emit("room:closed");
            deleteRoom(room, "matchmaking abort");
          } else startGame(room);
        }
      }, MM_START_DELAY_MS);
    }
  }

  // ───────────── authentication ─────────────

  async function verify(token: string): Promise<VerifiedUser> {
    const key = createHash("sha256").update(token).digest("hex");
    const hit = verifyCache.get(key);
    if (hit && hit.until > Date.now()) return hit.user;
    const user = await gas.verifySession(token);
    const exp = Date.parse(user.expiresAt);
    verifyCache.set(key, { user, until: Math.min(Date.now() + cfg.sessionCacheMs, Number.isFinite(exp) ? exp : Infinity) });
    if (verifyCache.size > 5000) for (const k of [...verifyCache.keys()].slice(0, 1000)) verifyCache.delete(k);
    return user;
  }

  function onEvent(socket: Socket, event: string, fn: (data: unknown) => void | Promise<void>) {
    socket.on(event, (data: unknown) => {
      const s = sessions.get(socket.id);
      if (s) {
        // token bucket: 30 events burst, refilled at 8/s
        const now = Date.now();
        s.tokens = Math.min(30, s.tokens + ((now - s.tokensAt) / 1000) * 8);
        s.tokensAt = now;
        if (s.tokens < 1) return fail(socket, "RATE_LIMITED", "Too many requests");
        s.tokens -= 1;
      }
      try {
        const r = fn(data);
        if (r instanceof Promise) r.catch((e) => { log(`[${event}] async error: ${String(e)}`); fail(socket, "INTERNAL", "Internal server error"); });
      } catch (e) {
        log(`[${event}] error: ${String(e)}`);
        fail(socket, "INTERNAL", "Internal server error");
      }
    });
  }

  io.on("connection", (socket) => {
    // a socket that never authenticates is dropped
    const helloTimer = setTimeout(() => {
      if (!sessions.has(socket.id)) socket.disconnect(true);
    }, 15_000);
    socket.on("disconnect", () => clearTimeout(helloTimer));

    onEvent(socket, "hello", async (raw) => {
      const data = asRecord(raw) ?? {};
      const token = typeof data.sessionToken === "string" ? data.sessionToken : "";
      if (token.length < 40 || token.length > 200) {
        fail(socket, "AUTH_REQUIRED", "Please sign in with Google to play online");
        socket.disconnect(true);
        return;
      }
      let user: VerifiedUser;
      try {
        user = await verify(token);
      } catch (e) {
        const err = e instanceof GasError ? e : new GasError("INTERNAL", String(e), true);
        if (err.retryable) {
          fail(socket, "AUTH_UNAVAILABLE", "Sign-in service is temporarily unavailable — retrying");
        } else {
          fail(socket, err.code.startsWith("AUTH") || err.code === "ACCOUNT_SUSPENDED" ? err.code : "AUTH_FAILED", err.message);
          socket.disconnect(true);
        }
        return;
      }
      if (user.status !== "active") {
        fail(socket, "ACCOUNT_SUSPENDED", "This account is not active");
        socket.disconnect(true);
        return;
      }

      // takeover: one live connection per player
      const oldId = byPlayer.get(user.playerId);
      if (oldId && oldId !== socket.id) {
        const old = io.sockets.sockets.get(oldId);
        sessions.delete(oldId);
        old?.emit("session:replaced");
        old?.disconnect(true);
      }
      const s: Session = {
        playerId: user.playerId, displayName: user.displayName, picture: user.picture, role: user.role, socketId: socket.id,
        roomCode: playerRoom.get(user.playerId) ?? null, mmQueued: false, tokens: 30, tokensAt: Date.now(), lastRollAt: 0,
      };
      sessions.set(socket.id, s);
      byPlayer.set(user.playerId, socket.id);
      socket.emit("hello:ok", { sessionId: user.playerId, displayName: user.displayName, picture: user.picture });
      log(`[session] ${user.playerId} (${user.displayName}) connected`);

      // reconnect into an existing room
      const room = s.roomCode ? rooms.get(s.roomCode) : undefined;
      const idx = room ? indexIn(room, user.playerId) : -1;
      if (!room || idx < 0) {
        s.roomCode = null;
        playerRoom.delete(user.playerId);
        return;
      }
      socket.join(room.code);
      const rp = room.players[idx]!;
      const was = !rp.connected;
      rp.connected = true;
      rp.displayName = user.displayName;
      const t = room.timers.get(user.playerId);
      if (t) {
        clearTimeout(t);
        room.timers.delete(user.playerId);
      }
      if (room.status === "active" && room.game) room.game.state.players[idx]!.connected = true;
      socket.emit("room:state", roomPayload(room));
      if (was) {
        io.to(room.code).emit("player:reconnected", { playerIndex: idx });
        if (room.status === "lobby") emitRoom(room);
      }
      if (room.status === "active" && room.game) socket.emit("game:state_sync", { state: room.game.state });
    });

    onEvent(socket, "room:create", (raw) => {
      const s = requireSession(socket);
      if (!s || !ensureFree(s, socket)) return;
      const d = asRecord(raw) ?? {};
      const max = [2, 3, 4].includes(d.maxPlayers as number) ? (d.maxPlayers as number) : 2;
      removeFromQueue(s.playerId);
      s.mmQueued = false;
      const room = newRoom(s, max, false);
      seat(room, s, socket);
      socket.emit("room:state", roomPayload(room));
      log(`[room] ${room.code} created by ${s.displayName} (max ${max})`);
    });

    onEvent(socket, "room:join", (raw) => {
      const s = requireSession(socket);
      if (!s) return;
      const code = typeof asRecord(raw)?.code === "string" ? (asRecord(raw)!.code as string).trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{6}$/.test(code)) return fail(socket, "ROOM_NOT_FOUND", "Room not found — check the code");
      if (!ensureFree(s, socket)) return;
      const room = rooms.get(code);
      if (!room) return fail(socket, "ROOM_NOT_FOUND", "Room not found — check the code");
      if (room.status !== "lobby") return fail(socket, "GAME_STARTED", "The game already started");
      if (room.players.length >= room.maxPlayers) return fail(socket, "ROOM_FULL", "This room is full");
      removeFromQueue(s.playerId);
      s.mmQueued = false;
      seat(room, s, socket);
      emitRoom(room);
      log(`[room] ${code} joined by ${s.displayName}`);
    });

    onEvent(socket, "room:leave", () => {
      const s = requireSession(socket);
      if (!s || !s.roomCode) return;
      const room = rooms.get(s.roomCode);
      s.roomCode = null;
      if (!room) return void playerRoom.delete(s.playerId);
      const idx = indexIn(room, s.playerId);
      socket.leave(room.code);
      if (room.status === "lobby") return removeFromLobby(room, s.playerId);
      playerRoom.delete(s.playerId);
      if (room.status === "active") {
        if (idx >= 0) room.players[idx]!.connected = false;
        return completeMatch(room, true, Math.max(idx, 0));
      }
      if (idx >= 0) room.players.splice(idx, 1);
      if (room.players.length === 0) deleteRoom(room, "empty after completed leave");
      else emitRoom(room);
    });

    onEvent(socket, "room:ready", (raw) => {
      const s = requireSession(socket);
      const room = s && roomOf(s);
      if (!s || !room || room.status !== "lobby") return;
      const idx = indexIn(room, s.playerId);
      if (idx < 0) return;
      room.players[idx]!.ready = asRecord(raw)?.ready === true;
      emitRoom(room);
    });

    onEvent(socket, "room:color", (raw) => {
      const s = requireSession(socket);
      const room = s && roomOf(s);
      if (!s || !room || room.status !== "lobby") return;
      const color = asRecord(raw)?.color;
      if (!isColor(color)) return fail(socket, "INVALID_COLOR", "Unknown token color");
      const idx = indexIn(room, s.playerId);
      if (idx < 0) return;
      if (room.players.some((p, i) => i !== idx && p.color === color)) return fail(socket, "COLOR_TAKEN", "That color is already taken");
      room.players[idx]!.color = color;
      emitRoom(room);
    });

    onEvent(socket, "game:start", () => {
      const s = requireSession(socket);
      if (!s) return;
      const room = roomOf(s);
      if (!room) return fail(socket, "NOT_IN_ROOM", "You are not in a room");
      if (room.hostId !== s.playerId) return fail(socket, "NOT_HOST", "Only the host can start the game");
      if (room.status !== "lobby" || room.game) return fail(socket, "GAME_STARTED", "The game already started");
      if (room.players.length < 2) return fail(socket, "NOT_ENOUGH_PLAYERS", "Need at least 2 players to start");
      if (!room.autoReady && room.players.some((p) => !p.ready && p.playerId !== room.hostId)) return fail(socket, "NOT_ALL_READY", "Waiting for all players to be ready");
      if (room.players.some((p) => !p.connected)) return fail(socket, "PLAYER_OFFLINE", "A player is offline");
      startGame(room);
    });

    onEvent(socket, "dice:roll", () => {
      const s = requireSession(socket);
      if (!s) return;
      const room = roomOf(s);
      if (!room) return fail(socket, "NOT_IN_ROOM", "You are not in a room");
      if (room.status !== "active" || !room.game || room.game.state.status !== "active") return fail(socket, "GAME_NOT_ACTIVE", "The game is not active");
      const idx = indexIn(room, s.playerId);
      if (idx < 0) return fail(socket, "NOT_IN_ROOM", "You are not in a room");
      if (room.game.state.current !== idx) return fail(socket, "NOT_YOUR_TURN", "Not your turn");
      const now = Date.now();
      if (now - s.lastRollAt < cfg.minRollMs) return fail(socket, "TOO_FAST", "Slow down");
      s.lastRollAt = now;
      performRoll(room, idx, socket);
    });

    onEvent(socket, "game:forfeit", () => {
      const s = requireSession(socket);
      const room = s && roomOf(s);
      if (!s || !room) return;
      if (room.status !== "active" || !room.game) return fail(socket, "GAME_NOT_ACTIVE", "The game is not active");
      const idx = indexIn(room, s.playerId);
      if (idx >= 0) completeMatch(room, true, idx);
    });

    onEvent(socket, "game:resync", () => {
      const s = requireSession(socket);
      const room = s && roomOf(s);
      if (room?.status === "active" && room.game) socket.emit("game:state_sync", { state: room.game.state });
    });

    onEvent(socket, "invite:send", async (raw) => {
      const s = requireSession(socket);
      if (!s) return;
      const room = roomOf(s);
      if (!room || room.status !== "lobby") return fail(socket, "NOT_IN_ROOM", "Open a room first");
      if (room.hostId !== s.playerId) return fail(socket, "NOT_HOST", "Only the host can invite");
      if (room.players.length >= room.maxPlayers) return fail(socket, "ROOM_FULL", "This room is full");
      const to = asRecord(raw)?.playerId;
      if (typeof to !== "string" || to.length < 3 || to.length > 40 || to === s.playerId) return fail(socket, "VALIDATION", "Invalid friend");
      try {
        const inv = await gas.createInvite({ fromPlayerId: s.playerId, toPlayerId: to, roomCode: room.code });
        const target = socketOf(to);
        target?.emit("invite:received", { inviteId: inv.inviteId, roomCode: room.code, from: { id: s.playerId, displayName: s.displayName, picture: s.picture } });
        socket.emit("invite:sent", { playerId: to, delivered: !!target });
      } catch (e) {
        const err = e as GasError;
        fail(socket, err.code === "NOT_FRIENDS" ? "NOT_FRIENDS" : "INVITE_FAILED", err.message);
      }
    });

    onEvent(socket, "matchmaking:join", () => {
      const s = requireSession(socket);
      if (!s || !ensureFree(s, socket)) return;
      if (!s.mmQueued) {
        s.mmQueued = true;
        if (!mmQueue.includes(s.playerId)) mmQueue.push(s.playerId);
      }
      socket.emit("matchmaking:searching");
      tryMatchmaking();
    });

    onEvent(socket, "matchmaking:cancel", () => {
      const s = requireSession(socket);
      if (!s) return;
      removeFromQueue(s.playerId);
      s.mmQueued = false;
    });

    socket.on("disconnect", () => {
      try {
        const s = sessions.get(socket.id);
        if (!s) return; // replaced by a newer connection
        sessions.delete(socket.id);
        if (byPlayer.get(s.playerId) === socket.id) byPlayer.delete(s.playerId);
        removeFromQueue(s.playerId);
        const room = roomOf(s);
        if (!room) return;
        const idx = indexIn(room, s.playerId);
        if (idx < 0) return;
        room.players[idx]!.connected = false;

        if (room.status === "completed") return emitRoom(room);
        if (room.status === "lobby") {
          // mobile browsers drop sockets when the tab sleeps: keep the seat for a short grace period
          emitRoom(room);
          room.timers.set(s.playerId, setTimeout(() => {
            room.timers.delete(s.playerId);
            const cur = room.players.find((p) => p.playerId === s.playerId);
            if (rooms.get(room.code) === room && room.status === "lobby" && cur && !cur.connected) removeFromLobby(room, s.playerId);
          }, cfg.lobbyGraceMs));
          return;
        }
        // active game: keep the seat, start the forfeit countdown
        if (room.game) room.game.state.players[idx]!.connected = false;
        io.to(room.code).emit("player:disconnected", { playerIndex: idx });
        log(`[room] ${room.code} p${idx} (${s.displayName}) disconnected`);
        room.timers.set(s.playerId, setTimeout(() => {
          room.timers.delete(s.playerId);
          const p = room.players[idx];
          if (rooms.get(room.code) !== room || room.status !== "active" || !p || p.connected) return;
          completeMatch(room, true, idx);
        }, cfg.disconnectForfeitMs));
      } catch (e) {
        log(`[disconnect] error: ${String(e)}`);
      }
    });
  });

  // ───────────── lifecycle ─────────────

  return {
    io, http, queue, rooms,
    listen: () =>
      new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(cfg.port, () => {
          queue.start();
          const addr = http.address();
          resolve(typeof addr === "object" && addr ? addr.port : cfg.port);
        });
      }),
    async close() {
      for (const room of rooms.values()) {
        if (room.status === "active" && room.game) queue.enqueue("gameAborted", room.game.id, { gameId: room.game.id });
        clearTimers(room);
        if (room.deleteTimer) clearTimeout(room.deleteTimer);
      }
      await queue.whenIdle(4000);
      queue.stop();
      await new Promise<void>((r) => io.close(() => r()));
      if (http.listening) await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
