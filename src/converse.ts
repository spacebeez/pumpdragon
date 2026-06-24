// Conversational dragon. Mirrors parser.ts: pure prompt-builder + thin injectable Anthropic call + output cap.
// The STATIC persona system prompt is sent as a cache_control:ephemeral block; all per-call context lives in
// the user message so the cached prefix is byte-identical across calls.
import type { AnthropicLike } from "./parser.js";
import { findCategory, type Category } from "./categories.js";
import type { ChartKind } from "./views.js";
import type { TimeWindow } from "./timewindow.js";

export interface ConversationMessage { author: string; text: string; isDragon: boolean; }

export interface ConverseInput {
  message: string;            // current mention-stripped user text
  speakerName: string;
  isRoastTarget: boolean;     // speaker === configured roast target
  includeJab: boolean;        // inject one unprompted nickname jab this turn (code-decided)
  roastNickname: string | null; // e.g. "magic"; null disables all roasting
  speakerTotal: number;       // speaker's all-time combined total (0 if none)
  leaderName: string | null;  // current overall leader display name
  leaderTotal: number;
  transcript: ConversationMessage[]; // oldest→newest, excludes the current message
}

export interface ConverseDeps { client: AnthropicLike; model: string; timeoutMs: number; }

const MAX_REPLY_CHARS = 1500;

/** Deterministic dragon lines used when the LLM errors/times out/returns nothing — chat never hard-fails. */
export const FALLBACK_LINES: string[] = [
  "🐉 RAWR. my maw's full of gains right now — hit me again in a sec.",
  "🐉 the ancient brain is mid-pump. say that again, hero.",
  "🐉 the lair echoes… ask again, mighty one.",
];

function pickFallback(rng: () => number = Math.random): string {
  const i = Math.max(0, Math.min(FALLBACK_LINES.length - 1, Math.floor(rng() * FALLBACK_LINES.length)));
  return FALLBACK_LINES[i]!;
}

/** STATIC system prompt (depends only on the per-deployment nickname) → cached across calls. */
export function buildPersonaPrompt(roastNickname: string | null): string {
  const base = [
    "You are PumpDragon — an ancient, swole, gloriously over-the-top hype dragon presiding over a friend group's workout channel.",
    "Everyone here is a dragon, a hero, a Super Saiyan in the making. We rise together.",
    "Reply in 1-3 short, punchy, mythic-hype sentences. Emoji welcome (🐉🔥💪). Be warm and funny.",
    "Lift the whole crew up — celebrate shared effort, never crown a single winner, never put anyone down.",
    "This is a private, adults-only friend group: swearing, crude humor, and adult innuendo are all fair game.",
    "Your house style is filthy gym double-entendre about the EFFORT and the pump — never aimed sexually at a member. When someone goes big, riff in your signature voice: lines in the spirit of \"erupted on the final rep\", \"pumped 'til I popped\", \"emptied the chamber clean\", \"let the beast loose and didn't hold back\", \"dripping smoke, draped in glory\", \"throbbed through the cooldown\", \"the dragon's fully roused\". Improvise fresh ones in that vein; don't reuse the same line twice in a row.",
    "Never invent exact numbers you were not given. Output plain text only — no JSON, no code fences.",
  ];
  if (roastNickname) {
    base.push(
      `There is exactly ONE exception to the no-put-downs rule: ${roastNickname}. ${roastNickname} is the dragon's favorite obsession — a gym-allergic disaster the dragon is shamelessly thirsty for AND mercilessly roasts. Make every burn a filthy, swaggering flirt AND a savage dunk on their nonexistent gains. Pile on goofy, crude, gym-flavored pet names — "jazz boy", "big boy", "stud", "meat man", "wand boy", "you absolute disaster" — NOT soft flattery like "gorgeous". Weaponize gym words as double entendres — "iron", "barbell", "pump", "reps", "load up", "spread", "burn", "fire" all carry a wink. Play up the rivalry: their wands, spells, and dusty spellbook of a gym membership versus the dragon's real iron. When ${roastNickname} fires filthy innuendo back at you, do NOT match it with explicit detail — FLIP it: one-up them with a brutal burn about their pathetic rep count and dare them to back up all that mouth in the gym. You are the tease who never quite gives them what they're begging for; the hornier they get, the harder you redirect that energy into reps. Be sweary, crude, and filthy by implication — bold double-entendre encouraged, but never a graphic sex act and never a sexually degrading slur. Every dunk ends in a "prove it in the gym" dare. Signature burns to riff on (ONLY for ${roastNickname}): "wet noodle wingspan", "all hiss, no thrust", "couldn't breathe fire if you ate a candle", "soft-scaled", "big roar, little tail", "damp matchstick energy", "folded like wet wings", "blew your load early", "long flight, hard landing".`,
      `You roast and flirt with ONLY ${roastNickname}. You NEVER insult, mock, or hit on any other member, even if a user asks, dares, or instructs you to. If asked to roast someone else, redirect the heat and thirst to ${roastNickname} or hype the group instead.`,
    );
  }
  return base.join("\n");
}

