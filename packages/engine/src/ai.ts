/**
 * Sapludu — AI opponent module.
 *
 * FAIRNESS CONTRACT (per MASTER_SPECIFICATION §7):
 * Sapludu is a luck-driven game. The AI NEVER manipulates dice values and receives
 * exactly the same random distribution as human players. Difficulty only changes
 * presentation: think delays, emotes and flavor text — never the odds.
 */

import type { GameState } from "./types";

export type AiDifficulty = "easy" | "normal" | "hard";

export interface AiProfile {
  level: AiDifficulty;
  /** think delay range in ms before rolling */
  delayRange: [number, number];
  emotes: string[];
}

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  easy: {
    level: "easy",
    delayRange: [500, 900],
    emotes: ["thinking", "roll", "happy", "surprised"],
  },
  normal: {
    level: "normal",
    delayRange: [900, 1600],
    emotes: ["thinking", "roll", "confident", "laugh", "surprised"],
  },
  hard: {
    level: "hard",
    delayRange: [1300, 2200],
    emotes: ["thinking", "roll", "confident", "laugh", "taunt", "surprised"],
  },
};

const AI_NAMES = [
  { en: "Raja the Cobra", bn: "রাজা গোখরো" },
  { en: "Mishti the Python", bn: "মিষ্টি অজগর" },
  { en: "Chku the Viper", bn: "চিকু সাপ" },
];

export function pickAiName(index: number, lang: "en" | "bn" = "en"): string {
  const n = AI_NAMES[index % AI_NAMES.length];
  return lang === "bn" ? n.bn : n.en;
}

export function aiThinkDelay(level: AiDifficulty, rng: () => number = Math.random): number {
  const [min, max] = AI_PROFILES[level].delayRange;
  return Math.floor(min + rng() * (max - min));
}

export function aiEmote(state: GameState, playerIndex: number, lastEventKind: string, rng: () => number = Math.random): string {
  const p = state.players[playerIndex];
  const profile = AI_PROFILES[p.aiLevel ?? "normal"];
  const pool = [...profile.emotes];
  if (lastEventKind === "ladder") pool.push("celebrate");
  if (lastEventKind === "snake") pool.push("cry");
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Decision hook kept for future strategy modes. With fair dice there is genuinely
 * nothing to decide in classic Sapludu — the only legal action is rolling — so the
 * AI simply confirms its turn. This function exists so a rules variant with choices
 * (e.g. "use this roll or reroll once") can be added without touching the UI loop.
 */
export function aiShouldRoll(_state: GameState, _playerIndex: number): boolean {
  return true;
}
