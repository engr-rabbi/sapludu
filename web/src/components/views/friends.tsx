/**
 * Sapludu — friends view: friend code, requests, friends list and live game invitations.
 * Friends are added by Player ID ("friend code") so e-mail addresses are never searchable.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useOnlineStore, type IncomingInvite } from "@/stores/online-store";
import { api, ApiError } from "@/lib/api";
import { useT, formatNumber } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Check, X, Trash2, Users, Send, Copy, Gamepad2 } from "lucide-react";
import { toast } from "sonner";

interface FriendRow {
  friendshipId: string;
  id: string;
  displayName: string;
  picture: string;
  avatar: string;
  rating: number;
}

interface FriendsPayload {
  friends: FriendRow[];
  incoming: FriendRow[];
  sent: FriendRow[];
  myFriendCode: string;
}

interface StoredInvite {
  inviteId: string;
  roomCode: string;
  from: { id: string; displayName: string; picture: string; avatar?: string } | null;
}

/** Accept / decline one game invitation (shared by the Friends tab and the Home dashboard). */
export function useInviteActions() {
  const navigate = useUiStore((s) => s.navigate);
  const joinRoom = useOnlineStore((s) => s.joinRoom);
  const connect = useOnlineStore((s) => s.connect);
  const dismiss = useOnlineStore((s) => s.dismissInvite);
  const t = useT();
  return useCallback(
    async (inviteId: string, roomCode: string, accept: boolean) => {
      try {
        await api("invites.respond", { inviteId, accept });
      } catch (e) {
        toast.error((e as ApiError).message);
        dismiss(inviteId);
        return false;
      }
      dismiss(inviteId);
      if (accept) {
        navigate("online");
        connect();
        // wait for the socket to be authenticated, then join
        const t0 = Date.now();
        const timer = setInterval(() => {
          const s = useOnlineStore.getState();
          if (s.mySessionId && s.socket?.connected) {
            clearInterval(timer);
            joinRoom(roomCode);
          } else if (Date.now() - t0 > 12000) {
            clearInterval(timer);
            toast.error(t("common.error"));
          }
        }, 150);
      }
      return true;
    },
    [navigate, joinRoom, connect, dismiss, t],
  );
}

