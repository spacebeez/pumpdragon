// dragon-bot/test/ceremony.test.ts
import { describe, it, expect } from "vitest";
import {
  monthLabel, COLLECTIVE_LINES, RIB_LINES, CLOSE_LINES,
  collectiveLine, risingStarLine, ribLine, momentsLine, closeLine, ceremonyPowerLine,
} from "../src/ceremony.js";

const zero = () => 0;

describe("ceremonyPowerLine", () => {
  it("goes over-the-top when the group blew past the goal (>=100%)", () => {
    const line = ceremonyPowerLine(14200, 10000);
    expect(line).toContain("14,200");
    expect(line).toContain("10,000");
    expect(line.toUpperCase()).toContain("BLEW PAST");
    expect(line).toContain("9,000"); // OVER 9,000
  });
  it("is encouraging (not deflating) when the group fell short", () => {
    const line = ceremonyPowerLine(8400, 10000);
    expect(line).toContain("8,400");
    expect(line.toUpperCase()).toContain("BREAK THROUGH");
  });
  it("handles no goal WITHOUT leaking the daily-recap 'no goal set yet / this month' wording", () => {
    const line = ceremonyPowerLine(8400, null);
    expect(line).toContain("8,400");
    expect(line.toLowerCase()).not.toContain("this month");
    expect(line.toLowerCase()).not.toContain("no goal set yet");
  });
});

describe("monthLabel", () => {
  it("formats year + month name", () => {
    expect(monthLabel(2026, 5)).toBe("May 2026");
    expect(monthLabel(2025, 12)).toBe("December 2025");
  });
});

describe("collectiveLine", () => {
  it("substitutes participant count and total, no leftover tokens", () => {
    const line = collectiveLine(8400, 6, zero);
    expect(line).toContain("6");
    expect(line).toContain("8,400");
    expect(line).not.toContain("{");
  });
});

describe("risingStarLine", () => {
  it("names the user (as a mention) + category + pct", () => {
    const line = risingStarLine({ userId: "u1", category: "cardio", pct: 60, current: 80, previous: 50 });
    expect(line).toContain("<@u1>");
    expect(line).toContain("cardio");
    expect(line).toContain("60%");
  });
});

describe("ribLine", () => {
  it("mentions the user and leaves no token; phrase pool is gentle (no slurs)", () => {
    const line = ribLine({ userId: "u9", previous: 100, current: 0, pctDrop: 100 }, zero);
    expect(line).toContain("<@u9>");
    expect(line).not.toContain("{");
  });
  it("RIB_LINES all contain the {id} token exactly once", () => {
    for (const p of RIB_LINES) expect((p.match(/\{id\}/g) ?? []).length).toBe(1);
  });
});

describe("momentsLine", () => {
  it("returns null when there are no details", () => {
    expect(momentsLine([])).toBeNull();
  });
  it("weaves up to two details as mentions", () => {
    const line = momentsLine([{ userId: "u1", detail: "trail running" }, { userId: "u2", detail: "bench press" }, { userId: "u3", detail: "x" }])!;
    expect(line).toContain("<@u1>");
    expect(line).toContain("trail running");
    expect(line).toContain("<@u2>");
    expect(line).not.toContain("<@u3>"); // capped at 2
  });
});

describe("closeLine", () => {
  it("returns a non-empty phrase from the pool", () => {
    expect(CLOSE_LINES).toContain(closeLine(zero));
  });
});
