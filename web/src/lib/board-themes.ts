/**
 * Sapludu — board theme catalog.
 *
 * Ten visually distinct board designs that ALL share the exact same game
 * engine, square numbering (1–100, zigzag), snake/ladder connections and
 * rules. A theme ONLY changes colors, textures and decorative effects —
 * it can never influence token coordinates, dice logic or win conditions.
 *
 * Geometry (snake spines, ladder rails) comes from board-geometry.ts and is
 * identical in every theme, so snakes and ladders always align with their
 * correct starting and ending squares.
 */

export type BoardThemeId =
  | "classic"
  | "modern3d"
  | "jungle"
  | "fantasy"
  | "cartoon"
  | "royal"
  | "neon"
  | "nature"
  | "space"
  | "minimal";

/** Snake coloring (identical fields to the classic palette). */
export interface SnakePalette {
  base1: string;
  base2: string;
  /** dorsal light tone for the top of the tube */
  light: string;
  blotch: string;
  belly: string;
  scale: string;
  outline: string;
  band: boolean;
}

/** Ladder coloring — injected into the ladder renderer. */
export interface LadderTheme {
  /** dark rail outline */
  railDark: string;
  /** rail gradient stops */
  woodA: string;
  woodB: string;
  woodC: string;
  /** rung gradient stops */
  rungA: string;
  rungB: string;
  rungC: string;
  /** pale top highlight on rungs */
  rungLight: string;
  /** end cap colors */
  cap: string;
  capDark: string;
  /** ground shadow stroke */
  shadow: string;
  /** glow color while a token climbs (rgba) */
  glow: string;
}

