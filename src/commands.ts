import type { GuildMember } from "discord.js";
import type { Pool } from "./db/pool.js";
import type { Config } from "./config.js";
import type { Renderer, LoggedLine, Reply } from "./renderer/types.js";
import type { ParseResult, LogResultRow } from "./types.js";
import { unitFor } from "./categories.js";
import { isHypeRequest, randomHypePhrase } from "./hype.js";
import { buildScoreboardEmbed, buildCategoryBoardEmbed, buildStatsCardEmbed, buildCeremonyEmbed } from "./scoreboard.js";
import { lastCompletedMonth } from "./deltas.js";
import { isHype, powerMeter } from "./scoring.js";
import { parseAdminCommand, isAdmin, executeAdmin } from "./admin.js";
import { insertEntries, getCurrentMonthCombinedTotal, getCurrentGoal, getCumulativeMonthlySeries, getGroupMonthlyByUser, getOverallStandings, getMonthEntryCount, getUserMonthCategoryCount, insertAchievement, type CumulativeSeriesRow, type UserMonthQtyRow } from "./db/queries.js";
import type { ConverseInput } from "./converse.js";
import { categoryViewOf, boardCategoryOf, parseStatsRequest, isHelpRequest, parseChartRequest, isInsightsRequest } from "./views.js";
import { parseTimeWindow } from "./timewindow.js";
import { buildRaceReply, buildTrendReply, buildMonthsReply } from "./chart/build.js";
import { buildInsightsEmbed } from "./insights.js";
import { evaluateAchievements, type AchievementContext } from "./achievements.js";

export interface MentionCtx {
  renderer: Renderer;
  config: Pick<Config, "guildId" | "timezone" | "adminRoleIds" | "roastUserId" | "roastNickname">;
  pool: Pool;
  parse: (rest: string) => Promise<ParseResult>;
  db?: {
    insertEntries: typeof insertEntries;
    getCurrentMonthCombinedTotal: typeof getCurrentMonthCombinedTotal;
    getCurrentGoal: typeof getCurrentGoal;
    getMonthEntryCount: typeof getMonthEntryCount;
    getUserMonthCategoryCount: typeof getUserMonthCategoryCount;
    insertAchievement: typeof insertAchievement;
  };
  member: GuildMember;
  authorId: string;
  authorName: string;
  messageId: string | null;
  now?: () => Date;
  converse?: (input: ConverseInput) => Promise<string>;
  fetchRecentMessages?: () => Promise<import("./converse.js").ConversationMessage[]>;
  rng?: () => number;
}

export type { Reply } from "./renderer/types.js";

/** True if the text is asking for the standings/scoreboard. */
export function isScoreboardRequest(text: string): boolean {
  return /^(board|scoreboard|standings|leaderboard|scores|ranks?|rankings)\b/i.test(text.trim());
}

/** Bulk-resolve user ids → display names via the guild member cache (fetch the misses). Never throws. */
export async function resolveNames(member: GuildMember, ids: string[]): Promise<Map<string, string>> {
  const guild = member.guild;
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const id of ids) {
    const cached = guild.members.cache.get(id);
    if (cached) out.set(id, cached.displayName);
    else missing.push(id);
  }
  if (missing.length) {
    try {
      const fetched = await guild.members.fetch({ user: missing });
      for (const [id, m] of fetched) out.set(id, m.displayName);
    } catch { /* fall through to fallback labels */ }
  }
  for (const id of ids) if (!out.has(id)) out.set(id, `@${id.slice(0, 6)}`);
  return out;
}

type DbBag = NonNullable<MentionCtx["db"]>;

/** Build the achievement context from this log, evaluate, write newly-earned rows, return flare lines.
 *  Wrapped so a detection failure NEVER breaks the log reply. `groupMonthAfter` is the post-log group total. */
