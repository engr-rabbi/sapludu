/**
 * Sapludu — shared animation timing constants.
 *
 * Single source of truth so the dice tumble, the movement sequencer and the
 * online event pipeline stay perfectly in sync across local/AI/online modes.
 *
 * Movement is intentionally slow enough that a player can COUNT each square:
 * one hop (HOP_MS) + a short beat (STEP_PAUSE_MS) per square. Tune the numbers
 * here and every mode (local, AI, online) follows automatically.
 */

/** Duration of the dice tumble animation (ms) — Dice3D and online-move delay both use this. */
export const DICE_TUMBLE_MS = 720;

/**
 * Duration of one square-by-square ground glide (ms) at "normal" speed.
 * The token slides along the board surface from square center to square
 * center — no vertical arc, no scaling. Tuned slightly slower so players can
 * COUNT every square the dice pays for. Adjust this single constant to speed
 * up / slow down every mode (local, AI, online) at once.
 */
export const HOP_MS = 400;

/** Short, consistent pause between consecutive squares (ms) so every step is countable. */
export const STEP_PAUSE_MS = 170;

/** How long a square stays illuminated after the token lands on it (ms). */
export const SQUARE_GLOW_MS = 520;

/** Brief beat between a move finishing and the next UI state (ms). */
export const MOVE_SETTLE_MS = 140;

/** Extra beat on the FINAL square of a move — a clear "arrival" moment before banners. */
export const LANDING_PAUSE_MS = 240;

/** Scale applied to every duration when the user picks "fast" animations. */
export const FAST_SPEED = 0.55;
