/**
 * Sapludu — online multiplayer view: create/join/quick-match + waiting lobby.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useOnlineStore, type RoomState } from "@/stores/online-store";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { isOnlineConfigured } from "@/lib/config";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { TOKEN_COLORS } from "@/components/board/board";
import { BoardThemeStrip } from "@/components/board/board-strip";
import type { TokenColor } from "@sapludu/engine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, LogOut, Play, Plus, KeyRound, Zap, UserPlus, WifiOff } from "lucide-react";
import { toast } from "sonner";

const COLOR_ORDER: TokenColor[] = ["red", "green", "yellow", "purple"];

function Lobby({ room, mySessionId }: { room: RoomState; mySessionId: string | null }) {
  const t = useT();
  const setReady = useOnlineStore((s) => s.setReady);
  const setColor = useOnlineStore((s) => s.setColor);
  const startGame = useOnlineStore((s) => s.startGame);
  const leaveRoom = useOnlineStore((s) => s.leaveRoom);
  const [copied, setCopied] = useState(false);

  const me = room.players.find((p) => p.sessionId === mySessionId);
  const isHost = me?.isHost ?? false;
  const allReady = room.players.every((p) => p.ready || p.isHost);
  const invite = useOnlineStore((s) => s.invite);
  const [friends, setFriends] = useState<{ id: string; displayName: string; picture: string; avatar: string }[]>([]);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isHost) return;
    api<{ friends: typeof friends }>("friends.list", {}, { retry: true }).then((d) => setFriends(d.friends)).catch(() => {});
  }, [isHost]);
  const takenColors = room.players.filter((p) => p.sessionId !== mySessionId).map((p) => p.color);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      sound.play("click");
      toast.success(t("common.copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("common.error"));
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-center text-white shadow-xl">
        <p className="text-sm font-semibold text-emerald-100">{t("online.shareCode")}</p>
        <button
          onClick={() => void copyCode()}
          className="mt-2 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-6 py-3 font-mono text-4xl font-black tracking-[0.3em] backdrop-blur transition hover:bg-white/25"
          aria-label="Copy room code"
        >
          {room.code}
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5 opacity-70" />}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-emerald-100">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("online.waiting")} ({room.players.length}/
          {room.maxPlayers})
        </p>
      </div>

      <div className="space-y-2 rounded-3xl border border-gray-200 bg-white p-5 shadow-lg">
        <p className="text-sm font-bold text-gray-700">{t("common.players")}</p>
        {room.players.map((p) => (
          <div
            key={p.sessionId}
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
          >
            <span className="relative">
              <UserAvatar name={p.displayName} picture={p.picture} className="h-9 w-9" />
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: TOKEN_COLORS[p.color].base }}
                aria-hidden
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-800">
                {p.displayName}
                {p.sessionId === mySessionId && (
                  <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                    {t("online.you")}
                  </span>
                )}
                {p.isHost && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                    {t("online.host")}
                  </span>
                )}
              </p>
              {!p.connected && <p className="text-xs font-semibold text-red-500">{t("common.offline")}</p>}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                p.ready || p.isHost ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
              }`}
            >
              {p.ready || p.isHost ? t("online.ready") : t("online.notReady")}
            </span>
          </div>
        ))}

        {/* color picker */}
        <div className="pt-2">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
            {t("local.color")}
          </p>
          <div className="flex gap-2">
            {COLOR_ORDER.map((c) => {
              const taken = takenColors.includes(c);
              const mine = me?.color === c;
              const tc = TOKEN_COLORS[c];
              return (
                <button
                  key={c}
                  disabled={taken && !mine}
                  onClick={() => {
                    sound.play("click");
                    setColor(c);
                  }}
                  aria-label={`color ${c}`}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    taken && !mine ? "opacity-25" : "hover:scale-110"
                  } ${mine ? "border-gray-900 shadow-md" : "border-white"}`}
                  style={{ backgroundColor: tc.base, borderColor: mine ? "#111827" : tc.ring }}
                />
              );
            })}
          </div>
        </div>

        {isHost && room.players.length < room.maxPlayers && (
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              <UserPlus className="h-3.5 w-3.5" /> {t("online.inviteFriends")}
            </p>
            {friends.length === 0 ? (
              <p className="text-xs text-gray-400">{t("online.noFriends")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {friends
                  .filter((f) => !room.players.some((p) => p.userId === f.id))
                  .map((f) => (
                    <button
                      key={f.id}
                      disabled={invited[f.id]}
                      onClick={() => {
                        sound.play("click");
                        invite(f.id);
                        setInvited((m) => ({ ...m, [f.id]: true }));
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <UserAvatar name={f.displayName} picture={f.picture} avatar={f.avatar} className="h-6 w-6" textClass="text-[10px]" />
                      {invited[f.id] ? "✓" : "+"} {f.displayName}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* board theme — visual only, each client renders its own look */}
        <div className="border-t border-gray-100 pt-3">
          <BoardThemeStrip compact />
        </div>

        <div className="flex gap-2 pt-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              leaveRoom();
              sound.play("click");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> {t("common.leave")}
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              setReady(!me?.ready);
              sound.play("click");
            }}
          >
            {me?.ready ? t("online.notReady") : t("online.ready")}
          </Button>
          {isHost && (
            <Button
              className="flex-1 bg-amber-400 font-black text-amber-950 hover:bg-amber-300"
              disabled={!allReady || room.players.length < 2}
              onClick={() => {
                sound.play("win");
                startGame();
              }}
            >
              <Play className="mr-1.5 h-4 w-4" /> {t("online.startGame")}
            </Button>
          )}
        </div>
        {isHost && room.players.length >= 2 && !allReady && (
          <p className="text-center text-xs text-gray-400">{t("online.err.needReady")}</p>
        )}
        {isHost && room.players.length < 2 && <p className="text-center text-xs text-gray-400">{t("online.hostNote")}</p>}
      </div>
    </div>
  );
}

export function OnlineView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const socket = useOnlineStore((s) => s.socket);
  const phase = useOnlineStore((s) => s.phase);
  const room = useOnlineStore((s) => s.room);
  const mySessionId = useOnlineStore((s) => s.mySessionId);
  const error = useOnlineStore((s) => s.error);
  const clearError = useOnlineStore((s) => s.clearError);
  const connect = useOnlineStore((s) => s.connect);
  const createRoom = useOnlineStore((s) => s.createRoom);
  const joinRoom = useOnlineStore((s) => s.joinRoom);
  const quickMatch = useOnlineStore((s) => s.quickMatch);
  const cancelSearch = useOnlineStore((s) => s.cancelSearch);

  const user = useAuthStore((s) => s.user);
  const authProblem = useOnlineStore((s) => s.authProblem);
  const [code, setCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);

  // auto-connect when entering the online view (signed-in players only)
  useEffect(() => {
    if (user && isOnlineConfigured && !socket && !authProblem) connect();
  }, [user, socket, connect, authProblem]);

  const goSignIn = useCallback(() => {
    useUiStore.getState().setPostAuthView("online");
    useUiStore.getState().setAuthMode("login");
    navigate("auth");
  }, [navigate]);

  // surface server errors as toasts
  useEffect(() => {
    if (error) {
      toast.error(error.message);
      clearError();
      if (phase === "searching") cancelSearch();
    }
  }, [error, clearError, phase, cancelSearch]);

  // jump into the game view once a match starts
  useEffect(() => {
    if (room?.status === "active") {
      navigate("game");
    }
  }, [room?.status, navigate]);

  const connected = Boolean(socket?.connected) || phase === "lobby" || phase === "searching";

  if (!isOnlineConfigured) {
    return <Notice icon={<WifiOff className="h-8 w-8" />} text={t("online.notConfigured")} />;
  }
  if (!user) {
    return <Notice icon={<KeyRound className="h-8 w-8" />} text={t("online.signInRequired")} action={t("landing.cta.login")} onAction={goSignIn} />;
  }
  if (authProblem === "SESSION_REPLACED") {
    return (
      <Notice
        icon={<WifiOff className="h-8 w-8" />}
        text={t("online.replaced")}
        action={t("online.reconnect")}
        onAction={() => {
          useOnlineStore.setState({ authProblem: null });
        }}
      />
    );
  }

  if (room && room.status === "lobby" && phase !== "searching") {
    return <Lobby room={room} mySessionId={mySessionId} />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <div className="flex items-center justify-center gap-2 text-xs font-bold" role="status">
        <span
          className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-400 animate-pulse"}`}
          aria-hidden
        />
        {connected ? t("online.connected") : phase === "connecting" && room ? t("online.reconnecting") : t("online.connecting")}
      </div>

      <h1 className="text-center text-2xl font-black text-gray-900">{t("online.title")}</h1>

      <AnimatePresence mode="wait">
        {phase === "searching" ? (
          <motion.div
            key="searching"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-xl"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
              className="mx-auto mb-4 h-14 w-14 rounded-full border-4 border-emerald-100 border-t-emerald-600"
            />
            <p className="text-lg font-black text-gray-900">{t("online.searching")}</p>
            <p className="mt-1 text-sm text-gray-500">{t("online.searchingHint")}</p>
            <Button variant="outline" className="mt-5" onClick={cancelSearch}>
              {t("online.cancelSearch")}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* create */}
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <Plus className="h-5 w-5" />
                </span>
                <h2 className="font-black text-gray-900">{t("online.create")}</h2>
              </div>
              <Label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
                {t("online.maxPlayers")}
              </Label>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    className={`rounded-xl border-2 py-2 text-lg font-black transition ${
                      maxPlayers === n
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Button
                className="h-11 w-full bg-emerald-600 font-bold hover:bg-emerald-700"
                onClick={() => {
                  sound.play("click");
                  createRoom(maxPlayers);
                }}
              >
                {t("online.createBtn")}
              </Button>
            </div>

            {/* join */}
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-700">
                  <KeyRound className="h-5 w-5" />
                </span>
                <h2 className="font-black text-gray-900">{t("online.join")}</h2>
              </div>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABC123"
                maxLength={6}
                className="mb-3 text-center font-mono text-2xl font-black tracking-[0.3em]"
              />
              <Button
                className="h-11 w-full bg-teal-600 font-bold hover:bg-teal-700"
                disabled={code.length < 4}
                onClick={() => {
                  sound.play("click");
                  joinRoom(code);
                }}
              >
                {t("online.joinBtn")}
              </Button>
            </div>

            {/* quick match */}
            <Button
              className="h-12 w-full bg-rose-600 text-base font-black hover:bg-rose-700 active:scale-[0.98]"
              onClick={() => {
                sound.play("click");
                quickMatch();
              }}
            >
              <Zap className="mr-2 h-5 w-5" /> {t("online.quickBtn")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Notice({ icon, text, action, onAction }: { icon: React.ReactNode; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-lg">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div>
      <p className="text-sm text-gray-600">{text}</p>
      {action && onAction && (
        <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
