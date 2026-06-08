import { findCategory, CATEGORIES, type Category } from "./categories.js";
import type { ParseResult, ParsedItem } from "./types.js";

interface RawItem {
  category?: unknown;
  quantity?: unknown;
  detail?: unknown;
}

function cleanDetail(d: unknown): string | null {
  if (typeof d !== "string") return null;
  // cap by code points (spread iterates code points) so we never split a surrogate pair —
  // e.g. an emoji in the activity ("ran 🏃") truncates cleanly instead of leaving a lone half.
  const t = [...d.trim()].slice(0, 60).join("");
  return t.length ? t : null;
}

/** Pure validation/coercion of whatever the model returned. Never throws. */
export function validateParse(raw: unknown): ParseResult {
  const unparsed: string[] = [];
  const sums = new Map<Category, number>();
  const details = new Map<Category, string>(); // first non-empty detail wins per category

  const obj = (raw ?? {}) as { items?: unknown; unparsed?: unknown };

  if (Array.isArray(obj.unparsed)) {
    for (const u of obj.unparsed) if (typeof u === "string" && u.trim()) unparsed.push(u.trim());
  }

  const items: RawItem[] = Array.isArray(obj.items) ? (obj.items as RawItem[]) : [];
  for (const it of items) {
    const catToken = typeof it?.category === "string" ? it.category : "";
    const cat = catToken ? findCategory(catToken) : null;
    const qtyNum = Number(it?.quantity);
    if (!cat) {
      unparsed.push(`${catToken || "?"} ${it?.quantity ?? ""}`.trim());
      continue;
    }
    if (!Number.isFinite(qtyNum)) {
      unparsed.push(`${catToken} ${String(it?.quantity ?? "")}`.trim());
      continue;
    }
    const rounded = Math.round(qtyNum);
    if (rounded < 1) {
      unparsed.push(`${catToken} ${qtyNum}`.trim());
      continue;
    }
    sums.set(cat, (sums.get(cat) ?? 0) + rounded);
    const d = cleanDetail(it?.detail);
    if (d && !details.has(cat)) details.set(cat, d);
  }

  const merged: ParsedItem[] = [...sums.entries()].map(([category, quantity]) => ({
    category, quantity, detail: details.get(category) ?? null,
  }));
  return { items: merged, unparsed };
}

export function buildSystemPrompt(): string {
  const lines = CATEGORIES.map((c) => `- "${c.name}" (unit: ${c.unit}; e.g. ${c.aliases.slice(0, 3).join(", ")})`).join("\n");
  return [
    "You convert a short fitness log into JSON. The five categories are:",
    lines,
    "",
    'Return ONLY a JSON object of the form: {"items":[{"category":"cardio","quantity":20,"detail":"trail running"}],"unparsed":[]}.',
    "- items: one object per activity, each with a string \"category\", a numeric \"quantity\" (reps or minutes), and an optional short \"detail\" capturing the user's own words for the activity (e.g. \"trail running\", \"bench press\"); omit detail or use null when they only named the bare category.",
    "- always return items as an array, even for a single activity.",
    '- map any cardio-ish activity (running, cycling, rowing, etc.) to "cardio".',
    "- anything you cannot confidently map goes in unparsed as the original phrase (a string). Do NOT guess.",
    '- if nothing maps, return {"items":[],"unparsed":["...the original text..."]}.',
    "- output JSON only, no prose, no code fences.",
  ].join("\n");
}

/** Minimal shape of the Anthropic client we use (so it can be faked in tests). */
export interface AnthropicLike {
  messages: {
    create: (
      body: unknown,
      options?: { timeout?: number },
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface ParseDeps {
  client: AnthropicLike;
  model: string;
  timeoutMs: number;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // strip ```json ... ``` fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function parseActivities(rest: string, deps: ParseDeps): Promise<ParseResult> {
  const res = await deps.client.messages.create(
    {
      model: deps.model,
      max_tokens: 512,
      system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: rest }],
    },
    { timeout: deps.timeoutMs },
  );
  const text = res.content.find((c) => c.type === "text")?.text ?? "";
  return validateParse(extractJson(text));
}
