/**
 * Sapludu — 3D dice with tumbling roll animation (CSS 3D cube + framer-motion controls).
 *
 * CORRECTNESS GUARANTEE (root-cause fix for the "dice shows N but token moves M" bug):
 * The cube's face mounts are DERIVED as the exact geometric inverse of
 * FACE_ROTATIONS — the single rotation that brings face `v` to the front.
 * With mount = inverse(show), resting rotation FACE_ROTATIONS[value] can
 * mathematically only display face `value`. (Previously faces 3 and 4 were
 * mounted with the same sign as their show-rotation instead of the inverse,
 * so rolling 3 displayed 4 pips and rolling 4 displayed 3 pips.)
 *
 * The shown value always comes from the store's diceDisplay (server dice
 * online, local RNG offline) — the exact number the engine moves by.
 */
"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { DICE_TUMBLE_MS } from "@/lib/animation/timings";

/**
 * Single source of truth: the cube rotation (degrees) that brings face `v`
 * flush against the viewer. Derived once, verified by geometry:
 *   mountTransform(v) === inverse(FACE_ROTATIONS[v])
 */
export const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: 90 }, // FIX: was y:-90, which physically displayed face 4
  4: { x: 0, y: -90 }, // FIX: was y:90, which physically displayed face 3
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};

/**
 * CSS transform that MOUNTS face `v` on the cube so that applying
 * FACE_ROTATIONS[v] brings it to the front. It is the exact inverse of the
 * show-rotation, so the resting face can never disagree with the engine value.
 * Order matters: rotateY(-y) → rotateX(-x) → translateZ(half).
 */
function mountTransform(v: number, half: number): string {
  const { x, y } = FACE_ROTATIONS[v];
  const parts: string[] = [];
  if (y !== 0) parts.push(`rotateY(${-y}deg)`);
  if (x !== 0) parts.push(`rotateX(${-x}deg)`);
  parts.push(`translateZ(${half}px)`);
  return parts.join(" ");
}

const PIP_MAP: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

function Face({ value }: { value: number }) {
  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-[8%] rounded-[15%] border border-amber-100 bg-gradient-to-br from-white via-white to-amber-50 p-[12%] shadow-[inset_0_0_10px_rgba(0,0,0,0.10),inset_0_-2px_4px_rgba(180,120,40,0.14)]">
      {Array.from({ length: 9 }, (_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const hasPip = PIP_MAP[value].some(([pr, pc]) => pr === r && pc === c);
        return (
          <div key={i} className="flex items-center justify-center">
            {hasPip && (
              <div className="h-[68%] w-[68%] rounded-full bg-gradient-to-br from-gray-700 to-gray-950 shadow-[inset_0_-1px_1px_rgba(255,255,255,0.25)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Dice3D({
  value,
  rolling,
  size = 76,
  disabled,
  onClick,
}: {
  value: number | null;
  rolling: boolean;
  size?: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const controls = useAnimationControls();
  const shadowControls = useAnimationControls();
  const landControls = useAnimationControls();
  const shown = value ?? 6;
  const rot = FACE_ROTATIONS[shown] ?? FACE_ROTATIONS[6];
  const prevRolling = useRef(false);
  const prevShown = useRef(shown);

  // Single effect owns all cube orientation transitions — ordering-safe:
  //   rolling on  → fire the tumble toward the new face
  //   rolling off → snap exactly onto the face + settle bump
  //   idle change → snap onto the newly shown face (remote dice, dev tools)
  useEffect(() => {
    const turnedOn = rolling && !prevRolling.current;
    const turnedOff = !rolling && prevRolling.current;
    const idleFaceChange = !rolling && !turnedOff && prevShown.current !== shown;

    if (turnedOn) {
      const d = DICE_TUMBLE_MS / 1000;
      void controls.start({
        rotateX: [0, rot.x + 1080],
        rotateY: [0, rot.y + 720],
        rotateZ: [0, 14, -10, 4, 0],
        y: [0, -size * 0.26, -size * 0.08, 0, -size * 0.07, 0],
        scale: [1, 1.12, 0.96, 1.05, 0.97, 1],
        transition: {
          duration: d,
          times: [0, 0.3, 0.5, 0.68, 0.84, 1],
          ease: ["easeOut", "easeIn", "easeOut", "easeIn", "easeOut"],
        },
      });
      void shadowControls.start({
        opacity: [0.35, 0.1, 0.3, 0.35],
        scaleX: [1, 0.7, 1.05, 1],
        transition: { duration: d, times: [0, 0.3, 0.68, 1], ease: "easeInOut" },
      });
    } else if (turnedOff) {
      void controls.set({ rotateX: rot.x, rotateY: rot.y, rotateZ: 0, y: 0, scale: 1 });
      void shadowControls.set({ opacity: 0.35, scaleX: 1 });
      // satisfying landing: confident settle bump + a soft glow ring
      void controls.start({
        scale: [1, 1.14, 1],
        transition: { duration: 0.28, ease: "easeOut" },
      });
      void landControls.start({
        opacity: [0.85, 0],
        scale: [0.55, 1.5],
        transition: { duration: 0.55, ease: "easeOut" },
      });
    } else if (idleFaceChange) {
      // keep the resting orientation exactly on the shown face whenever the
      // value changes while idle — the cube can never rest on a stale face
      void controls.set({ rotateX: rot.x, rotateY: rot.y, rotateZ: 0, y: 0, scale: 1 });
    }

    prevRolling.current = rolling;
    prevShown.current = shown;
  }, [rolling, shown, controls, shadowControls, landControls, rot.x, rot.y, size]);

  return (
    <div
      className="select-none [perspective:600px]"
      style={{ width: size, height: size + 10 }}
      onClick={disabled || !onClick ? undefined : onClick}
      role={onClick ? "button" : undefined}
      aria-label={`Dice showing ${shown}`}
      aria-disabled={disabled}
    >
      <div className="relative h-full w-full pb-[10px]">
        {/* landing glow ring */}
        <motion.div
          className="pointer-events-none absolute left-1/2 top-[62%] h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.55) 0%, rgba(245,158,11,0) 70%)" }}
          animate={landControls}
          initial={{ opacity: 0 }}
          aria-hidden
        />
        {/* impact shadow under the dice */}
        <motion.div
          className="absolute bottom-0 left-1/2 h-[10px] w-[62%] -translate-x-1/2 rounded-[50%] bg-black/40 blur-[3px]"
          animate={shadowControls}
          style={{ opacity: 0.35 }}
          aria-hidden
        />
        <motion.div
          className="relative h-[calc(100%-10px)] w-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={controls}
          initial={{ rotateX: rot.x, rotateY: rot.y }}
        >
          {([1, 2, 3, 4, 5, 6] as const).map((v) => (
            <div
              key={v}
              className="absolute inset-0"
              style={{ transform: mountTransform(v, size / 2) }}
            >
              <Face value={v} />
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
