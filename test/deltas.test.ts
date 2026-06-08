// dragon-bot/test/deltas.test.ts
import { describe, it, expect } from "vitest";
import { previousMonthOf, lastCompletedMonth, mostImproved, fallOffs } from "../src/deltas.js";
import type { StandingRow, OverallRow } from "../src/db/queries.js";

describe("previousMonthOf", () => {
  it("steps back a month, rolling the year at January", () => {
    expect(previousMonthOf({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 });
    expect(previousMonthOf({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });
});

describe("lastCompletedMonth", () => {
  it("returns the month before 'now' in the given timezone", () => {
    // 2026-06-01 07:00 America/Chicago → the just-ended month is May 2026
    const now = new Date("2026-06-01T12:00:00Z");
    expect(lastCompletedMonth(now, "America/Chicago")).toEqual({ year: 2026, month: 5 });
    // Jan 1 → December of the prior year
    expect(lastCompletedMonth(new Date("2026-01-01T12:00:00Z"), "America/Chicago")).toEqual({ year: 2025, month: 12 });
  });
});

describe("mostImproved", () => {
  const cur: StandingRow[] = [
    { category: "cardio", userId: "u1", total: 80 },
    { category: "pushups", userId: "u2", total: 199 }, // equal to prev → NOT a gain
    { category: "core", userId: "u3", total: 5 },
  ];
  const prev: StandingRow[] = [
    { category: "cardio", userId: "u1", total: 50 }, // +60%
    { category: "pushups", userId: "u2", total: 199 }, // unchanged → excluded
    { category: "core", userId: "u3", total: 0 }, // brand new → excluded (no prior)
  ];
  it("ranks finite month-over-month gains, biggest first", () => {
    const r = mostImproved(cur, prev, { limit: 2 });
    expect(r[0]).toMatchObject({ userId: "u1", category: "cardio", pct: 60 });
  });
  it("excludes brand-new (previous=0) AND non-gains (current<=previous)", () => {
    const r = mostImproved(cur, prev);
    expect(r.find((i) => i.userId === "u3")).toBeUndefined(); // brand new
    expect(r.find((i) => i.userId === "u2")).toBeUndefined(); // flat (199→199)
  });
  it("sorts by pct desc and slices to the limit", () => {
    const c: StandingRow[] = [
      { category: "cardio", userId: "a", total: 200 }, // +100%
      { category: "pushups", userId: "b", total: 150 }, // +50%
      { category: "core", userId: "c", total: 120 }, // +20%
    ];
    const p: StandingRow[] = [
      { category: "cardio", userId: "a", total: 100 },
      { category: "pushups", userId: "b", total: 100 },
      { category: "core", userId: "c", total: 100 },
    ];
    const r = mostImproved(c, p, { limit: 2 });
    expect(r).toHaveLength(2);
    expect(r.map((i) => i.userId)).toEqual(["a", "b"]); // c trimmed
    expect(r.map((i) => i.pct)).toEqual([100, 50]);
  });
});

describe("fallOffs", () => {
  const prev: OverallRow[] = [
    { userId: "a", total: 1000 },
    { userId: "b", total: 100 },
    { userId: "c", total: 10 }, // below minPrevious → ignored
  ];
  const cur: OverallRow[] = [
    { userId: "a", total: 900 }, // only −10% → not a fall-off
    { userId: "b", total: 0 }, // stopped → fall-off
  ];
  it("flags users who dropped well below last month (incl. to zero)", () => {
    const r = fallOffs(cur, prev, { minPrevious: 50, dropFraction: 0.5 });
    expect(r.map((f) => f.userId)).toEqual(["b"]);
    expect(r[0]).toMatchObject({ previous: 100, current: 0, pctDrop: 100 });
  });
  it("treats exactly the threshold (cur == prev*(1-dropFraction)) as NOT a fall-off", () => {
    // prev 100, dropFraction 0.5 → threshold 50; cur=50 is >= 50 → excluded
    const r = fallOffs([{ userId: "x", total: 50 }], [{ userId: "x", total: 100 }], { minPrevious: 50, dropFraction: 0.5 });
    expect(r).toHaveLength(0);
  });
  it("orders multiple fall-offs by biggest drop first", () => {
    const p: OverallRow[] = [{ userId: "p", total: 100 }, { userId: "q", total: 100 }];
    const c: OverallRow[] = [{ userId: "p", total: 40 }, { userId: "q", total: 0 }]; // q −100% > p −60%
    const r = fallOffs(c, p, { minPrevious: 50, dropFraction: 0.5 });
    expect(r.map((f) => f.userId)).toEqual(["q", "p"]);
  });
});
