/**
 * Sapludu — auth store. The source of truth for "who am I" is the Apps Script backend; this store only
 * mirrors what the backend returned. Local pass-and-play / AI games work without signing in.
 */
"use client";

import { create } from "zustand";
import { api, ApiError, onAuthLost, session } from "@/lib/api";
import { googleSignOut } from "@/lib/google";
import { useUiStore } from "@/stores/ui-store";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  picture: string;
  avatar: string;
  language: "en" | "bn";
  role: "player" | "admin";
  status: string;
  rating: number;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  practiceGames: number;
  practiceWins: number;
  createdAt: string;
  lastLogin: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  loaded: boolean;
  /** set when a session was lost (expired / revoked / suspended) so the UI can explain it once */
  notice: string | null;

  fetchMe: () => Promise<CurrentUser | null>;
  loginWithGoogle: (idToken: string) => Promise<{ user: CurrentUser; isNew: boolean }>;
  setUser: (u: CurrentUser | null) => void;
  updateProfile: (patch: Partial<Pick<CurrentUser, "displayName" | "avatar" | "language">>) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  clearNotice: () => void;
}

function applyLanguage(u: CurrentUser | null) {
  if (u && (u.language === "en" || u.language === "bn")) useUiStore.getState().setLanguage(u.language);
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: false,
  loaded: false,
  notice: null,

  fetchMe: async () => {
    if (!session.get()) {
      set({ user: null, loaded: true, loading: false });
      return null;
    }
    set({ loading: true });
    try {
      const data = await api<{ user: CurrentUser }>("auth.me", {}, { retry: true });
      applyLanguage(data.user);
      set({ user: data.user, loaded: true, loading: false });
      return data.user;
    } catch (e) {
      const err = e as ApiError;
      // transient failure (offline, Apps Script hiccup): keep the token, let the user retry later
      set({ user: null, loaded: true, loading: false, notice: err.retryable ? null : err.message });
      return null;
    }
  },

  loginWithGoogle: async (idToken) => {
    const data = await api<{ sessionToken: string; user: CurrentUser; isNew: boolean }>("auth.login", { idToken }, { auth: false });
    session.set(data.sessionToken);
    applyLanguage(data.user);
    set({ user: data.user, loaded: true, notice: null });
    return { user: data.user, isNew: data.isNew };
  },

  setUser: (user) => set({ user, loaded: true }),

  updateProfile: async (patch) => {
    const data = await api<{ user: CurrentUser }>("users.updateProfile", patch as Record<string, unknown>);
    set({ user: data.user });
    return data.user;
  },

  logout: async () => {
    try {
      if (session.get()) await api("auth.logout", {});
    } catch {
      /* the local session is dropped regardless */
    }
    session.clear();
    googleSignOut();
    set({ user: null });
  },

  clearNotice: () => set({ notice: null }),
}));

// when any API call learns the session is dead, sign out locally
onAuthLost((reason) => {
  useAuthStore.setState({
    user: null,
    notice: reason === "ACCOUNT_SUSPENDED" ? "Your account has been suspended." : "Your session expired. Please sign in again.",
  });
});
