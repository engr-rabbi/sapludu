/**
 * Public runtime configuration. Everything here is baked into the static bundle at build time from
 * NEXT_PUBLIC_* variables — these values are PUBLIC by design (a Google OAuth *client ID*, a web-app URL and a
 * socket URL). Secrets (Apps Script SERVER_SECRET, spreadsheet id…) never reach the browser.
 */
export const config = {
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  appsScriptUrl: process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? "",
  gameServerUrl: process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
} as const;

export const isBackendConfigured = Boolean(config.googleClientId && config.appsScriptUrl);
export const isOnlineConfigured = Boolean(config.gameServerUrl);

/** Prefix a public-folder path with the GitHub Pages base path. */
export function asset(path: string): string {
  return `${config.basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
