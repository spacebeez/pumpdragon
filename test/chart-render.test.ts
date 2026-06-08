import { describe, it, expect } from "vitest";
import { ChartRenderer } from "../src/chart/renderer.js";

function isPng(b: Buffer): boolean {
  return b.length > 100 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

describe("ChartRenderer", () => {
  it("produces a valid PNG buffer after drawing primitives", () => {
    const r = new ChartRenderer(400, 300);
    r.background("#0d0d12");
    r.text("hello", 10, 20, { font: "16px sans-serif", color: "#fff" });
    r.line(0, 0, 100, 100, { color: "#fff", width: 2 });
    r.polyline([[0, 0], [50, 50], [100, 25]], { color: "#f00", width: 3 });
    r.rect(10, 10, 30, 40, { color: "#0f0" });
    expect(isPng(r.toBuffer())).toBe(true);
  });
  it("skips polylines with fewer than 2 points without throwing", () => {
    const r = new ChartRenderer(100, 100);
    r.background("#000");
    r.polyline([[10, 10]], { color: "#fff", width: 1 });
    expect(isPng(r.toBuffer())).toBe(true);
  });
});
import { renderRaceChart } from "../src/chart/raceChart.js";
import { renderTrendChart } from "../src/chart/trendChart.js";
import { renderMonthsChart } from "../src/chart/monthsChart.js";

const names = new Map([["a", "Matt"], ["b", "Jeddy"], ["others", "others"]]);

describe("renderRaceChart", () => {
  it("renders a multi-line race to a PNG", () => {
    const axis = ["2024-06", "2024-07", "2024-08"];
    const lines = [
      { userId: "a", points: [10, 20, 35], total: 35 },
      { userId: "b", points: [null, 5, 12], total: 12 },
    ];
    expect(isPng(renderRaceChart({ axis, lines, names, title: "RACE", unit: "reps" }))).toBe(true);
  });
  it("single point / single month does not throw", () => {
    const buf = renderRaceChart({ axis: ["2024-06"], lines: [{ userId: "a", points: [10], total: 10 }], names, title: "RACE", unit: "reps" });
    expect(isPng(buf)).toBe(true);
  });
});

describe("renderTrendChart", () => {
  it("renders a single trend line to a PNG", () => {
    expect(isPng(renderTrendChart({ axis: ["2025-01", "2025-02"], values: [120, 90], title: "YOU", subtitle: "cardio", unit: "min" }))).toBe(true);
  });
});

describe("renderMonthsChart", () => {
  it("renders stacked monthly bars to a PNG", () => {
    const axis = ["2025-01", "2025-02"];
    const built = { users: ["a", "others"], perMonth: [[100, 15], [50, 7]] };
    expect(isPng(renderMonthsChart({ axis, ...built, names, title: "MONTHS", unit: "reps" }))).toBe(true);
  });
});
