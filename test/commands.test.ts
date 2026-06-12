import { describe, it, expect, vi } from "vitest";
import { handleMention, isScoreboardRequest } from "../src/commands.js";
import { EmbedRenderer } from "../src/renderer/embed.js";
import { HYPE_PHRASES } from "../src/hype.js";

function baseCtx(over: Partial<Parameters<typeof handleMention>[1]> = {}) {
  return {
    renderer: new EmbedRenderer(),
    config: { guildId: "g", timezone: "America/Chicago", adminRoleIds: [] } as never,
    pool: {} as never,
    parse: vi.fn(async () => ({ items: [{ category: "pushups", quantity: 50, detail: null }], unparsed: [] })),
    db: {
      insertEntries: vi.fn(async () => [{ category: "pushups", quantity: 50, userMonthlyTotal: 50, trailingAverage: 0, priorCount: 0, hype: false, detail: null }]),
      getCurrentMonthCombinedTotal: vi.fn(async () => 50),
      getCurrentGoal: vi.fn(async () => null),
      getMonthEntryCount: vi.fn(async () => 5),
      getUserMonthCategoryCount: vi.fn(async () => 1),
      insertAchievement: vi.fn(async () => false),
    } as never,
    member: { permissions: { has: () => true }, roles: { cache: { has: () => false } } } as never,
    authorId: "u1",
    authorName: "Matt",
    messageId: "m1",
    ...over,
  };
}

describe("handleMention routing", () => {
  it("ping → sanity content", async () => {
    const res = await handleMention("ping", baseCtx());
    expect(res.content?.toLowerCase()).toContain("rawr");
  });

  it("hype request → a hype phrase, no parse/db", async () => {
    const ctx = baseCtx();
    const res = await handleMention("hype me up", ctx);
    expect(HYPE_PHRASES).toContain(res.content);
    expect(ctx.parse).not.toHaveBeenCalled();
  });

  it("log → embed reply via parse + insert", async () => {
    const ctx = baseCtx();
    const res = await handleMention("50 pushups", ctx);
    expect(ctx.parse).toHaveBeenCalled();
    expect(res.embed).toBeDefined();
  });

  it("non-admin admin command → refusal, no db write", async () => {
    const ctx = baseCtx({ member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } } as never });
    const res = await handleMention("admin goal 2000", ctx);
    expect(res.content?.toLowerCase()).toMatch(/not allowed|admins only|nope/);
  });

  it("nothing parseable → didn't catch that", async () => {
    const ctx = baseCtx({ parse: vi.fn(async () => ({ items: [], unparsed: ["blah"] })) as never });
    const res = await handleMention("blah", ctx);
    expect(res.content).toMatch(/didn't catch that/i);
  });

  it("deduped re-delivery (insertEntries returns []) → silent empty reply", async () => {
    const ctx = baseCtx({
      db: {
        insertEntries: vi.fn(async () => []),
        getCurrentMonthCombinedTotal: vi.fn(async () => 0),
        getCurrentGoal: vi.fn(async () => null),
      } as never,
    });
    const res = await handleMention("50 pushups", ctx);
    expect(res).toEqual({});
    // must not fetch totals/goal or render anything for a dropped duplicate
    expect((ctx.db as never as { getCurrentMonthCombinedTotal: ReturnType<typeof vi.fn> }).getCurrentMonthCombinedTotal).not.toHaveBeenCalled();
  });

  it("valid admin command from an admin → executes and confirms", async () => {
    // admin execution uses the real setGoal(pool,...), so the fake pool needs a query()
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const ctx = baseCtx({ pool: { query } as never });
    const res = await handleMention("admin goal 2000", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalled();
    expect(res.content).toContain("2,000");
  });

  it("scoreboard request → embed, no parse/log", async () => {
    // board path uses real queries against the pool; route each query by its SQL shape
    const query = vi.fn(async (sql: string) => {
      if (/monthly_goals/i.test(sql)) return { rows: [], rowCount: 0 }; // no goal
      if (/GROUP BY/i.test(sql)) return { rows: [], rowCount: 0 }; // standings (empty)
      return { rows: [{ total: 0 }], rowCount: 1 }; // combined total
    });
    const ctx = baseCtx({ pool: { query } as never });
    const res = await handleMention("board", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(res.embed).toBeDefined();
  });
});

describe("admin close-month routing", () => {
  // routes buildCeremonyEmbed's 7 queries by SQL shape. ORDER MATTERS: getRecentDetails contains
  // BOTH "detail IS NOT NULL" and "GROUP BY", so its arm must come before the generic GROUP BY arm.
  const ceremonyQuery = () => vi.fn(async (sql: string) => {
    if (/monthly_goals/i.test(sql)) return { rows: [], rowCount: 0 };           // getGoalForMonth
    if (/detail IS NOT NULL/i.test(sql)) return { rows: [], rowCount: 0 };       // getRecentDetails
    if (/GROUP BY/i.test(sql)) return { rows: [], rowCount: 0 };                 // getStandings ×2, getOverallStandings ×2
    return { rows: [{ total: 0 }], rowCount: 1 };                                // getCurrentMonthCombinedTotal
  });
  it("admin close-month → a ceremony embed, no parse", async () => {
    const ctx = baseCtx({ pool: { query: ceremonyQuery() } as never, now: () => new Date("2026-06-06T12:00:00Z") } as never);
    const res = await handleMention("admin close-month", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.embed?.toJSON())).toContain("ASCENDED");
  });
  it("non-admin admin close-month → refusal", async () => {
    const ctx = baseCtx({ member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } } as never });
    const res = await handleMention("admin close-month", ctx);
    expect(res.content?.toLowerCase()).toMatch(/admins only/);
  });
});

