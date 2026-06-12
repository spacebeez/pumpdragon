import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import {
  insertEntries, getCurrentMonthCombinedTotal, getCurrentGoal, setGoal, getStandings,
  getOverallStandings, insertAdminEntry, getGoalForMonth, getRecentDetails, insertImportRows,
  getCumulativeMonthlySeries, getUserMonthlySeries, getGroupMonthlyByUser,
  getMonthEntryCount, getUserMonthCategoryCount, insertAchievement, getUserPrevEntryTime,
} from "../src/db/queries.js";

const url = process.env.DATABASE_URL_TEST ?? "postgres://pumpdragon:pumpdragon@localhost:5433/pumpdragon_test";
const pool = createPool(url);
const TZ = "America/Chicago";
const G = "guild1";

beforeAll(async () => {
  await runMigrations(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE entries; TRUNCATE achievements; DELETE FROM monthly_goals;");
});

describe("insertEntries", () => {
  it("inserts and reports the user's new monthly total", async () => {
    const rows = await insertEntries(pool, { guildId: G, userId: "u1", messageId: "m1", items: [{ category: "pushups", quantity: 50, detail: null }], timezone: TZ });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe("pushups");
    expect(rows[0]!.userMonthlyTotal).toBe(50);
    expect(rows[0]!.priorCount).toBe(0);
  });

  it("dedups a re-delivered message (same message_id+category)", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: "dup", items: [{ category: "cardio", quantity: 10, detail: null }], timezone: TZ });
    const second = await insertEntries(pool, { guildId: G, userId: "u1", messageId: "dup", items: [{ category: "cardio", quantity: 10, detail: null }], timezone: TZ });
    expect(second).toHaveLength(0);
    expect(await getCurrentMonthCombinedTotal(pool, G, TZ)).toBe(10);
  });

  it("computes trailing average over prior user+category entries", async () => {
    for (const q of [10, 20, 30]) {
      await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: q, detail: null }], timezone: TZ });
    }
    const rows = await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 100, detail: null }], timezone: TZ });
    expect(rows[0]!.priorCount).toBe(3);
    expect(rows[0]!.trailingAverage).toBe(20);
  });
});

describe("goals", () => {
  it("round-trips the current month's goal", async () => {
    expect(await getCurrentGoal(pool, G, TZ)).toBeNull();
    await setGoal(pool, G, TZ, 2000);
    expect(await getCurrentGoal(pool, G, TZ)).toBe(2000);
  });
});

describe("admin entries and standings", () => {
  it("admin remove (negative) reduces the combined total but not trailing average", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 100, detail: null }], timezone: TZ });
    await insertAdminEntry(pool, { guildId: G, targetUserId: "u1", category: "pushups", quantity: -40, source: "admin_remove", note: "correction" });
    expect(await getCurrentMonthCombinedTotal(pool, G, TZ)).toBe(60);

    const rows = await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 1, detail: null }], timezone: TZ });
    expect(rows[0]!.trailingAverage).toBe(100);
    expect(rows[0]!.priorCount).toBe(1);
  });

  it("getStandings returns per-category per-user totals", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "core", quantity: 15, detail: null }], timezone: TZ });
    await insertEntries(pool, { guildId: G, userId: "u2", messageId: null, items: [{ category: "core", quantity: 25, detail: null }], timezone: TZ });
    const s = await getStandings(pool, G, TZ);
    const core = s.filter((r) => r.category === "core");
    expect(core.find((r) => r.userId === "u2")!.total).toBe(25);
  });

  it("getOverallStandings ranks users by their summed total across all categories", async () => {
    // u1: 100 pushups + 50 cardio = 150 ; u2: 80 core = 80
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 100, detail: null }, { category: "cardio", quantity: 50, detail: null }], timezone: TZ });
    await insertEntries(pool, { guildId: G, userId: "u2", messageId: null, items: [{ category: "core", quantity: 80, detail: null }], timezone: TZ });
    const overall = await getOverallStandings(pool, G, TZ);
    expect(overall).toEqual([
      { userId: "u1", total: 150 },
      { userId: "u2", total: 80 },
    ]);
  });
});

describe("time-window queries", () => {
  it("getStandings(thisMonth) returns current-month rows", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "core", quantity: 15, detail: null }], timezone: TZ });
    const s = await getStandings(pool, G, TZ, { kind: "thisMonth" });
    expect(s.find((r) => r.category === "core" && r.userId === "u1")!.total).toBe(15);
  });

  it("getStandings(lastMonth) excludes current-month rows", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "core", quantity: 15, detail: null }], timezone: TZ });
    expect((await getStandings(pool, G, TZ, { kind: "lastMonth" })).filter((r) => r.category === "core")).toHaveLength(0);
  });

  it("getStandings(allTime) includes a back-dated row that thisMonth excludes", async () => {
    await pool.query(
      `INSERT INTO entries (guild_id, discord_user_id, category, quantity, source, created_at)
       VALUES ($1,'u9','pullups',7,'user', now() - interval '6 months')`, [G]);
    const all = await getStandings(pool, G, TZ, { kind: "allTime" });
    const month = await getStandings(pool, G, TZ, { kind: "thisMonth" });
    expect(all.find((r) => r.userId === "u9")!.total).toBe(7);
    expect(month.find((r) => r.userId === "u9")).toBeUndefined();
  });

  it("getCurrentMonthCombinedTotal accepts a window", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "core", quantity: 15, detail: null }], timezone: TZ });
    expect(await getCurrentMonthCombinedTotal(pool, G, TZ, { kind: "thisMonth" })).toBe(15);
    expect(await getCurrentMonthCombinedTotal(pool, G, TZ, { kind: "lastMonth" })).toBe(0);
  });
});

