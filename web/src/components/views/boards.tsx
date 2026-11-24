/**
 * Sapludu — board gallery: choose from ten distinct board designs.
 *
 * Every design runs on the exact same game engine, numbering and rules —
 * the choice is purely visual and is remembered across sessions.
 */
"use client";

import { motion } from "framer-motion";
import { Check, ChevronLeft, Play } from "lucide-react";
import { BOARD_THEMES, getBoardTheme } from "@/lib/board-themes";
import { useT } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { sound } from "@/lib/sound";
import { BoardPreview } from "@/components/board/board-preview";
import { Button } from "@/components/ui/button";

export function BoardsView() {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const boardTheme = useUiStore((s) => s.boardTheme);
  const setBoardTheme = useUiStore((s) => s.setBoardTheme);
  const selected = getBoardTheme(boardTheme);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-2">
      {/* header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("play")} aria-label={t("common.back")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900">{t("boards.title")}</h1>
          <p className="text-sm text-gray-500">{t("boards.subtitle")}</p>
        </div>
      </div>

      {/* play with the selected board */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-900">
          {t("boards.current")}: <span className="font-black">{t(selected.nameKey as never)}</span>
        </p>
        <Button
          className="bg-emerald-600 font-black hover:bg-emerald-700 active:scale-95"
          onClick={() => {
            sound.play("click");
            navigate("play");
          }}
        >
          <Play className="mr-2 h-4 w-4" /> {t("boards.playWith")}
        </Button>
      </div>

      {/* gallery grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {BOARD_THEMES.map((th, i) => {
          const isSelected = th.id === boardTheme;
          return (
            <motion.button
              key={th.id}
              type="button"
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
              onClick={() => {
                sound.play("click");
                setBoardTheme(th.id);
              }}
              aria-pressed={isSelected}
              className={`group relative overflow-hidden rounded-2xl border-2 bg-white p-2.5 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97] sm:p-3 ${
                isSelected ? "border-emerald-600 ring-2 ring-emerald-600/40" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {isSelected && (
                <span className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow">
                  <Check className="h-3 w-3" /> {t("boards.selected")}
                </span>
              )}
              <BoardPreview theme={th} decor={false} className="transition-transform duration-200 group-hover:scale-[1.015]" />
              <div className="mt-2 px-0.5">
                <p className="truncate text-sm font-black text-gray-900">{t(th.nameKey as never)}</p>
                <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-[11px] leading-snug text-gray-500">
                  {t(th.descKey as never)}
                </p>
                {!isSelected && (
                  <span className="mt-1.5 inline-block text-[11px] font-bold text-emerald-700 group-hover:underline">
                    {t("boards.select")}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* rules-unchanged note */}
      <p className="rounded-2xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        {t("boards.note")}
      </p>
    </div>
  );
}
