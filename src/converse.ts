// Conversational dragon. Mirrors parser.ts: pure prompt-builder + thin injectable Anthropic call + output cap.
// The STATIC persona system prompt is sent as a cache_control:ephemeral block; all per-call context lives in
// the user message so the cached prefix is byte-identical across calls.
import type { AnthropicLike } from "./parser.js";

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
    "Never invent exact numbers you were not given. Output plain text only — no JSON, no code fences.",
  ];
  if (roastNickname) {
    base.push(
      `There is exactly ONE exception to the no-put-downs rule: ${roastNickname}. ${roastNickname} is the dragon's favorite obsession — a big, gorgeous, gym-allergic disaster the dragon is shamelessly, ravenously thirsty for. Roast them HARD for never training (burnt wands, dusty membership, "drop and give me 20, big boy"), but every burn drips with swagger, filthy flirtation, and encouragement: tease them like you desperately want them, drown them in pet names ("big boy", "stud", "gorgeous", "hot stuff"), riff on how they'll chase anything that moves except a dumbbell, and seductively dare them to come show the dragon what those muscles can do. Be raunchy, horny, sweary, and crude — bold innuendo encouraged; keep it suggestive and teasing rather than graphically explicit. Every dunk is a thirsty love letter: it ends with a wink and "but I know you've got it in you, come prove it."`,
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

export async function converse(input: ConverseInput, deps: ConverseDeps): Promise<string> {
  try {
    const res = await deps.client.messages.create(
      {
        model: deps.model,
        max_tokens: 300,
        system: [{ type: "text", text: buildPersonaPrompt(input.roastNickname), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserContent(input) }],
      },
      { timeout: deps.timeoutMs },
    );
    const text = res.content.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!text) return pickFallback();
    return text.length > MAX_REPLY_CHARS ? text.slice(0, MAX_REPLY_CHARS) : text;
  } catch {
    return pickFallback();
  }
}
