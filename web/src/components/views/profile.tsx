/**
 * Sapludu — profile view: edit profile, stats, achievements, game history (tabs).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { UserAvatar, AVATAR_EMOJI } from "@/components/ui/user-avatar";
import { useT, formatDate, formatNumber } from "@/lib/i18n";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Globe2, Gamepad2, Medal, Flame, Crown, Shield, Save, LogOut, Trash2, Flag, Copy } from "lucide-react";
import { toast } from "sonner";

const AVATARS = ["google", ...Object.keys(AVATAR_EMOJI)];

interface GameRow {
  id: string;
  mode: string;
  turnCount: number;
  endedAt: string;
  players: { name: string; color: string; placement: number | null; userId: string | null; isAI: boolean }[];
}

const ACH_ICONS: Record<string, React.ReactNode> = {
  trophy: <Trophy className="h-6 w-6" />,
  globe: <Globe2 className="h-6 w-6" />,
  "gamepad-2": <Gamepad2 className="h-6 w-6" />,
  medal: <Medal className="h-6 w-6" />,
  flame: <Flame className="h-6 w-6" />,
  crown: <Crown className="h-6 w-6" />,
  shield: <Shield className="h-6 w-6" />,
};

export function ProfileView() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const logout = useAuthStore((s) => s.logout);
  const language = useUiStore((s) => s.language);
  const navigate = useUiStore((s) => s.navigate);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "google");
  const [prefLang, setPrefLang] = useState<"en" | "bn">(user?.language ?? "en");
  const [reportKind, setReportKind] = useState("bug");
  const [reportText, setReportText] = useState("");
  const [saving, setSaving] = useState(false);
  const [achievements, setAchievements] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<GameRow[] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalGames, setTotalGames] = useState(0);

  const loadAchievements = useCallback(async () => {
    try {
      const data = await api<{ achievements: { id: string; unlockedAt: string | null }[] }>("achievements.list", {}, { retry: true });
      const map: Record<string, string> = {};
      for (const a of data.achievements) if (a.unlockedAt) map[a.id] = a.unlockedAt;
      setAchievements(map);
    } catch {
      /* offline: keep empty */
    }
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    try {
      const data = await api<{ games: GameRow[]; total: number }>("games.history", { page }, { retry: true });
      setHistory(data.games);
      setTotalGames(data.total);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadAchievements();
      void loadHistory(historyPage);
    }, 0);
    return () => clearTimeout(id);
  }, [loadAchievements, loadHistory, historyPage]);

  if (!user) return null;

  async function save() {
    setSaving(true);
    try {
      await updateProfile({ displayName, avatar, language: prefLang });
      useUiStore.getState().setLanguage(prefLang);
      toast.success(t("profile.saved"));
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function signOutAll() {
    try {
      await api("auth.logoutAll", {});
      toast.success(t("profile.signedOutAll"));
    } catch {
      /* session is gone anyway */
    }
    await logout();
    navigate("landing");
  }

  async function deleteAccount() {
    const answer = window.prompt(t("profile.deleteConfirm"));
    if (answer !== "DELETE") return;
    try {
      await api("users.deleteAccount", { confirm: "DELETE" });
      toast.success(t("profile.deleted"));
      await logout();
      navigate("landing");
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  async function sendReport() {
    try {
      await api("reports.submit", { kind: reportKind, message: reportText, context: `${navigator.userAgent.slice(0, 160)} | ${location.pathname}` });
      toast.success(t("report.sent"));
      setReportText("");
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  const stats = [
    { label: t("dash.totalGames"), value: user.gamesPlayed },
    { label: t("dash.wins"), value: user.wins },
    { label: t("dash.losses"), value: user.losses },
    { label: t("dash.winRate"), value: `${user.winRate}%` },
    { label: t("dash.rating"), value: user.rating },
    { label: t("profile.rank"), value: user.rank > 0 ? `#${user.rank}` : "—" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      {/* header card */}
      <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
        <UserAvatar name={user.displayName} picture={user.picture} avatar={user.avatar} className="h-20 w-20 border-4 border-emerald-200" textClass="text-3xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-gray-900">{user.displayName}</h1>
          <p className="truncate text-sm text-gray-500">
            {user.email} · {t("profile.memberSince")} {formatDate(user.createdAt, language)}
          </p>
          <button
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-700"
            onClick={() => void navigator.clipboard.writeText(user.id).then(() => toast.success(t("common.copied")))}
          >
            {t("profile.friendCode")}: <span className="font-mono">{user.id}</span> <Copy className="h-3 w-3" />
          </button>
          <p className="mt-1 inline-flex rounded-full bg-amber-100 px-3 py-0.5 text-sm font-black text-amber-700">
            {t("dash.rating")}: {formatNumber(user.rating, language)}
          </p>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900">{formatNumber(s.value as number, language)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400">
        {t("profile.practice")}: {user.practiceWins} / {user.practiceGames}
      </p>

      <Tabs defaultValue="edit">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="edit">{t("profile.edit")}</TabsTrigger>
          <TabsTrigger value="achievements">
            {t("profile.achievements")} ({Object.keys(achievements).length}/{ACHIEVEMENTS.length})
          </TabsTrigger>
          <TabsTrigger value="history">{t("profile.history")}</TabsTrigger>
        </TabsList>

        {/* edit */}
        <TabsContent value="edit" className="mt-4">
          <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">{t("profile.displayName")}</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} />
            </div>
            <div>
              <Label className="mb-1.5 block">{t("profile.avatar")}</Label>
              <div className="flex flex-wrap gap-2">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAvatar(a)}
                    aria-label={a === "google" ? t("profile.useGooglePhoto") : a}
                    title={a === "google" ? t("profile.useGooglePhoto") : a}
                    className={`h-11 w-11 rounded-xl border-2 text-xl font-black transition ${
                      avatar === a ? "border-emerald-600 bg-emerald-50 shadow-md" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {a === "google" ? "G" : AVATAR_EMOJI[a]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">{t("profile.language")}</Label>
              <div className="flex gap-2">
                {(["en", "bn"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPrefLang(l)}
                    className={`rounded-xl border-2 px-5 py-2 font-bold transition ${
                      prefLang === l ? "border-emerald-600 bg-emerald-50" : "border-gray-200"
                    }`}
                  >
                    {l === "en" ? "English" : "বাংলা"}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="h-11 bg-emerald-600 font-bold hover:bg-emerald-700"
              onClick={() => void save()}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" /> {t("common.save")}
            </Button>
          </div>

          <div className="mt-4 space-y-3 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
            <h2 className="flex items-center gap-2 font-black text-gray-900">
              <Flag className="h-4 w-4 text-amber-600" /> {t("report.title")}
            </h2>
            <p className="text-xs text-gray-500">{t("report.hint")}</p>
            <div className="flex flex-wrap gap-2">
              {["bug", "cheating", "abuse", "other"].map((k) => (
                <button key={k} type="button" onClick={() => setReportKind(k)} className={`rounded-full border px-3 py-1 text-xs font-bold ${reportKind === k ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-500"}`}>
                  {t(`report.kind.${k}` as never)}
                </button>
              ))}
            </div>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              maxLength={1000}
              rows={3}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-emerald-500"
              aria-label={t("report.title")}
            />
            <Button variant="outline" disabled={reportText.trim().length < 5} onClick={() => void sendReport()}>
              {t("report.send")}
            </Button>
          </div>

          <div className="mt-4 space-y-3 rounded-3xl border border-red-100 bg-white p-6 shadow-lg">
            <h2 className="font-black text-gray-900">{t("profile.account")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void signOutAll()}>
                <LogOut className="mr-2 h-4 w-4" /> {t("profile.signOutAll")}
              </Button>
              <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => void deleteAccount()}>
                <Trash2 className="mr-2 h-4 w-4" /> {t("profile.delete")}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* achievements */}
        <TabsContent value="achievements" className="mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a, i) => {
              const at = achievements[a.id];
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${
                    at ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50 opacity-70"
                  }`}
                >
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                      at ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    {ACH_ICONS[a.icon] ?? ACH_ICONS.trophy}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{language === "bn" ? a.titleBn : a.titleEn}</p>
                    <p className="text-xs text-gray-500">{language === "bn" ? a.descBn : a.descEn}</p>
                    {at && (
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-amber-600">
                        {t("ach.unlocked")} · {formatDate(at, language)}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* history */}
        <TabsContent value="history" className="mt-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg">
            {history === null ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">{t("dash.noMatches")}</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100">
                  {history.map((g) => {
                    const mine = g.players.find((p) => p.userId === user.id);
                    const won = mine?.placement === 1;
                    return (
                      <li key={g.id} className="flex items-center gap-3 py-3">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-black ${
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
                              .map((p) => `${p.name}${p.placement === 1 ? " 🏆" : ""}`)
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
                {totalGames > history.length && (
                  <div className="flex justify-center gap-2 pt-3">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                      ←
                    </Button>
                    <span className="px-2 py-1.5 text-sm text-gray-500">
                      {historyPage} / {Math.ceil(totalGames / 15)}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setHistoryPage((p) => p + 1)}>
                      →
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="text-center">
        <Button variant="link" onClick={() => navigate("dashboard")}>
          ← {t("nav.home")}
        </Button>
      </div>
    </div>
  );
}
