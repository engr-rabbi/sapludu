/**
 * Sapludu — leaderboard view: all-time (Elo), daily/weekly/monthly (period wins), friends.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT, formatNumber } from "@/lib/i18n";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award } from "lucide-react";

interface LbEntry {
  id: string;
  rank: number;
  displayName: string;
  picture?: string;
  avatar: string;
  rating: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  periodWins?: number;
}

type Period = "all" | "daily" | "weekly" | "monthly";
type Scope = "global" | "friends";

export function LeaderboardView() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const language = useUiStore((s) => s.language);

  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState<Scope>("global");
  const [entries, setEntries] = useState<LbEntry[] | null>(null);
  const [mode, setMode] = useState<"rating" | "period-wins">("rating");

  const [me, setMe] = useState<LbEntry | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setEntries(null);
    setFailed(false);
    try {
      const data = await api<{ entries: LbEntry[]; mode: "rating" | "period-wins"; me: LbEntry | null }>("leaderboard.get", { period, scope }, { retry: true });
      setEntries(data.entries);
      setMode(data.mode);
      setMe(data.me);
    } catch {
      setEntries([]);
      setMe(null);
      setFailed(true);
    }
  }, [period, scope]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const tabs: { id: Period; label: string }[] = [
    { id: "all", label: t("lb.allTime") },
    { id: "daily", label: t("lb.daily") },
    { id: "weekly", label: t("lb.weekly") },
    { id: "monthly", label: t("lb.monthly") },
  ];


  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div className="text-center">
        <h1 className="text-2xl font-black text-gray-900">{t("lb.title")}</h1>
        <p className="text-sm text-gray-500">{t("lb.subtitle")}</p>
      </div>

      {/* period tabs */}
      <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-gray-100 p-1.5">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setPeriod(tb.id)}
            className={`rounded-xl px-2 py-2 text-xs font-bold transition sm:text-sm ${
              period === tb.id ? "bg-white text-emerald-700 shadow" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* scope toggle */}
      <div className="flex justify-center gap-2">
        <button
          onClick={() => setScope("global")}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
            scope === "global" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          🌐 Global
        </button>
        <button
          onClick={() => {
            if (!user) {
              useUiStore.getState().setAuthMode("login");
              useUiStore.getState().navigate("auth");
              return;
            }
            setScope("friends");
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
            scope === "friends" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          👥 {t("lb.friends")}
        </button>
      </div>

      {/* my rank banner */}
      {user && me && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-black text-emerald-700">#{me.rank}</span>
          <UserAvatar name={user.displayName} picture={user.picture} avatar={user.avatar} className="h-8 w-8" textClass="text-xs" />
          <p className="flex-1 text-sm font-bold text-gray-800">{user.displayName}</p>
          <span className="text-sm font-black text-emerald-700">
            {me.rating} Elo
          </span>
        </div>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
        {entries === null ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">{failed ? t("auth.err.unavailable") : t("lb.empty")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((e, i) => {
              const pos = e.rank || i + 1;
              return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className={`flex items-center gap-3 px-4 py-3 ${
                  e.id === user?.id ? "bg-emerald-50/70" : ""
                }`}
              >
                <span className="grid w-8 shrink-0 place-items-center">
                  {pos === 1 ? (
                    <Trophy className="h-5 w-5 text-amber-500" />
                  ) : pos === 2 ? (
                    <Medal className="h-5 w-5 text-gray-400" />
                  ) : pos === 3 ? (
                    <Award className="h-5 w-5 text-orange-400" />
                  ) : (
                    <span className="text-sm font-black text-gray-400">{pos}</span>
                  )}
                </span>
                <UserAvatar name={e.displayName} picture={e.picture} avatar={e.avatar} className="h-9 w-9" textClass="text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-800">{e.displayName}</p>
                  <p className="text-xs text-gray-400">
                    {e.wins}W / {e.losses}L
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-emerald-700">
                    {mode === "rating"
                      ? formatNumber(e.rating, language)
                      : `${e.periodWins ?? 0} ${t("lb.winsPeriod")}`}
                  </p>
                  {mode === "rating" && <p className="text-[10px] uppercase text-gray-400">Elo</p>}
                </div>
              </motion.li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-center text-[11px] text-gray-400">
        Elo ratings update only for online human-vs-human matches. AI &amp; local games affect personal
        stats only.
      </p>
    </div>
  );
}