export interface BoardTheme {
  id: BoardThemeId;
  /** i18n keys for name and one-line description */
  nameKey: string;
  descKey: string;
  squares: {
    /** color cycle applied with the theme's pattern */
    palette: string[];
    /** classic = varied stable mix, checker = alternating tiles */
    pattern: "classic" | "checker";
  };
  /** the board frame */
  frame: { border: string; bg: string; shadow: string };
  /** padded backdrop behind the board (css background) */
  backdrop: string;
  goal: { from: string; to: string; ring: string; shadow: string };
  startBadge: { bg: string; text: string };
  /** radial vignette over the graphics (null = none) */
  vignette: string | null;
  /** snake palettes, cycled per connection */
  snakePalettes: SnakePalette[];
  ladders: LadderTheme;
  fx?: { neon?: boolean; stars?: boolean };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Relative luminance of a hex color (0..1) — used for number contrast. */
export function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The classic varied square mix (stable per square, resembles the traditional board). */
export function classicSquareIndex(row: number, col: number, len: number): number {
  return (row * 5 + col * 3 + row) % len;
}

export function checkerSquareIndex(row: number, col: number, len: number): number {
  return (row + col) % Math.min(len, 2);
}

export function squareColorAt(theme: BoardTheme, square: number): string {
  const row = Math.floor((square - 1) / 10);
  const col = (square - 1) % 10;
  const { palette, pattern } = theme.squares;
  const i =
    pattern === "checker"
      ? checkerSquareIndex(row, col, palette.length)
      : classicSquareIndex(row, col, palette.length);
  return palette[i];
}

/* ------------------------------------------------------------------ */
/* Classic snake palettes (moved here so themes can own all colors)    */
/* ------------------------------------------------------------------ */

export const CLASSIC_SNAKE_PALETTES: SnakePalette[] = [
  // emerald tree python
  { base1: "#3ba55d", base2: "#1e7a3c", light: "#7fca7d", blotch: "#14532d", belly: "#eaf6c8", scale: "#f4f9d9", outline: "#0f3d22", band: false },
  // royal python (gold/brown)
  { base1: "#c9922e", base2: "#8f5e1a", light: "#ecc779", blotch: "#5e3a0e", belly: "#f7e7b6", scale: "#ffe9b3", outline: "#4a2c08", band: false },
  // slate olive racer
  { base1: "#8a8f7e", base2: "#5f6557", light: "#bcc2ac", blotch: "#3c4036", belly: "#e8e6d9", scale: "#f2f1e4", outline: "#2c2f28", band: false },
  // milk snake (cream bands on red)
  { base1: "#c2452f", base2: "#8e2b1c", light: "#e88a68", blotch: "#f3e4c2", belly: "#f8ecd0", scale: "#ffe4d1", outline: "#5e1a10", band: true },
  // vine snake (slender bright green)
  { base1: "#7cb518", base2: "#55910f", light: "#b3dd61", blotch: "#3f6d0a", belly: "#e7f5be", scale: "#f0fad2", outline: "#33530a", band: false },
  // russell's viper (tan with dark rows)
  { base1: "#b98a5a", base2: "#8a6238", light: "#dfba8b", blotch: "#54371e", belly: "#efd9b8", scale: "#fbe3c0", outline: "#4a2f18", band: false },
  // banded krait (charcoal + cream)
  { base1: "#4b4b52", base2: "#33333b", light: "#7d7d88", blotch: "#efe6c8", belly: "#efe6c8", scale: "#f5f0dc", outline: "#1f1f26", band: true },
  // corn snake (orange rust)
  { base1: "#d97a35", base2: "#a4511c", light: "#f0a969", blotch: "#7a3a12", belly: "#fbe3c2", scale: "#ffedd2", outline: "#5e2c0d", band: false },
  // sand boa (pale sandy)
  { base1: "#c9a06a", base2: "#9a744a", light: "#e6c692", blotch: "#6d4f2c", belly: "#f4e3c4", scale: "#fbeecf", outline: "#533a1f", band: false },
];

/* ------------------------------------------------------------------ */
/* Ladder theme shortcuts                                              */
/* ------------------------------------------------------------------ */

const WOODEN_LADDER: LadderTheme = {
  railDark: "#5d3a10",
  woodA: "#a16207",
  woodB: "#c98a3b",
  woodC: "#8a5a1f",
  rungA: "#e8b268",
  rungB: "#b45309",
  rungC: "#7c3d0d",
  rungLight: "#f2c98a",
  cap: "#a16207",
  capDark: "#5d3a10",
  shadow: "rgba(50,30,10,0.18)",
  glow: "rgba(253,224,71,0.95)",
};

/* ------------------------------------------------------------------ */
/* The 10 boards                                                       */
/* ------------------------------------------------------------------ */

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "classic",
    nameKey: "board.classic.name",
    descKey: "board.classic.desc",
    squares: {
      palette: ["#ef5350", "#ffee58", "#66bb6a", "#4fc3f7", "#ffa726", "#ec407a"],
      pattern: "classic",
    },
    frame: {
      border: "#78350f",
      bg: "#fffbeb",
      shadow:
        "0 18px 50px -12px rgba(120,53,15,0.6), inset 0 0 0 2px rgba(255,255,255,0.25)",
    },
    backdrop: "linear-gradient(160deg, rgba(255,251,235,0.9), rgba(254,243,199,0.55))",
    goal: { from: "#fcd34d", to: "#f59e0b", ring: "rgba(255,255,255,0.7)", shadow: "rgba(120,53,15,0.5)" },
    startBadge: { bg: "rgba(255,255,255,0.85)", text: "#047857" },
    vignette:
      "radial-gradient(120% 120% at 50% 30%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(60,30,5,0.14) 100%)",
    snakePalettes: CLASSIC_SNAKE_PALETTES,
    ladders: WOODEN_LADDER,
  },
  {
    id: "modern3d",
    nameKey: "board.modern3d.name",
    descKey: "board.modern3d.desc",
    squares: {
      palette: ["#f8fafc", "#e2e8f0", "#dbe4ee", "#c3d0dd", "#fbbf24", "#fb923c"],
      pattern: "classic",
    },
    frame: {
      border: "#334155",
      bg: "#f8fafc",
      shadow:
        "0 24px 60px -14px rgba(15,23,42,0.55), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 2px rgba(255,255,255,0.4)",
    },
    backdrop: "linear-gradient(160deg, rgba(241,245,249,0.95), rgba(203,213,225,0.5))",
    goal: { from: "#fbbf24", to: "#d97706", ring: "rgba(255,255,255,0.8)", shadow: "rgba(15,23,42,0.45)" },
    startBadge: { bg: "rgba(255,255,255,0.92)", text: "#0f766e" },
    vignette:
      "radial-gradient(130% 130% at 50% 25%, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0) 42%, rgba(15,23,42,0.18) 100%)",
    snakePalettes: [
      { base1: "#64748b", base2: "#334155", light: "#a8b6c6", blotch: "#1e293b", belly: "#e8eef5", scale: "#f1f5f9", outline: "#0f172a", band: false },
      { base1: "#0d9488", base2: "#0f766e", light: "#5eead4", blotch: "#134e4a", belly: "#ccfbf1", scale: "#effdf9", outline: "#134e4a", band: false },
      { base1: "#f43f5e", base2: "#be123c", light: "#fda4af", blotch: "#881337", belly: "#ffe4e6", scale: "#fff1f2", outline: "#881337", band: true },
    ],
    ladders: {
      railDark: "#1e293b",
      woodA: "#64748b",
      woodB: "#94a3b8",
      woodC: "#475569",
      rungA: "#cbd5e1",
      rungB: "#64748b",
      rungC: "#334155",
      rungLight: "#e2e8f0",
      cap: "#94a3b8",
      capDark: "#1e293b",
      shadow: "rgba(15,23,42,0.2)",
      glow: "rgba(148,163,184,0.95)",
    },
  },
  {
    id: "jungle",
    nameKey: "board.jungle.name",
    descKey: "board.jungle.desc",
    squares: {
      palette: ["#dcedb4", "#b5d68a", "#8fc766", "#6ba84a", "#4f8a36", "#e6d69b"],
      pattern: "classic",
    },
    frame: {
      border: "#14532d",
      bg: "#f2f8e6",
      shadow:
        "0 20px 55px -14px rgba(20,83,45,0.65), inset 0 0 0 2px rgba(255,255,255,0.3), inset 0 0 24px rgba(20,83,45,0.15)",
    },
    backdrop: "linear-gradient(160deg, rgba(236,252,203,0.8), rgba(74,222,128,0.25))",
    goal: { from: "#fcd34d", to: "#d97706", ring: "rgba(255,255,255,0.75)", shadow: "rgba(20,83,45,0.5)" },
    startBadge: { bg: "rgba(255,255,255,0.9)", text: "#166534" },
    vignette:
      "radial-gradient(125% 125% at 50% 30%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0) 40%, rgba(20,83,45,0.3) 100%)",
    snakePalettes: [
      { base1: "#2f9e44", base2: "#1b6e2f", light: "#69c06d", blotch: "#143d1e", belly: "#e3f2b8", scale: "#f2f9d4", outline: "#0d3318", band: false },
      { base1: "#8b5e34", base2: "#5e3a1e", light: "#c99e6a", blotch: "#3d2513", belly: "#efe0c0", scale: "#f9ecd2", outline: "#33200f", band: false },
      { base1: "#65851d", base2: "#425c12", light: "#a4c155", blotch: "#273a08", belly: "#e7f2bd", scale: "#f3fad4", outline: "#1f2f06", band: true },
    ],
    ladders: {
      railDark: "#3f2d16",
      woodA: "#6b4423",
      woodB: "#8f6b3d",
      woodC: "#5c3a1e",
      rungA: "#a97b45",
      rungB: "#7a5426",
      rungC: "#503317",
      rungLight: "#c99a5e",
      cap: "#7a5426",
      capDark: "#3f2d16",
      shadow: "rgba(30,20,8,0.22)",
      glow: "rgba(251,191,36,0.95)",
    },
  },
  {
    id: "fantasy",
    nameKey: "board.fantasy.name",
    descKey: "board.fantasy.desc",
    squares: {
      palette: ["#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#7e22ce"],
      pattern: "classic",
    },
    frame: {
      border: "#6b21a8",
      bg: "#faf5ff",
      shadow:
        "0 22px 60px -14px rgba(107,33,168,0.6), inset 0 0 0 2px rgba(255,255,255,0.4), inset 0 0 26px rgba(168,85,247,0.18)",
    },
    backdrop: "linear-gradient(160deg, rgba(243,232,255,0.95), rgba(216,180,254,0.4))",
    goal: { from: "#e9d5ff", to: "#c026d3", ring: "rgba(255,255,255,0.85)", shadow: "rgba(107,33,168,0.5)" },
    startBadge: { bg: "rgba(255,255,255,0.9)", text: "#7e22ce" },
    vignette:
      "radial-gradient(125% 125% at 50% 30%, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0) 42%, rgba(88,28,135,0.24) 100%)",
    snakePalettes: [
      { base1: "#9333ea", base2: "#6b21a8", light: "#d8b4fe", blotch: "#4c1d95", belly: "#f3e8ff", scale: "#fbeeff", outline: "#3b0764", band: false },
      { base1: "#db2777", base2: "#9d174d", light: "#f9a8d4", blotch: "#831843", belly: "#fce7f3", scale: "#fff0f6", outline: "#500724", band: true },
      { base1: "#14b8a6", base2: "#0f766e", light: "#5eead4", blotch: "#134e4a", belly: "#ccfbf1", scale: "#effdf9", outline: "#134e4a", band: false },
    ],
    ladders: {
      railDark: "#701a75",
      woodA: "#c026d3",
      woodB: "#e879f9",
      woodC: "#a21caf",
      rungA: "#f5d0fe",
      rungB: "#d946ef",
      rungC: "#86198f",
      rungLight: "#fde2ff",
      cap: "#d946ef",
      capDark: "#701a75",
      shadow: "rgba(88,28,135,0.22)",
      glow: "rgba(232,121,249,0.95)",
    },
  },
  {
    id: "cartoon",
    nameKey: "board.cartoon.name",
    descKey: "board.cartoon.desc",
    squares: {
      palette: ["#f87171", "#facc15", "#4ade80", "#f472b6", "#fb923c", "#fde047"],
      pattern: "classic",
    },
    frame: {
      border: "#ea580c",
      bg: "#fff7ed",
      shadow:
        "0 18px 50px -12px rgba(234,88,12,0.55), inset 0 0 0 3px rgba(255,255,255,0.55), inset 0 0 0 6px rgba(251,146,60,0.35)",
    },
    backdrop: "linear-gradient(160deg, rgba(255,247,237,0.95), rgba(254,215,170,0.45))",
    goal: { from: "#fde047", to: "#f59e0b", ring: "rgba(255,255,255,0.9)", shadow: "rgba(194,65,12,0.45)" },
    startBadge: { bg: "rgba(255,255,255,0.92)", text: "#ea580c" },
    vignette: null,
    snakePalettes: [
      { base1: "#4ade80", base2: "#16a34a", light: "#86efac", blotch: "#166534", belly: "#f0fdf4", scale: "#f0fdf4", outline: "#14532d", band: false },
      { base1: "#fb923c", base2: "#ea580c", light: "#fdba74", blotch: "#9a3412", belly: "#fff7ed", scale: "#fff7ed", outline: "#7c2d12", band: false },
      { base1: "#f472b6", base2: "#db2777", light: "#f9a8d4", blotch: "#9d174d", belly: "#fdf2f8", scale: "#fdf2f8", outline: "#831843", band: true },
    ],
    ladders: {
      railDark: "#9a3412",
      woodA: "#f97316",
      woodB: "#fdba74",
      woodC: "#ea580c",
      rungA: "#fed7aa",
      rungB: "#fb923c",
      rungC: "#c2410c",
      rungLight: "#ffedd5",
      cap: "#fb923c",
      capDark: "#9a3412",
      shadow: "rgba(154,52,18,0.2)",
      glow: "rgba(251,146,60,0.95)",
    },
  },
  {
    id: "royal",
    nameKey: "board.royal.name",
    descKey: "board.royal.desc",
    squares: {
      palette: ["#fdf6e3", "#f7ead0", "#eed9a8", "#d4a017", "#9f1239", "#7f1d1d"],
      pattern: "classic",
    },
    frame: {
      border: "#b8860b",
      bg: "#fffbf0",
      shadow:
        "0 22px 58px -14px rgba(120,53,15,0.65), inset 0 0 0 2px rgba(255,255,255,0.5), inset 0 0 30px rgba(212,160,23,0.25)",
    },
    backdrop: "linear-gradient(160deg, rgba(255,251,240,0.95), rgba(234,214,170,0.5))",
    goal: { from: "#fde68a", to: "#b45309", ring: "rgba(255,255,255,0.85)", shadow: "rgba(120,53,15,0.55)" },
    startBadge: { bg: "rgba(255,255,255,0.92)", text: "#92400e" },
    vignette:
      "radial-gradient(130% 130% at 50% 28%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0) 44%, rgba(88,28,20,0.2) 100%)",
    snakePalettes: [
      { base1: "#7e22ce", base2: "#581c87", light: "#c084fc", blotch: "#d4a017", belly: "#f3e8ff", scale: "#ffe9a8", outline: "#3b0764", band: false },
      { base1: "#047857", base2: "#065f46", light: "#34d399", blotch: "#d4a017", belly: "#ecfdf5", scale: "#f7fee7", outline: "#022c22", band: false },
      { base1: "#9f1239", base2: "#881337", light: "#fb7185", blotch: "#fde68a", belly: "#fff1f2", scale: "#ffe4c9", outline: "#4c0519", band: true },
    ],
    ladders: {
      railDark: "#7a5b0e",
      woodA: "#d4a017",
      woodB: "#e9c46a",
      woodC: "#b8860b",
      rungA: "#ffe08a",
      rungB: "#d4a017",
      rungC: "#9c7a10",
      rungLight: "#fff3bf",
      cap: "#e9c46a",
      capDark: "#7a5b0e",
      shadow: "rgba(120,90,10,0.2)",
      glow: "rgba(253,224,71,0.98)",
    },
  },
  {
    id: "neon",
    nameKey: "board.neon.name",
    descKey: "board.neon.desc",
    squares: {
      palette: ["#0f172a", "#182234", "#052e16", "#0c2a1b", "#1e293b", "#132d2a"],
      pattern: "checker",
    },
    frame: {
      border: "#22c55e",
      bg: "#0a0f1c",
      shadow:
        "0 0 34px rgba(34,197,94,0.4), 0 22px 60px -14px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(34,197,94,0.35)",
    },
    backdrop: "linear-gradient(160deg, rgba(10,15,28,0.95), rgba(6,46,22,0.5))",
    goal: { from: "#a3e635", to: "#15803d", ring: "rgba(163,230,53,0.6)", shadow: "rgba(0,0,0,0.6)" },
    startBadge: { bg: "rgba(10,15,28,0.85)", text: "#4ade80" },
    vignette:
      "radial-gradient(130% 130% at 50% 30%, rgba(163,230,53,0.05) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%)",
    snakePalettes: [
      { base1: "#22c55e", base2: "#15803d", light: "#a3e635", blotch: "#052e16", belly: "#ecfccb", scale: "#d9f99d", outline: "#052e16", band: false },
      { base1: "#ec4899", base2: "#be185d", light: "#f9a8d4", blotch: "#500724", belly: "#fce7f3", scale: "#fbd6e8", outline: "#500724", band: true },
      { base1: "#eab308", base2: "#a16207", light: "#fde047", blotch: "#422006", belly: "#fef9c3", scale: "#fef08a", outline: "#422006", band: false },
    ],
    ladders: {
      railDark: "#052e16",
      woodA: "#22c55e",
      woodB: "#4ade80",
      woodC: "#15803d",
      rungA: "#a3e635",
      rungB: "#65a30d",
      rungC: "#3f6212",
      rungLight: "#d9f99d",
      cap: "#4ade80",
      capDark: "#052e16",
      shadow: "rgba(0,0,0,0.5)",
      glow: "rgba(163,230,53,0.98)",
    },
    fx: { neon: true },
  },
  {
    id: "nature",
    nameKey: "board.nature.name",
    descKey: "board.nature.desc",
    squares: {
      palette: ["#f1ead9", "#e3d9c0", "#d3c7a3", "#c2b28a", "#a8b58c", "#d9c9a8"],
      pattern: "classic",
    },
    frame: {
      border: "#7c6f56",
      bg: "#faf6ec",
      shadow:
        "0 20px 55px -16px rgba(87,83,78,0.55), inset 0 0 0 2px rgba(255,255,255,0.4), inset 0 0 22px rgba(120,113,90,0.18)",
    },
    backdrop: "linear-gradient(160deg, rgba(250,246,236,0.95), rgba(220,210,185,0.5))",
    goal: { from: "#e5d3a1", to: "#a16207", ring: "rgba(255,255,255,0.8)", shadow: "rgba(87,83,78,0.5)" },
    startBadge: { bg: "rgba(255,255,255,0.9)", text: "#57534e" },
    vignette:
      "radial-gradient(125% 125% at 50% 30%, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0) 44%, rgba(87,83,78,0.22) 100%)",
    snakePalettes: [
      { base1: "#9a744a", base2: "#6d4f2c", light: "#d6b485", blotch: "#4a331b", belly: "#f4e3c4", scale: "#fbeecf", outline: "#3d2a15", band: false },
      { base1: "#8a8f5e", base2: "#5f6557", light: "#bcc28a", blotch: "#3c4036", belly: "#e8e6d9", scale: "#f2f1e4", outline: "#2c2f28", band: false },
      { base1: "#b98a5a", base2: "#8a6238", light: "#dfba8b", blotch: "#54371e", belly: "#efd9b8", scale: "#fbe3c0", outline: "#4a2f18", band: true },
    ],
    ladders: {
      railDark: "#4a3a22",
      woodA: "#8a6d3b",
      woodB: "#b08d57",
      woodC: "#6e5628",
      rungA: "#d6bb85",
      rungB: "#9c7a45",
      rungC: "#6b5228",
      rungLight: "#ecd9ae",
      cap: "#9c7a45",
      capDark: "#4a3a22",
      shadow: "rgba(74,58,34,0.2)",
      glow: "rgba(214,187,133,0.95)",
    },
  },
  {
    id: "space",
    nameKey: "board.space.name",
    descKey: "board.space.desc",
    squares: {
      palette: ["#020617", "#0b1120", "#172033", "#231b3d", "#2a1e3f", "#101828"],
      pattern: "classic",
    },
    frame: {
      border: "#6d28d9",
      bg: "#050816",
      shadow:
        "0 0 36px rgba(139,92,246,0.35), 0 22px 60px -14px rgba(0,0,0,0.75), inset 0 0 0 2px rgba(139,92,246,0.3)",
    },
    backdrop: "linear-gradient(160deg, rgba(5,8,22,0.95), rgba(42,30,63,0.6))",
    goal: { from: "#d946ef", to: "#7c3aed", ring: "rgba(217,70,239,0.6)", shadow: "rgba(0,0,0,0.6)" },
    startBadge: { bg: "rgba(5,8,22,0.85)", text: "#d946ef" },
    vignette:
      "radial-gradient(130% 130% at 50% 28%, rgba(139,92,246,0.08) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%)",
    snakePalettes: [
      { base1: "#8b5cf6", base2: "#6d28d9", light: "#c4b5fd", blotch: "#312e81", belly: "#ede9fe", scale: "#e6e2ff", outline: "#2e1065", band: false },
      { base1: "#d946ef", base2: "#a21caf", light: "#f0abfc", blotch: "#701a75", belly: "#fae8ff", scale: "#fbd6ff", outline: "#4a044e", band: true },
      { base1: "#64748b", base2: "#334155", light: "#a8b6c6", blotch: "#0f172a", belly: "#e2e8f0", scale: "#f1f5f9", outline: "#0f172a", band: false },
    ],
    ladders: {
      railDark: "#1e293b",
      woodA: "#64748b",
      woodB: "#94a3b8",
      woodC: "#475569",
      rungA: "#cbd5e1",
      rungB: "#64748b",
      rungC: "#334155",
      rungLight: "#f1f5f9",
      cap: "#94a3b8",
      capDark: "#1e293b",
      shadow: "rgba(0,0,0,0.5)",
      glow: "rgba(217,70,239,0.9)",
    },
    fx: { stars: true },
  },
  {
    id: "minimal",
    nameKey: "board.minimal.name",
    descKey: "board.minimal.desc",
    squares: {
      palette: ["#ffffff", "#f1f3f5"],
      pattern: "checker",
    },
    frame: {
      border: "#e5e7eb",
      bg: "#ffffff",
      shadow: "0 12px 34px -12px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(0,0,0,0.04)",
    },
    backdrop: "linear-gradient(160deg, rgba(255,255,255,0.95), rgba(241,243,245,0.8))",
    goal: { from: "#6ee7b7", to: "#059669", ring: "rgba(255,255,255,0.9)", shadow: "rgba(5,150,105,0.4)" },
    startBadge: { bg: "rgba(255,255,255,0.95)", text: "#059669" },
    vignette: null,
    snakePalettes: [
      { base1: "#83948c", base2: "#5c6f66", light: "#b6c4bd", blotch: "#3f4f48", belly: "#eef2ef", scale: "#f6f8f6", outline: "#2f3d37", band: false },
      { base1: "#94a3b8", base2: "#64748b", light: "#cbd5e1", blotch: "#334155", belly: "#e2e8f0", scale: "#f1f5f9", outline: "#1e293b", band: true },
    ],
    ladders: {
      railDark: "#065f46",
      woodA: "#10b981",
      woodB: "#6ee7b7",
      woodC: "#059669",
      rungA: "#a7f3d0",
      rungB: "#34d399",
      rungC: "#047857",
      rungLight: "#d1fae5",
      cap: "#34d399",
      capDark: "#065f46",
      shadow: "rgba(0,0,0,0.12)",
      glow: "rgba(110,231,183,0.95)",
    },
  },
];

/** Lookup with a safe fallback to the classic board. */
export function getBoardTheme(id: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