describe("isScoreboardRequest", () => {
  it("matches scoreboard words", () => {
    for (const t of ["board", "scoreboard", "standings", "leaderboard", "Scores", "ranks", "rankings"]) {
      expect(isScoreboardRequest(t)).toBe(true);
    }
  });
  it("does not match a normal log", () => {
    expect(isScoreboardRequest("50 pushups")).toBe(false);
    expect(isScoreboardRequest("boardgame night")).toBe(false);
  });
});

// helper: a ctx whose db + chart pieces are stubbed so handleMention routing can be tested without a real DB.
function chartCtx(over: Partial<Parameters<typeof handleMention>[1]> = {}) {
  return baseCtx({
    pool: {} as never,
    member: {
      displayName: "Matt",
      guild: { members: { fetch: vi.fn(async () => new Map()) } },
      permissions: { has: () => true }, roles: { cache: { has: () => false } },
    } as never,
    ...over,
  });
}

describe("chart + insights routing", () => {
  it("`insights` → an embed, no parse/log", async () => {
    // buildInsightsEmbed: getStandings/getOverallStandings use GROUP BY → empty; getCurrentMonthCombinedTotal → { total }
    const insightsQuery = vi.fn(async (sql: string) => {
      if (/GROUP BY/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [{ total: 0 }], rowCount: 1 };
    });
    const ctx = chartCtx({ pool: { query: insightsQuery } as never });
    const res = await handleMention("insights", ctx);
    expect(res.embed).toBeDefined();
    expect(ctx.parse).not.toHaveBeenCalled();
  });

  it("`race` with no history → friendly content, no image", async () => {
    const ctx = chartCtx({ pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never });
    const res = await handleMention("race", ctx);
    expect(res.content).toMatch(/no .* history|forge/i);
    expect(res.files).toBeUndefined();
  });
});

// A pool whose query returns overall-standings rows (for getOverallStandings in the conversation path).
function standingsPool(rows: { discord_user_id: string; total: string }[]) {
  return { query: vi.fn(async () => ({ rows, rowCount: rows.length })) } as never;
}

