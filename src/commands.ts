import type { GuildMember } from "discord.js";
import type { Pool } from "./db/pool.js";
import type { Config } from "./config.js";
import type { Renderer, LoggedLine, Reply } from "./renderer/types.js";
import type { ParseResult, LogResultRow } from "./types.js";
import { unitFor, type Category } from "./categories.js";
import { isHypeRequest, randomHypePhrase } from "./hype.js";
import { buildScoreboardEmbed, buildCategoryBoardEmbed, buildStatsCardEmbed, buildCeremonyEmbed, buildAchievementsEmbed } from "./scoreboard.js";
import { lastCompletedMonth } from "./deltas.js";
import { isHype, powerMeter } from "./scoring.js";
import { parseAdminCommand, isAdmin, executeAdmin } from "./admin.js";
import { insertEntries, getCurrentMonthCombinedTotal, getCurrentGoal, getCumulativeMonthlySeries, getGroupMonthlyByUser, getOverallStandings, getMonthEntryCount, getUserMonthCategoryCount, insertAchievement, getStandings, getUserPrevEntryTime, type CumulativeSeriesRow, type UserMonthQtyRow } from "./db/queries.js";
import type { ConverseInput, ConverseResult, CommandDirective } from "./converse.js";
import { categoryViewOf, boardCategoryOf, parseStatsRequest, parseAchievementsRequest, isHelpRequest, parseChartRequest, isInsightsRequest, type StatsRequest, type ChartKind } from "./views.js";
import { parseTimeWindow, type TimeWindow } from "./timewindow.js";
import { buildRaceReply, buildTrendReply, buildMonthsReply } from "./chart/build.js";
import { buildInsightsEmbed } from "./insights.js";
import { evaluateAchievements, type AchievementContext, type Award } from "./achievements.js";
import { photoMoodForAwards, renderPhoto, createCooldownGate, isTinySubmission, ZEN_PHOTO_CHANCE, type PhotoMood, type PhotoFile } from "./photos.js";

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
    getStandings: typeof getStandings;
    getUserPrevEntryTime: typeof getUserPrevEntryTime;
  };
  member: GuildMember;
  authorId: string;
  authorName: string;
  messageId: string | null;
  now?: () => Date;
  converse?: (input: ConverseInput) => Promise<ConverseResult>;
  fetchRecentMessages?: () => Promise<import("./converse.js").ConversationMessage[]>;
  rng?: () => number;
  renderPhoto?: (mood: PhotoMood, rng: () => number) => Promise<PhotoFile | null>;
  magicPhotoGate?: { allow(now: Date, rng: () => number): boolean };
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

const defaultMagicGate = createCooldownGate({ chance: 0.2, cooldownMs: 15 * 60_000 });

/** Build the achievement context from this log, evaluate, write newly-earned rows, return flare lines.
 *  Wrapped so a detection failure NEVER breaks the log reply. `groupMonthAfter` is the post-log group total.
 *  `prevEntryTime` is the user's most recent entry timestamp captured BEFORE this log's insert. */
async function awardAchievements(ctx: MentionCtx, db: DbBag, rows: LogResultRow[], groupMonthAfter: number, prevEntryTime: Date | null): Promise<{ flares: string[]; photoMood: PhotoMood | null }> {
  try {
    const now = (ctx.now ?? (() => new Date()))();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: ctx.config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const yr = parts.find((p) => p.type === "year")!.value;
    const mo = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    const periodKey = `${yr}-${mo}`;
    const localDateKey = `${yr}-${mo}-${day}`;
    const loggedHourLocal = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: ctx.config.timezone, hour: "2-digit", hourCycle: "h23" }).format(now), 10);
    const daysSincePrevEntry = prevEntryTime ? Math.floor((now.getTime() - prevEntryTime.getTime()) / 86_400_000) : null;
    const loggedQty = rows.reduce((s, r) => s + r.quantity, 0);

    const [monthCount, userCats, standings] = await Promise.all([
      db.getMonthEntryCount(ctx.pool, ctx.config.guildId, ctx.config.timezone),
      db.getUserMonthCategoryCount(ctx.pool, ctx.config.guildId, ctx.config.timezone, ctx.authorId),
      db.getStandings(ctx.pool, ctx.config.guildId, ctx.config.timezone),
    ]);

    // Reconstruct the per-category #1 BEFORE this log by subtracting the logger's delta from their standing.
    const priorCategoryLeader: Partial<Record<Category, { userId: string; total: number }>> = {};
    for (const r of rows) {
      const catRows = standings.filter((s) => s.category === r.category);
      let best: { userId: string; total: number } | null = null;
      for (const s of catRows) {
        const before = s.userId === ctx.authorId ? s.total - r.quantity : s.total;
        if (before > 0 && (!best || before > best.total)) best = { userId: s.userId, total: before };
      }
      if (best) priorCategoryLeader[r.category] = best;
    }

    const context: AchievementContext = {
      userId: ctx.authorId,
      periodKey,
      logged: rows.map((r) => ({ category: r.category, quantity: r.quantity, monthTotalAfter: r.userMonthlyTotal })),
      groupMonthBefore: groupMonthAfter - loggedQty,
      groupMonthAfter,
      monthEntryCountBefore: monthCount - rows.length,
      userCategoriesAfter: userCats,
      addedNewCategory: rows.some((r) => r.userMonthlyTotal === r.quantity),
      loggedHourLocal,
      localDateKey,
      daysSincePrevEntry,
      priorCategoryLeader,
    };
    const flares: string[] = [];
    const earned: Award[] = [];
    for (const a of evaluateAchievements(context)) {
      const created = await db.insertAchievement(ctx.pool, {
        guildId: ctx.config.guildId,
        userId: a.scope === "group" ? null : ctx.authorId,
        key: a.key,
        periodKey: a.periodKey ?? periodKey,
      });
      if (created) { flares.push(a.flare); earned.push(a); }
    }
    return { flares, photoMood: photoMoodForAwards(earned, ctx.rng ?? Math.random) };
  } catch (e) {
    console.error("[pumpdragon] achievement detection error:", e);
    return { flares: [], photoMood: null };
  }
}

