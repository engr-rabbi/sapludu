/**
 * Sapludu — UI store: client-side view routing, language, and accessibility/game settings.
 * The platform is a single-route SPA (sandbox architecture decision): every screen is a view here.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/en";
import type { BoardThemeId } from "@/lib/board-themes";

export type ViewId =
  | "landing"
  | "auth"
  | "dashboard"
  | "play"
  | "setup-local"
  | "setup-ai"
  | "boards"
  | "online"
  | "game"
  | "profile"
  | "leaderboard"
  | "friends"
  | "settings"
  | "rules"
  | "admin";

export type AnimationSpeed = "normal" | "fast" | "reduced";

export interface DialogId {
  terms: boolean;
  privacy: boolean;
  about: boolean;
}

interface UiState {
  view: ViewId;
  language: Language;
  sound: boolean;
  animation: AnimationSpeed;
  vibration: boolean;
  theme: "light" | "dark";
  /** active board design — visual only, never changes game rules */
  boardTheme: BoardThemeId;
  authMode: "login" | "register";
  postAuthView: ViewId | null;
  dialog: DialogId;
  hydrated: boolean;

  navigate: (view: ViewId) => void;
  setLanguage: (l: Language) => void;
  toggleLanguage: () => void;
  setSound: (v: boolean) => void;
  setAnimation: (v: AnimationSpeed) => void;
  setVibration: (v: boolean) => void;
  setTheme: (t: "light" | "dark") => void;
  setBoardTheme: (id: BoardThemeId) => void;
  setAuthMode: (m: "login" | "register") => void;
  setPostAuthView: (v: ViewId | null) => void;
  setDialog: (id: keyof DialogId, open: boolean) => void;
  setHydrated: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      view: "landing",
      language: "en",
      sound: true,
      animation: "normal",
      vibration: true,
      theme: "light",
      boardTheme: "classic",
      authMode: "login",
      postAuthView: null,
      dialog: { terms: false, privacy: false, about: false },
      hydrated: false,

      navigate: (view) => set({ view }),
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set({ language: get().language === "en" ? "bn" : "en" }),
      setSound: (sound) => set({ sound }),
      setAnimation: (animation) => set({ animation }),
      setVibration: (vibration) => set({ vibration }),
      setTheme: (theme) => set({ theme }),
      setBoardTheme: (boardTheme) => set({ boardTheme }),
      setAuthMode: (authMode) => set({ authMode }),
      setPostAuthView: (postAuthView) => set({ postAuthView }),
      setDialog: (id, open) => set((s) => ({ dialog: { ...s.dialog, [id]: open } })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "sapludu-ui",
      partialize: (s) => ({
        language: s.language,
        sound: s.sound,
        animation: s.animation,
        vibration: s.vibration,
        theme: s.theme,
        boardTheme: s.boardTheme,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

/** Animation timing (ms) resolved from the accessibility setting. */
export function animMs(speed: AnimationSpeed, base: number): number {
  switch (speed) {
    case "fast":
      return base * 0.5;
    case "reduced":
      return 0;
    default:
      return base;
  }
}

export type { TranslationKey };
