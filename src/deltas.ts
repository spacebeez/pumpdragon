// dragon-bot/src/deltas.ts
import type { StandingRow, OverallRow } from "./db/queries.js";
import type { Category } from "./categories.js";

export interface MonthRef { year: number; month: number; } // month: 1–12

/** The calendar month immediately before the given one. */
export function previousMonthOf(m: MonthRef): MonthRef {
  return m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 };
}

/** The month that just ended relative to `now`, computed in `tz` (so a 1st-of-month fire is robust). */
export function lastCompletedMonth(now: Date, tz: string): MonthRef {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now));
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(now));
  return previousMonthOf({ year, month });
}

export interface Improvement { userId: string; category: Category; pct: number; current: number; previous: number; }

/** Per-(user,category) month-over-month % gain, biggest first. Requires a real prior and a meaningful
 *  current so tiny numbers don't dominate; excludes brand-new (previous=0) — that's not "improvement". */
export function mostImproved(
  current: StandingRow[], previous: StandingRow[],
  opts: { minPrevious?: number; minCurrent?: number; limit?: number } = {},
): Improvement[] {
  const minPrevious = opts.minPrevious ?? 1;
  const minCurrent = opts.minCurrent ?? 1;
  const limit = opts.limit ?? 2;
  const prevMap = new Map<string, number>();
  for (const r of previous) prevMap.set(`${r.userId}|${r.category}`, r.total);
  const out: Improvement[] = [];
  for (const r of current) {
    const prev = prevMap.get(`${r.userId}|${r.category}`) ?? 0;
    if (prev < minPrevious || r.total < minCurrent || r.total <= prev) continue;
    out.push({ userId: r.userId, category: r.category, pct: Math.round(((r.total - prev) / prev) * 100), current: r.total, previous: prev });
  }
  out.sort((a, b) => b.pct - a.pct);
  return out.slice(0, limit);
}

export interface FallOff { userId: string; previous: number; current: number; pctDrop: number; }

/** Per-user overall drops: logged a real amount last month (>= minPrevious) but fell below
 *  (1 - dropFraction) of it this month (including all the way to 0). Biggest drop first. */
export function fallOffs(
  current: OverallRow[], previous: OverallRow[],
  opts: { minPrevious?: number; dropFraction?: number; limit?: number } = {},
): FallOff[] {
  const minPrevious = opts.minPrevious ?? 50;
  const dropFraction = opts.dropFraction ?? 0.5;
  const limit = opts.limit ?? 2;
  const curMap = new Map<string, number>();
  for (const r of current) curMap.set(r.userId, r.total);
  const out: FallOff[] = [];
  for (const r of previous) {
    if (r.total < minPrevious) continue;
    const cur = curMap.get(r.userId) ?? 0;
    if (cur >= r.total * (1 - dropFraction)) continue;
    out.push({ userId: r.userId, previous: r.total, current: cur, pctDrop: Math.round(((r.total - cur) / r.total) * 100) });
  }
  out.sort((a, b) => b.pctDrop - a.pctDrop);
  return out.slice(0, limit);
}
