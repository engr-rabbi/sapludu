/**
 * Sapludu — move log with scrollable history.
 */
"use client";

import { useT } from "@/lib/i18n";
import type { GameState } from "@sapludu/engine/types";
import { TOKEN_COLORS } from "@/components/board/board";

export function MoveLog({ state, max = 40 }: { state: GameState; max?: number }) {
  const t = useT();
  const recent = state.moves.slice(-max).reverse();

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white">
      <p className="border-b border-gray-100 px-3 py-2 text-sm font-bold text-gray-700">
        {t("game.history")}
      </p>
      <div className="max-h-56 flex-1 overflow-y-auto px-3 py-2 lg:max-h-[280px]">
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("game.noMoves")}</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((m, idx) => {
              const player = state.players[m.playerIndex];
              const color = TOKEN_COLORS[player?.color ?? "red"];
              return (
                <li key={`${m.at}-${idx}`} className="flex items-center gap-2 text-xs text-gray-600">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.base }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-gray-800">{m.playerName}</b>{" "}
                    <span className="text-gray-500">
                      · {t(`game.kind.${m.kind}` as never)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-gray-400">
                    ⚄{m.dice} {m.fromPos}→{m.toPos}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
