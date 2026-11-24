/**
 * Sapludu — application shell: sticky header, sticky footer, single-route view router.
 */
"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore, type ViewId } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { InstallBar, NetworkBanners } from "@/components/pwa/pwa-ui";
import { usePwaStore } from "@/lib/pwa";
import { useOnlineStore } from "@/stores/online-store";
import { useInviteActions } from "@/components/views/friends";
import { toast } from "sonner";
import { isOnlineConfigured } from "@/lib/config";
import {
  Home,
  Play,
  Trophy,
  Users,
  User,
  Settings,
  ScrollText,
  ShieldCheck,
  LogOut,
  Volume2,
  VolumeX,
  Languages,
} from "lucide-react";

import { LandingView } from "@/components/views/landing";
import { AuthView } from "@/components/views/auth";
import { DashboardView } from "@/components/views/dashboard";
import { PlayView } from "@/components/views/play";
import { BoardsView } from "@/components/views/boards";
import { OnlineView } from "@/components/views/online";
import { GameView } from "@/components/views/game-view";
import { ProfileView } from "@/components/views/profile";
import { LeaderboardView } from "@/components/views/leaderboard";
import { FriendsView } from "@/components/views/friends";
import { SettingsView } from "@/components/views/settings";
import { RulesView } from "@/components/views/rules";
import { AdminView } from "@/components/views/admin";
import { InfoDialogs } from "@/components/views/dialogs";

export function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const t = useT();
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="flex items-center gap-2">
      <div className={`${dim} grid place-items-center rounded-xl bg-emerald-600 shadow-md`}>
        <svg viewBox="0 0 24 24" className="h-3/4 w-3/4" fill="none" aria-hidden>
          <path
            d="M4 17c4 0 4-5 8-5s4 5 8 5M4 7c4 0 4 5 8 5"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="18" cy="5.4" r="2.6" fill="#fff" />
          <circle cx="17.4" cy="4.9" r="0.6" fill="#065f46" />
          <circle cx="19" cy="4.9" r="0.6" fill="#065f46" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="font-black tracking-tight text-gray-900">
          {t("brand.name")} <span className="text-emerald-600">{t("brand.native")}</span>
        </p>
        <p className="text-[10px] font-medium text-gray-500">{t("brand.tagline")}</p>
      </div>
    </div>
  );
}

