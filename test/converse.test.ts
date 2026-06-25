import { describe, it, expect } from "vitest";
import { buildPersonaPrompt, converse, validateDirective, FALLBACK_LINES, type ConverseInput } from "../src/converse.js";

const baseInput: ConverseInput = {
  message: "yo dragon what's up",
  speakerName: "Matt",
  isRoastTarget: false,
  includeJab: false,
  roastNickname: "magic",
  speakerTotal: 8000,
  leaderName: "Jeddy",
  leaderTotal: 148222,
  transcript: [],
};

// capturing fake client: records the request body, returns a fixed text
function capturing(text: string) {
  const calls: any[] = [];
  const client = { messages: { create: async (body: any) => { calls.push(body); return { content: [{ type: "text", text }] }; } } };
  return { client, calls };
}

// fake client that returns a single show_data tool_use block
function toolReturning(input: unknown) {
  const calls: any[] = [];
  const client = { messages: { create: async (body: any) => { calls.push(body); return { content: [{ type: "tool_use", name: "show_data", input }] }; } } };
  return { client, calls };
}

describe("buildPersonaPrompt", () => {
  it("contains the dragon persona", () => {
    const p = buildPersonaPrompt("magic");
    expect(p).toMatch(/dragon/i);
    expect(p).toMatch(/hero|goku|saiyan/i);
  });
  it("with a nickname, names it and hard-contains the roast to only that nickname", () => {
    const p = buildPersonaPrompt("magic");
    expect(p).toMatch(/magic/);
    expect(p).toMatch(/only/i);
    expect(p).toMatch(/never .*other member|never insult|never roast any other/i);
  });
  it("with null nickname, contains no roast language", () => {
    const p = buildPersonaPrompt(null);
    expect(p.toLowerCase()).not.toContain("roast");
  });
});

describe("converse", () => {
  it("returns the model text as a chat result, trimmed", async () => {
    const { client } = capturing("  RAWR brother 🐉  ");
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out).toEqual({ kind: "chat", text: "RAWR brother 🐉" });
  });
  it("puts the static persona in a cached system block and the dynamic context in the user message", async () => {
    const { client, calls } = capturing("ok");
    await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    const body = calls[0];
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    // dynamic context must NOT be in the cached system block...
    expect(body.system[0].text).not.toContain("Matt");
    expect(body.system[0].text).not.toContain("yo dragon what's up");
    // ...it must be in the user message
    const userMsg = body.messages[0].content as string;
    expect(userMsg).toContain("Matt");
    expect(userMsg).toContain("yo dragon what's up");
    expect(userMsg).toContain("Jeddy");
  });
  it("injects the roast directive when the speaker is the target", async () => {
    const { client, calls } = capturing("ok");
    await converse({ ...baseInput, isRoastTarget: true }, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(calls[0].messages[0].content).toMatch(/IS magic|dunk|train/i);
  });
  it("injects an unprompted jab directive when includeJab is set", async () => {
    const { client, calls } = capturing("ok");
    await converse({ ...baseInput, includeJab: true }, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(calls[0].messages[0].content).toMatch(/jab at magic/i);
  });
  it("includes the transcript when present", async () => {
    const { client, calls } = capturing("ok");
    await converse({ ...baseInput, transcript: [{ author: "Mart", text: "lol", isDragon: false }] }, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(calls[0].messages[0].content).toContain("Mart: lol");
  });
  it("returns a fallback chat line when the client throws", async () => {
    const client = { messages: { create: async () => { throw new Error("boom"); } } };
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("chat");
    if (out.kind === "chat") expect(FALLBACK_LINES).toContain(out.text);
  });
  it("returns a fallback chat line on an empty/non-text response", async () => {
    const client = { messages: { create: async () => ({ content: [] }) } };
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("chat");
    if (out.kind === "chat") expect(FALLBACK_LINES).toContain(out.text);
  });
  it("hard-caps an overlong chat reply", async () => {
    const { client } = capturing("x".repeat(5000));
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("chat");
    if (out.kind === "chat") expect(out.text.length).toBe(1500);
  });
});

describe("converse → command routing", () => {
  it("returns a command when the model calls show_data", async () => {
    const { client } = toolReturning({ view: "scoreboard", window: "lastMonth" });
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("command");
    if (out.kind === "command") {
      expect(out.directive.view).toBe("scoreboard");
      expect(out.directive.window).toEqual({ kind: "lastMonth" });
    }
  });
  it("coerces a category alias via findCategory", async () => {
    const { client } = toolReturning({ view: "chart", chart_kind: "race", category: "weights" });
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("command");
    if (out.kind === "command") {
      expect(out.directive.category).toBe("lifting");
      expect(out.directive.chartKind).toBe("race");
    }
  });
  it("degrades a malformed tool call (bad view) to chat", async () => {
    const { client } = toolReturning({ view: "nonsense" });
    const out = await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(out.kind).toBe("chat"); // no valid directive, no text → fallback line
    if (out.kind === "chat") expect(FALLBACK_LINES).toContain(out.text);
  });
  it("passes the show_data tool in the request body", async () => {
    const { client, calls } = capturing("ok");
    await converse(baseInput, { client: client as never, model: "x", timeoutMs: 1000 });
    expect(Array.isArray(calls[0].tools)).toBe(true);
    expect(calls[0].tools[0].name).toBe("show_data");
  });
});

describe("validateDirective", () => {
  it("maps a full valid input", () => {
    expect(validateDirective({ view: "category_board", category: "cardio", window: "allTime" })).toEqual({
      view: "category_board", category: "cardio", chartKind: null, window: { kind: "allTime" }, statsTarget: null,
    });
  });
  it("returns null for an invalid view", () => {
    expect(validateDirective({ view: "explode" })).toBeNull();
    expect(validateDirective({})).toBeNull();
  });
  it("accepts the achievements view", () => {
    expect(validateDirective({ view: "achievements", stats_target: "me" })).toMatchObject({ view: "achievements", statsTarget: "me" });
  });
  it("nulls out unknown optionals", () => {
    expect(validateDirective({ view: "chart", chart_kind: "bogus", category: "nope", window: "decade" })).toEqual({
      view: "chart", category: null, chartKind: null, window: null, statsTarget: null,
    });
  });
});
