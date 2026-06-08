// Pure data-shaping for charts. No canvas, no DB. Months are "YYYY-MM" strings (chronologically sortable).

export type MonthKey = string;

export const OTHERS_ID = "others";

/** A date → "YYYY-MM" in UTC. */
export function monthKey(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive chronological "YYYY-MM" list from start to end. Empty if end < start. */
export function buildMonthAxis(start: MonthKey, end: MonthKey): MonthKey[] {
  const [sy, sm] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  const out: MonthKey[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export interface CumPoint { userId: string; month: MonthKey; cumulative: number; }
export interface RaceLine { userId: string; points: (number | null)[]; total: number; }

/** Build forward-filled cumulative lines aligned to `axis`, one per user, sorted by final total desc.
 *  A line is null for months before the user's first data point (not yet on the board). */
export function buildRaceSeries(rows: CumPoint[], axis: MonthKey[]): RaceLine[] {
  const byUser = new Map<string, Map<MonthKey, number>>();
  for (const r of rows) {
    let mm = byUser.get(r.userId);
    if (!mm) { mm = new Map(); byUser.set(r.userId, mm); }
    mm.set(r.month, r.cumulative);
  }
  const lines: RaceLine[] = [];
  for (const [userId, mm] of byUser) {
    const points: (number | null)[] = [];
    let carry: number | null = null;
    for (const mk of axis) {
      if (mm.has(mk)) carry = mm.get(mk)!;
      points.push(carry);
    }
    const total = carry ?? 0;
    lines.push({ userId, points, total });
  }
  lines.sort((a, b) => b.total - a.total);
  return lines;
}

export interface MonthQty { month: MonthKey; qty: number; }

/** Per-month values aligned to `axis`; months with no data become 0. */
export function buildTrendSeries(rows: MonthQty[], axis: MonthKey[]): number[] {
  const m = new Map(rows.map((r) => [r.month, r.qty]));
  return axis.map((mk) => m.get(mk) ?? 0);
}

/** Top N ids by their total value, descending. */
export function topUsersByTotal(totals: Map<string, number>, n: number): string[] {
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

export interface UserMonthQty { month: MonthKey; userId: string; qty: number; }
export interface StackedMonths { users: string[]; perMonth: number[][] }

/** Stacked monthly totals. The top-N users (by lifetime total) keep their own segment; everyone
 *  else collapses into a trailing OTHERS_ID segment (omitted entirely if no one is left over).
 *  `perMonth[i]` is aligned to `users` and to `axis[i]`. */
export function buildStackedMonths(rows: UserMonthQty[], axis: MonthKey[], topN: number): StackedMonths {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.userId, (totals.get(r.userId) ?? 0) + r.qty);
  const top = topUsersByTotal(totals, topN);
  const topSet = new Set(top);
  const hasOthers = [...totals.keys()].some((id) => !topSet.has(id));
  const users = hasOthers ? [...top, OTHERS_ID] : [...top];

  const idx = new Map(users.map((u, i) => [u, i]));
  const perMonth = axis.map(() => new Array<number>(users.length).fill(0));
  const monthIdx = new Map(axis.map((mk, i) => [mk, i]));
  for (const r of rows) {
    const mi = monthIdx.get(r.month);
    if (mi === undefined) continue;
    const ui = idx.get(topSet.has(r.userId) ? r.userId : OTHERS_ID);
    if (ui === undefined) continue;
    perMonth[mi]![ui]! += r.qty;
  }
  return { users, perMonth };
}

// ── Axis label helpers (pure presentation, shared by the chart composers) ──

const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2024-06" → "Jun '24". Defensive against malformed keys (never throws, never renders "undefined"). */
export function shortMonth(mk: MonthKey): string {
  const parts = mk.split("-");
  if (parts.length < 2) return "? '00";
  const [y = "0000", m = "0"] = parts;
  const mon = MON[Number(m)] ?? "?";
  const yr = y.length >= 4 ? y.slice(2) : "00";
  return `${mon} '${yr}`;
}

/** ~`count` evenly-spaced indices into a `len`-long axis, so a 24-month axis stays readable. */
export function tickIndices(len: number, count = 8): number[] {
  if (len <= count) return Array.from({ length: len }, (_, i) => i);
  const step = (len - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