export function GameInvites() {
  const t = useT();
  const live = useOnlineStore((s) => s.invites);
  const respond = useInviteActions();
  const [stored, setStored] = useState<StoredInvite[]>([]);

  useEffect(() => {
    api<{ invites: StoredInvite[] }>("invites.list", {}, { retry: true })
      .then((d) => setStored(d.invites))
      .catch(() => {});
  }, [live.length]);

  const merged = new Map<string, StoredInvite>();
  for (const i of stored) merged.set(i.inviteId, i);
  for (const i of live as IncomingInvite[]) merged.set(i.inviteId, { ...i, from: { ...i.from, picture: i.from.picture ?? "" } });
  const list = [...merged.values()];
  if (list.length === 0) return null;
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-lg" data-testid="game-invites">
      <p className="mb-2 flex items-center gap-2 text-sm font-black text-amber-900">
        <Gamepad2 className="h-4 w-4" /> {t("friends.invitesTitle")}
      </p>
      <ul className="space-y-2">
        {list.map((i) => (
          <li key={i.inviteId} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
            <UserAvatar name={i.from?.displayName ?? "?"} picture={i.from?.picture} className="h-9 w-9" />
            <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
              <span className="font-bold">{i.from?.displayName}</span> {t("online.invitedYou")}
            </p>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void respond(i.inviteId, i.roomCode, true).then(() => setStored((s) => s.filter((x) => x.inviteId !== i.inviteId)))}>
              {t("online.accept")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void respond(i.inviteId, i.roomCode, false).then(() => setStored((s) => s.filter((x) => x.inviteId !== i.inviteId)))}>
              {t("online.decline")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FriendsView() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const language = useUiStore((s) => s.language);
  const navigate = useUiStore((s) => s.navigate);
  const room = useOnlineStore((s) => s.room);
  const mySessionId = useOnlineStore((s) => s.mySessionId);
  const invite = useOnlineStore((s) => s.invite);

  const [data, setData] = useState<FriendsPayload | null>(null);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<FriendsPayload>("friends.list", {}, { retry: true }));
    } catch {
      setData({ friends: [], incoming: [], sent: [], myFriendCode: user?.id ?? "" });
    }
  }, [user?.id]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function act(action: string, payload: Record<string, unknown>, ok?: string) {
    try {
      await api(action, payload);
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as ApiError).message || t("common.error"));
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(user?.id ?? "");
      toast.success(t("common.copied"));
    } catch {
      toast.error(t("common.error"));
    }
  }

  if (!user) return null;
  const iAmHost = room?.status === "lobby" && room.players.find((p) => p.sessionId === mySessionId)?.isHost;

  function Row({ f, actions }: { f: FriendRow; actions: React.ReactNode }) {
    return (
      <li className="flex items-center gap-3 px-3 py-3">
        <UserAvatar name={f.displayName} picture={f.picture} avatar={f.avatar} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-800">{f.displayName}</p>
          <p className="text-xs text-gray-400">{formatNumber(f.rating, language)} Elo</p>
        </div>
        <div className="flex shrink-0 gap-1.5">{actions}</div>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <h1 className="text-center text-2xl font-black text-gray-900">{t("friends.title")}</h1>

      <GameInvites />

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{t("friends.myCode")}</p>
        <button onClick={() => void copyCode()} className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 font-mono text-sm font-bold text-emerald-800" aria-label="Copy friend code">
          <span className="truncate">{user.id}</span>
          <Copy className="h-4 w-4 shrink-0" />
        </button>
        <p className="mt-1 text-xs text-gray-400">{t("friends.codeHint")}</p>

        <p className="mb-2 mt-4 flex items-center gap-2 text-sm font-bold text-gray-700">
          <UserPlus className="h-4 w-4 text-emerald-600" /> {t("friends.add")}
        </p>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} placeholder={t("friends.enterCode")} maxLength={40} />
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={code.length < 3}
            onClick={() => {
              void act("friends.request", { playerId: code }, t("friends.reqSent"));
              setCode("");
            }}
          >
            <Send className="mr-1.5 h-4 w-4" /> {t("friends.add")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="list">
            {t("friends.list")} ({data?.friends.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="requests">
            {t("friends.requests")} ({data?.incoming.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="sent">
            {t("friends.pending")} ({data?.sent.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-lg">
            {data === null ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : data.friends.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500">{t("friends.empty")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.friends.map((f) => (
                  <Row
                    key={f.friendshipId}
                    f={f}
                    actions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (iAmHost) {
                              invite(f.id);
                              toast.success(t("online.inviteSent"));
                            } else {
                              toast(t("friends.openRoom"));
                              navigate("online");
                            }
                          }}
                        >
                          <Users className="mr-1 h-3.5 w-3.5" /> {iAmHost ? t("friends.inviteToRoom") : t("friends.invite")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => void act("friends.remove", { playerId: f.id }, t("friends.removed"))} aria-label={t("friends.remove")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-3">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-lg">
            {!data || data.incoming.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500">{t("dash.noNotifications")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.incoming.map((f) => (
                  <Row
                    key={f.friendshipId}
                    f={f}
                    actions={
                      <>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void act("friends.respond", { friendshipId: f.friendshipId, accept: true }, t("friends.reqAccepted"))}>
                          <Check className="mr-1 h-3.5 w-3.5" /> {t("friends.accept")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void act("friends.respond", { friendshipId: f.friendshipId, accept: false })} aria-label={t("friends.reject")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-3">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-lg">
            {!data || data.sent.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500">{t("dash.noNotifications")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.sent.map((f) => (
                  <Row
                    key={f.friendshipId}
                    f={f}
                    actions={<span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">{t("friends.pending")}</span>}
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
