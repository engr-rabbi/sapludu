import { assertProductionConfig, loadConfig } from "./config.ts";
import { HttpGasClient } from "./gas.ts";
import { createGameServer } from "./game-server.ts";

const cfg = loadConfig();
try {
  assertProductionConfig(cfg);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const gas = new HttpGasClient(cfg.appsScriptUrl, cfg.appsScriptSecret, cfg.serverId);
const server = createGameServer(cfg, gas);

server.listen().then((port) => {
  console.log(`sapludu game-server listening on :${port} (id=${cfg.serverId}); allowed origins: ${cfg.corsOrigins.join(", ")}`);
});

let closing = false;
async function shutdown(sig: string) {
  if (closing) return;
  closing = true;
  console.log(`received ${sig}, flushing and shutting down…`);
  const t = setTimeout(() => process.exit(0), 8000);
  t.unref();
  await server.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
