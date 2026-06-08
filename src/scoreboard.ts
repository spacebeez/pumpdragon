import type { EmbedBuilder } from "discord.js";
import type { Pool } from "./db/pool.js";
import type { Config } from "./config.js";
import type { Renderer } from "./renderer/types.js";
import {
  getStandings, getOverallStandings, getCurrentMonthCombinedTotal, getCurrentGoal,
  getGoalForMonth, getRecentDetails,
} from "./db/queries.js";
import { powerMeter } from "./scoring.js";
import { CATEGORIES, unitFor, type Category } from "./categories.js";
import type { TimeWindow } from "./timewindow.js";
import type { Rng } from "./hype.js";
import { previousMonthOf, mostImproved, fallOffs, type MonthRef } from "./deltas.js";
import { monthLabel, collectiveLine, ceremonyPowerLine, risingStarLine, ribLine, momentsLine, closeLine } from "./ceremony.js";

export async function buildScoreboardEmbed(
  pool: Pool, config: Pick<Config, "guildId" | "timezone">, renderer: Renderer,
  title?: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<EmbedBuilder> {
  const [standingsRows, overall, total, goal] = await Promise.all([
    getStandings(pool, config.guildId, config.timezone, window),
    getOverallStandings(pool, config.guildId, config.timezone, window),
    getCurrentMonthCombinedTotal(pool, config.guildId, config.timezone, window),
    getCurrentGoal(pool, config.guildId, config.timezone),
  ]);
  const standings = CATEGORIES.map((c) => ({
    category: c.name, unit: c.unit,
    rows: standingsRows.filter((r) => r.category === c.name).map((r) => ({ userId: r.userId, total: r.total })),
  }));
  return renderer.recap({ overall, standings, powerMeterText: powerMeter(total, goal).text, title });
}

export async function buildCategoryBoardEmbed(
  pool: Pool, config: Pick<Config, "guildId" | "timezone">, renderer: Renderer,
  category: Category, title: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<EmbedBuilder> {
  const rows = (await getStandings(pool, config.guildId, config.timezone, window))
    .filter((r) => r.category === category)
    .map((r) => ({ userId: r.userId, total: r.total }));
  return renderer.categoryBoard({ title, category, unit: unitFor(category), rows });
}

export async function buildStatsCardEmbed(
  pool: Pool, config: Pick<Config, "guildId" | "timezone">, renderer: Renderer,
  userId: string, name: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<EmbedBuilder> {
  const [standingsRows, overall, groupTotal, goal] = await Promise.all([
    getStandings(pool, config.guildId, config.timezone, window),
    getOverallStandings(pool, config.guildId, config.timezone, window),
    getCurrentMonthCombinedTotal(pool, config.guildId, config.timezone, window),
    getCurrentGoal(pool, config.guildId, config.timezone),
  ]);
  const lines = CATEGORIES.map((c) => ({
    category: c.name, unit: c.unit,
    total: standingsRows.filter((r) => r.category === c.name && r.userId === userId).reduce((a, r) => a + r.total, 0),
  }));
  const userTotal = lines.reduce((a, l) => a + l.total, 0);
  const idx = overall.findIndex((r) => r.userId === userId);
  return renderer.statsCard({
    name, rank: idx === -1 ? null : idx + 1, rankOf: overall.length,
    lines, userTotal, groupTotal, goal,
  });
}

export async function buildCeremonyEmbed(
  pool: Pool, config: Pick<Config, "guildId" | "timezone">, renderer: Renderer,
  target: MonthRef, rng: Rng = Math.random,
): Promise<EmbedBuilder> {
  const prev = previousMonthOf(target);
  const window: TimeWindow = { kind: "namedMonth", year: target.year, month: target.month };
  const prevWindow: TimeWindow = { kind: "namedMonth", year: prev.year, month: prev.month };
  const [standings, prevStandings, overall, prevOverall, total, goal, details] = await Promise.all([
    getStandings(pool, config.guildId, config.timezone, window),
    getStandings(pool, config.guildId, config.timezone, prevWindow),
    getOverallStandings(pool, config.guildId, config.timezone, window),
    getOverallStandings(pool, config.guildId, config.timezone, prevWindow),
    getCurrentMonthCombinedTotal(pool, config.guildId, config.timezone, window),
    getGoalForMonth(pool, config.guildId, target.year, target.month),
    getRecentDetails(pool, config.guildId, config.timezone, window),
  ]);
  // MVP = top user per category (getStandings is ordered category, total DESC → first match wins)
  const mvps = CATEGORIES.map((c) => {
    const top = standings.find((r) => r.category === c.name);
    return top ? { category: c.name, userId: top.userId, total: top.total, unit: c.unit } : null;
  }).filter((m): m is NonNullable<typeof m> => m !== null);
  return renderer.ceremony({
    title: `🐉 ${monthLabel(target.year, target.month).toUpperCase()} — WE ASCENDED TOGETHER`,
    collectiveLine: collectiveLine(total, overall.length, rng),
    powerMeterText: ceremonyPowerLine(total, goal),
    mvps,
    // pass the full flat standings — mostImproved keys on `${userId}|${category}`, so it separates categories itself
    risingStars: mostImproved(standings, prevStandings).map(risingStarLine),
    ribs: fallOffs(overall, prevOverall).map((f) => ribLine(f, rng)),
    momentsLine: momentsLine(details),
    participants: overall.map((o) => o.userId),
    closeLine: closeLine(rng),
  });
}
