/**
 * Sapludu — hero board illustration for the landing page.
 *
 * Renders an authentic decorative preview of the REAL game board using the
 * player's currently selected board theme: the same zigzag 10x10
 * checkerboard, the REAL procedural snakes and themed ladders used in
 * gameplay, colorful pawns and a slowly tumbling dice. It instantly tells
 * visitors "this is a Snakes & Ladders game" with zero image assets —
 * crisp on every screen size and fast to load.
 */
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { DEFAULT_BOARD, squareCenter } from "@sapludu/engine/board";
import { getBoardTheme, hexLuminance, squareColorAt } from "@/lib/board-themes";
import { useUiStore } from "@/stores/ui-store";
import { Snake } from "@/components/board/snake";
import { Ladder } from "@/components/board/ladder";

/** Decorative pawn matching the in-game token silhouette. */
function HeroPawn({ square, color, dark }: { square: number; color: string; dark: string }) {
  const c = squareCenter(square);
  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-[78%]"
      style={{ left: `${c.x}%`, top: `${c.y}%`, width: "7%", height: "7%" }}
      aria-hidden
    >
      <svg viewBox="0 0 40 44" className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
        <ellipse cx="20" cy="41" rx="12" ry="3" fill="rgba(0,0,0,0.25)" />
        <path
          d="M20 6c5 0 9 4 9 9 0 3.4-1.9 6.3-4.7 7.9C28.5 25.6 31 29.5 32 36H8c1-6.5 3.5-10.4 7.7-13.1A9 9 0 0 1 11 15c0-5 4-9 9-9z"
          fill={color}
          stroke={dark}
          strokeWidth="2"
        />
        <path
          d="M23.4 8.1A9 9 0 0 1 26 22.9C29.6 25.7 31.2 30 32 36h-4.4c-.7-5.4-2.3-9.3-5.4-12.1A8.9 8.9 0 0 0 23.4 8.1z"
          fill={dark}
          opacity="0.35"
        />
        <circle cx="16.5" cy="13.5" r="2.2" fill="#fff" opacity="0.9" />
        <circle cx="23.5" cy="13.5" r="2.2" fill="#fff" opacity="0.9" />
        <circle cx="17" cy="14" r="1.1" fill="#1f2937" />
        <circle cx="24" cy="14" r="1.1" fill="#1f2937" />
        <path d="M20 17.5l-2 1.6h4z" fill="#be123c" />
      </svg>
    </div>
  );
}

