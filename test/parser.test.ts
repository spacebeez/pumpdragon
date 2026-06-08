import { describe, it, expect } from "vitest";
import { validateParse, parseActivities, buildSystemPrompt } from "../src/parser.js";

describe("validateParse", () => {
  it("keeps valid items and rounds quantities to whole numbers", () => {
    const r = validateParse({ items: [{ category: "pushups", quantity: 50 }, { category: "cardio", quantity: 30.4 }], unparsed: [] });
    expect(r.items).toEqual([
      { category: "pushups", quantity: 50, detail: null },
      { category: "cardio", quantity: 30, detail: null },
    ]);
    expect(r.unparsed).toEqual([]);
  });

  it("sums duplicate categories within one message", () => {
    const r = validateParse({ items: [{ category: "cardio", quantity: 30 }, { category: "cardio", quantity: 20 }], unparsed: [] });
    expect(r.items).toEqual([{ category: "cardio", quantity: 50, detail: null }]);
  });

  it("moves unknown categories to unparsed", () => {
    const r = validateParse({ items: [{ category: "yoga", quantity: 10 }], unparsed: ["plank stuff"] });
    expect(r.items).toEqual([]);
    expect(r.unparsed).toContain("plank stuff");
    expect(r.unparsed.join(" ")).toContain("yoga");
  });

  it("drops quantities that round to <1 into unparsed", () => {
    const r = validateParse({ items: [{ category: "cardio", quantity: 0.3 }], unparsed: [] });
    expect(r.items).toEqual([]);
    expect(r.unparsed.length).toBe(1);
  });

  it("resolves category aliases", () => {
    const r = validateParse({ items: [{ category: "running", quantity: 25 }], unparsed: [] });
    expect(r.items).toEqual([{ category: "cardio", quantity: 25, detail: null }]);
  });

  it("tolerates a totally malformed shape without throwing", () => {
    expect(validateParse(null)).toEqual({ items: [], unparsed: [] });
    expect(validateParse({ foo: "bar" })).toEqual({ items: [], unparsed: [] });
    expect(validateParse({ items: "nope", unparsed: 5 })).toEqual({ items: [], unparsed: [] });
  });

  it("coerces numeric strings", () => {
    const r = validateParse({ items: [{ category: "pushups", quantity: "40" }], unparsed: [] });
    expect(r.items).toEqual([{ category: "pushups", quantity: 40, detail: null }]);
  });

  it("tolerates null/primitive elements inside the items array (LLM malformation)", () => {
    const r = validateParse({ items: [null, 42, "junk", { category: "pushups", quantity: 10 }], unparsed: [] });
    expect(r.items).toEqual([{ category: "pushups", quantity: 10, detail: null }]);
  });

  it("drops negative quantities to unparsed", () => {
    const r = validateParse({ items: [{ category: "pushups", quantity: -5 }], unparsed: [] });
    expect(r.items).toEqual([]);
    expect(r.unparsed.length).toBe(1);
  });
});

describe("buildSystemPrompt", () => {
  it("lists all five categories with units", () => {
    const p = buildSystemPrompt();
    for (const name of ["cardio", "pushups", "pullups", "core", "lifting"]) {
      expect(p).toContain(name);
    }
  });
});

describe("parseActivities", () => {
  const fakeClient = (text: string) => ({
    messages: { create: async () => ({ content: [{ type: "text", text }] }) },
  });

  it("returns validated items from a well-formed model reply", async () => {
    const client = fakeClient(JSON.stringify({ items: [{ category: "pushups", quantity: 50 }], unparsed: [] }));
    const r = await parseActivities("50 pushups", { client: client as never, model: "x", timeoutMs: 1000 });
    expect(r.items).toEqual([{ category: "pushups", quantity: 50, detail: null }]);
  });

  it("extracts JSON even if wrapped in prose/fences", async () => {
    const client = fakeClient('Sure!\n```json\n{"items":[{"category":"cardio","quantity":20}],"unparsed":[]}\n```');
    const r = await parseActivities("ran 20", { client: client as never, model: "x", timeoutMs: 1000 });
    expect(r.items).toEqual([{ category: "cardio", quantity: 20, detail: null }]);
  });

  it("returns empty result on malformed JSON instead of throwing", async () => {
    const client = fakeClient("totally not json");
    const r = await parseActivities("???", { client: client as never, model: "x", timeoutMs: 1000 });
    expect(r).toEqual({ items: [], unparsed: [] });
  });
});

describe("parseActivities request shape", () => {
  it("sends the system prompt as a cached ephemeral block", async () => {
    const calls: any[] = [];
    const client = { messages: { create: async (body: any) => { calls.push(body); return { content: [{ type: "text", text: '{"items":[],"unparsed":[]}' }] }; } } };
    await parseActivities("hi", { client: client as never, model: "x", timeoutMs: 1000 });
    expect(Array.isArray(calls[0].system)).toBe(true);
    expect(calls[0].system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(typeof calls[0].system[0].text).toBe("string");
  });
});

describe("validateParse detail capture", () => {
  it("captures a trimmed detail string per item", () => {
    const r = validateParse({ items: [{ category: "cardio", quantity: 20, detail: "  trail running " }], unparsed: [] });
    expect(r.items[0]!.detail).toBe("trail running");
  });
  it("detail is null when absent", () => {
    const r = validateParse({ items: [{ category: "pushups", quantity: 50 }], unparsed: [] });
    expect(r.items[0]!.detail).toBeNull();
  });
  it("length-caps overly long detail to 60 chars", () => {
    const r = validateParse({ items: [{ category: "lifting", quantity: 30, detail: "x".repeat(200) }], unparsed: [] });
    expect(r.items[0]!.detail!.length).toBe(60);
  });
  it("caps multibyte detail by code point without splitting a surrogate pair", () => {
    const r = validateParse({ items: [{ category: "cardio", quantity: 20, detail: "🏃".repeat(80) }], unparsed: [] });
    const detail = r.items[0]!.detail!;
    expect([...detail]).toHaveLength(60);          // 60 code points, not 60 UTF-16 units
    expect([...detail].join("")).toBe(detail);     // round-trips → no lone surrogate
  });
  it("coerces a non-string detail (LLM returns wrong type) to null", () => {
    const num = validateParse({ items: [{ category: "cardio", quantity: 10, detail: 42 }], unparsed: [] });
    expect(num.items[0]!.detail).toBeNull();
    const obj = validateParse({ items: [{ category: "core", quantity: 5, detail: { text: "x" } }], unparsed: [] });
    expect(obj.items[0]!.detail).toBeNull();
  });
  it("merged duplicate categories keep the first non-null detail", () => {
    const r = validateParse({ items: [
      { category: "cardio", quantity: 10, detail: "biking" },
      { category: "cardio", quantity: 5, detail: "rowing" },
    ], unparsed: [] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.quantity).toBe(15);
    expect(r.items[0]!.detail).toBe("biking");
  });
});
