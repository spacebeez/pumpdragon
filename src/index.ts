import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { createClient, startBot } from "./bot.js";
import { scheduleRecap, scheduleCeremony } from "./cron.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  const ran = await runMigrations(pool);
  if (ran.length) console.log(`[pumpdragon] applied migrations: ${ran.join(", ")}`);

  const client = createClient();
  startBot(client, config, pool);
  await client.login(config.discordToken);
  scheduleRecap(client, config, pool);
  scheduleCeremony(client, config, pool);

  process.on("unhandledRejection", (r) => console.error("[pumpdragon] unhandledRejection:", r));
  process.on("uncaughtException", (e) => console.error("[pumpdragon] uncaughtException:", e));

  // Graceful shutdown on `docker stop` (SIGTERM) / Ctrl-C (SIGINT): drain the
  // Discord connection and the pg pool so restarts are clean.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[pumpdragon] received ${signal}, shutting down...`);
    void (async () => {
      try {
        await client.destroy();
        await pool.end();
      } catch (e) {
        console.error("[pumpdragon] error during shutdown:", e);
      } finally {
        process.exit(0);
      }
    })();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[pumpdragon] fatal startup error:", err);
  process.exit(1);
});
