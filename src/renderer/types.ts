import type { EmbedBuilder } from "discord.js";
import type { Category } from "../categories.js";

export interface LoggedLine {
  category: Category;
  quantity: number;
  userMonthlyTotal: number;
  unit: string;
}

export interface LogReplyPayload {
  /** Display name of the person whose entry was logged. */
  loggedBy: string;
  logged: LoggedLine[];
  unparsed: string[];
  hypeLine: string | null;
  powerMeterText: string;
  /** Flare lines for achievements unlocked by this log (rendered as one highlighted field). */
  achievements?: string[];
}

export interface StandingsGroup {
  category: Category;
  unit: string;
  rows: { userId: string; total: number }[];
}

export interface RecapPayload {
  /** Per-person total across all categories (naive sum), ranked high→low. */
  overall: { userId: string; total: number }[];
  standings: StandingsGroup[];
  powerMeterText: string;
  /** Optional embed title; defaults to the daily-recap title. */
  title?: string;
}

export interface CategoryBoardPayload {
  title: string;
  category: Category;
  unit: string;
  rows: { userId: string; total: number }[];
}

export interface StatsCardPayload {
  name: string;           // already-resolved display name (no raw mention)
  rank: number | null;    // null if the user has no entries in the window
  rankOf: number;
  lines: { category: Category; unit: string; total: number }[];
  userTotal: number;      // this user's combined total for the window
  groupTotal: number;     // whole-group combined total for the window
  goal: number | null;    // current group goal (for context), or null
}

export interface HelpPayload {
  isAdmin: boolean;
}

export interface CeremonyMvp {
  category: Category;
  userId: string;
  total: number;
  unit: string;
}

export interface CeremonyPayload {
  title: string;
  collectiveLine: string;
  powerMeterText: string;
  mvps: CeremonyMvp[];
  risingStars: string[];   // preformatted lines
  ribs: string[];          // preformatted lines
  momentsLine: string | null;
  participants: string[];  // userIds (rendered as non-pinging mentions)
  closeLine: string;
}

export interface Renderer {
  logReply(p: LogReplyPayload): EmbedBuilder;
  recap(p: RecapPayload): EmbedBuilder;
  categoryBoard(p: CategoryBoardPayload): EmbedBuilder;
  statsCard(p: StatsCardPayload): EmbedBuilder;
  help(p: HelpPayload): EmbedBuilder;
  ceremony(p: CeremonyPayload): EmbedBuilder;
}

export interface Reply {
  content?: string;
  embed?: EmbedBuilder;
  files?: { name: string; buffer: Buffer }[];
}
