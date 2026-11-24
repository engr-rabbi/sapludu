/**
 * Sapludu — compact horizontal board-theme strip for setup screens.
 * Shows every board as a small thumbnail; tap to switch instantly.
 * The selected board is highlighted; a link opens the full gallery.
 */
"use client";

import { LayoutGrid } from "lucide-react";
import { BOARD_THEMES, getBoardTheme } from "@/lib/board-themes";
import { useT } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { sound } from "@/lib/sound";
import { BoardPreview } from "./board-preview";
import { Check } from "lucide-react";

export function BoardThemeStrip({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const boardTheme = useUiStore((s) => s.boardTheme);
  const setBoardTheme = useUiStore((s) => s.setBoardTheme);
  const navigate = useUiStore((s) => s.navigate);
  const selected = getBoardTheme(boardTheme);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-700">
          {t("play.board.title")}: <span className="text-gray-900">{t(selected.nameKey as never)}</span>
        </p>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
          onClick={() => {
            sound.play("click");
            navigate("boards");
          }}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> {t("play.board.viewAll")}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1.5" role="listbox" aria-label={t("boards.title")}>
        {BOARD_THEMES.map((th) => {
          const isSelected = th.id === boardTheme;
          return (
            <button
              key={th.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              title={t(th.nameKey as never)}
              onClick={() => {
                sound.play("click");
                setBoardTheme(th.id);
              }}
              className={`relative w-[68px] shrink-0 rounded-xl border-2 p-1 transition active:scale-95 ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50 shadow-md ring-1 ring-emerald-600/40"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <BoardPreview theme={th} decor={false} />
              {isSelected && (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white shadow">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {!compact && (
                <p className="mt-1 truncate text-[9px] font-bold text-gray-600">{t(th.nameKey as never)}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
