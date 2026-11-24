/**
 * Sapludu — online multiplayer store.
 * Socket.IO client bound to the game server mini-service via the Caddy gateway.
 * The remote server is authoritative for dice and movement; this store only mirrors
 * states for rendering and queues events for animation.
 */
"use client";

import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type { GameState, MoveKind, TokenColor } from "@sapludu/engine/types";
import { playLadderClimb, playMoveHops, playSnakeSwallow, waitForDiceLanding } from "@/lib/animation/board-fx";
import { useBoardFxStore } from "@/components/board/fx-store";
import { animMs, useUiStore } from "@/stores/ui-store";
import { sound, vibrate } from "@/lib/sound";
import { config } from "@/lib/config";
import { session } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export type OnlinePhase =
  | "disconnected"
  | "connecting"
  | "menu"
  | "searching"
  | "lobby"
  | "rolling"
  | "moving"
  | "awaiting-roll"
  | "finished";

export interface RoomPlayer {
  sessionId: string;
  userId: string | null;
  displayName: string;
  picture?: string;
  color: TokenColor;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  maxPlayers: number;
  status: "lobby" | "active" | "completed";
  players: RoomPlayer[];
}

export interface CompletedResult {
  playerIndex: number;
  name: string;
  userId: string | null;
  placement: number;
  position: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface IncomingInvite {
  inviteId: string;
  roomCode: string;
  from: { id: string; displayName: string; picture?: string };
}

export interface OnlineError {
  code: string;
  message: string;
}

interface OnlineStore {
  socket: Socket | null;
  phase: OnlinePhase;
  room: RoomState | null;
  state: GameState | null;
  mySessionId: string | null;
  diceDisplay: number | null;
  banner: { kind: MoveKind | "six" | null };
  error: OnlineError | null;
  /** fatal authentication problem (not signed in / expired / replaced by another tab) */
  authProblem: string | null;
  invites: IncomingInvite[];
  achievements: string[];
  serverNotice: string | null;
  results: CompletedResult[] | null;
  winnerIndex: number | null;
  ratingDelta: number | null;
  /** true while a movement/choreography animation is in progress (blocks rolling) */
  animating: boolean;
  /** turn:changed reason received while animating, applied when it finishes */
  pendingTurnReason: string | null;
  /** playerIndex of a turn:changed received while animating (applied with the reason) */
  pendingTurnPlayer: number | null;
  /** animation sequence token to cancel stale events */
  seq: number;

  connect: () => void;
  disconnect: () => void;
  createRoom: (maxPlayers: number) => void;
  joinRoom: (code: string) => void;
  quickMatch: () => void;
  cancelSearch: () => void;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  setColor: (color: TokenColor) => void;
  startGame: () => void;
  roll: () => void;
  forfeit: () => void;
  resync: () => void;
  requestHello: () => void;
  roomStatusPhase: () => OnlinePhase;
  invite: (playerId: string) => void;
  dismissInvite: (inviteId: string) => void;
  clearError: () => void;
  resetMatch: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let animToken = 0;
/** last processed player:moved version — drops stale/duplicate move events */
let lastMoveVersion = 0;

// Dev-only mirror inspector (stripped from production builds).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__sapluduOnlineDev = () => {
    const s = useOnlineStore.getState();
    return {
      phase: s.phase,
      animating: s.animating,
      dice: s.diceDisplay,
      players: s.state?.players.map((p) => ({ name: p.name, pos: p.position, connected: p.connected })),
      current: s.state?.current,
      turn: s.state?.turnCount,
      version: s.state?.version,
      override: useBoardFxStore.getState().tokenOverride,
      resync: () => useOnlineStore.getState().resync(),
    };
  };
}