async function awardAchievements(ctx: MentionCtx, db: DbBag, rows: LogResultRow[], groupMonthAfter: number): Promise<string[]> {
  try {
    const now = (ctx.now ?? (() => new Date()))();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: ctx.config.timezone, year: "numeric", month: "2-digit" }).formatToParts(now);
    const periodKey = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
    const loggedQty = rows.reduce((s, r) => s + r.quantity, 0);
    const [monthCount, userCats] = await Promise.all([
      db.getMonthEntryCount(ctx.pool, ctx.config.guildId, ctx.config.timezone),
      db.getUserMonthCategoryCount(ctx.pool, ctx.config.guildId, ctx.config.timezone, ctx.authorId),
    ]);
    const context: AchievementContext = {
      userId: ctx.authorId,
      periodKey,
      logged: rows.map((r) => ({ category: r.category, quantity: r.quantity, monthTotalAfter: r.userMonthlyTotal })),
      groupMonthBefore: groupMonthAfter - loggedQty,
      groupMonthAfter,
      monthEntryCountBefore: monthCount - rows.length,
      userCategoriesAfter: userCats,
      addedNewCategory: rows.some((r) => r.userMonthlyTotal === r.quantity),
    };
    const flares: string[] = [];
    for (const a of evaluateAchievements(context)) {
      const earned = await db.insertAchievement(ctx.pool, {
        guildId: ctx.config.guildId,
        userId: a.scope === "group" ? null : ctx.authorId,
        key: a.key,
        periodKey,
      });
      if (earned) flares.push(a.flare);
    }
    return flares;
  } catch (e) {
    console.error("[pumpdragon] achievement detection error:", e);
    return [];
  }
}

async function converseReply(ctx: MentionCtx, text: string): Promise<Reply> {
  if (!ctx.converse) {
    return { content: `🐉 didn't catch that — try e.g. "50 pushups and 20 min cardio".` };
  }
  const rng = ctx.rng ?? Math.random;
  const roastUserId = ctx.config.roastUserId ?? null;
  const isRoastTarget = roastUserId !== null && ctx.authorId === roastUserId;
  const includeJab = roastUserId !== null && !isRoastTarget && rng() < 0.25;
  const overall = await getOverallStandings(ctx.pool, ctx.config.guildId, ctx.config.timezone, { kind: "allTime" });
  const speakerTotal = overall.find((r) => r.userId === ctx.authorId)?.total ?? 0;
  const leader = overall[0] ?? null;
  const leaderName = leader ? (await resolveNames(ctx.member, [leader.userId])).get(leader.userId) ?? null : null;
  const transcript = ctx.fetchRecentMessages ? await ctx.fetchRecentMessages() : [];
  const reply = await ctx.converse({
    message: text,
    speakerName: ctx.authorName,
    isRoastTarget,
    includeJab,
    roastNickname: ctx.config.roastNickname ?? null,
    speakerTotal,
    leaderName,
    leaderTotal: leader?.total ?? 0,
    transcript,
  });
  return { content: reply };
}

