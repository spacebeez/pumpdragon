// dragon-bot/src/scoreboarder.ts
import { findCategory, type Category } from "./categories.js";

/** A Scoreboarder message reduced to the text strings the parser needs. */
export interface NormalizedMessage {
  id: string;
  ts: string; // ISO timestamp
  texts: string[];
}

export interface ImportEvent {
  kind: "add" | "subtract" | "zero" | "set";
  amount: number | null; // null for zero
  target: string;        // "<@id>" verbatim, or a raw label (leading @ stripped)
  category: Category;
  ts: string;
  messageId: string;
}

/** Recursively pull all text-display `.content` strings out of components-v2 JSON. */
export function extractComponentTexts(components: unknown): string[] {
  const out: string[] = [];
  const walk = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      const node = c as { content?: unknown; components?: unknown };
      if (typeof node?.content === "string") out.push(node.content);
      if (Array.isArray(node?.components)) walk(node.components);
    }
  };
  walk(components);
  return out;
}

/** Pull title + description text out of OLD-format Scoreboarder rich embeds. */
export function extractEmbedTexts(embeds: unknown): string[] {
  const out: string[] = [];
  for (const e of (Array.isArray(embeds) ? embeds : [])) {
    const emb = e as { title?: unknown; description?: unknown };
    if (typeof emb?.title === "string") out.push(emb.title);
    if (typeof emb?.description === "string") out.push(emb.description);
  }
  return out;
}

const RE_ADD   = /^Added \*\*(\d+(?:\.\d+)?)\*\* to \*\*(.+?)\*\* in \*\*(.+?)\*\*\.?$/;
const RE_SUB   = /^Subtracted \*\*(\d+(?:\.\d+)?)\*\* points from \*\*(.+?)\*\* in \*\*(.+?)\*\*\.?$/;
const RE_ZERO  = /^Removed \*\*(.+?)\*\* from \*\*(.+?)\*\*\.?$/;
const RE_RESET = /^All points in \*\*(.+?)\*\* set to \*\*0\*\*\.?$/;
const RE_SET   = /^Set points to \*\*(\d+(?:\.\d+)?)\*\* points for \*\*(.+?)\*\* in \*\*(.+?)\*\*\.?$/;

/** A target keeps `<@id>` / `<@!id>` verbatim; a raw label loses only its leading `@`. */
function cleanTarget(t: string): string {
  const s = t.trim();
  return /^<@!?\d+>$/.test(s) ? s : s.replace(/^@/, "");
}

/** Strip a trailing parenthetical (e.g. " (30+ lbs)") before looking up the category,
 *  so "Lifting (30+ lbs)" resolves to "lifting" the same as plain "Lifting". */
const normCat = (raw: string) => findCategory(raw.replace(/\s*\([^)]*\)\s*$/, "").trim());

export type ParsedLine = Omit<ImportEvent, "ts" | "messageId">;

/** Parse one Scoreboarder detail line into a partial event, or null if it isn't a recognized ledger line.
 *  Category is resolved with the project's findCategory → ALL FIVE categories (+ aliases) map. */
export function parseLedgerLine(text: string): ParsedLine | null {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = RE_ADD.exec(t))) {
    const category = normCat(m[3]!);
    const amount = Number(m[1]);
    if (!category || !(Number.isFinite(amount) && Math.abs(amount) < 1e7)) return null; // reject absurd/overflowing amounts from untrusted text
    return { kind: "add", amount, target: cleanTarget(m[2]!), category };
  }
  if ((m = RE_SUB.exec(t))) {
    const category = normCat(m[3]!);
    const amount = Number(m[1]);
    if (!category || !(Number.isFinite(amount) && Math.abs(amount) < 1e7)) return null;
    return { kind: "subtract", amount, target: cleanTarget(m[2]!), category };
  }
  if ((m = RE_ZERO.exec(t))) {
    const category = normCat(m[2]!);
    if (!category) return null;
    return { kind: "zero", amount: null, target: cleanTarget(m[1]!), category };
  }
  if ((m = RE_RESET.exec(t))) {
    const category = normCat(m[1]!);
    if (!category) return null;
    return { kind: "zero", amount: null, target: "", category };
  }
  if ((m = RE_SET.exec(t))) {
    const category = normCat(m[3]!);
    const amount = Number(m[1]);
    if (!category || !(Number.isFinite(amount) && Math.abs(amount) < 1e7)) return null;
    return { kind: "set", amount, target: cleanTarget(m[2]!), category };
  }
  return null;
}

