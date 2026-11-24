/**
 * Sapludu — victory confetti (framer-motion particles, no extra dependency).
 */
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = ["#ef4444", "#22c55e", "#facc15", "#a855f7", "#f97316", "#06b6d4"];

export function Confetti({ active }: { active: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.2 + Math.random() * 1.8,
        size: 8 + Math.random() * 10,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 720 - 360,
        round: Math.random() > 0.6,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute top-[-5%]"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: p.round ? "50%" : 2,
          }}
          initial={{ y: "-10vh", opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
