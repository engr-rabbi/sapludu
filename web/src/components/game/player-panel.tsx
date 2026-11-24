/**
 * Sapludu — player status panel used in all game modes.
 */
"use client";

import { motion } from "framer-motion";
import { TOKEN_COLORS } from "@/components/board/board";
import type { GameState } from "@sapludu/engine/types";

export interface PlayerPanelEntry {
  name: string;
  color: keyof typeof TOKEN_COLORS;
  position: number;
  isAI: boolean;
  isCurrent: boolean;
  connected?: boolean;
  aiLevel?: string;
}

export function PlayerPanel({ players }: { players: PlayerPanelEntry[] }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
      {players.map((p, i) => {
        const c = TOKEN_COLORS[p.color];
        return (
          <motion.div
            key={i}
            animate={
              p.isCurrent
                ? { scale: [1, 1.02, 1], boxShadow: `0 0 0 2px ${c.base}, 0 6px 16px -4px ${c.base}66` }
                : { scale: 1, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
            }
            transition={p.isCurrent ? { repeat: Infinity, duration: 1.6 } : { duration: 0.2 }}
            className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 ${
              p.isCurrent ? "border-transparent" : "border-gray-200"
            }`}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full border-2 shadow-inner"
              style={{ backgroundColor: c.base, borderColor: c.dark }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-800">
                {p.name}
                {p.isAI && (
                  <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                    AI{p.aiLevel ? ` · ${p.aiLevel}` : ""}
                  </span>
                )}
                {p.connected === false && (
                  <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-600">
                    ⚡off
                  </span>
                )}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
              {p.position}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