function HeaderNav() {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const language = useUiStore((s) => s.language);
  const toggleLanguage = useUiStore((s) => s.toggleLanguage);
  const soundOn = useUiStore((s) => s.sound);
  const setSound = useUiStore((s) => s.setSound);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setAuthMode = useUiStore((s) => s.setAuthMode);

  const items: { id: ViewId; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: t("nav.home"), icon: <Home className="h-4 w-4" /> },
    { id: "play", label: t("nav.play"), icon: <Play className="h-4 w-4" /> },
    { id: "leaderboard", label: t("nav.leaderboard"), icon: <Trophy className="h-4 w-4" /> },
    { id: "friends", label: t("nav.friends"), icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-100 bg-white/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-4">
        <button
          onClick={() => {
            sound.play("click");
            navigate("landing");
          }}
          className="shrink-0"
          aria-label="Sapludu home"
        >
          <BrandLogo size="sm" />
        </button>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {items.map((it) => (
            <Button
              key={it.id}
              variant={view === it.id ? "default" : "ghost"}
              size="sm"
              className={`gap-1.5 ${view === it.id ? "bg-emerald-600 hover:bg-emerald-700" : "text-gray-600"}`}
              onClick={() => {
                sound.play("click");
                navigate(it.id);
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => {
              toggleLanguage();
              sound.play("click");
            }}
            className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
            aria-label="Toggle language"
            title="EN / বাংলা"
          >
            <Languages className="h-4 w-4" />
            {language === "en" ? "বাংলা" : "EN"}
          </button>

          <button
            onClick={() => {
              setSound(!soundOn);
              sound.setEnabled(!soundOn);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50"
            aria-label={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1" aria-label="Account menu">
                  <UserAvatar name={user.displayName} picture={user.picture} avatar={user.avatar} className="h-9 w-9 border-2 border-emerald-200" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-bold text-gray-900">{user.displayName}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                  <p className="mt-1 text-xs font-bold text-emerald-700">
                    {t("dash.rating")}: {user.rating}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("profile")}>
                  <User className="mr-2 h-4 w-4" /> {t("nav.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("settings")}>
                  <Settings className="mr-2 h-4 w-4" /> {t("nav.settings")}
                </DropdownMenuItem>
                {user.role === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("admin")}>
                    <ShieldCheck className="mr-2 h-4 w-4" /> {t("nav.admin")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate("landing");
                  }}
                  className="text-red-600 focus:text-red-700"
                >
                  <LogOut className="mr-2 h-4 w-4" /> {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setAuthMode("login");
                navigate("auth");
              }}
            >
              {t("landing.cta.login")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const setAuthMode = useUiStore((s) => s.setAuthMode);

  const items: { id: ViewId; label: string; icon: React.ReactNode }[] = [
    { id: "landing", label: t("nav.home"), icon: <Home className="h-5 w-5" /> },
    { id: "play", label: t("nav.play"), icon: <Play className="h-5 w-5" /> },
    { id: "leaderboard", label: t("nav.leaderboard"), icon: <Trophy className="h-5 w-5" /> },
    { id: "friends", label: t("nav.friends"), icon: <Users className="h-5 w-5" /> },
    {
      id: user ? "profile" : "auth",
      label: user ? t("nav.profile") : t("landing.cta.login"),
      icon: user ? <User className="h-5 w-5" /> : <LogOut className="h-5 w-5 rotate-180" />,
    },
  ];

  function go(id: ViewId) {
    sound.play("click");
    if (id === "auth") {
      setAuthMode("login");
    }
    navigate(id);
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => go(it.id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition ${
              view === it.id ? "text-emerald-700" : "text-gray-400"
            }`}
            aria-current={view === it.id ? "page" : undefined}
          >
            {it.icon}
            <span className="max-w-full truncate px-1">{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Footer() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const setDialog = useUiStore((s) => s.setDialog);
  return (
    <footer className="mt-auto border-t border-emerald-100 bg-white pb-16 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-gray-500 sm:flex-row">
        <p>
          © 2026 {t("brand.name")} · {t("footer.madeFor")}
        </p>
        <nav className="flex items-center gap-4" aria-label="Footer navigation">
          <button className="hover:text-emerald-700" onClick={() => navigate("rules")}>
            {t("footer.rules")}
          </button>
          <button className="hover:text-emerald-700" onClick={() => setDialog("about", true)}>
            {t("footer.about")}
          </button>
          <button className="hover:text-emerald-700" onClick={() => setDialog("terms", true)}>
            {t("footer.terms")}
          </button>
          <button className="hover:text-emerald-700" onClick={() => setDialog("privacy", true)}>
            {t("footer.privacy")}
          </button>
        </nav>
      </div>
    </footer>
  );
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-emerald-50 to-white">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 0.9 }}
        className="text-center"
      >
        <BrandLogo />
        <p className="mt-3 text-sm text-gray-500">Loading...</p>
      </motion.div>
    </div>
  );
}

/** Live game invitations: a toast with one-tap Join / Decline, wherever the player currently is. */
function InviteWatcher() {
  const t = useT();
  const invites = useOnlineStore((s) => s.invites);
  const respond = useInviteActions();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const inv of invites) {
      if (seen.current.has(inv.inviteId)) continue;
      seen.current.add(inv.inviteId);
      toast(`${inv.from.displayName} ${t("online.invitedYou")}`, {
        duration: 15000,
        action: { label: t("online.accept"), onClick: () => void respond(inv.inviteId, inv.roomCode, true) },
        cancel: { label: t("online.decline"), onClick: () => void respond(inv.inviteId, inv.roomCode, false) },
      });
    }
  }, [invites, respond, t]);
  return null;
}

export function AppShell() {
  const view = useUiStore((s) => s.view);
  const hydrated = useUiStore((s) => s.hydrated);
  const theme = useUiStore((s) => s.theme);
  const soundOn = useUiStore((s) => s.sound);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const user = useAuthStore((s) => s.user);
  const loaded = useAuthStore((s) => s.loaded);
  const viewRef = useRef(view);

  // apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // sound setting sync
  useEffect(() => {
    sound.setEnabled(soundOn);
  }, [soundOn]);

  // restore the Google-backed session once, and start PWA bookkeeping
  useEffect(() => {
    void fetchMe();
    usePwaStore.getState().init();
  }, [fetchMe]);

  // PWA shortcuts / deep links: ?view=online | setup-ai | setup-local | play | leaderboard | rules
  useEffect(() => {
    const v = new URLSearchParams(location.search).get("view");
    const allowed: ViewId[] = ["online", "setup-ai", "setup-local", "play", "leaderboard", "rules"];
    if (v && (allowed as string[]).includes(v)) useUiStore.getState().navigate(v as ViewId);
  }, []);

  // A signed-in player stays connected to the realtime server so invitations arrive live and an interrupted
  // game can be resumed. Signing out closes the connection.
  useEffect(() => {
    if (!loaded) return;
    const s = useOnlineStore.getState();
    if (!user) s.disconnect();
    else if (isOnlineConfigured && !s.socket && !s.authProblem) s.connect();
  }, [user, loaded]);

  // offer to resume a room / game the server restored after a reload or reconnect
  const t = useT();
  const restoredRoom = useOnlineStore((s) => s.room?.code ?? null);
  const resumeShown = useRef<string | null>(null);
  useEffect(() => {
    if (!restoredRoom || resumeShown.current === restoredRoom) return;
    resumeShown.current = restoredRoom;
    if (useUiStore.getState().view !== "online" && useUiStore.getState().view !== "game") {
      toast(t("online.resume"), {
        duration: 20000,
        action: { label: t("online.resumeBtn"), onClick: () => useUiStore.getState().navigate("online") },
      });
    }
  }, [restoredRoom, t]);

  // gesture unlock for WebAudio
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // guests landing on protected views → auth
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!loaded) return;
    const protectedViews: ViewId[] = ["dashboard", "profile", "friends", "admin"];
    if (!user && protectedViews.includes(viewRef.current)) {
      useUiStore.getState().setAuthMode("login");
      useUiStore.getState().navigate("auth");
    }
    if (viewRef.current === "admin" && user && user.role !== "admin") {
      useUiStore.getState().navigate("dashboard");
    }
  }, [view, user, loaded]);

  if (!hydrated || !loaded) return <Splash />;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-amber-50/40">
      <InstallBar />
      <NetworkBanners />
      <HeaderNav />
      <main className="flex-1 pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6"
          >
            {view === "landing" && <LandingView />}
            {view === "auth" && <AuthView />}
            {view === "dashboard" && <DashboardView />}
            {view === "play" && <PlayView />}
            {view === "setup-local" && <PlayView mode="local" />}
            {view === "setup-ai" && <PlayView mode="ai" />}
            {view === "boards" && <BoardsView />}
            {view === "online" && <OnlineView />}
            {view === "game" && <GameView />}
            {view === "profile" && <ProfileView />}
            {view === "leaderboard" && <LeaderboardView />}
            {view === "friends" && <FriendsView />}
            {view === "settings" && <SettingsView />}
            {view === "rules" && <RulesView />}
            {view === "admin" && <AdminView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <MobileNav />
      <InfoDialogs />
      <InviteWatcher />
    </div>
  );
}
