/**
 * Browser client for the Google Apps Script backend.
 *
 * Apps Script web apps cannot answer CORS preflights, so every call is a "simple" POST
 * (Content-Type: text/plain, no custom headers) whose JSON body carries the action, the session token and payload.
 * The session token is an opaque random string issued by the backend after it verified the user's Google ID token.
 */
import { config } from "./config";

const TOKEN_KEY = "sapludu-session";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

type AuthLostHandler = (reason: string) => void;
let authLost: AuthLostHandler = () => {};
export function onAuthLost(fn: AuthLostHandler) {
  authLost = fn;
}

const RETRYABLE_CODES = new Set(["BUSY", "AUTH_UNAVAILABLE", "INTERNAL", "NETWORK", "TIMEOUT"]);

async function once<T>(action: string, payload: unknown, token: string | null): Promise<T> {
  if (!config.appsScriptUrl) throw new ApiError("NOT_CONFIGURED", "The backend URL is not configured (NEXT_PUBLIC_APPS_SCRIPT_URL).");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("OFFLINE", "You are offline.", true);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(config.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload, sessionToken: token ?? undefined, ua: navigator.userAgent.slice(0, 120) }),
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: ctl.signal,
    });
  } catch (e) {
    throw new ApiError((e as Error).name === "AbortError" ? "TIMEOUT" : "NETWORK", "Could not reach the server. Check your connection.", true);
  } finally {
    clearTimeout(timer);
  }
  let body: { ok: boolean; data?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", "The server returned an unexpected response.", true);
  }
  if (!body.ok) {
    const code = body.error?.code ?? "UNKNOWN";
    throw new ApiError(code, body.error?.message ?? "Request failed", RETRYABLE_CODES.has(code));
  }
  return body.data as T;
}

/**
 * Calls a backend action. Read-only actions (idempotent) are retried once on transient failures.
 * If the session is rejected the stored token is dropped and the auth store is told to sign the user out.
 */
export async function api<T = unknown>(action: string, payload: Record<string, unknown> = {}, opts: { retry?: boolean; auth?: boolean } = {}): Promise<T> {
  const token = opts.auth === false ? null : session.get();
  try {
    return await once<T>(action, payload, token);
  } catch (e) {
    const err = e as ApiError;
    if (opts.retry && err.retryable) {
      await new Promise((r) => setTimeout(r, 900));
      try {
        return await once<T>(action, payload, token);
      } catch (e2) {
        throw e2;
      }
    }
    if (token && (err.code === "AUTH_EXPIRED" || err.code === "AUTH_REQUIRED" || err.code === "ACCOUNT_SUSPENDED")) {
      session.clear();
      authLost(err.code);
    }
    throw err;
  }
}
