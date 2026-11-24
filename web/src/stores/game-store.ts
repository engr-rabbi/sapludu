/**
 * Sapludu — local & AI game orchestration store.
 * Drives the shared pure engine client-side for offline modes and sequences all
 * animations (dice, hops, ladder climb, snake slide, victory) with cancellation.
 * AI turns use the same fair random dice as humans (never manipulated).
 */
"use client";

import { create } from "zustand";
import { applyRoll, createGame, EngineError } from "@sapludu/engine/engine";
import { DEFAULT_BOARD } from "@sapludu/engine/board";
import { aiThinkDelay, type AiDifficulty } from "@sapludu/engine/ai";
import type { GameState, MoveKind, RollOutcome, TokenColor } from "@sapludu/engine/types";
import { playLadderClimb, playMoveHops, playSnakeSwallow } from "@/lib/animation/board-fx";
import { FAST_SPEED } from "@/lib/animation/timings";
import { useBoardFxStore } from "@/components/board/fx-store";
import { animMs, useUiStore } from "@/stores/ui-store";
import { sound, vibrate } from "@/lib/sound";
import { useAuthStore, type CurrentUser } from "@/stores/auth-store";
import { api } from "@/lib/api";

export interface LocalPlayerSetup {
  name: string;
  color: TokenColor;
  isAI: boolean;
  aiLevel?: AiDifficulty;
}

export interface GameConfig {
  mode: "local" | "ai";
  players: LocalPlayerSetup[];
}

export type GamePhase = "idle" | "awaiting-roll" | "rolling" | "moving" | "finished";

export interface GameBanner {
  kind: MoveKind | "six" | null;
}

interface LocalGameStore {
  config: GameConfig | null;
  state: GameState | null;
  phase: GamePhase;
  diceDisplay: number | null;
  banner: GameBanner;
  emote: { playerIndex: number; emote: string } | null;
  celebration: boolean;
  newAchievements: string[];
  reported: boolean;
  /** increments each game to cancel stale async sequences */
  seq: number;

  startGame: (config: GameConfig) => void;
  roll: () => Promise<void>;
  playAgain: () => void;
  exitGame: () => void;
  clearAchievementsToast: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let aiTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAi(store: () => LocalGameStore, delay: number) {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    void store().roll();
  }, delay);
}

