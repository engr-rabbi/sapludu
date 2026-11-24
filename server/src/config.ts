/** Runtime configuration, read once from environment variables (see server/.env.example). */

export interface ServerConfig {
  port: number;
  /** Allowed browser origins for the WebSocket handshake. */
  corsOrigins: string[];
  appsScriptUrl: string;
  appsScriptSecret: string;
  serverId: string;
  turnTimeMs: number;
  disconnectForfeitMs: number;
  lobbyGraceMs: number;
  completedRoomTtlMs: number;
  pendingFile: string | null;
  sessionCacheMs: number;
  /** minimum gap between two rolls of the same player (anti-flood) */
  minRollMs: number;
}

function int(name: string, dflt: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return {
    port: int("PORT", 3003),
    corsOrigins: origins,
    appsScriptUrl: env.APPS_SCRIPT_URL ?? "",
    appsScriptSecret: env.APPS_SCRIPT_SERVER_SECRET ?? "",
    serverId: env.SERVER_ID ?? `srv-${Math.random().toString(36).slice(2, 8)}`,
    turnTimeMs: int("TURN_TIME_MS", 40_000),
    disconnectForfeitMs: int("DISCONNECT_FORFEIT_MS", 90_000),
    lobbyGraceMs: int("LOBBY_GRACE_MS", 30_000),
    completedRoomTtlMs: int("COMPLETED_ROOM_TTL_MS", 10 * 60_000),
    pendingFile: env.PENDING_FILE === "" ? null : (env.PENDING_FILE ?? "./data/pending-results.json"),
    sessionCacheMs: int("SESSION_CACHE_MS", 60_000),
    minRollMs: int("MIN_ROLL_MS", 250),
  };
}

/** Throws with a readable message if the server cannot work in production. */
export function assertProductionConfig(c: ServerConfig): void {
  const problems: string[] = [];
  if (!c.appsScriptUrl.startsWith("https://")) problems.push("APPS_SCRIPT_URL must be the https://script.google.com/macros/s/.../exec URL");
  if (c.appsScriptSecret.length < 24) problems.push("APPS_SCRIPT_SERVER_SECRET must be at least 24 characters (same value as the SERVER_SECRET script property)");
  if (c.corsOrigins.length === 0) problems.push("CORS_ORIGINS must list your web app origin(s), e.g. https://yourname.github.io");
  if (problems.length) throw new Error("Invalid configuration:\n - " + problems.join("\n - "));
}
