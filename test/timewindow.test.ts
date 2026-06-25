// dragon-bot/test/timewindow.test.ts
import { describe, it, expect } from "vitest";
import { windowSql, parseTimeWindow, monthKey } from "../src/timewindow.js";

const TZ = "America/Chicago";

describe("monthKey", () => {
  it("returns YYYY-MM in the given tz", () => {
    expect(monthKey(new Date("2026-06-25T12:00:00Z"), TZ)).toBe("2026-06");
  });
});

describe("windowSql", () => {
  it("thisMonth compares created_at month to now's month", () => {
    const sql = windowSql(TZ, { kind: "thisMonth" });
    expect(sql).toContain("date_trunc('month'");
    expect(sql).toContain("now() AT TIME ZONE 'America/Chicago'");
  });
  it("lastMonth subtracts one month interval", () => {
    expect(windowSql(TZ, { kind: "lastMonth" })).toContain("interval '1 month'");
  });
  it("namedMonth pins to the given year-month start date", () => {
    expect(windowSql(TZ, { kind: "namedMonth", year: 2026, month: 3 })).toContain("date '2026-03-01'");
  });
  it("yearToDate truncates to year", () => {
    expect(windowSql(TZ, { kind: "yearToDate" })).toContain("date_trunc('year'");
  });
  it("allTime is an always-true predicate", () => {
    expect(windowSql(TZ, { kind: "allTime" })).toBe("TRUE");
  });
});

describe("parseTimeWindow", () => {
  const now = new Date("2026-06-06T12:00:00Z"); // June 2026

  it("returns null when no window words are present", () => {
    expect(parseTimeWindow("board", now)).toBeNull();
    expect(parseTimeWindow("50 pushups", now)).toBeNull();
  });
  it("recognizes last month", () => {
    expect(parseTimeWindow("last month", now)).toEqual({ kind: "lastMonth" });
    expect(parseTimeWindow("board last month", now)).toEqual({ kind: "lastMonth" });
  });
  it("recognizes year / ytd", () => {
    expect(parseTimeWindow("year", now)).toEqual({ kind: "yearToDate" });
    expect(parseTimeWindow("this year", now)).toEqual({ kind: "yearToDate" });
    expect(parseTimeWindow("ytd", now)).toEqual({ kind: "yearToDate" });
    expect(parseTimeWindow("year to date", now)).toEqual({ kind: "yearToDate" });
  });
  it("recognizes all-time variants", () => {
    expect(parseTimeWindow("alltime", now)).toEqual({ kind: "allTime" });
    expect(parseTimeWindow("all time", now)).toEqual({ kind: "allTime" });
    expect(parseTimeWindow("lifetime", now)).toEqual({ kind: "allTime" });
  });
  it("maps a past month name to this year", () => {
    expect(parseTimeWindow("march", now)).toEqual({ kind: "namedMonth", year: 2026, month: 3 });
    expect(parseTimeWindow("board may", now)).toEqual({ kind: "namedMonth", year: 2026, month: 5 });
  });
  it("strips every board synonym before the window word", () => {
    expect(parseTimeWindow("scores last month", now)).toEqual({ kind: "lastMonth" });
    expect(parseTimeWindow("rank year", now)).toEqual({ kind: "yearToDate" });
    expect(parseTimeWindow("rankings alltime", now)).toEqual({ kind: "allTime" });
    expect(parseTimeWindow("standings may", now)).toEqual({ kind: "namedMonth", year: 2026, month: 5 });
  });
  it("maps a future month name to last year", () => {
    expect(parseTimeWindow("december", now)).toEqual({ kind: "namedMonth", year: 2025, month: 12 });
  });
  it("maps the current month name to this year as a namedMonth (never thisMonth)", () => {
    // by design parseTimeWindow never returns {kind:'thisMonth'} — the router defaults to that
    // when parse returns null. "june" in June resolves to the current namedMonth, which queries
    // identically to thisMonth.
    expect(parseTimeWindow("june", now)).toEqual({ kind: "namedMonth", year: 2026, month: 6 });
  });
  it("honors an explicit 4-digit year", () => {
    expect(parseTimeWindow("may 2025", now)).toEqual({ kind: "namedMonth", year: 2025, month: 5 });
  });
});
