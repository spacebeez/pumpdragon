import { describe, it, expect } from "vitest";
import { toCronExpr } from "../src/cron.js";

describe("toCronExpr", () => {
  it("passes through a 5-field cron expression unchanged", () => {
    expect(toCronExpr("0 8 * * *")).toBe("0 8 * * *");
  });
  it("converts HH:MM to a daily cron expression", () => {
    expect(toCronExpr("08:00")).toBe("0 8 * * *");
    expect(toCronExpr("21:30")).toBe("30 21 * * *");
  });
  it("throws on garbage", () => {
    expect(() => toCronExpr("nonsense")).toThrow();
  });
});
