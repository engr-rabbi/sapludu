/**
 * LOCAL TEST STACK (not used in production).
 *
 * Runs everything the browser needs without any Google account:
 *   :8787  /exec   — the REAL Apps Script code on in-memory fakes of Sheets/Google (same API as the deployed web app)
 *   :8787  /mint   — mints a fake Google ID token for a given e-mail (the fake "Sign in with Google" button uses it)
 *   :3003          — the real Socket.IO game server
 *   :3000          — static server for web/out
 *
 * Used by scripts/e2e/browser-test.py to drive the production static build in headless Chromium.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createEnv, googleToken } from "../../apps-script/tests/harness.mjs";
import { createGameServer } from "../../server/src/game-server.ts";
import { HttpGasClient } from "../../server/src/gas.ts";

const SECRET = "s".repeat(40);
const env = createEnv({ GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", SERVER_SECRET: SECRET, ADMIN_EMAILS: "boss@example.com" });
env.setup();
let last = Date.now();

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };

http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === "/mint") {
    const email = url.searchParams.get("email") ?? "user@example.com";
    const name = url.searchParams.get("name") ?? "Test User";
    res.writeHead(200, { ...cors, "content-type": "text/plain" });
    return res.end(googleToken({ email, sub: "sub-" + email, name }));
  }
  if (url.pathname === "/state") {
    const sheets: Record<string, unknown[][]> = {};
    for (const [k, v] of env.sheets) sheets[k] = (v as { data: unknown[][] }).data;
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify(sheets));
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const now = Date.now(); env.advance(now - last); last = now;
    try {
      const p = JSON.parse(body);
      const out = env.call(p.action, p.payload, { sessionToken: p.sessionToken, serverSecret: p.serverSecret });
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }));
    }
  });
}).listen(8787, "127.0.0.1");

const gs = createGameServer(
  { port: 3003, corsOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"], appsScriptUrl: "http://127.0.0.1:8787/exec", appsScriptSecret: SECRET, serverId: "e2e",
    turnTimeMs: 40000, disconnectForfeitMs: 90000, lobbyGraceMs: 30000, completedRoomTtlMs: 600000, pendingFile: null, sessionCacheMs: 1000, minRollMs: 150 },
  new HttpGasClient("http://127.0.0.1:8787/exec", SECRET, "e2e"),
  (m) => console.log(m),
);
await gs.listen();

const root = path.resolve(import.meta.dirname, "../../web/out");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url!, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  let file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(root, "404.html"); res.statusCode = 404; }
  res.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
  if (file.endsWith("sw.js")) res.setHeader("service-worker-allowed", "/");
  fs.createReadStream(file).pipe(res);
}).listen(3000, "127.0.0.1");
console.log("STACK READY :3000 web, :8787 backend, :3003 game server");
