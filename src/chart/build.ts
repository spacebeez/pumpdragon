import { EmbedBuilder } from "discord.js";
import type { Pool } from "../db/pool.js";
import type { Config } from "../config.js";
import type { Reply } from "../renderer/types.js";
import { unitFor, type Category } from "../categories.js";
import { getCumulativeMonthlySeries, getUserMonthlySeries, getGroupMonthlyByUser, type CumulativeSeriesRow, type UserMonthQtyRow } from "../db/queries.js";
import { buildMonthAxis, buildRaceSeries, buildTrendSeries, buildStackedMonths } from "./series.js";
import { lastCompletedMonth } from "../deltas.js";
import { renderRaceChart } from "./raceChart.js";
import { renderTrendChart } from "./trendChart.js";
import { renderMonthsChart } from "./monthsChart.js";

const DRAGON_COLOR = 0xc0392b;
const STACK_TOP_N = 7;

const raceTitle = (c: Category) => `⚔️ THE ${c.toUpperCase()} ASCENSION`;
const monthsTitle = (c: Category) => `🔥 WHO CARRIED THE FLAME — ${c} by month`;

function imageReply(title: string, name: string, buffer: Buffer): Reply {
  const embed = new EmbedBuilder().setColor(DRAGON_COLOR).setTitle(title).setImage(`attachment://${name}`);
  return { embed, files: [{ name, buffer }] };
}

/** Axis end = the last COMPLETED month (in the configured tz), so a barely-started current month
 *  doesn't cliff the trend / plateau the race. Never earlier than `minMonth` (covers the rare case
 *  where every data point is in the current month — then the axis is just that single month). */
function axisEndKey(now: Date, tz: string, minMonth: string): string {
  const m = lastCompletedMonth(now, tz);
  const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
  return key < minMonth ? minMonth : key;
}

type Cfg = Pick<Config, "guildId" | "timezone">;
type Names = Map<string, string>;

export async function buildRaceReply(pool: Pool, config: Cfg, category: Category, names: Names, now: Date, prefetchedRows?: CumulativeSeriesRow[]): Promise<Reply> {
  const rows = prefetchedRows ?? await getCumulativeMonthlySeries(pool, config.guildId, config.timezone, category);
  if (rows.length === 0) return { content: `🐉 no ${category} history yet — go forge some and I'll chart your climb.` };
  const minMonth = rows.reduce((min, r) => (r.month < min ? r.month : min), rows[0]!.month);
  const axis = buildMonthAxis(minMonth, axisEndKey(now, config.timezone, minMonth));
  const lines = buildRaceSeries(rows, axis);
  const buf = renderRaceChart({ axis, lines, names, title: raceTitle(category), unit: unitFor(category) });
  return imageReply(raceTitle(category), "race.png", buf);
}

export async function buildTrendReply(pool: Pool, config: Cfg, category: Category, userId: string, displayName: string, now: Date): Promise<Reply> {
  const rows = await getUserMonthlySeries(pool, config.guildId, config.timezone, userId, category);
  if (rows.length === 0) return { content: `🐉 no ${category} logged for you yet — every legend starts at rep one.` };
  const axis = buildMonthAxis(rows[0]!.month, axisEndKey(now, config.timezone, rows[0]!.month));
  const values = buildTrendSeries(rows, axis);
  const title = `🐲 ${displayName.toUpperCase()}'S RISE`;
  const buf = renderTrendChart({ axis, values, title: displayName, subtitle: category, unit: unitFor(category) });
  return imageReply(title, "mychart.png", buf);
}

export async function buildMonthsReply(pool: Pool, config: Cfg, category: Category, names: Names, now: Date, prefetchedRows?: UserMonthQtyRow[]): Promise<Reply> {
  const rows = prefetchedRows ?? await getGroupMonthlyByUser(pool, config.guildId, config.timezone, category);
  if (rows.length === 0) return { content: `🐉 no ${category} history yet — the chronicle is unwritten.` };
  const minMonth = rows.reduce((min, r) => (r.month < min ? r.month : min), rows[0]!.month);
  const axis = buildMonthAxis(minMonth, axisEndKey(now, config.timezone, minMonth));
  const { users, perMonth } = buildStackedMonths(rows, axis, STACK_TOP_N);
  const buf = renderMonthsChart({ axis, users, perMonth, names, title: monthsTitle(category), unit: unitFor(category) });
  return imageReply(monthsTitle(category), "months.png", buf);
}

/** Collect the distinct user ids a chart needs labels for. */
export function idsForRace(rows: { userId: string }[]): string[] { return [...new Set(rows.map((r) => r.userId))]; }
