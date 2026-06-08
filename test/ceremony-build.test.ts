// dragon-bot/test/ceremony-build.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";
import { EmbedRenderer } from "../src/renderer/embed.js";
import { buildCeremonyEmbed } from "../src/scoreboard.js";

const url = process.env.DATABASE_URL_TEST ?? "postgres://pumpdragon:pumpdragon@localhost:5433/pumpdragon_test";
const pool = createPool(url);
const TZ = "America/Chicago";
const G = "guild1";
const cfg = { guildId: G, timezone: TZ };

beforeAll(async () => { await runMigrations(pool); });
beforeEach(async () => { await pool.query("TRUNCATE entries; DELETE FROM monthly_goals;"); });

// helper: insert an entry back-dated to a specific month
async function seed(userId: string, category: string, qty: number, year: number, month: number, detail: string | null = null): Promise<void> {
  const mm = String(month).padStart(2, "0");
  await pool.query(
    `INSERT INTO entries (guild_id, discord_user_id, category, quantity, source, detail, created_at)
     VALUES ($1,$2,$3,$4,'user',$5, (date '${year}-${mm}-15') AT TIME ZONE '${TZ}')`,
    [G, userId, category, qty, detail],
  );
}

describe("buildCeremonyEmbed", () => {
  it("assembles MVPs, rising stars, the collective total and moments for the target month", async () => {
    // May 2026 (target) and April 2026 (previous, for deltas)
    await seed("u1", "cardio", 80, 2026, 5, "trail running");
    await seed("u1", "cardio", 50, 2026, 4); // u1 cardio +60% → rising star
    await seed("u2", "pushups", 300, 2026, 5);
    await setGoalForMay(pool); // sets May goal (helper below)
    const renderer = new EmbedRenderer();
    const embed = (await buildCeremonyEmbed(pool, cfg, renderer, { year: 2026, month: 5 }, () => 0)).toJSON();
    const s = JSON.stringify(embed);
    expect(embed.title).toContain("MAY 2026");
    expect(s).toContain("<@u1>"); // participant / mvp / rising
    expect(s).toContain("cardio");
    expect(s).toContain("+60%"); // u1's rising-star gain (with the leading + sign)
    expect(s).toContain("trail running"); // moment
    expect(s).toContain("2 showed up"); // participants: u1 + u2
    // total 380 vs goal 1000 → the "fell short" ascension branch
    expect(s).toContain("BREAK THROUGH");
  });

  it("gently ribs a user who fell off (big last month, gone this month)", async () => {
    await seed("u1", "cardio", 80, 2026, 5); // keeps May alive (not a dead month)
    await seed("u9", "pushups", 200, 2026, 4); // u9 logged big in April, nothing in May → fall-off
    const renderer = new EmbedRenderer();
    const embed = (await buildCeremonyEmbed(pool, cfg, renderer, { year: 2026, month: 5 }, () => 0)).toJSON();
    const s = JSON.stringify(embed);
    expect(s).toContain("fall off"); // the "👀 don't fall off" field
    expect(s).toContain("<@u9>"); // u9 gets a gentle rib
  });

  it("does not crash for a month with no data", async () => {
    const renderer = new EmbedRenderer();
    const embed = (await buildCeremonyEmbed(pool, cfg, renderer, { year: 2099, month: 1 }, () => 0)).toJSON();
    expect(embed.title).toContain("JANUARY 2099");
  });
});

// sets the May-2026 goal directly (setGoal targets the current month, so write the row explicitly)
async function setGoalForMay(pool: import("../src/db/pool.js").Pool): Promise<void> {
  await pool.query(
    `INSERT INTO monthly_goals (guild_id, month, goal_amount) VALUES ($1, date '2026-05-01', 1000)
     ON CONFLICT (guild_id, month) DO UPDATE SET goal_amount = EXCLUDED.goal_amount`, [G]);
}