export async function handleMention(rest: string, ctx: MentionCtx): Promise<Reply> {
  const db = ctx.db ?? { insertEntries, getCurrentMonthCombinedTotal, getCurrentGoal, getMonthEntryCount, getUserMonthCategoryCount, insertAchievement };
  const text = rest.trim();

  if (text === "" || text.toLowerCase() === "ping") {
    return { content: "🐉 RAWR. I'm awake and counting your reps." };
  }

  if (text.toLowerCase().startsWith("admin")) {
    if (!isAdmin(ctx.member, ctx.config.adminRoleIds)) {
      return { content: "🐉 admins only, brother. nice try." };
    }
    const parsed = parseAdminCommand(text);
    if (!parsed.ok) return { content: parsed.error };
    if (parsed.command.kind === "closeMonth") {
      const now = (ctx.now ?? (() => new Date()))();
      const target = parsed.command.month ?? lastCompletedMonth(now, ctx.config.timezone);
      return { embed: await buildCeremonyEmbed(ctx.pool, ctx.config, ctx.renderer, target) };
    }
    // existing call — preserve the exact object it passes today (do NOT paste a placeholder):
    const msg = await executeAdmin(parsed.command, {
      pool: ctx.pool, guildId: ctx.config.guildId, timezone: ctx.config.timezone, actorId: ctx.authorId,
    });
    return { content: msg };
  }

  if (isHypeRequest(text)) {
    return { content: randomHypePhrase() };
  }

  if (isHelpRequest(text)) {
    return { embed: ctx.renderer.help({ isAdmin: isAdmin(ctx.member, ctx.config.adminRoleIds) }) };
  }

  const cat = categoryViewOf(text);
  if (cat) {
    return { embed: await buildCategoryBoardEmbed(ctx.pool, ctx.config, ctx.renderer, cat, `🐉 ${cat} — this month`) };
  }

  const stats = parseStatsRequest(text);
  if (stats) {
    // NOTE: stats always shows the current month; windowed stats (e.g. "stats @user last month") not yet supported.
    const userId = stats.self ? ctx.authorId : stats.userId;
    const name = stats.self
      ? ctx.authorName
      : await ctx.member.guild.members.fetch(userId).then((m) => m.displayName).catch(() => "that warrior");
    return { embed: await buildStatsCardEmbed(ctx.pool, ctx.config, ctx.renderer, userId, name) };
  }

  if (isInsightsRequest(text)) {
    return { embed: await buildInsightsEmbed(ctx.pool, ctx.config, (ctx.now ?? (() => new Date()))()) };
  }

  const chart = parseChartRequest(text);
  if (chart) {
    const now = (ctx.now ?? (() => new Date()))();
    if (chart.kind === "mychart") {
      return await buildTrendReply(ctx.pool, ctx.config, chart.category, ctx.authorId, ctx.authorName, now);
    }
    // race + months need display-name labels for the people they plot
    const rows = chart.kind === "race"
      ? await getCumulativeMonthlySeries(ctx.pool, ctx.config.guildId, ctx.config.timezone, chart.category)
      : await getGroupMonthlyByUser(ctx.pool, ctx.config.guildId, ctx.config.timezone, chart.category);
    const names = await resolveNames(ctx.member, [...new Set(rows.map((r) => r.userId))]);
    return chart.kind === "race"
      ? await buildRaceReply(ctx.pool, ctx.config, chart.category, names, now, rows as CumulativeSeriesRow[])
      : await buildMonthsReply(ctx.pool, ctx.config, chart.category, names, now, rows as UserMonthQtyRow[]);
  }

  // "board pushups" / "scoreboard cardio" → that single category's board (must precede the generic board match)
  const boardCat = boardCategoryOf(text);
  if (boardCat) {
    return { embed: await buildCategoryBoardEmbed(ctx.pool, ctx.config, ctx.renderer, boardCat, `🐉 ${boardCat} — this month`) };
  }

  const now = (ctx.now ?? (() => new Date()))();
  const win = parseTimeWindow(text, now);
  // bare relative windows (last month / year / alltime) route; a bare month name needs an explicit board word
  if (isScoreboardRequest(text) || (win !== null && win.kind !== "namedMonth")) {
    const window = win ?? { kind: "thisMonth" as const };
    // strip any leading board-word so the title reads "scoreboard — last month", not "— board last month"
    const windowLabel = text.trim().replace(/^(board|scoreboard|standings|leaderboard)\s+/i, "");
    const label = window.kind === "thisMonth" ? "🐉 scoreboard" : `🐉 scoreboard — ${windowLabel}`;
    return { embed: await buildScoreboardEmbed(ctx.pool, ctx.config, ctx.renderer, label, window) };
  }

  const parsed = await ctx.parse(text);
  if (parsed.items.length === 0) {
    return await converseReply(ctx, text);
  }

  const rows = await db.insertEntries(ctx.pool, {
    guildId: ctx.config.guildId, userId: ctx.authorId, messageId: ctx.messageId, items: parsed.items, timezone: ctx.config.timezone,
  });
  if (rows.length === 0) return {};

  const hypeRow = rows.find((r) => isHype(r.quantity, r.trailingAverage, r.priorCount));
  const logged: LoggedLine[] = rows.map((r) => ({
    category: r.category, quantity: r.quantity, userMonthlyTotal: r.userMonthlyTotal, unit: unitFor(r.category),
  }));

  const [total, goal] = await Promise.all([
    db.getCurrentMonthCombinedTotal(ctx.pool, ctx.config.guildId, ctx.config.timezone),
    db.getCurrentGoal(ctx.pool, ctx.config.guildId, ctx.config.timezone),
  ]);
  const pm = powerMeter(total, goal);
  const achievements = await awardAchievements(ctx, db, rows, total);

  const embed = ctx.renderer.logReply({
    loggedBy: ctx.authorName,
    logged,
    unparsed: parsed.unparsed,
    hypeLine: hypeRow ? randomHypePhrase(Math.random, hypeRow.detail) : null,
    powerMeterText: pm.text,
    achievements,
  });
  return { embed };
}
