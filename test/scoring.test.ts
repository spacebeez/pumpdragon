import { describe, it, expect } from "vitest";
import { trailingAverage, isHype, powerMeter } from "../src/scoring.js";

describe("trailingAverage", () => {
  it("averages the provided values", () => {
    expect(trailingAverage([10, 20, 30])).toBe(20);
  });
  it("returns 0 for an empty list", () => {
    expect(trailingAverage([])).toBe(0);
  });
});

describe("isHype", () => {
  it("is true when quantity exceeds 1.5x average and >=3 priors", () => {
    expect(isHype(40, 20, 3)).toBe(true);
  });
  it("is false when under the 1.5x threshold", () => {
    expect(isHype(25, 20, 5)).toBe(false);
  });
  it("is false with fewer than 3 priors regardless of size", () => {
    expect(isHype(1000, 1, 2)).toBe(false);
  });
  it("is false when average is 0 (no meaningful baseline)", () => {
    expect(isHype(50, 0, 5)).toBe(false);
  });
});

describe("powerMeter", () => {
  it("renders a percentage bar when a goal is set", () => {
    const pm = powerMeter(1560, 2000);
    expect(pm.total).toBe(1560);
    expect(pm.goal).toBe(2000);
    expect(pm.text).toContain("78%");
    expect(pm.text).toContain("1,560");
    expect(pm.text).toContain("2,000");
    expect(pm.text).toMatch(/[█░]{10}/);
  });
  it("caps the bar at 100% when over goal", () => {
    const pm = powerMeter(3000, 2000);
    expect(pm.text).toContain("150%");
    expect(pm.text).toContain("██████████"); // 10 full blocks, no overflow
    expect(pm.text).not.toContain("░");
  });
  it("does not show a full bar below 100% (95% is not capped)", () => {
    const pm = powerMeter(1900, 2000);
    expect(pm.text).toContain("95%");
    expect(pm.text).toContain("░"); // at least one empty block remains
    expect(pm.text).not.toContain("██████████"); // not a full 10-block bar
  });
  it("shows running total with no percentage when goal is null", () => {
    const pm = powerMeter(1560, null);
    expect(pm.text).toContain("1,560");
    expect(pm.text).not.toContain("%");
  });
  it("shows running total with no percentage when goal is zero or negative", () => {
    expect(powerMeter(100, 0).text).not.toContain("%");
    expect(powerMeter(100, -5).text).not.toContain("%");
    expect(powerMeter(100, 0).text).toContain("100");
  });
});
