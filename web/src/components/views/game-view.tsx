/**
 * Sapludu — main game view for ALL modes (local, AI, online).
 * Layout: board is the primary focus; side panels for players, dice controls and move log.
 */
"use client";

import { useMemo } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useGameStore } from "@/stores/game-store";
import { useOnlineStore } from "@/stores/online-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { Board, TOKEN_COLORS } from "@/components/board/board";
import { Dice3D } from "@/components/game/dice-3d";
import { PlayerPanel } from "@/components/game/player-panel";
import { MoveLog } from "@/components/game/move-log";
import { TurnBanner, ResultDialog, type BannerKind, type ResultPlayer } from "@/components/game/result-dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LogOut, Dice5, Loader2, WifiOff } from "lucide-react";
import type { TokenColor } from "@sapludu/engine/types";

export function GameView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const language = useUiStore((s) => s.language);

  // local / AI store
  const localState = useGameStore((s) => s.state);
  const localPhase = useGameStore((s) => s.phase);
  const localDice = useGameStore((s) => s.diceDisplay);
  const localBanner = useGameStore((s) => s.banner);
  const localRoll = useGameStore((s) => s.roll);
  const localPlayAgain = useGameStore((s) => s.playAgain);
  const localExit = useGameStore((s) => s.exitGame);
  const localEmote = useGameStore((s) => s.emote);

  // online store
  const onlineRoom = useOnlineStore((s) => s.room);
  const onlineState = useOnlineStore((s) => s.state);
  const onlinePhase = useOnlineStore((s) => s.phase);
  const onlineDice = useOnlineStore((s) => s.diceDisplay);
  const onlineBanner = useOnlineStore((s) => s.banner);
  const onlineRoll = useOnlineStore((s) => s.roll);
  const onlineResults = useOnlineStore((s) => s.results);
  const onlineRatingDelta = useOnlineStore((s) => s.ratingDelta);
  const onlineLeave = useOnlineStore((s) => s.leaveRoom);
  const onlineForfeit = useOnlineStore((s) => s.forfeit);
  const mySessionId = useOnlineStore((s) => s.mySessionId);

  const isOnline = Boolean(onlineRoom && onlineState);
  const state = isOnline ? onlineState : localState;
  const phase = isOnline ? onlinePhase : localPhase;
  const dice = isOnline ? onlineDice : localDice;
  const banner = (isOnline ? onlineBanner : localBanner).kind as BannerKind;
  // result dialog derives directly from phase — no mirror state needed
  const showResult = phase === "finished";

  const myIndex = useMemo(() => {
    if (!state) return -1;
    if (isOnline) {
      return (onlineRoom?.players ?? []).findIndex((p) => p.sessionId === mySessionId);
    }
    // local: first human player is "you"; AI mode: index 0 is the human
    const idx = state.players.findIndex((p) => !p.isAI);
    return idx;
  }, [state, isOnline, onlineRoom, mySessionId]);

  if (!state) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-gray-500">{t("common.loading")}</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("play")}>
            {t("game.backToMenu")}
          </Button>
        </div>
      </div>
    );
  }

  const current = state.players[state.current];
  const isMyTurnLocal = !current.isAI && state.status === "active" && phase === "awaiting-roll";
  const isMyTurnOnline =
    isOnline && myIndex === state.current && state.status === "active" && phase === "awaiting-roll";
  const canRoll = isOnline ? isMyTurnOnline : isMyTurnLocal;

  const turnLabel = (() => {
    if (state.status !== "active") return t("game.gameOver");
    if (phase === "rolling" || phase === "moving") return `${current.name} ${t("game.rolling")}`;
    if (isOnline) {
      if (isMyTurnOnline) return t("game.yourTurn");
      return `${t("game.waitingTurn")}: ${current.name}`;
    }
    if (current.isAI) return `${current.name} ${t("game.aiThinking")}`;
    if (localEmote) {
      const emoteKey = `game.emote.${localEmote.emote}` as never;
      return `${current.name} ${t(emoteKey)}...`;
    }
    return t("game.yourTurn");
  })();

  const panelPlayers = state.players.map((p, i) => ({
    name: p.name,
    color: p.color,
    position: p.position,
    isAI: p.isAI,
    isCurrent: state.current === i && state.status === "active",
    connected: isOnline ? p.connected : undefined,
    aiLevel: p.aiLevel,
  }));

  const resultPlayers: ResultPlayer[] = (() => {
    if (isOnline && onlineResults) {
      return onlineResults.map((r) => ({
        name: r.name,
        color: state.players[r.playerIndex]?.color ?? "red",
        placement: r.placement,
        position: r.position,
        isAI: false,
        ratingBefore: r.ratingBefore,
        ratingAfter: r.ratingAfter,
      }));
    }
    return [...state.players]
      .map((p, i) => ({
        name: p.name,
        color: p.color,
        placement: state.winnerIndex === i ? 1 : 2,
        position: p.position,
        isAI: p.isAI,
      }))
      .sort((a, b) => b.position - a.position)
      .map((p, i) => ({ ...p, placement: p.position >= 100 ? 1 : i === 0 ? 1 : i + 1 }));
  })();

  const winnerPlayer = state.winnerIndex !== null ? state.players[state.winnerIndex] : null;
  const youWon = winnerPlayer
    ? isOnline
      ? winnerIndexIsMe()
      : !winnerPlayer.isAI
    : null;

  function winnerIndexIsMe(): boolean {
    const me = (onlineRoom?.players ?? []).findIndex((p) => p.sessionId === mySessionId);
    return me !== -1 && state?.winnerIndex === me;
  }

  function exitToMenu() {
    sound.play("click");
    if (isOnline) {
      onlineForfeit();
      onlineLeave();
    } else {
      localExit();
    }
    navigate("play");
  }

  return (
    <div className="space-y-4 overflow-x-hidden pb-4">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border-2 shadow-inner"
            style={{
              backgroundColor: TOKEN_COLORS[current.color].base,
              borderColor: TOKEN_COLORS[current.color].dark,
            }}
            aria-hidden
          />
          <p className="text-sm font-bold text-gray-800 sm:text-base" aria-live="polite">
            {turnLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              {t("online.roomCode")}: {onlineRoom?.code}
            </span>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                <LogOut className="mr-1.5 h-4 w-4" /> {t("common.exit")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("game.exitConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {isOnline ? t("game.forfeit") + "?" : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={exitToMenu}
                >
                  {t("common.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* main layout — in landscape phones the controls move beside the board */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px] game-landscape-grid">
        <div className="relative min-w-0">
          <div className="relative">
            <div className="board-fit mx-auto">
              <Board state={state} />
            </div>
            <TurnBanner kind={banner} />
          </div>

          {/* mobile dice bar — hidden in landscape (controls are beside the board there) */}
          <div className="mt-4 flex items-center justify-center lg:hidden hide-in-landscape">
            <DiceArea
              canRoll={canRoll}
              rolling={phase === "rolling"}
              dice={dice}
              onRoll={() => {
                sound.play("click");
                if (isOnline) onlineRoll();
                else void localRoll();
              }}
              label={t("game.roll")}
            />
          </div>
        </div>

        {/* side panel */}
        <aside className="flex min-h-0 flex-col gap-3">
          <PlayerPanel players={panelPlayers} />

          {/* desktop dice area — also shown beside the board in landscape phones */}
          <div className="hidden lg:block show-in-landscape">
            <DiceArea
              canRoll={canRoll}
              rolling={phase === "rolling"}
              dice={dice}
              onRoll={() => {
                sound.play("click");
                if (isOnline) onlineRoll();
                else void localRoll();
              }}
              label={t("game.roll")}
            />
          </div>

          <MoveLog state={state} />
        </aside>
      </div>

      {/* result */}
      <ResultDialog
        open={showResult}
        winnerName={winnerPlayer?.name ?? ""}
        winnerColor={(winnerPlayer?.color ?? "red") as TokenColor}
        results={resultPlayers}
        youWon={youWon}
        ratingDelta={isOnline ? onlineRatingDelta : null}
        showPlayAgain={!isOnline}
        onPlayAgain={() => {
          localPlayAgain();
        }}
        onMenu={exitToMenu}
      />
    </div>
  );
}

function DiceArea({
  canRoll,
  rolling,
  dice,
  onRoll,
  label,
}: {
  canRoll: boolean;
  rolling: boolean;
  dice: number | null;
  onRoll: () => void;
  label: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <Dice3D value={dice} rolling={rolling} disabled={!canRoll || rolling} onClick={canRoll ? onRoll : undefined} />
      <Button
        className="h-11 min-w-44 bg-amber-400 font-black text-amber-950 shadow hover:bg-amber-300 active:scale-95"
        disabled={!canRoll || rolling}
        onClick={onRoll}
      >
        {rolling ? (
          <>
            <Dice5 className="mr-2 h-5 w-5 animate-bounce" />
            {t("game.rolling")}
          </>
        ) : (
          <>
            <Dice5 className="mr-2 h-5 w-5" />
            {label}
          </>
        )}
      </Button>
    </div>
  );
}