export const useGameStore = create<LocalGameStore>()((set, get) => {
  async function processOutcome(outcome: RollOutcome) {
    const { events } = outcome;
    const ui = useUiStore.getState();
    const mySeq = get().seq;
    const abortCheck = () => get().seq !== mySeq;

    /** mirror an intermediate engine-confirmed position onto the board */
    function setPos(playerIndex: number, square: number) {
      set((s) => {
        if (!s.state) return s;
        const players = s.state.players.map((p, idx) =>
          idx === playerIndex ? { ...p, position: square } : p
        );
        return { state: { ...s.state, players, version: s.state.version + 1 } };
      });
    }

    // 1) movement choreography — visual only; the authoritative state lands below
    const moveEv = events.find((e) => e.type === "move");
    if (moveEv && moveEv.type === "move") {
      const { playerIndex, kind, path } = moveEv;
      // ladder/snake: the last path element is the jump destination and is
      // rendered by the dedicated choreography below, not by a plain hop.
      // Plain moves: the engine path contains EXACTLY `dice` squares.
      const isJump = kind === "ladder" || kind === "snake";
      const hops = kind === "overshoot" ? [] : isJump ? path.slice(0, -1) : path;

      // 1a) square-by-square hops along the exact engine path
      set({ phase: "moving" });
      await playMoveHops(playerIndex, moveEv.from, hops, abortCheck, undefined, moveEv.dice);
      if (abortCheck()) return;

      if (kind === "ladder") {
        const foot = hops[hops.length - 1] ?? moveEv.from;
        const top = path[path.length - 1];
        sound.play("ladder");
        // token climbs the ladder rung by rung (visual only)
        await playLadderClimb(playerIndex, foot, top, abortCheck);
        if (abortCheck()) return;
        setPos(playerIndex, top);
        set({ banner: { kind: "ladder" } });
        await sleep(animMs(ui.animation, 700));
        set({ banner: { kind: null } });
      } else if (kind === "snake") {
        const head = hops[hops.length - 1] ?? moveEv.from;
        const tail = path[path.length - 1];
        sound.play("snake");
        if (ui.vibration) vibrate([60, 40, 60]);
        // snake swallows the token and releases it from its tail (visual only)
        await playSnakeSwallow(playerIndex, head, tail, abortCheck);
        if (abortCheck()) return;
        setPos(playerIndex, tail);
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
    }

    if (abortCheck()) return;

    // 2) apply the authoritative engine state and release the visual override
    //    in the same tick — never a frame where the pawn flickers back
    set({ state: outcome.next });
    useBoardFxStore.getState().setTokenOverride(null);

    // 3) turn / win handling
    if (events.some((e) => e.type === "win")) {
      sound.play("win");
      if (ui.vibration) vibrate([120, 60, 120, 60, 200]);
      set({ phase: "finished", celebration: true });
      void reportResult();
      return;
    }

    const extra = events.some((e) => e.type === "extraTurn");
    if (extra) {
      set({ banner: { kind: "six" } });
      await sleep(animMs(ui.animation, 650));
      set({ banner: { kind: null } });
    } else {
      sound.play("turn");
      await sleep(animMs(ui.animation, 260));
    }

    if (get().seq !== mySeq) return;
    set({ phase: "awaiting-roll" });
    maybeStartAiTurn();
  }

  function maybeStartAiTurn() {
    const { state, config } = get();
    if (!state || state.status !== "active" || !config) return;
    const current = state.players[state.current];
    if (!current.isAI) return;
    const level = current.aiLevel ?? "normal";
    const emotes = ["thinking", "roll"];
    const emote = emotes[Math.floor(Math.random() * emotes.length)];
    set({ emote: { playerIndex: state.current, emote } });
    scheduleAi(get, aiThinkDelay(level));
  }

  async function runRoll(dice: number) {
    const { state } = get();
    if (!state || state.status !== "active") return;
    const playerIndex = state.current;
    const outcome = applyRoll(state, playerIndex, dice);
    // diceDisplay was already set before the tumble (see roll()) so the cube
    // visibly lands on the exact face the engine uses for this move.
    set((s) => ({ emote: s.emote ? { ...s.emote, emote: "roll" } : null }));
    await processOutcome(outcome);
  }

  /** Dice tumble wait synced with the Dice3D animation duration. */
  function diceRollDelay(): number {
    const speed = useUiStore.getState().animation;
    if (speed === "reduced") return 80;
    const base = 700; // slightly inside the 720ms tumble so the face snaps as it lands
    return speed === "fast" ? base * FAST_SPEED : base;
  }

  async function reportResult() {
    const { config, state, reported } = get();
    if (!config || !state || reported) return;
    set({ reported: true });
    const user = useAuthStore.getState().user;
    if (!user) return; // guests: nothing to persist
    try {
      // Unverified practice result: the backend replays the move list against the rules and only touches the
      // separate practice counters — never rating or the leaderboard.
      const data = await api<{ achievements?: string[]; user?: CurrentUser }>("games.reportPractice", {
        mode: config.mode,
        mySeat: Math.max(0, config.players.findIndex((p) => !p.isAI)),
        players: config.players.map((p) => ({ name: p.name, color: p.color, isAI: p.isAI })),
        moves: state.moves.map((m) => ({ seat: m.playerIndex, dice: m.dice, fromPos: m.fromPos, toPos: m.toPos, kind: m.kind })),
      });
      if (data.achievements && data.achievements.length > 0) set({ newAchievements: data.achievements });
      if (data.user) useAuthStore.getState().setUser(data.user);
    } catch {
      // offline-friendly: practice stats reporting is best-effort
    }
  }

  // Dev-only hook for manual browser testing of specific board scenarios.
  // Stripped from production builds; never used by the game itself.
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__sapluduDev = {
      startLocal: () =>
        get().startGame({
          mode: "local",
          players: [
            { name: "You", color: "red", isAI: false },
            { name: "Player 2", color: "green", isAI: false },
          ],
        }),
      setPosition: (playerIndex: number, square: number) =>
        set((s) => ({
          state: s.state
            ? {
                ...s.state,
                players: s.state.players.map((p, i) => (i === playerIndex ? { ...p, position: square } : p)),
              }
            : s.state,
        })),
      forceRoll: (dice: number) => {
        const s = get();
        if (s.state && s.state.status === "active" && s.phase === "awaiting-roll") {
          sound.unlock();
          // mirror the real roll() flow: the face is shown before the move
          set({ diceDisplay: dice });
          void runRoll(dice);
        }
      },
      fx: () => {
        const st = useBoardFxStore.getState();
        return { override: st.tokenOverride, snake: st.snakeFx, ladder: st.ladderFx };
      },
      state: () => {
        const s = get();
        return {
          players: s.state?.players.map((p) => ({ name: p.name, pos: p.position })),
          current: s.state?.current,
          phase: s.phase,
        };
      },
    };
  }

  return {
    config: null,
    state: null,
    phase: "idle",
    diceDisplay: null,
    banner: { kind: null },
    emote: null,
    celebration: false,
    newAchievements: [],
    reported: false,
    seq: 0,

    startGame: (config) => {
      if (aiTimer) clearTimeout(aiTimer);
      // remember guest display name for online guest sessions
      const authed = useAuthStore.getState().user;
      if (!authed && config.players[0] && !config.players[0].isAI) {
        try {
          localStorage.setItem("sapludu-guest-name", config.players[0].name);
        } catch {
          // ignore
        }
      }
      const state = createGame({
        id: `local-${Date.now()}`,
        players: config.players.map((p) => ({
          id: p.isAI ? `ai-${p.name}` : `p-${p.name}`,
          name: p.name,
          color: p.color,
          isAI: p.isAI,
          aiLevel: p.aiLevel,
        })),
        board: DEFAULT_BOARD,
      });
      set({
        config,
        state,
        phase: "awaiting-roll",
        diceDisplay: null,
        banner: { kind: null },
        emote: null,
        celebration: false,
        newAchievements: [],
        reported: false,
        seq: get().seq + 1,
      });
      maybeStartAiTurn();
    },

    roll: async () => {
      const { state, phase } = get();
      if (!state || state.status !== "active") return;
      if (phase !== "awaiting-roll") return;
      const current = state.players[state.current];
      if (!current.isAI) {
        // Human roll — fair local RNG (Math.random); identical odds to AI.
        const dice = 1 + Math.floor(Math.random() * 6);
        sound.unlock();
        sound.play("dice");
        // Show the true face immediately: the tumble targets this exact value,
        // so the cube always lands on the number the engine moves by.
        set({ phase: "rolling", diceDisplay: dice });
        await sleep(diceRollDelay());
        try {
          await runRoll(dice);
        } catch (e) {
          if (e instanceof EngineError) {
            set({ phase: "awaiting-roll" });
          }
        }
      } else {
        // AI roll — same fair RNG.
        const dice = 1 + Math.floor(Math.random() * 6);
        sound.play("dice");
        set({ phase: "rolling", diceDisplay: dice, emote: null });
        await sleep(diceRollDelay());
        try {
          await runRoll(dice);
        } catch {
          set({ phase: "awaiting-roll" });
        }
      }
    },

    playAgain: () => {
      const { config } = get();
      if (config) get().startGame(config);
    },

    exitGame: () => {
      if (aiTimer) clearTimeout(aiTimer);
      set((s) => ({
        seq: s.seq + 1,
        state: null,
        config: null,
        phase: "idle",
        celebration: false,
        emote: null,
        banner: { kind: null },
      }));
    },

    clearAchievementsToast: () => set({ newAchievements: [] }),
  };
});