/** Slowly tumbling decorative dice showing a fixed face. */
function HeroDice({ value, delay }: { value: number; delay: number }) {
  return (
    <motion.div
      className="select-none"
      style={{ width: "100%", perspective: 500 }}
      animate={{ rotate: [0, 4, -3, 0], y: [0, -5, 0, -3, 0] }}
      transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay }}
      aria-hidden
    >
      <div className="relative mx-auto aspect-square w-[70%]">
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[8%] rounded-[22%] border border-amber-100 bg-gradient-to-br from-white via-white to-amber-100 p-[10%] shadow-[0_10px_24px_-6px_rgba(30,64,175,0.45),inset_0_0_10px_rgba(0,0,0,0.08)]">
          {Array.from({ length: 9 }, (_, i) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            const pips: Record<number, number[][]> = {
              1: [[1, 1]],
              2: [[0, 0], [2, 2]],
              3: [[0, 0], [1, 1], [2, 2]],
              4: [[0, 0], [0, 2], [2, 0], [2, 2]],
              5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
              6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
            };
            const hasPip = (pips[value] ?? pips[6]).some(([pr, pc]) => pr === r && pc === c);
            return (
              <div key={i} className="flex items-center justify-center">
                {hasPip && (
                  <div className="h-[72%] w-[72%] rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shadow-[inset_0_-1px_1px_rgba(255,255,255,0.3)]" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export function HeroBoard() {
  const themeId = useUiStore((s) => s.boardTheme);
  const theme = useMemo(() => getBoardTheme(themeId), [themeId]);
  const { snakes, ladders } = DEFAULT_BOARD;
  const squares = useMemo(() => Array.from({ length: 100 }, (_, i) => i + 1), []);
  const goal = squareCenter(100);

  return (
    <div className="relative w-full">
      {/* floating dice decorations */}
      <div className="absolute -left-5 -top-7 z-40 w-16 sm:-left-8 sm:w-20" aria-hidden>
        <HeroDice value={5} delay={0.4} />
      </div>
      <div className="absolute -bottom-6 -right-4 z-40 w-14 sm:-right-7 sm:w-[4.5rem]" aria-hidden>
        <HeroDice value={6} delay={1.6} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
        className="relative aspect-square w-full overflow-hidden rounded-3xl border-[3px]"
        style={{
          borderColor: theme.frame.border,
          background: theme.frame.bg,
          boxShadow: `0 28px 70px -18px rgba(30,58,138,0.55), 0 10px 24px -12px rgba(120,53,15,0.5)`,
        }}
        role="img"
        aria-label="Illustrated Snakes and Ladders board with colorful snakes, ladders and game pawns"
      >
        {/* squares */}
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
          {squares.map((sq) => {
            const engineRow = Math.floor((sq - 1) / 10);
            const forward = engineRow % 2 === 0;
            const col = forward ? (sq - 1) % 10 : 9 - ((sq - 1) % 10);
            const gridIdx = (9 - engineRow) * 10 + col;
            const color = squareColorAt(theme, sq);
            const lightText = hexLuminance(color) < 0.5;
            return (
              <div
                key={sq}
                style={{
                  order: gridIdx,
                  backgroundColor: color,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset -1px -1px 2px rgba(0,0,0,0.10)",
                }}
                className="relative flex items-start justify-end"
              >
                <span
                  className={`select-none pr-0.5 pt-0.5 text-[7px] font-bold leading-none sm:text-[9px] ${
                    lightText ? "text-white/90" : "text-gray-900/80"
                  }`}
                >
                  {sq}
                </span>
              </div>
            );
          })}
        </div>

        {/* REAL game snakes & ladders (same renderers as gameplay) */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden
        >
          {ladders.map((l) => (
            <Ladder key={`hl${l.from}`} from={l.from} to={l.to} style={theme.ladders} />
          ))}
          {snakes.map((s, i) => (
            <Snake
              key={`hs${s.from}`}
              from={s.from}
              to={s.to}
              paletteIndex={i}
              palette={theme.snakePalettes[i % theme.snakePalettes.length]}
              reduced={false}
            />
          ))}
        </svg>

        {/* goal marker */}
        <div
          className="pointer-events-none absolute z-[15] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `${goal.x}%`, top: `${goal.y}%`, width: "8.6%", height: "8.6%" }}
        >
          <motion.div
            className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_2px_6px_rgba(120,53,15,0.5),inset_0_1px_2px_rgba(255,255,255,0.6)] ring-2 ring-white/70"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          >
            <span className="text-sm drop-shadow sm:text-lg">🏆</span>
          </motion.div>
        </div>

        {/* depth vignette */}
        <div
          className="pointer-events-none absolute inset-0 z-[12]"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 30%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(60,30,5,0.14) 100%)",
          }}
          aria-hidden
        />

        {/* colorful pawns */}
        <HeroPawn square={3} color="#ef4444" dark="#b91c1c" />
        <HeroPawn square={11} color="#22c55e" dark="#15803d" />
        <HeroPawn square={25} color="#facc15" dark="#a16207" />
        <HeroPawn square={46} color="#a855f7" dark="#7e22ce" />
        <HeroPawn square={81} color="#ef4444" dark="#b91c1c" />
        <HeroPawn square={93} color="#f97316" dark="#c2410c" />
      </motion.div>
    </div>
  );
}
