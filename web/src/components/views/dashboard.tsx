/**
 * Sapludu — player dashboard: real DB stats, recent matches, achievements preview,
 * notifications and quick-play actions.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { GameInvites } from "@/components/views/friends";
import { useT, formatDate, formatNumber } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ACHIEVEMENTS, getAchievement } from "@/lib/achievements";
import {
  Play,
  Trophy,
  TrendingUp,
  Flame,
  Gamepad2,
  Bell,
  ChevronRight,
  Users,
  Bot,
  Globe2,
} from "lucide-react";

interface RecentGame {
  id: string;
  mode: string;
  turnCount: number;
  endedAt: string;
  players: {
    name: string;
    color: string;
    isAI: boolean;
    finalPosition: number;
    placement: number | null;
    userId: string | null;
  }[];
}

interface RequestRow {
  friendshipId: string;
  displayName: string;
}

export function DashboardView() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const navigate = useUiStore((s) => s.navigate);
  const language = useUiStore((s) => s.language);

  const [recent, setRecent] = useState<RecentGame[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [g, f, a] = await Promise.allSettled([
      api<{ games: RecentGame[] }>("games.history", { page: 1 }, { retry: true }),
      api<{ incoming: RequestRow[] }>("friends.list", {}, { retry: true }),
      api<{ achievements: { id: string; unlockedAt: string | null }[] }>("achievements.list", {}, { retry: true }),
    ]);
    setRecent(g.status === "fulfilled" ? g.value.games : []);
    setRequests(f.status === "fulfilled" ? f.value.incoming : []);
    if (a.status === "fulfilled") {
      const map: Record<string, string> = {};
      for (const x of a.value.achievements) if (x.unlockedAt) map[x.id] = x.unlockedAt;
      setUnlocked(map);
    }
  }, []);

  useEffect(() => {
    // deferred tick keeps setState out of the effect body (React 19 rule)
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  if (!user) return null;

  const stats = [
    { label: t("dash.totalGames"), value: user.gamesPlayed, icon: <Gamepad2 className="h-5 w-5" />, cls: "text-emerald-700 bg-emerald-50" },
    { label: t("dash.wins"), value: user.wins, icon: <Trophy className="h-5 w-5" />, cls: "text-amber-700 bg-amber-50" },
    { label: t("dash.winRate"), value: `${user.winRate}%`, icon: <TrendingUp className="h-5 w-5" />, cls: "text-teal-700 bg-teal-50" },
    { label: t("dash.rating"), value: user.rating, icon: <Flame className="h-5 w-5" />, cls: "text-rose-700 bg-rose-50" },
  ];

  const quickActions = [
    { view: "setup-local" as const, label: t("play.local.title"), icon: <Users className="h-5 w-5" />, cls: "hover:bg-amber-50 border-amber-200" },
    { view: "setup-ai" as const, label: t("play.ai.title"), icon: <Bot className="h-5 w-5" />, cls: "hover:bg-emerald-50 border-emerald-200" },
    { view: "online" as const, label: t("play.online.title"), icon: <Globe2 className="h-5 w-5" />, cls: "hover:bg-rose-50 border-rose-200" },
  ];

  return (
    <div className="space-y-6">
      {/* greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            {t("dash.welcome")}, {user.displayName}!
          </h1>
          <p className="text-sm text-gray-500">
            {t("profile.rank")}: <b className="text-emerald-700">{user.rank > 0 ? `#${formatNumber(user.rank, language)}` : "—"}</b> ·{" "}
            <b className="text-emerald-700">{formatNumber(user.rating, language)}</b> Elo ·{" "}
            {t("profile.memberSince")} {formatDate(user.createdAt, language)}
          </p>
        </div>
        <Button
          className="h-11 bg-amber-400 px-6 font-black text-amber-950 hover:bg-amber-300"
          onClick={() => {
            sound.play("click");
            navigate("play");
          }}
        >
          <Play className="mr-2 h-5 w-5" /> {t("dash.quickPlay")}
        </Button>
      </div>

      <GameInvites />

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 p-4 shadow-sm ${s.cls}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide opacity-80">{s.label}</span>
              {s.icon}
            </div>
            <p className="text-2xl font-black">{formatNumber(s.value as number, language)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* quick play cards */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("play.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {quickActions.map((qa) => (
              <button
                key={qa.view}
                onClick={() => {
                  sound.play("click");
                  navigate(qa.view);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left font-semibold text-gray-800 shadow-sm transition ${qa.cls}`}
              >
                {qa.icon}
                <span className="flex-1">{qa.label}</span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </CardContent>
        </Card>

        {/* recent matches */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("dash.recent")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("profile")}>
              {t("dash.viewAll")} <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recent === null ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{t("dash.noMatches")}</p>
            ) : (
              <ul className="space-y-2">
                {recent.slice(0, 5).map((g) => {
                  const mine = g.players.find((p) => p.userId === user.id);
                  const won = mine?.placement === 1;
                  return (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black ${
                          won ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {won ? "W" : "L"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-800">
                          {g.players
                            .slice()
                            .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9))
                            .map((p) => p.name)
                            .join(" · ")}
                        </p>
                        <p className="text-xs text-gray-400">
                          {t(`admin.mode.${g.mode}` as never)} · {g.turnCount} {t("game.turn")} ·{" "}
                          {formatDate(g.endedAt, language)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* achievements preview */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("dash.achievements")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("profile")}>
              {unlockedCount(unlocked)}/{ACHIEVEMENTS.length} <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {ACHIEVEMENTS.map((a) => {
                const isUnlocked = Boolean(unlocked[a.id]);
                const def = getAchievement(a.id);
                const Icon = {
                  trophy: Trophy,
                  globe: Globe2,
                  "gamepad-2": Gamepad2,
                  medal: Trophy,
                  flame: Flame,
                  crown: Trophy,
                  shield: Users,
                }[def?.icon ?? "trophy"] ?? Trophy;
                return (
                  <div
                    key={a.id}
                    title={language === "bn" ? a.titleBn : a.titleEn}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                      isUnlocked
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-gray-100 bg-gray-50 text-gray-300"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[9px] font-bold leading-tight">
                      {(language === "bn" ? a.titleBn : a.titleEn).split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* notifications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> {t("dash.notifications")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requests === null ? (
              <Skeleton className="h-20 w-full" />
            ) : requests.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">{t("dash.noNotifications")}</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {requests.slice(0, 8).map((r) => (
                  <li key={r.friendshipId}>
                    <button onClick={() => navigate("friends")} className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 hover:bg-emerald-50">
                      <b>{r.displayName}</b> — {t("friends.reqSent")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function unlockedCount(map: Record<string, string>): number {
  return Object.keys(map).length;
}
