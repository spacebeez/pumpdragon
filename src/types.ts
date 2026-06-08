import type { Category } from "./categories.js";
import type { MonthRef } from "./deltas.js";

export interface ParsedItem {
  category: Category;
  quantity: number; // positive integer
  detail: string | null; // original activity phrasing, e.g. "trail running"; null if none
}

export interface ParseResult {
  items: ParsedItem[];
  unparsed: string[];
}

/** A row returned from insertEntries: the new monthly total + trailing avg context per logged category. */
export interface LogResultRow {
  category: Category;
  quantity: number; // what was logged this message (post-sum)
  userMonthlyTotal: number; // this user's total for this category, current month
  trailingAverage: number; // avg of last 10 user+category source='user' entries (excludes the new one)
  priorCount: number; // # of prior source='user' entries used for the average
  hype: boolean; // computed by scoring at insert time
  detail: string | null; // flavor of the triggering entry (post-merge), for hype callbacks
}

export interface PowerMeter {
  total: number;
  goal: number | null;
  /** e.g. "████████░░ 78% — 1,560 / 2,000" or "1,560 logged this month (no goal set)" */
  text: string;
}

export type AdminCommand =
  | { kind: "add"; quantity: number; category: Category; targetUserId: string }
  | { kind: "remove"; quantity: number; category: Category; targetUserId: string }
  | { kind: "goal"; amount: number }
  | { kind: "closeMonth"; month: MonthRef | null }; // null = the last completed month
