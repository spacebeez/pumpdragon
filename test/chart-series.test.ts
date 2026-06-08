import { describe, it, expect } from "vitest";
import { assignColors, makeScale, colorForIndex, PALETTE } from "../src/chart/theme.js";

describe("colorForIndex", () => {
  it("cycles the palette", () => {
    expect(colorForIndex(0)).toBe(PALETTE[0]);
    expect(colorForIndex(PALETTE.length)).toBe(PALETTE[0]);
  });
});

describe("assignColors", () => {
  it("assigns a stable palette color per id in order", () => {
    const m = assignColors(["a", "b", "c"]);
    expect(m.get("a")).toBe(PALETTE[0]);
    expect(m.get("b")).toBe(PALETTE[1]);
    expect(m.get("c")).toBe(PALETTE[2]);
  });
});

describe("makeScale", () => {
  it("maps domain endpoints to range endpoints", () => {
    const s = makeScale(0, 10, 100, 200);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(200);
    expect(s(5)).toBe(150);
  });
  it("returns the range midpoint for a zero-width domain (avoids divide-by-zero)", () => {
    const s = makeScale(5, 5, 0, 100);
    expect(s(5)).toBe(50);
  });
});

import {
  monthKey, buildMonthAxis, buildRaceSeries, buildTrendSeries,
  topUsersByTotal, buildStackedMonths, shortMonth, tickIndices,
} from "../src/chart/series.js";

describe("monthKey", () => {
  it("formats a date as YYYY-MM (UTC)", () => {
    expect(monthKey(new Date("2024-06-15T12:00:00Z"))).toBe("2024-06");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});

describe("buildMonthAxis", () => {
  it("produces an inclusive chronological list across a year boundary", () => {
    expect(buildMonthAxis("2024-11", "2025-02")).toEqual(["2024-11", "2024-12", "2025-01", "2025-02"]);
  });
  it("single month → one element", () => {
    expect(buildMonthAxis("2025-03", "2025-03")).toEqual(["2025-03"]);
  });
  it("end before start → empty", () => {
    expect(buildMonthAxis("2025-05", "2025-04")).toEqual([]);
  });
});

describe("buildRaceSeries", () => {
  const axis = ["2024-06", "2024-07", "2024-08"];
  it("forward-fills cumulative and is null before a user's first month", () => {
    const rows = [
      { userId: "a", month: "2024-06", cumulative: 10 },
      { userId: "a", month: "2024-08", cumulative: 25 }, // skipped July → carries 10
      { userId: "b", month: "2024-07", cumulative: 5 },
    ];
    const lines = buildRaceSeries(rows, axis);
    const a = lines.find((l) => l.userId === "a")!;
    const b = lines.find((l) => l.userId === "b")!;
    expect(a.points).toEqual([10, 10, 25]);
    expect(a.total).toBe(25);
    expect(b.points).toEqual([null, 5, 5]); // null before first activity
    expect(b.total).toBe(5);
  });
  it("sorts lines by final total descending", () => {
    const rows = [
      { userId: "low", month: "2024-06", cumulative: 1 },
      { userId: "high", month: "2024-06", cumulative: 99 },
    ];
    expect(buildRaceSeries(rows, axis).map((l) => l.userId)).toEqual(["high", "low"]);
  });
  it("empty rows → empty", () => {
    expect(buildRaceSeries([], axis)).toEqual([]);
  });
});

describe("buildTrendSeries", () => {
  it("zero-fills gap months across the axis", () => {
    const axis = ["2025-01", "2025-02", "2025-03"];
    const rows = [{ month: "2025-01", qty: 120 }, { month: "2025-03", qty: 90 }];
    expect(buildTrendSeries(rows, axis)).toEqual([120, 0, 90]);
  });
});

describe("topUsersByTotal", () => {
  it("returns the top N ids by total, descending", () => {
    const totals = new Map([["a", 5], ["b", 50], ["c", 20]]);
    expect(topUsersByTotal(totals, 2)).toEqual(["b", "c"]);
  });
});

describe("buildStackedMonths", () => {
  it("keeps top-N users and buckets the rest into 'others', aligned to the axis", () => {
    const axis = ["2025-01", "2025-02"];
    const rows = [
      { month: "2025-01", userId: "a", qty: 100 },
      { month: "2025-01", userId: "b", qty: 10 },
      { month: "2025-01", userId: "c", qty: 5 },
      { month: "2025-02", userId: "a", qty: 50 },
      { month: "2025-02", userId: "c", qty: 7 },
    ];
    const { users, perMonth } = buildStackedMonths(rows, axis, 1); // top 1 = "a"
    expect(users).toEqual(["a", "others"]);
    // month 0: a=100, others=15 ; month 1: a=50, others=7
    expect(perMonth).toEqual([[100, 15], [50, 7]]);
  });
  it("no 'others' segment when everyone fits in top-N", () => {
    const axis = ["2025-01"];
    const rows = [{ month: "2025-01", userId: "a", qty: 1 }, { month: "2025-01", userId: "b", qty: 2 }];
    const { users, perMonth } = buildStackedMonths(rows, axis, 5);
    expect(users).toEqual(["b", "a"]); // ordered by lifetime total desc
    expect(perMonth).toEqual([[2, 1]]);
  });
});

describe("shortMonth", () => {
  it("formats a month key as 'Mon \\'YY'", () => {
    expect(shortMonth("2024-06")).toBe("Jun '24");
    expect(shortMonth("2026-01")).toBe("Jan '26");
  });
  it("never throws or renders 'undefined' on a malformed key", () => {
    expect(shortMonth("garbage")).toBe("? '00");
  });
});

describe("tickIndices", () => {
  it("returns every index when the axis is short", () => {
    expect(tickIndices(3)).toEqual([0, 1, 2]);
  });
  it("returns evenly-spaced indices including the endpoints for a long axis", () => {
    const t = tickIndices(24, 8);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(23);
    expect(t).toHaveLength(8);
  });
});