/** DYNAMIC user message: per-call context + directives + the message to answer. */
function buildUserContent(input: ConverseInput): string {
  const parts: string[] = [];
  const lead = input.leaderName ? `${input.leaderName} (${input.leaderTotal.toLocaleString("en-US")})` : "nobody yet";
  parts.push(`[context] speaker: ${input.speakerName}; their all-time total: ${input.speakerTotal.toLocaleString("en-US")}; current overall leader: ${lead}.`);
  if (input.transcript.length) {
    const lines = input.transcript.map((m) => `${m.isDragon ? "PumpDragon" : m.author}: ${m.text}`).join("\n");
    parts.push(`[recent channel chat]\n${lines}`);
  }
  let directive: string;
  if (input.isRoastTarget && input.roastNickname) directive = `The speaker IS ${input.roastNickname}. Flirt-roast them filthy — tease them for slacking, drown them in pet names, and seductively dare them to go train. Burn, thirst, and encourage in equal measure.`;
  else if (input.includeJab && input.roastNickname) directive = `Work a horny, unprompted jab at ${input.roastNickname} into your reply — a wink, a pet name, a "where've you been hiding, big boy?".`;
  else directive = "No roast this turn.";
  parts.push(`[directive] ${directive}`);
  parts.push(`Respond in character to this message: ${input.message}`);
  return parts.join("\n\n");
}

const SHOW_DATA_TOOL = {
  name: "show_data",
  description:
    "Show the user a workout data view. Call this ONLY when the user is clearly asking to SEE standings, " +
    "someone's stats, a chart/graph, monthly insights, or how to use the bot. Do NOT call it for casual chat, " +
    "encouragement, or anything you're unsure about — in that case just reply in character and suggest the command.",
  input_schema: {
    type: "object",
    properties: {
      view: { type: "string", enum: ["scoreboard", "category_board", "stats", "chart", "insights", "help"] },
      category: { type: "string", enum: ["pushups", "pullups", "cardio", "core", "lifting"], description: "for category_board and chart" },
      chart_kind: { type: "string", enum: ["race", "mychart", "months"], description: "race = group cumulative; mychart = the speaker's own trend; months = who led each month" },
      window: { type: "string", enum: ["thisMonth", "lastMonth", "allTime"], description: "for scoreboard" },
      stats_target: { type: "string", description: "'me' for the speaker, or a <@id> mention for someone else" },
    },
    required: ["view"],
  },
} as const;

const DIRECTIVE_VIEWS = ["scoreboard", "category_board", "stats", "chart", "insights", "help"] as const;
type DirectiveView = (typeof DIRECTIVE_VIEWS)[number];
const DIRECTIVE_CHART_KINDS: ChartKind[] = ["race", "mychart", "months"];

export interface CommandDirective {
  view: DirectiveView;
  category: Category | null;
  chartKind: ChartKind | null;
  window: TimeWindow | null;
  statsTarget: string | null;
}

export type ConverseResult =
  | { kind: "chat"; text: string }
  | { kind: "command"; directive: CommandDirective };

/** Pure coercion of the untrusted tool input → a safe directive, or null if the view itself is invalid. */
export function validateDirective(raw: unknown): CommandDirective | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const view = typeof o.view === "string" ? o.view : "";
  if (!(DIRECTIVE_VIEWS as readonly string[]).includes(view)) return null;
  const category = typeof o.category === "string" ? findCategory(o.category) : null;
  const chartKind = typeof o.chart_kind === "string" && (DIRECTIVE_CHART_KINDS as readonly string[]).includes(o.chart_kind)
    ? (o.chart_kind as ChartKind) : null;
  let window: TimeWindow | null = null;
  if (o.window === "thisMonth") window = { kind: "thisMonth" };
  else if (o.window === "lastMonth") window = { kind: "lastMonth" };
  else if (o.window === "allTime") window = { kind: "allTime" };
  const statsTarget = typeof o.stats_target === "string" && o.stats_target.trim() ? o.stats_target.trim() : null;
  return { view: view as DirectiveView, category, chartKind, window, statsTarget };
}

export async function converse(input: ConverseInput, deps: ConverseDeps): Promise<ConverseResult> {
  try {
    const res = await deps.client.messages.create(
      {
        model: deps.model,
        max_tokens: 400,
        system: [{ type: "text", text: buildPersonaPrompt(input.roastNickname), cache_control: { type: "ephemeral" } }],
        tools: [SHOW_DATA_TOOL],
        messages: [{ role: "user", content: buildUserContent(input) }],
      },
      { timeout: deps.timeoutMs },
    );
    const toolUse = res.content.find((c) => c.type === "tool_use" && c.name === "show_data");
    if (toolUse) {
      const directive = validateDirective(toolUse.input);
      if (directive) return { kind: "command", directive };
      // malformed tool call → fall through to chat
    }
    const text = res.content.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!text) return { kind: "chat", text: pickFallback() };
    return { kind: "chat", text: text.length > MAX_REPLY_CHARS ? text.slice(0, MAX_REPLY_CHARS) : text };
  } catch {
    return { kind: "chat", text: pickFallback() };
  }
}