function convoCtx(over: Partial<Parameters<typeof handleMention>[1]> = {}) {
  return baseCtx({
    pool: standingsPool([{ discord_user_id: "leader", total: "100" }]),
    parse: vi.fn(async () => ({ items: [], unparsed: ["chatter"] })) as never, // force the conversation path
    config: { guildId: "g", timezone: "America/Chicago", adminRoleIds: [], roastUserId: "MAGIC", roastNickname: "magic" } as never,
    member: { displayName: "Matt", guild: { members: { cache: { get: () => undefined }, fetch: vi.fn(async () => new Map()) } }, permissions: { has: () => true }, roles: { cache: { has: () => false } } } as never,
    converse: vi.fn(async () => "🐉 hype reply") as never,
    fetchRecentMessages: vi.fn(async () => []) as never,
    ...over,
  });
}

describe("conversation routing", () => {
  it("empty parse → calls converse and returns its text", async () => {
    const ctx = convoCtx();
    const res = await handleMention("yo dragon", ctx);
    expect((ctx.converse as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(res.content).toBe("🐉 hype reply");
    expect((ctx.fetchRecentMessages as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
  it("isRoastTarget true only when the author is the configured target", async () => {
    const ctx = convoCtx({ authorId: "MAGIC" });
    await handleMention("hey", ctx);
    expect((ctx.converse as ReturnType<typeof vi.fn>).mock.calls[0][0].isRoastTarget).toBe(true);
    const ctx2 = convoCtx({ authorId: "someone-else" });
    await handleMention("hey", ctx2);
    expect((ctx2.converse as ReturnType<typeof vi.fn>).mock.calls[0][0].isRoastTarget).toBe(false);
  });
  it("includeJab follows the injected rng for a non-target speaker", async () => {
    const ctx = convoCtx({ authorId: "x", rng: () => 0.1 } as never); // < 0.25 → jab
    await handleMention("hey", ctx);
    expect((ctx.converse as ReturnType<typeof vi.fn>).mock.calls[0][0].includeJab).toBe(true);
    const ctx2 = convoCtx({ authorId: "x", rng: () => 0.9 } as never); // ≥ 0.25 → no jab
    await handleMention("hey", ctx2);
    expect((ctx2.converse as ReturnType<typeof vi.fn>).mock.calls[0][0].includeJab).toBe(false);
  });
  it("falls back to deterministic guidance when converse is absent", async () => {
    const ctx = convoCtx({ converse: undefined });
    const res = await handleMention("yo dragon", ctx);
    expect(res.content).toMatch(/didn't catch that/i);
  });
});

describe("handleMention new view routing", () => {
  const boardQuery = () => vi.fn(async (sql: string) => {
    if (/monthly_goals/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/GROUP BY/i.test(sql)) return { rows: [], rowCount: 0 };
    return { rows: [{ total: 0 }], rowCount: 1 };
  });

  it("help → help embed, no parse", async () => {
    const ctx = baseCtx();
    const res = await handleMention("help", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.embed?.toJSON())).toContain("what I can do");
  });

  it("bare category → category board, no parse", async () => {
    const ctx = baseCtx({ pool: { query: boardQuery() } as never });
    const res = await handleMention("cardio", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(res.embed).toBeDefined();
  });

  it("'board pushups' → that single category's board, not the full scoreboard", async () => {
    const ctx = baseCtx({ pool: { query: boardQuery() } as never });
    const res = await handleMention("board pushups", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.embed?.toJSON())).toContain("pushups — this month");
  });

  it("'me' → stats card, no parse", async () => {
    const ctx = baseCtx({ pool: { query: boardQuery() } as never });
    const res = await handleMention("me", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.embed?.toJSON())).toContain("Matt");
  });

  it("bare 'year' → board, no parse", async () => {
    const ctx = baseCtx({ pool: { query: boardQuery() } as never, now: () => new Date("2026-06-06T12:00:00Z") } as never);
    const res = await handleMention("year", ctx);
    expect(ctx.parse).not.toHaveBeenCalled();
    expect(res.embed).toBeDefined();
  });

  it("bare month 'may' does NOT board — it falls through to the parse path", async () => {
    const ctx = baseCtx({ now: () => new Date("2026-06-06T12:00:00Z") } as never);
    await handleMention("may", ctx);
    expect(ctx.parse).toHaveBeenCalled(); // bare month is ambiguous → log path, not a board
  });

  it("hype reply uses the logged detail when an entry is hype-worthy", async () => {
    const ctx = baseCtx({
      db: {
        insertEntries: vi.fn(async () => [{ category: "cardio", quantity: 100, userMonthlyTotal: 100, trailingAverage: 10, priorCount: 5, hype: false, detail: "trail running" }]),
        getCurrentMonthCombinedTotal: vi.fn(async () => 100),
        getCurrentGoal: vi.fn(async () => null),
        getMonthEntryCount: vi.fn(async () => 5),
        getUserMonthCategoryCount: vi.fn(async () => 1),
        insertAchievement: vi.fn(async () => false),
      } as never,
      parse: vi.fn(async () => ({ items: [{ category: "cardio", quantity: 100, detail: "trail running" }], unparsed: [] })) as never,
    });
    const res = await handleMention("ran 100 min trail running", ctx);
    expect(JSON.stringify(res.embed?.toJSON())).toContain("trail running");
  });
});

describe("achievement awards on log", () => {
  function achDb(over: Record<string, unknown> = {}) {
    return {
      insertEntries: vi.fn(async () => [{ category: "pushups", quantity: 600, userMonthlyTotal: 600, trailingAverage: 0, priorCount: 0, hype: false, detail: null }]),
      getCurrentMonthCombinedTotal: vi.fn(async () => 600),
      getCurrentGoal: vi.fn(async () => null),
      getMonthEntryCount: vi.fn(async () => 5),
      getUserMonthCategoryCount: vi.fn(async () => 1),
      insertAchievement: vi.fn(async () => true),
      ...over,
    } as never;
  }

  it("a log that crosses a milestone renders the achievement flare", async () => {
    const ctx = baseCtx({ pool: {} as never, parse: vi.fn(async () => ({ items: [{ category: "pushups", quantity: 600, detail: null }], unparsed: [] })) as never, db: achDb() });
    const res = await handleMention("600 pushups", ctx);
    const json = JSON.stringify(res.embed?.toJSON());
    expect(json).toContain("ACHIEVEMENT UNLOCKED");
    expect(json).toContain("500 pushups");
  });

  it("a normal log (no crossing) renders no achievement field", async () => {
    const ctx = baseCtx({
      pool: {} as never,
      parse: vi.fn(async () => ({ items: [{ category: "pushups", quantity: 50, detail: null }], unparsed: [] })) as never,
      db: achDb({ insertEntries: vi.fn(async () => [{ category: "pushups", quantity: 50, userMonthlyTotal: 50, trailingAverage: 0, priorCount: 0, hype: false, detail: null }]), getCurrentMonthCombinedTotal: vi.fn(async () => 50) }),
    });
    const res = await handleMention("50 pushups", ctx);
    expect(JSON.stringify(res.embed?.toJSON())).not.toContain("ACHIEVEMENT UNLOCKED");
  });

  it("an error during achievement detection still returns the normal log embed", async () => {
    const ctx = baseCtx({ pool: {} as never, parse: vi.fn(async () => ({ items: [{ category: "pushups", quantity: 600, detail: null }], unparsed: [] })) as never, db: achDb({ getMonthEntryCount: vi.fn(async () => { throw new Error("boom"); }) }) });
    const res = await handleMention("600 pushups", ctx);
    expect(res.embed).toBeDefined();
    expect(JSON.stringify(res.embed?.toJSON())).not.toContain("ACHIEVEMENT UNLOCKED");
  });
});
