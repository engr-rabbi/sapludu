/**
 * Client for the Google Apps Script backend (server-to-server, authenticated with the shared secret)
 * plus a persistent retry queue so that a slow or failing Apps Script never blocks or loses a game result.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface VerifiedUser {
  playerId: string;
  displayName: string;
  picture: string;
  role: "player" | "admin";
  status: string;
  rating: number;
  expiresAt: string;
}

export interface RecordGamePayload {
  gameId: string;
  roomCode: string;
  forfeited: boolean;
  winnerSeat: number;
  startedAt: string;
  endedAt: string;
  players: { seat: number; playerId: string; name: string; color: string; finalPosition: number; placement: number }[];
  moves: { seat: number; dice: number; fromPos: number; toPos: number; kind: string }[];
}

export interface RecordGameResult {
  gameId: string;
  duplicate?: boolean;
  ratings?: Record<string, { before: number; after: number }>;
  achievements?: Record<string, string[]>;
}

export class GasError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export interface GasClient {
  verifySession(sessionToken: string): Promise<VerifiedUser>;
  gameStarted(p: { gameId: string; roomCode: string; players: { playerId: string; name: string }[] }): Promise<void>;
  gameAborted(gameId: string): Promise<void>;
  recordGame(p: RecordGamePayload): Promise<RecordGameResult>;
  createInvite(p: { fromPlayerId: string; toPlayerId: string; roomCode: string }): Promise<{ inviteId: string; fromName: string }>;
}

const RETRYABLE = new Set(["BUSY", "INTERNAL", "AUTH_UNAVAILABLE", "RATE_LIMITED", "DB_UNAVAILABLE", "NETWORK", "HTTP_5XX"]);

export class HttpGasClient implements GasClient {
  constructor(
    private url: string,
    private secret: string,
    private serverId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(action: string, payload: unknown, timeoutMs = 25_000): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        // text/plain keeps Apps Script happy; the secret travels in the body because Apps Script cannot read headers
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, serverSecret: this.secret, payload }),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new GasError("NETWORK", `Apps Script unreachable: ${(e as Error).message}`, true);
    }
    if (res.status >= 500) throw new GasError("HTTP_5XX", `Apps Script HTTP ${res.status}`, true);
    let body: { ok?: boolean; data?: T; error?: { code: string; message: string } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Apps Script returns an HTML page when the deployment is wrong or not public
      throw new GasError("BAD_RESPONSE", "Apps Script did not return JSON (check the deployment URL and that access is 'Anyone')", false);
    }
    if (!body.ok) {
      const code = body.error?.code ?? "UNKNOWN";
      throw new GasError(code, body.error?.message ?? "Apps Script error", RETRYABLE.has(code));
    }
    return body.data as T;
  }

  verifySession(sessionToken: string) {
    return this.call<VerifiedUser>("server.verifySession", { sessionToken }, 15_000);
  }
  async gameStarted(p: { gameId: string; roomCode: string; players: { playerId: string; name: string }[] }) {
    await this.call("server.gameStarted", { ...p, serverId: this.serverId });
  }
  async gameAborted(gameId: string) {
    await this.call("server.gameAborted", { gameId });
  }
  recordGame(p: RecordGamePayload) {
    return this.call<RecordGameResult>("server.recordGame", p, 40_000);
  }
  createInvite(p: { fromPlayerId: string; toPlayerId: string; roomCode: string }) {
    return this.call<{ inviteId: string; fromName: string }>("server.createInvite", p, 15_000);
  }
}

// ───────────────────────── retry queue ─────────────────────────

export interface Job {
  id: string;
  kind: "gameStarted" | "gameAborted" | "recordGame";
  payload: unknown;
  attempts: number;
}

export interface QueueOptions {
  file: string | null;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  log?: (msg: string) => void;
}

/** Sequential (one at a time, to avoid Apps Script lock contention) at-least-once job queue with backoff. */
export class ResultQueue {
  private jobs: Job[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private idle: (() => void)[] = [];
  onDone: (job: Job, result: unknown) => void = () => {};

  constructor(
    private gas: GasClient,
    private opts: QueueOptions,
  ) {
    this.load();
  }

  private log(m: string) {
    (this.opts.log ?? console.log)(`[queue] ${m}`);
  }

  private load() {
    if (!this.opts.file || !existsSync(this.opts.file)) return;
    try {
      this.jobs = JSON.parse(readFileSync(this.opts.file, "utf8")) as Job[];
      if (this.jobs.length) this.log(`restored ${this.jobs.length} pending job(s) from ${this.opts.file}`);
    } catch (e) {
      this.log(`could not read ${this.opts.file}: ${(e as Error).message}`);
    }
  }

  private save() {
    if (!this.opts.file) return;
    try {
      mkdirSync(dirname(this.opts.file), { recursive: true });
      writeFileSync(this.opts.file, JSON.stringify(this.jobs));
    } catch (e) {
      this.log(`could not persist queue: ${(e as Error).message}`);
    }
  }

  get size() {
    return this.jobs.length;
  }

  enqueue(kind: Job["kind"], id: string, payload: unknown) {
    if (this.jobs.some((j) => j.kind === kind && j.id === id)) return;
    this.jobs.push({ id, kind, payload, attempts: 0 });
    this.save();
    this.kick(0);
  }

  start() {
    this.stopped = false;
    if (this.jobs.length) this.kick(1000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.save();
  }

  /** Resolves when the queue is empty (used by tests and graceful shutdown). */
  whenIdle(timeoutMs = 10_000): Promise<void> {
    if (this.jobs.length === 0 && !this.running) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      this.idle.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  private kick(delay: number) {
    if (this.stopped || this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pump(), delay);
  }

  private async pump() {
    if (this.running || this.stopped) return;
    this.running = true;
    let nextDelay = 0;
    try {
      while (this.jobs.length && !this.stopped) {
        const job = this.jobs[0]!;
        try {
          const result = await this.run(job);
          this.jobs.shift();
          this.save();
          this.onDone(job, result);
        } catch (e) {
          const err = e as GasError;
          job.attempts++;
          const max = this.opts.maxAttempts ?? 12;
          if (!err.retryable || job.attempts >= max) {
            this.log(`DROPPED ${job.kind} ${job.id}: ${err.code} ${err.message} (attempts=${job.attempts})`);
            this.jobs.shift();
            this.save();
            continue;
          }
          const base = this.opts.baseDelayMs ?? 2000;
          nextDelay = Math.min(this.opts.maxDelayMs ?? 300_000, base * 2 ** (job.attempts - 1));
          this.log(`retry ${job.kind} ${job.id} in ${nextDelay}ms after ${err.code}: ${err.message}`);
          this.save();
          break;
        }
      }
    } finally {
      this.running = false;
      if (this.jobs.length === 0) {
        const waiters = this.idle.splice(0);
        waiters.forEach((w) => w());
      } else if (nextDelay > 0) {
        this.kick(nextDelay);
      }
    }
  }

  private run(job: Job): Promise<unknown> {
    switch (job.kind) {
      case "gameStarted":
        return this.gas.gameStarted(job.payload as Parameters<GasClient["gameStarted"]>[0]);
      case "gameAborted":
        return this.gas.gameAborted((job.payload as { gameId: string }).gameId);
      case "recordGame":
        return this.gas.recordGame(job.payload as RecordGamePayload);
    }
  }
}
