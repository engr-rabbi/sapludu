/**
 * Sapludu — admin dashboard. Purely a client for the `admin.*` backend actions: every one of them is
 * authorised on the Apps Script side (role checked from the database on each call), so hiding or showing
 * this screen in the browser grants nothing.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { api, ApiError } from "@/lib/api";
import { useT, formatDate, formatNumber } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Users, Gamepad2, Globe2, UserCheck, TrendingUp, Search, Ban, Undo2, Flag, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  newUsers7d: number;
  totalGames: number;
  onlineGames: number;
  games7d: number;
  activeGames: number;
  openReports: number;
}

interface AdminUser {
  id: string;
  displayName: string;
  picture: string;
  avatar: string;
  email: string;
  role: string;
  status: string;
  statusReason: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  createdAt: string;
  lastLogin: string;
}

interface AdminGame {
  id: string;
  mode: string;
  status: string;
  roomCode: string;
  turnCount: number;
  endedAt: string;
  forfeited: boolean;
  players: { name: string; color: string; userId: string | null; finalPosition: number; placement: number }[];
}

interface ActiveSession {
  gameId: string;
  roomCode: string;
  startedAt: string;
  players: { playerId: string; name: string }[];
}

interface Report {
  id: string;
  kind: string;
  message: string;
  context: string;
  status: string;
  createdAt: string;
  reporter: { id: string; displayName: string } | null;
}

interface AuditRow {
  auditId: string;
  adminId: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

export function AdminView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const language = useUiStore((s) => s.language);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [games, setGames] = useState<AdminGame[] | null>(null);
  const [active, setActive] = useState<ActiveSession[]>([]);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "suspended" | "inactive">("all");
  const [forbidden, setForbidden] = useState(false);
  const [failed, setFailed] = useState(false);

  const guard = useCallback((e: unknown) => {
    if ((e as ApiError).code === "FORBIDDEN") setForbidden(true);
    else setFailed(true);
  }, []);

  const loadStats = useCallback(() => api<AdminStats>("admin.stats").then(setStats).catch(guard), [guard]);
  const loadUsers = useCallback(
    (q: string, f: string) => api<{ users: AdminUser[] }>("admin.users", { q, filter: f }).then((d) => setUsers(d.users)).catch(guard),
    [guard],
  );
  const loadGames = useCallback(
    () =>
      api<{ games: AdminGame[]; activeSessions: ActiveSession[] }>("admin.games")
        .then((d) => {
          setGames(d.games);
          setActive(d.activeSessions);
        })
        .catch(guard),
    [guard],
  );
  const loadReports = useCallback(() => api<{ reports: Report[] }>("admin.reports", { status: "open" }).then((d) => setReports(d.reports)).catch(guard), [guard]);
  const loadAudit = useCallback(() => api<{ audit: AuditRow[] }>("admin.audit").then((d) => setAudit(d.audit)).catch(guard), [guard]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadStats();
      void loadUsers("", "all");
      void loadGames();
      void loadReports();
      void loadAudit();
    }, 0);
    return () => clearTimeout(id);
  }, [loadStats, loadUsers, loadGames, loadReports, loadAudit]);

  async function setStatus(u: AdminUser, status: "active" | "suspended") {
    let reason = "";
    if (status === "suspended") {
      const r = window.prompt(`${t("admin.confirmSuspend")}\n${t("admin.reason")}:`, "");
      if (r === null) return;
      reason = r;
    }
    try {
      await api("admin.setUserStatus", { playerId: u.id, status, reason });
      toast.success("✓");
      void loadUsers(query, filter);
      void loadStats();
      void loadAudit();
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  async function setRole(u: AdminUser, role: "player" | "admin") {
    try {
      await api("admin.setRole", { playerId: u.id, role });
      toast.success("✓");
      void loadUsers(query, filter);
      void loadAudit();
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  async function resolve(r: Report) {
    const note = window.prompt(t("admin.resolveNote"), "") ?? "";
    try {
      await api("admin.resolveReport", { reportId: r.id, resolution: note });
      void loadReports();
      void loadStats();
      void loadAudit();
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  if (forbidden) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-red-400" />
          <p className="mt-3 font-bold text-gray-700">{t("admin.noPermission")}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("dashboard")}>
            {t("nav.home")}
          </Button>
        </div>
      </div>
    );
  }

  const overview = [
    { label: t("admin.totalUsers"), value: stats?.totalUsers, icon: <Users className="h-5 w-5" />, cls: "bg-emerald-50 text-emerald-700" },
    { label: t("admin.newUsers"), value: stats?.newUsers7d, icon: <UserCheck className="h-5 w-5" />, cls: "bg-teal-50 text-teal-700" },
    { label: t("admin.totalGames"), value: stats?.totalGames, icon: <Gamepad2 className="h-5 w-5" />, cls: "bg-amber-50 text-amber-700" },
    { label: t("admin.games7d"), value: stats?.games7d, icon: <TrendingUp className="h-5 w-5" />, cls: "bg-indigo-50 text-indigo-700" },
    { label: t("admin.activeGames"), value: stats?.activeGames, icon: <Globe2 className="h-5 w-5" />, cls: "bg-rose-50 text-rose-700" },
    { label: t("admin.openReports"), value: stats?.openReports, icon: <Flag className="h-5 w-5" />, cls: "bg-orange-50 text-orange-700" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-2">
      <h1 className="flex items-center gap-2 text-2xl font-black text-gray-900">
        <ShieldCheck className="h-6 w-6 text-emerald-600" /> {t("admin.title")}
      </h1>
      {failed && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("admin.loadFailed")}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {overview.map((o) => (
          <div key={o.label} className={`rounded-2xl border border-gray-100 p-3 shadow-sm ${o.cls}`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{o.label}</span>
              {o.icon}
            </div>
            {stats ? <p className="text-2xl font-black">{formatNumber(o.value ?? 0, language)}</p> : <Skeleton className="h-8 w-14" />}
          </div>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">{t("admin.users")}</TabsTrigger>
          <TabsTrigger value="games">{t("admin.games")}</TabsTrigger>
          <TabsTrigger value="reports">
            {t("admin.reports")} {stats?.openReports ? `(${stats.openReports})` : ""}
          </TabsTrigger>
          <TabsTrigger value="audit">{t("admin.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-3 space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loadUsers(query, filter);
            }}
          >
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("admin.searchUsers")} className="pl-9" maxLength={60} />
            </div>
            {(["all", "suspended", "inactive"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                variant={filter === f ? "default" : "outline"}
                size="sm"
                className={filter === f ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                onClick={() => {
                  setFilter(f);
                  void loadUsers(query, f);
                }}
              >
                {f === "all" ? t("admin.all") : f === "suspended" ? t("admin.suspendedOnly") : t("admin.inactive")}
              </Button>
            ))}
          </form>
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
            {users === null ? (
              <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <ul className="divide-y divide-gray-100" data-testid="admin-users">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <UserAvatar name={u.displayName} picture={u.picture} avatar={u.avatar} className="h-9 w-9" textClass="text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-800">
                        {u.displayName}{" "}
                        {u.role === "admin" && <Badge className="ml-1 bg-emerald-600">{t("admin.role.admin")}</Badge>}
                        {u.status === "suspended" && <Badge className="ml-1 bg-red-600">{t("admin.suspended")}</Badge>}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {u.email} · {u.gamesPlayed}G {u.wins}W · {u.rating} Elo · {t("admin.lastLogin")} {formatDate(u.lastLogin, language)}
                      </p>
                      {u.statusReason && <p className="text-xs text-red-500">{u.statusReason}</p>}
                    </div>
                    {u.role !== "admin" && (
                      <div className="flex gap-1.5">
                        {u.status === "suspended" ? (
                          <Button size="sm" variant="outline" onClick={() => void setStatus(u, "active")}>
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> {t("admin.restore")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => void setStatus(u, "suspended")}>
                            <Ban className="mr-1 h-3.5 w-3.5" /> {t("admin.suspend")}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => void setRole(u, "admin")}>
                          {t("admin.makeAdmin")}
                        </Button>
                      </div>
                    )}
                    {u.role === "admin" && (
                      <Button size="sm" variant="outline" onClick={() => void setRole(u, "player")}>
                        {t("admin.removeAdmin")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="games" className="mt-3 space-y-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg">
            <p className="mb-2 text-sm font-black text-gray-700">{t("admin.activeSessions")}</p>
            {active.length === 0 ? (
              <p className="text-sm text-gray-500">{t("admin.noActive")}</p>
            ) : (
              <ul className="space-y-1.5">
                {active.map((s) => (
                  <li key={s.gameId} className="rounded-xl bg-rose-50 px-3 py-2 text-sm">
                    <span className="font-mono font-bold">{s.roomCode}</span> · {s.players.map((p) => p.name).join(" vs ")} · {formatDate(s.startedAt, language)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
            {games === null ? (
              <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {games.map((g) => (
                  <li key={g.id} className="px-4 py-3 text-sm">
                    <p className="font-bold text-gray-800">
                      {g.players.slice().sort((a, b) => a.placement - b.placement).map((p) => `${p.name}${p.placement === 1 ? " 🏆" : ""}`).join(" · ")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t(`admin.mode.${g.mode}` as never)} · {g.turnCount} {t("game.turn")} · {formatDate(g.endedAt, language)}
                      {g.forfeited ? " · forfeit" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-3">
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
            {reports === null ? (
              <Skeleton className="m-4 h-16" />
            ) : reports.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500">{t("admin.noReports")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800">
                        <Badge className="mr-2 bg-amber-500">{t(`report.kind.${r.kind}` as never)}</Badge>
                        {r.message}
                      </p>
                      <p className="mt-1 break-all text-xs text-gray-400">
                        {r.reporter?.displayName ?? "?"} · {formatDate(r.createdAt, language)} · {r.context}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void resolve(r)}>
                      <CheckCheck className="mr-1 h-3.5 w-3.5" /> {t("admin.resolve")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg">
            {!audit || audit.length === 0 ? (
              <p className="text-sm text-gray-500">{t("admin.noAudit")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs text-gray-600">
                {audit.map((a) => (
                  <li key={a.auditId}>
                    <b>{a.action}</b> → <span className="font-mono">{a.targetId}</span> {a.detail && `(${a.detail})`} · {formatDate(a.createdAt, language)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
