import type { PowerMeter } from "./types.js";

const HYPE_MULTIPLIER = 1.5;
const HYPE_MIN_PRIORS = 3;
const BAR_WIDTH = 10;

export function trailingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function isHype(quantity: number, average: number, priorCount: number): boolean {
  if (priorCount < HYPE_MIN_PRIORS) return false;
  if (average <= 0) return false;
  return quantity > HYPE_MULTIPLIER * average;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function powerMeter(total: number, goal: number | null): PowerMeter {
  if (goal === null || goal <= 0) {
    return { total, goal, text: `${fmt(total)} logged this month (no goal set yet)` };
  }
  const ratio = total / goal;
  // floor so the bar only fills a block once that block is fully earned —
  // a 95% meter must not render as a full bar (that's reserved for >=100%).
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.floor(ratio * BAR_WIDTH)));
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  const pct = Math.round(ratio * 100);
  return { total, goal, text: `${bar} ${pct}% — ${fmt(total)} / ${fmt(goal)}` };
}
