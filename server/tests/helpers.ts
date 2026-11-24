import http from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioc, type Socket } from "socket.io-client";
// The REAL Apps Script sources, executed against in-memory Google fakes
// @ts-expect-error plain JS test harness
import { createEnv, googleToken } from "../../apps-script/tests/harness.mjs";
import { createGameServer, type GameServer } from "../src/game-server.ts";
import { HttpGasClient } from "../src/gas.ts";
import type { ServerConfig } from "../src/config.ts";

export const SECRET = "s".repeat(40);

export interface Backend {
  env: any;
  url: string;
  down: boolean;
  failNext: number;
  calls: string[];
  close(): Promise<void>;
}

/** HTTP front for the real Apps Script code (what the /exec URL is in production). */
export async function startBackend(): Promise<Backend> {
  const env = createEnv();
  env.setup();
  const be: Backend = { env, url: "", down: false, failNext: 0, calls: [], close: async () => {} };
  let last = Date.now();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const now = Date.now();
      env.advance(now - last);
      last = now;
      if (be.down || be.failNext > 0) {
        if (be.failNext > 0) be.failNext--;
        res.writeHead(503);
        return res.end("down");
      }
      const parsed = JSON.parse(body);
      be.calls.push(parsed.action);
      const out = env.call(parsed.action, parsed.payload, { serverSecret: parsed.serverSecret, sessionToken: parsed.sessionToken });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  be.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`;
  be.close = () => new Promise((r) => server.close(() => r()));
  return be;
}

export function login(be: Backend, who: string): { token: string; id: string; name: string } {
  const d = be.env.ok("auth.login", {
    idToken: googleToken({ email: `${who}@example.com`, sub: "sub-" + who, name: who[0]!.toUpperCase() + who.slice(1) + " Tester" }),
  });
  return { token: d.sessionToken, id: d.user.id, name: d.user.displayName };
}

export function testConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0, corsOrigins: ["http://localhost:3000"], appsScriptUrl: "", appsScriptSecret: SECRET, serverId: "test",
    turnTimeMs: 60_000, disconnectForfeitMs: 60_000, lobbyGraceMs: 60_000, completedRoomTtlMs: 60_000, pendingFile: null, sessionCacheMs: 1000, minRollMs: 0,
    ...over,
  };
}

export async function startServer(be: Backend, over: Partial<ServerConfig> = {}): Promise<{ gs: GameServer; port: number }> {
  const cfg = testConfig({ appsScriptUrl: be.url, ...over });
  const gs = createGameServer(cfg, new HttpGasClient(be.url, SECRET, "test"), () => {});
  const port = await gs.listen();
  return { gs, port };
}

export class Client {
  socket: Socket;
  log: { event: string; data: any }[] = [];
  waiters: { event: string; pred: (d: any) => boolean; resolve: (d: any) => void }[] = [];
  state: any = null;
  constructor(port: number, public token: string) {
    this.socket = ioc(`http://127.0.0.1:${port}`, { transports: ["websocket"], reconnection: false, forceNew: true });
    this.socket.onAny((event, data) => {
      this.log.push({ event, data });
      if (event === "game:start" || event === "game:state_sync") this.state = data.state;
      this.waiters = this.waiters.filter((w) => {
        if (w.event === event && w.pred(data)) { w.resolve(data); return false; }
        return true;
      });
    });
  }
  async hello(token = this.token): Promise<any> {
    const p = this.waitFor("hello:ok", () => true, 4000);
    this.socket.emit("hello", { sessionToken: token });
    return p;
  }
  waitFor(event: string, pred: (d: any) => boolean = () => true, ms = 5000): Promise<any> {
    const hit = this.log.find((l) => l.event === event && pred(l.data) && !(l as any).used);
    if (hit) { (hit as any).used = true; return Promise.resolve(hit.data); }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}; got: ${this.log.map((l) => l.event).join(",")}`)), ms);
      this.waiters.push({ event, pred, resolve: (d) => { clearTimeout(t); resolve(d); } });
    });
  }
  count(event: string) { return this.log.filter((l) => l.event === event).length; }
  last(event: string) { return [...this.log].reverse().find((l) => l.event === event)?.data; }
  emit(event: string, data?: unknown) { this.socket.emit(event, data); }
  close() { this.socket.close(); }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Roll for whoever's turn it is until the game ends. Returns the number of rolls. */
export async function playToEnd(clients: Client[], timeoutMs = 20000): Promise<number> {
  let rolls = 0;
  const start = Date.now();
  const done = () => clients[0]!.count("game:completed") > 0;
  while (!done() && Date.now() - start < timeoutMs) {
    const st = clients[0]!.last("turn:changed");
    const state = clients[0]!.state;
    const seat = st ? st.playerIndex : state.current;
    const before = clients[0]!.count("dice:result");
    clients[seat]!.emit("dice:roll");
    const t0 = Date.now();
    while (clients[0]!.count("dice:result") === before && !done() && Date.now() - t0 < 2000) await sleep(2);
    rolls++;
  }
  return rolls;
}
