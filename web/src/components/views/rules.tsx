/**
 * Sapludu — rules/help view with bilingual content.
 */
"use client";

import { useUiStore } from "@/stores/ui-store";
import { useT } from "@/lib/i18n";
import { DEFAULT_BOARD } from "@sapludu/engine/board";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function RulesView() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const navigate = useUiStore((s) => s.navigate);

  const rules = [t("rules.rule1"), t("rules.rule2"), t("rules.rule3"), t("rules.rule4"), t("rules.rule5"), t("rules.rule6")];

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("landing")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-black text-gray-900">{t("rules.title")}</h1>
      </div>

      {/* goal */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-lg">
        <h2 className="text-lg font-black">{t("rules.goal")}</h2>
        <p className="mt-1 text-sm text-emerald-50">{t("rules.goalDesc")}</p>
        <div className="mt-3 flex items-center gap-3 text-3xl">
          <span>🎲</span>
          <span>🪜</span>
          <span>🐍</span>
          <span>🏆</span>
        </div>
      </div>

      {/* numbered rules */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
        <ol className="space-y-3">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-black text-white">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-gray-700">{r}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* board tables */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-black text-emerald-800">🪜 {t("game.ladder")}</h3>
          <ul className="grid grid-cols-2 gap-1.5 text-sm font-bold text-emerald-700">
            {DEFAULT_BOARD.ladders.map((l) => (
              <li key={l.from} className="rounded-lg bg-white px-3 py-1.5 text-center shadow-sm">
                {l.from} → {l.to}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-black text-red-800">🐍 {t("game.snake")}</h3>
          <ul className="grid grid-cols-2 gap-1.5 text-sm font-bold text-red-700">
            {DEFAULT_BOARD.snakes.map((s) => (
              <li key={s.from} className="rounded-lg bg-white px-3 py-1.5 text-center shadow-sm">
                {s.from} → {s.to}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* bilingual glossary */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
        <h3 className="mb-3 font-black text-gray-900">
          {language === "en" ? "Key terms (বাংলা)" : "মূল শব্দ (English)"}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {[
            ["Snake", "সাপ"],
            ["Ladder", "মই"],
            ["Dice", "পাশা"],
            ["Token", "টোকেন"],
            ["Turn", "চাল"],
            ["Winner", "বিজয়ী"],
            ["Board", "বোর্ড"],
            ["Goal 100", "লক্ষ্য ১০০"],
            ["Play", "খেলা"],
          ].map(([en, bn]) => (
            <div key={en} className="rounded-lg bg-gray-50 px-3 py-2 text-center shadow-sm">
              <p className="font-bold text-gray-800">{language === "en" ? bn : en}</p>
              <p className="text-xs text-gray-400">{language === "en" ? en : bn}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