function scoreboardLabelFor(w: TimeWindow): string {
  if (w.kind === "lastMonth") return "🐉 scoreboard — last month";
  if (w.kind === "allTime") return "🐉 scoreboard — all time";
  return "🐉 scoreboard";
}

function resolveStatsTarget(raw: string | null): StatsRequest {
  if (!raw) return { self: true };
  const m = raw.match(/<@!?(\d+)>/);
  return m ? { self: false, userId: m[1]! } : { self: true };
}

/** Map a validated NL directive onto the shared view helpers (safe defaults, never a dead-end). */
async function runDirective(ctx: MentionCtx, d: CommandDirective, now: Date): Promise<Reply> {
  switch (d.view) {
    case "scoreboard": {
      const window = d.window ?? { kind: "thisMonth" as const };
      return await showScoreboard(ctx, window, scoreboardLabelFor(window));
    }
    case "category_board":
      return d.category
        ? await showCategoryBoard(ctx, d.category)
        : await showScoreboard(ctx, { kind: "thisMonth" }, scoreboardLabelFor({ kind: "thisMonth" }));
    case "stats":
      return await showStats(ctx, resolveStatsTarget(d.statsTarget));
    case "chart":
      return await showChart(ctx, d.chartKind ?? "race", d.category ?? "pushups", now);
    case "insights":
      return await showInsights(ctx, now);
    case "help":
      return showHelp(ctx);
    case "achievements":
      return await showAchievements(ctx, resolveStatsTarget(d.statsTarget));
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
  const result = await ctx.converse({
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
  if (result.kind === "command") {
    return await runDirective(ctx, result.directive, (ctx.now ?? (() => new Date()))());
  }
  const reply: Reply = { content: result.text };
  if ((isRoastTarget || includeJab) && (ctx.magicPhotoGate ?? defaultMagicGate).allow((ctx.now ?? (() => new Date()))(), rng)) {
    const photo = await (ctx.renderPhoto ?? renderPhoto)("weak", rng);
    if (photo) reply.files = [photo];
  }
  return reply;
}

async function showScoreboard(ctx: MentionCtx, window: TimeWindow, label: string): Promise<Reply> {
  return { embed: await buildScoreboardEmbed(ctx.pool, ctx.config, ctx.renderer, label, window) };
}

async function showCategoryBoard(ctx: MentionCtx, cat: Category): Promise<Reply> {
  return { embed: await buildCategoryBoardEmbed(ctx.pool, ctx.config, ctx.renderer, cat, `🐉 ${cat} — this month`) };
}

async function showStats(ctx: MentionCtx, target: StatsRequest): Promise<Reply> {
  const userId = target.self ? ctx.authorId : target.userId;
  const name = target.self
    ? ctx.authorName
    : await ctx.member.guild.members.fetch(userId).then((m) => m.displayName).catch(() => "that warrior");
  return { embed: await buildStatsCardEmbed(ctx.pool, ctx.config, ctx.renderer, userId, name) };
}

async function showChart(ctx: MentionCtx, kind: ChartKind, category: Category, now: Date): Promise<Reply> {
  if (kind === "mychart") {
    return await buildTrendReply(ctx.pool, ctx.config, category, ctx.authorId, ctx.authorName, now);
  }
  const rows = kind === "race"
    ? await getCumulativeMonthlySeries(ctx.pool, ctx.config.guildId, ctx.config.timezone, category)
    : await getGroupMonthlyByUser(ctx.pool, ctx.config.guildId, ctx.config.timezone, category);
  const names = await resolveNames(ctx.member, [...new Set(rows.map((r) => r.userId))]);
  return kind === "race"
    ? await buildRaceReply(ctx.pool, ctx.config, category, names, now, rows as CumulativeSeriesRow[])
    : await buildMonthsReply(ctx.pool, ctx.config, category, names, now, rows as UserMonthQtyRow[]);
}

async function showInsights(ctx: MentionCtx, now: Date): Promise<Reply> {
  return { embed: await buildInsightsEmbed(ctx.pool, ctx.config, now) };
}

async function showAchievements(ctx: MentionCtx, target: StatsRequest): Promise<Reply> {
  const userId = target.self ? ctx.authorId : target.userId;
  const name = target.self
    ? ctx.authorName
    : await ctx.member.guild.members.fetch(userId).then((m) => m.displayName).catch(() => "that warrior");
  return { embed: await buildAchievementsEmbed(ctx.pool, ctx.config, ctx.renderer, userId, name) };
}

function showHelp(ctx: MentionCtx): Reply {
  return { embed: ctx.renderer.help({ isAdmin: isAdmin(ctx.member, ctx.config.adminRoleIds) }) };
}

export async function handleMention(rest: string, ctx: MentionCtx): Promise<Reply> {
  const db = ctx.db ?? { insertEntries, getCurrentMonthCombinedTotal, getCurrentGoal, getMonthEntryCount, getUserMonthCategoryCount, insertAchievement, getStandings, getUserPrevEntryTime };
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
    return showHelp(ctx);
  }

  const cat = categoryViewOf(text);
  if (cat) {
    return await showCategoryBoard(ctx, cat);
  }

  const stats = parseStatsRequest(text);
  if (stats) {
    // NOTE: stats always shows the current month; windowed stats (e.g. "stats @user last month") not yet supported.
    return await showStats(ctx, stats);
  }

  const ach = parseAchievementsRequest(text);
  if (ach) {
    return await showAchievements(ctx, ach);
  }

  if (isInsightsRequest(text)) {
    return await showInsights(ctx, (ctx.now ?? (() => new Date()))());
  }

  const chart = parseChartRequest(text);
  if (chart) {
    return await showChart(ctx, chart.kind, chart.category, (ctx.now ?? (() => new Date()))());
  }

  // "board pushups" / "scoreboard cardio" → that single category's board (must precede the generic board match)
  const boardCat = boardCategoryOf(text);
  if (boardCat) {
    return await showCategoryBoard(ctx, boardCat);
  }

  const now = (ctx.now ?? (() => new Date()))();
  const win = parseTimeWindow(text, now);
  // bare relative windows (last month / year / alltime) route; a bare month name needs an explicit board word
  if (isScoreboardRequest(text) || (win !== null && win.kind !== "namedMonth")) {
    const window = win ?? { kind: "thisMonth" as const };
    // strip any leading board-word so the title reads "scoreboard — last month", not "— board last month"
    const windowLabel = text.trim().replace(/^(board|scoreboard|standings|leaderboard)\s+/i, "");
    const label = window.kind === "thisMonth" ? "🐉 scoreboard" : `🐉 scoreboard — ${windowLabel}`;
    return await showScoreboard(ctx, window, label);
  }

  const parsed = await ctx.parse(text);
  if (parsed.items.length === 0) {
    return await converseReply(ctx, text);
  }

  const prevEntryTime = await db.getUserPrevEntryTime(ctx.pool, ctx.config.guildId, ctx.authorId).catch(() => null);
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
  const { flares, photoMood } = await awardAchievements(ctx, db, rows, total, prevEntryTime);

  const embed = ctx.renderer.logReply({
    loggedBy: ctx.authorName,
    logged,
    unparsed: parsed.unparsed,
    hypeLine: hypeRow ? randomHypePhrase(Math.random, hypeRow.detail) : null,
    powerMeterText: pm.text,
    achievements: flares,
  });
  // Priority: achievement pic > weak clown on a tiny submission (<10 push/cardio/core) > rare zen drop.
  let mood: PhotoMood | null = photoMood;
  if (!mood && rows.some((r) => isTinySubmission(r.category, r.quantity))) {
    mood = "weak";
  }
  if (!mood && rows.some((r) => r.category === "core" || r.category === "cardio") && (ctx.rng ?? Math.random)() < ZEN_PHOTO_CHANCE) {
    mood = "zen";
  }
  const photo = mood ? await (ctx.renderPhoto ?? renderPhoto)(mood, ctx.rng ?? Math.random) : null;
  return photo ? { embed, files: [photo] } : { embed };
}
