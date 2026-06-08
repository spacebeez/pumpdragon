import cron from "node-cron";
import type { Client, TextChannel } from "discord.js";
import type { Pool } from "./db/pool.js";
import type { Config } from "./config.js";
import { EmbedRenderer } from "./renderer/embed.js";
import { buildScoreboardEmbed, buildCeremonyEmbed } from "./scoreboard.js";
import { lastCompletedMonth } from "./deltas.js";
import { getOverallStandings } from "./db/queries.js";

/** Accept a 5-field cron expr, or HH:MM (→ daily at that time). */
export function toCronExpr(value: string): string {
  const v = value.trim();
  if (/^(\S+\s+){4}\S+$/.test(v)) return v; // already 5 fields
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`RECAP_TIME must be HH:MM or a cron expression, got "${value}"`);
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`RECAP_TIME out of range: "${value}"`);
  return `${min} ${h} * * *`;
}

export function scheduleRecap(client: Client, config: Config, pool: Pool): void {
  const expr = toCronExpr(config.recapTime);
  const renderer = new EmbedRenderer();
  cron.schedule(
    expr,
    async () => {
      try {
        const channel = await client.channels.fetch(config.recapChannelId);
        if (!channel || !channel.isTextBased()) return;
        const embed = await buildScoreboardEmbed(pool, config, renderer, "🐉 daily recap");
        await (channel as TextChannel).send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (err) {
        console.error("[pumpdragon] recap error:", err);
      }
    },
    { timezone: config.timezone },
  );
  console.log(`[pumpdragon] recap scheduled: "${expr}" (${config.timezone})`);
}

/** Auto-post the month-rollover ceremony at 07:00 on the 1st (tz-aware) for the month that just ended. */
export function scheduleCeremony(client: Client, config: Config, pool: Pool): void {
  const expr = "0 7 1 * *";
  const renderer = new EmbedRenderer();
  cron.schedule(
    expr,
    async () => {
      try {
        const target = lastCompletedMonth(new Date(), config.timezone);
        // skip a dead month — never auto-post "0 warriors ascended" (manual close-month can still render it)
        const window = { kind: "namedMonth" as const, year: target.year, month: target.month };
        const participants = await getOverallStandings(pool, config.guildId, config.timezone, window);
        if (participants.length === 0) {
          console.log(`[pumpdragon] ceremony skipped: no activity in ${target.year}-${target.month}`);
          return;
        }
        const channel = await client.channels.fetch(config.recapChannelId);
        if (!channel || !channel.isTextBased()) return;
        const embed = await buildCeremonyEmbed(pool, config, renderer, target);
        await (channel as TextChannel).send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (err) {
        console.error("[pumpdragon] ceremony error:", err);
      }
    },
    { timezone: config.timezone },
  );
  console.log(`[pumpdragon] ceremony scheduled: "${expr}" (${config.timezone})`);
}
