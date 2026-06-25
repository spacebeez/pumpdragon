// dragon-bot/test/views.test.ts
import { describe, it, expect } from "vitest";
import { categoryViewOf, parseStatsRequest, isHelpRequest, parseAchievementsRequest } from "../src/views.js";

describe("parseAchievementsRequest", () => {
  it("matches the self keywords", () => {
    for (const t of ["achievements", "my achievements", "medals", "badges"]) {
      expect(parseAchievementsRequest(t)).toEqual({ self: true });
    }
  });
  it("matches a mention target", () => {
    expect(parseAchievementsRequest("achievements <@99>")).toEqual({ self: false, userId: "99" });
    expect(parseAchievementsRequest("badges <@!99>")).toEqual({ self: false, userId: "99" });
  });
  it("returns null for anything else", () => {
    expect(parseAchievementsRequest("achievements of war")).toBeNull();
    expect(parseAchievementsRequest("50 pushups")).toBeNull();
  });
});

describe("categoryViewOf", () => {
  it("returns the category for a bare category word/alias", () => {
    expect(categoryViewOf("cardio")).toBe("cardio");
    expect(categoryViewOf("Pushups")).toBe("pushups");
    expect(categoryViewOf("running")).toBe("cardio");
  });
  it("returns null for a log or multi-word text", () => {
    expect(categoryViewOf("50 pushups")).toBeNull();
    expect(categoryViewOf("cardio please")).toBeNull();
    expect(categoryViewOf("board")).toBeNull();
  });
});

describe("parseStatsRequest", () => {
  it("matches 'me' as self", () => {
    expect(parseStatsRequest("me")).toEqual({ self: true });
  });
  it("matches 'stats @user' with the mentioned id", () => {
    expect(parseStatsRequest("stats <@123>")).toEqual({ self: false, userId: "123" });
    expect(parseStatsRequest("stats <@!456>")).toEqual({ self: false, userId: "456" });
  });
  it("matches bare 'stats' as self", () => {
    expect(parseStatsRequest("stats")).toEqual({ self: true });
  });
  it("does not over-match a word that merely starts with 'stats'", () => {
    expect(parseStatsRequest("statsmania")).toBeNull();
    expect(parseStatsRequest("statistics")).toBeNull();
    expect(parseStatsRequest("stats hello")).toBeNull(); // 'stats' + non-mention text
  });
  it("handles padding and uppercase on the mention form", () => {
    expect(parseStatsRequest("  stats  <@123>  ")).toEqual({ self: false, userId: "123" });
    expect(parseStatsRequest("STATS <@123>")).toEqual({ self: false, userId: "123" });
  });
  it("returns null otherwise", () => {
    expect(parseStatsRequest("50 pushups")).toBeNull();
    expect(parseStatsRequest("meatball")).toBeNull();
  });
});

describe("isHelpRequest", () => {
  it("matches help variants", () => {
    for (const t of ["help", "Help", "commands", "what can you do", "what can you do?", "how do i use you"]) {
      expect(isHelpRequest(t)).toBe(true);
    }
  });
  it("does not match a log or board", () => {
    expect(isHelpRequest("50 pushups")).toBe(false);
    expect(isHelpRequest("help me do 50 pushups")).toBe(false);
  });
});

import { parseChartRequest, isInsightsRequest } from "../src/views.js";

describe("parseChartRequest", () => {
  it("bare command → default pushups", () => {
    expect(parseChartRequest("race")).toEqual({ kind: "race", category: "pushups" });
    expect(parseChartRequest("mychart")).toEqual({ kind: "mychart", category: "pushups" });
    expect(parseChartRequest("months")).toEqual({ kind: "months", category: "pushups" });
  });
  it("command + category alias → that category", () => {
    expect(parseChartRequest("race cardio")).toEqual({ kind: "race", category: "cardio" });
    expect(parseChartRequest("mychart abs")).toEqual({ kind: "mychart", category: "core" });
    expect(parseChartRequest("months run")).toEqual({ kind: "months", category: "cardio" });
  });
  it("is case-insensitive and tolerates extra spaces", () => {
    expect(parseChartRequest("  RACE   Pushups ")).toEqual({ kind: "race", category: "pushups" });
  });
  it("unrecognized category token → null (so it won't silently chart the wrong thing)", () => {
    expect(parseChartRequest("race banana")).toBeNull();
  });
  it("non-chart text → null", () => {
    expect(parseChartRequest("board")).toBeNull();
    expect(parseChartRequest("racecar stuff")).toBeNull();
  });
});

describe("isInsightsRequest", () => {
  it("matches the whole word insights/stats-recap synonyms", () => {
    expect(isInsightsRequest("insights")).toBe(true);
    expect(isInsightsRequest("INSIGHTS")).toBe(true);
  });
  it("does not match insights embedded in a log", () => {
    expect(isInsightsRequest("insights into my 50 pushups")).toBe(false);
    expect(isInsightsRequest("board")).toBe(false);
  });
});

import { boardCategoryOf } from "../src/views.js";

describe("boardCategoryOf", () => {
  it("resolves a board word + category to that category", () => {
    expect(boardCategoryOf("board pushups")).toBe("pushups");
    expect(boardCategoryOf("scoreboard cardio")).toBe("cardio");
    expect(boardCategoryOf("board pullups")).toBe("pullups");
    expect(boardCategoryOf("leaderboard abs")).toBe("core"); // alias resolves
  });
  it("is null without a leading board word (bare category handled elsewhere)", () => {
    expect(boardCategoryOf("pushups")).toBeNull();
  });
  it("is null when the remainder isn't a single category", () => {
    expect(boardCategoryOf("board last month")).toBeNull();
    expect(boardCategoryOf("board may")).toBeNull();
    expect(boardCategoryOf("board")).toBeNull();
  });
});