describe("detail storage", () => {
  it("persists and returns the item detail", async () => {
    const rows = await insertEntries(pool, { guildId: G, userId: "u1", messageId: "md", items: [{ category: "cardio", quantity: 20, detail: "trail running" }], timezone: TZ });
    expect(rows[0]!.detail).toBe("trail running");
    const db = await pool.query("SELECT detail FROM entries WHERE discord_user_id='u1' LIMIT 1");
    expect(db.rows[0]!.detail).toBe("trail running");
  });
});

describe("getGoalForMonth", () => {
  it("returns the goal for a specific month, or null", async () => {
    await setGoal(pool, G, TZ, 5000); // sets THIS month's goal
    // setGoal writes the current month; read it back via getGoalForMonth using the current y/m
    const now = new Date();
    const y = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(now));
    const m = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric" }).format(now));
    expect(await getGoalForMonth(pool, G, y, m)).toBe(5000);
    expect(await getGoalForMonth(pool, G, 2000, 1)).toBeNull();
  });
});

describe("getRecentDetails", () => {
  it("returns distinct recent (user, detail) moments in the window, most recent first", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "cardio", quantity: 20, detail: "trail running" }], timezone: TZ });
    await insertEntries(pool, { guildId: G, userId: "u2", messageId: null, items: [{ category: "lifting", quantity: 30, detail: "bench press" }], timezone: TZ });
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 40, detail: null }], timezone: TZ });
    const moments = await getRecentDetails(pool, G, TZ, { kind: "thisMonth" });
    const set = new Set(moments.map((d) => `${d.userId}:${d.detail}`));
    expect(set.has("u1:trail running")).toBe(true);
    expect(set.has("u2:bench press")).toBe(true);
    expect(moments.every((d) => d.detail !== null)).toBe(true);
  });

  it("collapses a repeated (user, detail) pair to a single moment", async () => {
    for (const q of [10, 12, 15]) {
      await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "cardio", quantity: q, detail: "trail running" }], timezone: TZ });
    }
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "core", quantity: 5, detail: "yoga" }], timezone: TZ });
    const moments = await getRecentDetails(pool, G, TZ, { kind: "thisMonth" });
    const trail = moments.filter((d) => d.userId === "u1" && d.detail === "trail running");
    expect(trail).toHaveLength(1); // deduped despite 3 logs
    expect(moments.filter((d) => d.userId === "u1").map((d) => d.detail).sort()).toEqual(["trail running", "yoga"]);
  });

  it("caps the result at the given limit", async () => {
    for (const d of ["a", "b", "c", "d"]) {
      await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "cardio", quantity: 10, detail: d }], timezone: TZ });
    }
    expect(await getRecentDetails(pool, G, TZ, { kind: "thisMonth" }, 2)).toHaveLength(2);
  });
});

describe("insertImportRows", () => {
  it("inserts source='import' rows, back-dated, idempotent on (message_id, category)", async () => {
    const rows = [
      { messageId: "imp1", userId: "u1", category: "cardio" as const, quantity: 30, ts: "2025-03-15T10:00:00Z" },
      { messageId: "imp1", userId: "u1", category: "lifting" as const, quantity: 40, ts: "2025-03-15T10:00:00Z" }, // same msg, diff category → distinct
      { messageId: "imp2", userId: "u1", category: "pushups" as const, quantity: 50, ts: "2025-03-16T10:00:00Z" },
    ];
    expect(await insertImportRows(pool, G, rows)).toBe(3);
    expect(await insertImportRows(pool, G, rows)).toBe(0); // re-run → all conflicted
    const n = await pool.query("SELECT COUNT(*)::int AS n FROM entries WHERE source='import'");
    expect(n.rows[0]!.n).toBe(3);
    // the exact back-dated timestamp + source are stored (not now(), not 'user')
    const row = await pool.query("SELECT created_at, source FROM entries WHERE discord_message_id='imp2' AND category='pushups'");
    expect(new Date(row.rows[0]!.created_at).toISOString()).toBe("2025-03-16T10:00:00.000Z");
    expect(row.rows[0]!.source).toBe("import");
  });
});

async function seed(userId: string, category: string, qty: number, createdAt: string) {
  await pool.query(
    `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, created_at)
     VALUES ($1,$2,NULL,$3,$4,'import',$5)`,
    [G, userId, category, qty, createdAt],
  );
}