/** Parse a stream of normalized messages into ledger events (the first ledger line per message wins). */
export function parseScoreboarderLedger(messages: NormalizedMessage[]): ImportEvent[] {
  const events: ImportEvent[] = [];
  for (const msg of messages) {
    for (const text of msg.texts) {
      const p = parseLedgerLine(text);
      if (p) { events.push({ ...p, ts: msg.ts, messageId: msg.id }); break; }
    }
  }
  return events;
}

export interface ResolveResult { userId: string | null; reason?: string; }

const MENTION_RE = /^<@!?(\d+)>$/;

/** Resolve a ledger target to a Discord id: a mention yields its id directly; a raw label is looked up
 *  in the name map (exact, then lowercased). Unmapped → { userId: null, reason }. */
export function resolveTarget(target: string, nameMap: Record<string, string>): ResolveResult {
  const m = MENTION_RE.exec(target.trim());
  if (m) return { userId: m[1]! };
  const id = nameMap[target] ?? nameMap[target.toLowerCase()];
  return id ? { userId: id } : { userId: null, reason: `unmapped label: ${target}` };
}

/** Cardio had a 10× points rule change at `conversionAt`. Canonical scale = the post-changeover 10× points
 *  (the values everyone currently sees). So cardio ON/AFTER the date passes through unchanged, and
 *  PRE-changeover cardio (logged as raw minutes, 1×) is scaled UP ×10 to match. Non-cardio passes through;
 *  `conversionAt` null disables it. */
export function normalizeCardioAmount(
  category: Category, amount: number, ts: string, conversionAt: string | null,
): number {
  if (category !== "cardio" || conversionAt === null) return amount;
  const boundary = Date.parse(conversionAt);
  // fail loud on a misconfigured conversion date — silently passing through would leave the whole
  // pre-changeover cardio history on the wrong (1x) scale with no signal.
  if (Number.isNaN(boundary)) throw new Error(`normalizeCardioAmount: invalid conversionAt "${conversionAt}"`);
  return Date.parse(ts) >= boundary ? amount : amount * 10;
}

export interface LedgerRow {
  messageId: string;
  userId: string;
  category: Category;
  quantity: number; // signed; never 0
  ts: string;
}

export interface SkippedEvent { event: ImportEvent; reason: string; }

/** Replay events into signed `entries`-ready rows under a CUMULATIVE all-time model:
 *  add → +amount; subtract (a real correction) → −amount. The no-amount `zero` events are Scoreboarder's
 *  monthly board RESETS — they clear the displayed board, NOT a person's lifetime work — so they are
 *  IGNORED here. (Applying them would wipe each user's all-time total down to whatever they'd logged since
 *  their last reset, badly distorting rankings.) Unmapped targets, add/subtracts that resolve to 0, and the
 *  ignored resets are all reported in `skipped`. Output order follows input order (each row is independent). */
export function replayLedger(
  events: ImportEvent[], nameMap: Record<string, string>, cardioConversionAt: string | null,
): { rows: LedgerRow[]; skipped: SkippedEvent[] } {
  const rows: LedgerRow[] = [];
  const skipped: SkippedEvent[] = [];
  for (const e of events) {
    if (e.kind === "zero") { skipped.push({ event: e, reason: "monthly reset / zeroing ignored (cumulative all-time model)" }); continue; }
    if (e.kind === "set") { skipped.push({ event: e, reason: "absolute 'Set points' ignored — adjudicate manually" }); continue; }
    const r = resolveTarget(e.target, nameMap);
    if (!r.userId) { skipped.push({ event: e, reason: r.reason ?? "unresolved" }); continue; }
    const norm = normalizeCardioAmount(e.category, e.amount ?? 0, e.ts, cardioConversionAt);
    const rawQty = e.kind === "add" ? norm : -norm;
    const qty = Math.round(rawQty); // round to integer — entries.quantity is INTEGER; decimal ×10 (e.g. 13.67→136.7) must round
    if (qty === 0) { skipped.push({ event: e, reason: `${e.kind} resolved to 0 quantity (dropped): ${e.amount}` }); continue; } // entries.quantity CHECK (<> 0)
    rows.push({ messageId: e.messageId, userId: r.userId, category: e.category, quantity: qty, ts: e.ts });
  }
  return { rows, skipped };
}