export const useOnlineStore = create<OnlineStore>()((set, get) => {
  function myIndex(): number {
    const { state, mySessionId, room } = get();
    if (!state || !mySessionId || !room) return -1;
    // game players share index order with room players
    const idx = room.players.findIndex((p) => p.sessionId === mySessionId);
    return idx;
  }

  function bindSocket(socket: Socket) {
    socket.on("connect", () => {
      set({ phase: get().room ? get().roomStatusPhase() : "menu" });
      get().requestHello();
    });

    socket.on("disconnect", () => {
      set({ phase: "connecting" });
    });

    socket.on("hello:ok", (data: { sessionId: string; displayName: string }) => {
      set({ mySessionId: data.sessionId, authProblem: null });
      // attempt room rejoin after reconnect
      const s = get();
      if (s.room && s.room.status !== "lobby") {
        socket.emit("game:resync");
      }
    });

    socket.on("error", (data: OnlineError) => {
      if (data.code.startsWith("AUTH") || data.code === "ACCOUNT_SUSPENDED" || data.code === "NO_SESSION") {
        if (data.code === "AUTH_UNAVAILABLE") {
          // transient: try again shortly
          setTimeout(() => get().requestHello(), 2500);
          return;
        }
        set({ authProblem: data.code, error: data, phase: "disconnected" });
        if (data.code === "AUTH_EXPIRED" || data.code === "AUTH_REQUIRED") {
          useAuthStore.getState().fetchMe(); // re-validates; signs the user out if the session is really gone
        }
        return;
      }
      set({ error: data });
    });

    socket.on("session:replaced", () => {
      // the same account connected from another tab/device: stop fighting over the seat
      socket.disconnect();
      set({ authProblem: "SESSION_REPLACED", phase: "disconnected", socket: null });
    });

    socket.on("invite:received", (data: IncomingInvite) => {
      set((s) => ({ invites: [data, ...s.invites.filter((i) => i.inviteId !== data.inviteId)].slice(0, 5) }));
      sound.play("click");
    });

    socket.on("game:rated", (data: { ratings: Record<string, { before: number; after: number }>; achievements: Record<string, string[]> }) => {
      const me = get().mySessionId;
      if (me && data.ratings[me]) set({ ratingDelta: data.ratings[me].after - data.ratings[me].before });
      if (me && data.achievements?.[me]?.length) set({ achievements: data.achievements[me] });
      void useAuthStore.getState().fetchMe(); // refresh rating / rank / stats
    });

    socket.on("room:state", (data: { room: RoomState }) => {
      const prevStatus = get().room?.status;
      set({ room: data.room, phase: data.room.status === "lobby" ? "lobby" : get().phase });
      if (prevStatus === "lobby" && data.room.status === "active") {
        // game:start will arrive next; keep phase
      }
    });

    socket.on("room:closed", () => {
      set({ room: null, state: null, phase: "menu", results: null, winnerIndex: null });
    });

    socket.on("matchmaking:searching", () => set({ phase: "searching" }));
    socket.on("matchmaking:matched", () => {
      set({ phase: "lobby" });
    });

    socket.on("game:start", (data: { state: GameState }) => {
      animToken++;
      lastMoveVersion = 0;
      useBoardFxStore.getState().clearFx();
      set({
        state: data.state,
        phase: "awaiting-roll",
        diceDisplay: null,
        banner: { kind: null },
        results: null,
        winnerIndex: null,
        ratingDelta: null,
        animating: false,
        pendingTurnReason: null,
        pendingTurnPlayer: null,
        seq: animToken,
      });
    });

    socket.on("dice:result", (data: { playerIndex: number; dice: number }) => {
      set({ diceDisplay: data.dice, phase: "rolling" });
    });

    socket.on("player:moved", (data: { playerIndex: number; playerName?: string; dice?: number; from?: number; path: number[]; kind: MoveKind; version: number }) => {
      // drop stale/duplicate move events (reconnect replay, gateway retry)
      if (typeof data.version === "number") {
        if (data.version <= lastMoveVersion) return;
        lastMoveVersion = data.version;
      }
      set((s) => {
        if (!s.state) return {};
        // keep the mirror's move log in sync (server state holds the authoritative list too)
        const record = {
          playerIndex: data.playerIndex,
          playerName: data.playerName ?? s.state.players[data.playerIndex]?.name ?? `P${data.playerIndex}`,
          dice: data.dice ?? 0,
          fromPos: data.from ?? data.path[0] ?? 1,
          toPos: data.path[data.path.length - 1] ?? 1,
          kind: data.kind,
          at: s.state.turnCount + 1,
        };
        return {
          state: {
            ...s.state,
            moves: [...s.state.moves.slice(-499), record],
            turnCount: s.state.turnCount + 1,
          },
        };
      });
      void animateMove(data.playerIndex, data.from ?? data.path[0] - 1, data.path, data.kind, data.dice);
    });

    socket.on("turn:changed", (data: { playerIndex: number; reason: string }) => {
      // the turn highlight and roll permission switch only after the movement
      // choreography finishes — the visual sequence owns the board meanwhile
      if (get().animating) {
        set({ pendingTurnPlayer: data.playerIndex, pendingTurnReason: data.reason });
        return;
      }
      set((s) => {
        if (!s.state) return {};
        return {
          state: { ...s.state, current: data.playerIndex, version: s.state.version + 1 },
        };
      });
      applyTurnChange(data.reason);
    });

    socket.on("turn:timeout", (data: { playerIndex: number }) => {
      set({ serverNotice: `timeout-${data.playerIndex}` });
    });

    socket.on(
      "game:completed",
      (data: { state: GameState; results: CompletedResult[]; winnerIndex: number }) => {
        // The server announces the result instantly (it never waits for Google Sheets). Let the final
        // move finish animating before switching to the result screen.
        void (async () => {
          const t0 = Date.now();
          while (get().animating && Date.now() - t0 < 9000) await sleep(80);
          animToken++;
          lastMoveVersion = 0;
          useBoardFxStore.getState().clearFx();
          set({
            state: data.state,
            results: data.results,
            winnerIndex: data.winnerIndex,
            phase: "finished",
            animating: false,
            pendingTurnReason: null,
            pendingTurnPlayer: null,
            seq: animToken,
            ratingDelta: null,
            achievements: [],
          });
        })();
      }
    );

    socket.on("player:disconnected", (data: { playerIndex: number }) => {
      set({ serverNotice: `disconnected-${data.playerIndex}` });
      set((s) => {
        if (!s.state) return {};
        const players = s.state.players.map((p, i) =>
          i === data.playerIndex ? { ...p, connected: false } : p
        );
        return { state: { ...s.state, players } };
      });
    });

    socket.on("player:reconnected", (data: { playerIndex: number }) => {
      set((s) => {
        if (!s.state) return {};
        const players = s.state.players.map((p, i) =>
          i === data.playerIndex ? { ...p, connected: true } : p
        );
        return { state: { ...s.state, players } };
      });
    });

    socket.on("game:state_sync", (data: { state: GameState }) => {
      animToken++;
      lastMoveVersion = data.state.version;
      useBoardFxStore.getState().clearFx();
      set({
        state: data.state,
        seq: animToken,
        animating: false,
        pendingTurnReason: null,
        pendingTurnPlayer: null,
        phase: data.state.status === "completed" ? "finished" : "awaiting-roll",
      });
    });
  }

  function applyTurnChange(reason: string) {
    const ui = useUiStore.getState();
    if (reason === "extra-turn") {
      set({ banner: { kind: "six" } });
      void (async () => {
        await sleep(animMs(ui.animation, 650));
        set({ banner: { kind: null }, phase: "awaiting-roll" });
      })();
    } else {
      set({ banner: { kind: null }, phase: "awaiting-roll" });
    }
  }

  /**
   * Visual-only movement choreography driven by the server-confirmed path.
   * The authoritative positions arrive with game:state_sync / game:completed;
   * this only animates the confirmed transition.
   *
   * Order of operations:
   *   1. wait for the dice tumble to land (dice:result → player:moved arrive
   *      back-to-back; hopping immediately would outrun the dice visual)
   *   2. square-by-square hops along the exact server path
   *   3. ladder climb / snake swallow choreography
   *   4. release the override and apply the deferred turn switch
   */
  async function animateMove(
    playerIndex: number,
    fromSq: number,
    path: number[],
    kind: MoveKind,
    dice?: number
  ) {
    const token = ++animToken;
    const ui = useUiStore.getState();
    set({ seq: token, animating: true, phase: "rolling" });

    const mySeq = () => get().seq !== token;

    function setPos(sq: number) {
      set((s) => {
        if (!s.state) return s;
        const players = s.state.players.map((p, idx) =>
          idx === playerIndex ? { ...p, position: sq } : p
        );
        return { state: { ...s.state, players, version: s.state.version + 1 } };
      });
    }

    try {
      // 1) let the dice visibly land before the pawn starts moving
      await waitForDiceLanding(mySeq);
      if (mySeq()) return;
      set({ phase: "moving" });

      const isJump = kind === "ladder" || kind === "snake";
      // Plain moves: the server path contains EXACTLY `dice` squares.
      // Jumps: the last path element is the snake/ladder destination, rendered
      // by the dedicated choreography below.
      const hops = kind === "overshoot" ? [] : isJump ? path.slice(0, -1) : path;

      // 2) square-by-square hops along the exact server path
      await playMoveHops(playerIndex, fromSq, hops, mySeq, undefined, dice ?? hops.length);
      if (mySeq()) return;

      if (kind === "ladder") {
        const foot = hops[hops.length - 1] ?? fromSq;
        const top = path[path.length - 1];
        sound.play("ladder");
        await playLadderClimb(playerIndex, foot, top, mySeq);
        if (mySeq()) return;
        setPos(top);
        set({ banner: { kind: "ladder" } });
        await sleep(animMs(ui.animation, 700));
        set({ banner: { kind: null } });
      } else if (kind === "snake") {
        const head = hops[hops.length - 1] ?? fromSq;
        const tail = path[path.length - 1];
        sound.play("snake");
        if (ui.vibration) vibrate([60, 40, 60]);
        await playSnakeSwallow(playerIndex, head, tail, mySeq);
        if (mySeq()) return;
        setPos(tail);
        set({ banner: { kind: "snake" } });
        await sleep(animMs(ui.animation, 700));
        set({ banner: { kind: null } });
      } else if (kind === "overshoot") {
        sound.play("overshoot");
        useBoardFxStore.getState().pulseToken(playerIndex, "shake");
        set({ banner: { kind: "overshoot" } });
        await sleep(animMs(ui.animation, 900));
        set({ banner: { kind: null } });
      }

      // 3) mirror the confirmed final position and release the visual override
      //    in the same tick — the player panel, stacking and the pawn itself
      //    all agree with the server state after every move.
      if (!mySeq()) {
        const finalSq = path[path.length - 1] ?? fromSq;
        setPos(finalSq);
        useBoardFxStore.getState().setTokenOverride(null);
      }
    } finally {
      // whether finished or aborted, animation ownership ends here; the
      // deferred turn switch (if any) is applied for this sequence only
      const pendingPlayer = get().pendingTurnPlayer;
      const pendingReason = get().pendingTurnReason;
      const mine = get().seq === token;
      set({ animating: false });
      if (mine && pendingReason !== null) {
        set({ pendingTurnReason: null, pendingTurnPlayer: null });
        if (pendingPlayer !== null && pendingPlayer >= 0) {
          set((s) => {
            if (!s.state) return {};
            return {
              state: { ...s.state, current: pendingPlayer, version: s.state.version + 1 },
            };
          });
        }
        if (!mySeq()) applyTurnChange(pendingReason);
      }
    }
    // NOTE: do NOT set phase here for the normal path — applyTurnChange (from the
    // queued or already-arrived turn:changed) owns the "awaiting-roll" transition,
    // so a rolling user can never act mid-animation.
  }

  return {
    socket: null,
    phase: "disconnected",
    room: null,
    state: null,
    mySessionId: null,
    diceDisplay: null,
    banner: { kind: null },
    error: null,
    authProblem: null,
    invites: [],
    achievements: [],
    serverNotice: null,
    results: null,
    winnerIndex: null,
    ratingDelta: null,
    animating: false,
    pendingTurnReason: null,
    pendingTurnPlayer: null,
    seq: 0,

    connect: () => {
      if (get().socket?.connected) return;
      if (!config.gameServerUrl) {
        set({ phase: "disconnected", authProblem: "NOT_CONFIGURED" });
        return;
      }
      if (!session.get()) {
        set({ phase: "disconnected", authProblem: "AUTH_REQUIRED" });
        return;
      }
      get().socket?.disconnect();
      set({ phase: "connecting", error: null, authProblem: null });
      const socket = io(config.gameServerUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
        timeout: 15000,
        forceNew: true,
      });
      set({ socket });
      bindSocket(socket);
    },

    disconnect: () => {
      get().socket?.disconnect();
      set({ socket: null, phase: "disconnected", room: null, state: null, invites: [] });
    },

    requestHello: () => {
      const socket = get().socket;
      const token = session.get();
      if (!socket || !token) return;
      // identity is proven by the session token and verified server-side through Apps Script
      socket.emit("hello", { sessionToken: token });
    },

    invite: (playerId) => get().socket?.emit("invite:send", { playerId }),
    dismissInvite: (inviteId) => set((s) => ({ invites: s.invites.filter((i) => i.inviteId !== inviteId) })),

    roomStatusPhase(): OnlinePhase {
      const { room } = get();
      if (!room) return "menu";
      return room.status === "lobby" ? "lobby" : get().phase;
    },

    createRoom: (maxPlayers) => get().socket?.emit("room:create", { maxPlayers }),
    joinRoom: (code) => get().socket?.emit("room:join", { code }),
    quickMatch: () => get().socket?.emit("matchmaking:join"),
    cancelSearch: () => get().socket?.emit("matchmaking:cancel"),
    leaveRoom: () => {
      get().socket?.emit("room:leave");
      set({ room: null, state: null, phase: "menu", results: null, winnerIndex: null });
    },
    setReady: (ready) => get().socket?.emit("room:ready", { ready }),
    setColor: (color) => get().socket?.emit("room:color", { color }),
    startGame: () => get().socket?.emit("game:start"),
    roll: () => {
      // never roll while the movement choreography is still in progress
      if (get().animating) return;
      get().socket?.emit("dice:roll");
    },
    forfeit: () => get().socket?.emit("game:forfeit"),
    resync: () => get().socket?.emit("game:resync"),
    clearError: () => set({ error: null }),
    resetMatch: () =>
      set({ state: null, results: null, winnerIndex: null, diceDisplay: null, ratingDelta: null }),
  };
});
