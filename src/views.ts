// dragon-bot/src/views.ts
import { findCategory, type Category } from "./categories.js";

const MENTION_RE = /<@!?(\d+)>/;

/** The category if the WHOLE trimmed text is a single category word/alias; else null. */
export function categoryViewOf(text: string): Category | null {
  const t = text.trim();
  if (!t || /\s/.test(t) || /\d/.test(t)) return null;
  return findCategory(t);
}

export type StatsRequest = { self: true } | { self: false; userId: string };

/** `me` / `stats` / `stats @user` → a stats request; else null. */
export function parseStatsRequest(text: string): StatsRequest | null {
  const t = text.trim().toLowerCase();
  if (t === "me" || t === "stats") return { self: true };
  // word-boundary, not a prefix: "statsmania" must NOT enter the stats branch
  if (/^stats\s/.test(t)) {
    const m = text.match(MENTION_RE);
    if (m) return { self: false, userId: m[1]! };
  }
  return null;
}

const HELP_RE = /^(help|commands|what can you do\??|how do i use you\??|what do you do\??)$/i;

/** True if the whole text is asking for help (not "help me do 50 pushups"). */
export function isHelpRequest(text: string): boolean {
  return HELP_RE.test(text.trim());
}

export type ChartKind = "race" | "mychart" | "months";
export interface ChartRequest { kind: ChartKind; category: Category; }

const CHART_KINDS: ChartKind[] = ["race", "mychart", "months"];
const DEFAULT_CHART_CATEGORY: Category = "pushups";

/** `race` / `mychart` / `months` optionally followed by a category alias.
 *  Bare command → default pushups. An UNRECOGNIZED trailing token → null (don't silently default). */
export function parseChartRequest(text: string): ChartRequest | null {
  const parts = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const kind = parts[0] as ChartKind;
  if (!CHART_KINDS.includes(kind)) return null;
  if (parts.length === 1) return { kind, category: DEFAULT_CHART_CATEGORY };
  const category = findCategory(parts[1]!);
  return category ? { kind, category } : null;
}

const INSIGHTS_RE = /^(insights|insight|recap stats|stats recap)$/i;

/** True if the whole text is asking for the insights summary. */
export function isInsightsRequest(text: string): boolean {
  return INSIGHTS_RE.test(text.trim());
}
