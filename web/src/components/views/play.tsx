/**
 * Sapludu — mode selection + local & AI game setup.
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { useGameStore, type LocalPlayerSetup } from "@/stores/game-store";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";
import { sound } from "@/lib/sound";
import { getBoardTheme } from "@/lib/board-themes";
import type { TokenColor } from "@sapludu/engine/types";
import { TOKEN_COLORS } from "@/components/board/board";
import { BoardPreview } from "@/components/board/board-preview";
import { BoardThemeStrip } from "@/components/board/board-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Bot, Globe2, ArrowLeft, ShieldCheck, Minus, Plus, LayoutGrid } from "lucide-react";

const COLOR_ORDER: TokenColor[] = ["red", "green", "yellow", "purple"];

function ColorPicker({
  value,
  taken,
  onChange,
}: {
  value: TokenColor;
  taken: TokenColor[];
  onChange: (c: TokenColor) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {COLOR_ORDER.map((c) => {
        const disabled = c !== value && taken.includes(c);
        const tc = TOKEN_COLORS[c];
        return (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c)}
            aria-label={`color ${c}`}
            className={`h-7 w-7 rounded-full border-2 transition ${
              disabled ? "opacity-25" : "hover:scale-110"
            } ${value === c ? "border-gray-900 shadow-md" : "border-white"}`}
            style={{ backgroundColor: tc.base, borderColor: value === c ? "#111827" : tc.ring }}
          />
        );
      })}
    </div>
  );
}

export function PlayView({ mode }: { mode?: "local" | "ai" }) {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  const startGame = useGameStore((s) => s.startGame);
  const user = useAuthStore((s) => s.user);
  const boardTheme = useUiStore((s) => s.boardTheme);
  const theme = getBoardTheme(boardTheme);

  const isAi = mode === "ai";
  // hooks are declared unconditionally to respect the rules of hooks
  const [playerCount, setPlayerCount] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [colors, setColors] = useState<TokenColor[]>([...COLOR_ORDER]);

  // ── mode selection ──
  if (!mode) {
    const modes = [
      {
        id: "local" as const,
        icon: <Users className="h-7 w-7" />,
        title: t("play.local.title"),
        desc: t("play.local.desc"),
        cls: "from-amber-400 to-orange-500",
      },
      {
        id: "ai" as const,
        icon: <Bot className="h-7 w-7" />,
        title: t("play.ai.title"),
        desc: t("play.ai.desc"),
        cls: "from-emerald-500 to-teal-600",
      },
      {
        id: "online" as const,
        icon: <Globe2 className="h-7 w-7" />,
        title: t("play.online.title"),
        desc: t("play.online.desc"),
        cls: "from-rose-500 to-pink-600",
      },
    ];
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <h1 className="text-center text-2xl font-black text-gray-900">{t("play.title")}</h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {modes.map((m, i) => (
            <motion.button
              key={m.id}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => {
                sound.play("click");
                navigate(m.id === "online" ? "online" : `setup-${m.id}`);
              }}
              className={`group flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br p-6 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl active:scale-95 ${m.cls}`}
            >
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 backdrop-blur">
                {m.icon}
              </span>
              <span className="text-lg font-black">{m.title}</span>
              <span className="text-center text-xs text-white/85">{m.desc}</span>
            </motion.button>
          ))}
        </div>

        {/* board choice — applies to every mode, purely visual */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.26 }}
          className="flex items-center gap-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-lg"
        >
          <div className="w-20 shrink-0 sm:w-24">
            <BoardPreview theme={theme} decor={false} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{t("play.board.title")}</p>
            <p className="truncate text-base font-black text-gray-900">{t(theme.nameKey as never)}</p>
            <p className="truncate text-xs text-gray-500">{t(theme.descKey as never)}</p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-emerald-600 font-black text-emerald-700 hover:bg-emerald-50"
            onClick={() => {
              sound.play("click");
              navigate("boards");
            }}
          >
            <LayoutGrid className="mr-1.5 h-4 w-4" /> {t("play.board.choose")}
          </Button>
        </motion.div>
      </div>
    );
  }

  const isAiSetup = mode === "ai";
  const humanName = user?.displayName ?? "";

  function takenColors(exceptIdx: number): TokenColor[] {
    return colors.filter((_, i) => i !== exceptIdx);
  }

  function buildPlayers(): LocalPlayerSetup[] {
    const players: LocalPlayerSetup[] = [];
    const used: TokenColor[] = [];
    for (let i = 0; i < playerCount; i++) {
      const isAI = isAiSetup && i > 0;
      const color = colors[i];
      used.push(color);
      const name = isAI
        ? undefined
        : names[i]?.trim() || (i === 0 && humanName ? humanName : `Player ${i + 1}`);
      players.push({
        name: isAI ? `${["", "Raja", "Mishti", "Chiku"][i] ?? `AI ${i}`}` : name!,
        color,
        isAI,
        aiLevel: isAI ? difficulty : undefined,
      });
    }
    return players;
  }

  function start() {
    sound.play("win");
    startGame({ mode: mode ?? "local", players: buildPlayers() });
    navigate("game");
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 py-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("play")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-black text-gray-900">{isAiSetup ? t("ai.title") : t("local.title")}</h1>
      </div>

      <div className="space-y-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-lg sm:p-6">
        {/* board theme picker */}
        <BoardThemeStrip />

        {/* count */}
        <div>
          <Label className="mb-2 block text-sm font-bold text-gray-700">
            {isAiSetup ? t("ai.opponents") : t("local.playerCount")}
          </Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPlayerCount((c) => Math.max(isAiSetup ? 2 : 2, c - 1))}
              aria-label="fewer players"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex min-w-16 justify-center text-2xl font-black text-gray-900">
              {playerCount}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPlayerCount((c) => Math.min(isAiSetup ? 4 : 4, c + 1))}
              aria-label="more players"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-500">
              {isAiSetup ? `1 ${t("common.you")} + ${playerCount - 1} AI` : `${playerCount} ${t("common.players")}`}
            </span>
          </div>
        </div>

        {isAiSetup && (
          <div>
            <Label className="mb-2 block text-sm font-bold text-gray-700">{t("ai.difficulty")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "normal", "hard"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-center transition ${
                    difficulty === d
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-bold text-gray-900">{t(`ai.difficulty.${d}` as never)}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-gray-500">
                    {t(`ai.difficulty.${d}.desc` as never)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* players */}
        <div className="space-y-2.5">
          <Label className="block text-sm font-bold text-gray-700">{t("common.players")}</Label>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="w-5 text-sm font-black text-gray-400">{i + 1}</span>
              {isAiSetup && i > 0 ? (
                <span className="flex-1 text-sm font-semibold text-gray-700">
                  {["", "Raja the Cobra", "Mishti the Python", "Chiku the Viper"][i] ?? `AI ${i}`}
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-700">
                    AI
                  </span>
                </span>
              ) : (
                <Input
                  className="h-8 flex-1"
                  value={i === 0 && humanName && !names[0] ? humanName : names[i]}
                  onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={`${t("local.player")} ${i + 1}`}
                  maxLength={20}
                />
              )}
              <ColorPicker
                value={colors[i]}
                taken={takenColors(i)}
                onChange={(c) => setColors((arr) => arr.map((v, j) => (j === i ? c : v)))}
              />
            </div>
          ))}
        </div>

        {isAiSetup && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0" /> {t("ai.fairness")}
          </p>
        )}

        <Button
          className="h-12 w-full bg-emerald-600 text-base font-black hover:bg-emerald-700 active:scale-[0.98]"
          onClick={start}
        >
          {t("local.start")}
        </Button>
      </div>
    </div>
  );
}