describe("getCumulativeMonthlySeries", () => {
  it("returns per-user running totals as YYYY-MM strings", async () => {
    await seed("u1", "pushups", 100, "2025-01-10T12:00:00Z");
    await seed("u1", "pushups", 50, "2025-02-10T12:00:00Z");
    await seed("u2", "pushups", 30, "2025-02-10T12:00:00Z");
    await seed("u1", "cardio", 999, "2025-02-10T12:00:00Z"); // other category — excluded
    const rows = await getCumulativeMonthlySeries(pool, G, TZ, "pushups");
    expect(rows).toContainEqual({ userId: "u1", month: "2025-01", cumulative: 100 });
    expect(rows).toContainEqual({ userId: "u1", month: "2025-02", cumulative: 150 });
    expect(rows).toContainEqual({ userId: "u2", month: "2025-02", cumulative: 30 });
  });
});

describe("getUserMonthlySeries", () => {
  it("returns one user's per-month (non-cumulative) totals for a category", async () => {
    await seed("u1", "cardio", 60, "2025-01-05T12:00:00Z");
    await seed("u1", "cardio", 40, "2025-01-20T12:00:00Z");
    await seed("u1", "cardio", 30, "2025-03-01T12:00:00Z");
    const rows = await getUserMonthlySeries(pool, G, TZ, "u1", "cardio");
    expect(rows).toEqual([{ month: "2025-01", qty: 100 }, { month: "2025-03", qty: 30 }]);
  });
});

describe("getGroupMonthlyByUser", () => {
  it("returns per-user monthly totals for a category, positive only", async () => {
    await seed("u1", "lifting", 20, "2025-01-05T12:00:00Z");
    await seed("u2", "lifting", 35, "2025-01-06T12:00:00Z");
    const rows = await getGroupMonthlyByUser(pool, G, TZ, "lifting");
    expect(rows).toContainEqual({ month: "2025-01", userId: "u1", qty: 20 });
    expect(rows).toContainEqual({ month: "2025-01", userId: "u2", qty: 35 });
  });
});

describe("getMonthEntryCount", () => {
  it("counts this month's entries for the guild", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 5, detail: null }], timezone: TZ });
    await insertEntries(pool, { guildId: G, userId: "u2", messageId: null, items: [{ category: "cardio", quantity: 5, detail: null }], timezone: TZ });
    expect(await getMonthEntryCount(pool, G, TZ)).toBe(2);
  });
});

describe("getUserMonthCategoryCount", () => {
  it("counts distinct categories the user has positive points in this month", async () => {
    await insertEntries(pool, { guildId: G, userId: "u1", messageId: null, items: [{ category: "pushups", quantity: 5, detail: null }, { category: "cardio", quantity: 5, detail: null }], timezone: TZ });
    expect(await getUserMonthCategoryCount(pool, G, TZ, "u1")).toBe(2);
    expect(await getUserMonthCategoryCount(pool, G, TZ, "u2")).toBe(0);
  });
});

describe("insertAchievement", () => {
  it("returns true the first time and false on a duplicate (per scope)", async () => {
    expect(await insertAchievement(pool, { guildId: G, userId: "u1", key: "milestone:pushups:500", periodKey: "2026-06" })).toBe(true);
    expect(await insertAchievement(pool, { guildId: G, userId: "u1", key: "milestone:pushups:500", periodKey: "2026-06" })).toBe(false);
    // a different period is a fresh award
    expect(await insertAchievement(pool, { guildId: G, userId: "u1", key: "milestone:pushups:500", periodKey: "2026-07" })).toBe(true);
  });
  it("dedups group rows (NULL user) by (key, period)", async () => {
    expect(await insertAchievement(pool, { guildId: G, userId: null, key: "over_9000", periodKey: "2026-06" })).toBe(true);
    expect(await insertAchievement(pool, { guildId: G, userId: null, key: "over_9000", periodKey: "2026-06" })).toBe(false);
  });
});

describe("getUserPrevEntryTime", () => {
  it("returns null when the user has no entries", async () => {
    expect(await getUserPrevEntryTime(pool, G, "nobody")).toBeNull();
  });
  it("returns the most recent created_at for the user", async () => {
    await pool.query(
      `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, created_at)
       VALUES ($1,'u1','e1','pushups',10,'user', now() - interval '5 days'),
              ($1,'u1','e2','pushups',10,'user', now() - interval '1 day')`,
      [G],
    );
    const t = await getUserPrevEntryTime(pool, G, "u1");
    expect(t).toBeInstanceOf(Date);
    // most recent is ~1 day ago, comfortably within the last 2 days
    expect(Date.now() - t!.getTime()).toBeLessThan(2 * 86_400_000);
  });
  it("ignores admin corrections so a today-stamped admin edit can't mask a real gap", async () => {
    await pool.query(
      `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, created_at)
       VALUES ($1,'u1','e1','pushups',10,'user', now() - interval '20 days'),
              ($1,'u1',NULL,'pushups',50,'admin_add', now())`,
      [G],
    );
    const t = await getUserPrevEntryTime(pool, G, "u1");
    // should reflect the 20-day-old USER log, not today's admin entry
    expect(Date.now() - t!.getTime()).toBeGreaterThan(19 * 86_400_000);
  });
});
