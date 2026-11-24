/**
 * Sapludu — turn banner (ladder/snake/six/overshoot) + result dialog.
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { Confetti } from "@/components/game/confetti";
import { TOKEN_COLORS } from "@/components/board/board";
import type { TokenColor } from "@sapludu/engine/types";

export type BannerKind = "ladder" | "snake" | "six" | "overshoot" | null;

const BANNER_STYLE: Record<Exclude<BannerKind, null>, { icon: string; cls: string; key: "game.ladder" | "game.snake" | "game.six" | "game.overshoot" }> = {
  ladder: { icon: "🪜", cls: "bg-emerald-500 text-white", key: "game.ladder" },
  snake: { icon: "🐍", cls: "bg-red-500 text-white", key: "game.snake" },
  six: { icon: "🎲", cls: "bg-amber-500 text-white", key: "game.six" },
  overshoot: { icon: "💨", cls: "bg-gray-700 text-white", key: "game.overshoot" },
};

export function TurnBanner({ kind }: { kind: BannerKind }) {
  const t = useT();
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6, y: -18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2"
        >
          <div
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-lg font-extrabold shadow-2xl ${BANNER_STYLE[kind].cls}`}
          >
            <span>{BANNER_STYLE[kind].icon}</span>
            <span>{t(BANNER_STYLE[kind].key)}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ResultPlayer {
  name: string;
  color: TokenColor;
  placement: number;
  position: number;
  isAI: boolean;
  ratingAfter?: number | null;
  ratingBefore?: number | null;
}

export function ResultDialog({
  open,
  winnerName,
  winnerColor,
  results,
  youWon,
  ratingDelta,
  onPlayAgain,
  onMenu,
  showPlayAgain,
}: {
  open: boolean;
  winnerName: string;
  winnerColor: TokenColor;
  results: ResultPlayer[];
  youWon: boolean | null;
  ratingDelta?: number | null;
  onPlayAgain: () => void;
  onMenu: () => void;
  showPlayAgain: boolean;
}) {
  const t = useT();
  const c = TOKEN_COLORS[winnerColor];

  return (
    <AnimatePresence>
      {open && (
        <>
          <Confetti active={youWon !== false} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.7, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Game result"
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, -8, 0] }}
                transition={{ repeat: Infinity, repeatDelay: 2.4, duration: 0.7 }}
                className="mx-auto mb-2 text-6xl"
              >
                {youWon === false ? "🐍" : "🏆"}
              </motion.div>
              <h2 className="mb-1 text-2xl font-black text-gray-900">
                {youWon === null ? t("result.title") : youWon ? t("result.youWon") : t("result.youLost")}
              </h2>
              <p className="mb-4 text-gray-600">
                <span className="font-bold" style={{ color: c.dark }}>
                  {winnerName}
                </span>{" "}
                {t("result.winnerIs")}
              </p>

              {typeof ratingDelta === "number" && ratingDelta !== 0 && (
                <p className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                  {t("result.ratingGain")}: {ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta}
                </p>
              )}

              <div className="mb-5 space-y-1.5 text-left">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  {t("result.placements")}
                </p>
                {[...results]
                  .sort((a, b) => a.placement - b.placement)
                  .map((r, i) => {
                    const rc = TOKEN_COLORS[r.color];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm"
                      >
                        <span className="w-5 font-black text-gray-400">{r.placement}.</span>
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{ backgroundColor: rc.base }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">
                          {r.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {t("game.position")} {r.position}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex gap-2">
                {showPlayAgain && (
                  <button
                    onClick={onPlayAgain}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-95"
                  >
                    {t("game.playAgain")}
                  </button>
                )}
                <button
                  onClick={onMenu}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-95"
                >
                  {t("game.backToMenu")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
