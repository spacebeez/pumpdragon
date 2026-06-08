// dragon-bot/src/timewindow.ts
export type TimeWindow =
  | { kind: "thisMonth" }
  | { kind: "lastMonth" }
  | { kind: "namedMonth"; year: number; month: number } // month: 1–12
  | { kind: "yearToDate" }
  | { kind: "allTime" };

// tz is IANA-validated in loadConfig before reaching SQL (same guarantee as queries.ts).
// year/month in namedMonth are numbers, so interpolation here is injection-safe.
export function windowSql(tz: string, w: TimeWindow): string {
  const local = `created_at AT TIME ZONE '${tz}'`;
  const nowLocal = `now() AT TIME ZONE '${tz}'`;
  switch (w.kind) {
    case "thisMonth":
      return `date_trunc('month', ${local}) = date_trunc('month', ${nowLocal})`;
    case "lastMonth":
      return `date_trunc('month', ${local}) = date_trunc('month', ${nowLocal} - interval '1 month')`;
    case "namedMonth": {
      const mm = String(w.month).padStart(2, "0");
      return `date_trunc('month', ${local}) = date '${w.year}-${mm}-01'`;
    }
    case "yearToDate":
      return `date_trunc('year', ${local}) = date_trunc('year', ${nowLocal})`;
    case "allTime":
      return "TRUE";
  }
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

/** Pure text → TimeWindow, or null if the text names no recognizable window. `now` anchors relative windows. */
export function parseTimeWindow(text: string, now: Date): TimeWindow | null {
  // input is already lowercased, so no /i flag needed on the prefix strip.
  // strip every board synonym isScoreboardRequest accepts, so "rank last month" etc. carry the window too.
  const t = text.trim().toLowerCase().replace(/^(board|scoreboard|standings|leaderboard|scores|ranks?|rankings?|in|for)\s+/, "").trim();
  if (t === "last month") return { kind: "lastMonth" };
  if (t === "year" || t === "this year" || t === "ytd" || t === "year to date") return { kind: "yearToDate" };
  if (t === "alltime" || t === "all time" || t === "all-time" || t === "lifetime") return { kind: "allTime" };

  const m = t.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (m && MONTHS[m[1]!] !== undefined) {
    const month = MONTHS[m[1]!]!;
    const nowYear = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth() + 1;
    const year = m[2] ? Number(m[2]) : month > nowMonth ? nowYear - 1 : nowYear;
    return { kind: "namedMonth", year, month };
  }
  return null;
}
