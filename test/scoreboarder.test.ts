// dragon-bot/test/scoreboarder.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractComponentTexts, extractEmbedTexts, parseLedgerLine, parseScoreboarderLedger, resolveTarget, normalizeCardioAmount, replayLedger } from "../src/scoreboarder.js";
import type { ImportEvent } from "../src/scoreboarder.js";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/scoreboarder-ledger.json", import.meta.url)), "utf8"));

describe("extractComponentTexts", () => {
  it("pulls nested text-display content from components-v2", () => {
    const raw = [{ type: 17, components: [
      { type: 10, content: "## **Add complete!**" },
      { type: 14, divider: true },
      { type: 10, content: "Added **30** to **<@111>** in **Cardio**." },
    ] }];
    expect(extractComponentTexts(raw)).toEqual(["## **Add complete!**", "Added **30** to **<@111>** in **Cardio**."]);
  });
  it("returns [] for empty/missing components", () => {
    expect(extractComponentTexts(undefined)).toEqual([]);
    expect(extractComponentTexts([])).toEqual([]);
  });
});

describe("parseLedgerLine", () => {
  it("parses an add with a mention target", () => {
    expect(parseLedgerLine("Added **30** to **<@111>** in **Cardio**.")).toEqual({ kind: "add", amount: 30, target: "<@111>", category: "cardio" });
  });
  it("parses adds for ALL five categories (incl. pushups + core)", () => {
    expect(parseLedgerLine("Added **50** to **<@1>** in **Pushups**.")!.category).toBe("pushups");
    expect(parseLedgerLine("Added **12** to **<@1>** in **Core**.")!.category).toBe("core");
    expect(parseLedgerLine("Added **9** to **<@1>** in **Pullups**.")!.category).toBe("pullups");
    expect(parseLedgerLine("Added **9** to **<@1>** in **Lifting**.")!.category).toBe("lifting");
  });
  it("parses a subtract (amount-remove)", () => {
    expect(parseLedgerLine("Subtracted **10** points from **<@111>** in **Cardio**.")).toEqual({ kind: "subtract", amount: 10, target: "<@111>", category: "cardio" });
  });
  it("parses a zeroing remove (no amount) and strips a leading @ from a label", () => {
    expect(parseLedgerLine("Removed **@DragonJeddy** from **Pullups**.")).toEqual({ kind: "zero", amount: null, target: "DragonJeddy", category: "pullups" });
  });
  it("keeps a mention target verbatim (no @ strip on <@id> / <@!id>)", () => {
    expect(parseLedgerLine("Added **5** to **<@!222>** in **Lifting**.")).toEqual({ kind: "add", amount: 5, target: "<@!222>", category: "lifting" });
  });
  it("returns null for headers, failures, boards, chatter, and genuinely-unknown categories", () => {
    expect(parseLedgerLine("## **Add complete!**")).toBeNull();
    expect(parseLedgerLine("No users matching @ghost found in Cardio")).toBeNull();
    expect(parseLedgerLine("# **Cardio**")).toBeNull();
    expect(parseLedgerLine("lol nice work everyone")).toBeNull();
    expect(parseLedgerLine("Added **9** to **<@1>** in **Yoga**.")).toBeNull();
  });
  it("rejects comma-separated and overflowing amounts (regex or guard); decimals now parse", () => {
    expect(parseLedgerLine("Added **1,000** to **<@1>** in **Cardio**.")).toBeNull(); // comma → regex rejects
    expect(parseLedgerLine("Added **1.5** to **<@1>** in **Cardio**."))              // decimal now accepted
      .toEqual({ kind: "add", amount: 1.5, target: "<@1>", category: "cardio" });
    expect(parseLedgerLine(`Added **${"9".repeat(40)}** to **<@1>** in **Cardio**.`)).toBeNull(); // overflow → guard
  });
  it("does not mis-split a target label that contains ' in ' / ' from ' (separator is the literal ** in **)", () => {
    expect(parseLedgerLine("Added **5** to **GB in Jomsters** in **Cardio**.")).toEqual({ kind: "add", amount: 5, target: "GB in Jomsters", category: "cardio" });
    expect(parseLedgerLine("Removed **GB from Jomsters** from **Pullups**.")).toEqual({ kind: "zero", amount: null, target: "GB from Jomsters", category: "pullups" });
  });
});

describe("parseScoreboarderLedger", () => {
  it("yields one event per matching message, in order, ignoring non-ledger messages", () => {
    const events = parseScoreboarderLedger(fixture);
    expect(events.map((e) => `${e.kind}:${e.category}:${e.amount}:${e.target}`)).toEqual([
      "add:cardio:30:<@111>",
      "add:lifting:40:<@111>",
      "subtract:cardio:10:<@111>",
      "zero:pullups:null:DragonJeddy",
      "add:pullups:5:DragonJeddy",
      "add:pushups:50:<@111>",
      "add:core:12:<@111>",
    ]);
    expect(events[0]).toMatchObject({ ts: "2025-03-15T10:00:00Z", messageId: "100" });
  });
});

describe("resolveTarget", () => {
  const nameMap = { DragonJeddy: "999", "some label": "888" };
  it("extracts the id from a <@id> / <@!id> mention", () => {
    expect(resolveTarget("<@111>", nameMap)).toEqual({ userId: "111" });
    expect(resolveTarget("<@!222>", nameMap)).toEqual({ userId: "222" });
  });
  it("maps a raw label via the name map (case-insensitive fallback)", () => {
    expect(resolveTarget("DragonJeddy", nameMap)).toEqual({ userId: "999" });
    expect(resolveTarget("Some Label", nameMap)).toEqual({ userId: "888" });
  });
  it("returns a null userId + reason for an unmapped label", () => {
    const r = resolveTarget("nobody@example.com", nameMap);
    expect(r.userId).toBeNull();
    expect(r.reason).toContain("nobody@example.com");
  });
});

describe("normalizeCardioAmount", () => {
  const at = "2026-01-01T00:00:00Z"; // the 10x changeover
  it("leaves cardio ON/AFTER the changeover unchanged (canonical 10x points scale)", () => {
    expect(normalizeCardioAmount("cardio", 300, "2026-02-15T00:00:00Z", at)).toBe(300);
  });
  it("scales PRE-changeover cardio UP x10 to match the 10x scale", () => {
    expect(normalizeCardioAmount("cardio", 45, "2025-09-15T00:00:00Z", at)).toBe(450);
  });
  it("never touches non-cardio categories", () => {
    expect(normalizeCardioAmount("lifting", 300, "2025-09-15T00:00:00Z", at)).toBe(300);
    expect(normalizeCardioAmount("pushups", 50, "2025-09-15T00:00:00Z", at)).toBe(50);
  });
  it("is a no-op when no conversion date is configured", () => {
    expect(normalizeCardioAmount("cardio", 45, "2025-09-15T00:00:00Z", null)).toBe(45);
  });
  it("throws (fails loud) on a misconfigured conversion date rather than silently disabling", () => {
    expect(() => normalizeCardioAmount("cardio", 300, "2025-09-15T00:00:00Z", "not-a-date")).toThrow(/invalid conversionAt/);
  });
});

const ev = (over: Partial<ImportEvent>): ImportEvent => ({ kind: "add", amount: 10, target: "<@1>", category: "cardio", ts: "2025-03-01T00:00:00Z", messageId: "m", ...over });

describe("replayLedger", () => {
  const nameMap: Record<string, string> = { Jeddy: "999" };

  it("emits +amount for add and -amount for subtract (a real correction)", () => {
    const { rows } = replayLedger([
      ev({ kind: "add", amount: 20, messageId: "a" }),
      ev({ kind: "subtract", amount: 5, messageId: "b" }),
    ], nameMap, null);
    expect(rows.map((r) => [r.messageId, r.quantity])).toEqual([["a", 20], ["b", -5]]);
  });

  it("IGNORES zeroing/reset events (cumulative model) — no row, reported in skipped", () => {
    const { rows, skipped } = replayLedger([
      ev({ kind: "add", amount: 30, messageId: "a" }),
      ev({ kind: "add", amount: 10, messageId: "b" }),
      ev({ kind: "zero", amount: null, messageId: "c" }), // monthly board reset — must NOT subtract anything
    ], nameMap, null);
    expect(rows.map((r) => r.quantity)).toEqual([30, 10]); // adds stand; the reset emits no negative
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("reset");
  });

  it("reports an add that resolves to 0 quantity as SKIPPED (never silently dropped)", () => {
    const { rows, skipped } = replayLedger([ev({ kind: "add", amount: 0, messageId: "x" })], nameMap, null);
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("resolved to 0");
  });

  it("routes unmapped targets to skipped, not rows", () => {
    const { rows, skipped } = replayLedger([ev({ target: "ghost", messageId: "g" })], nameMap, null);
    expect(rows).toHaveLength(0);
    expect(skipped[0]!.reason).toContain("ghost");
  });

  it("applies cardio normalization to the emitted quantity (pre x10, post unchanged)", () => {
    const conv = "2026-01-01T00:00:00Z";
    const pre = replayLedger([ev({ kind: "add", amount: 45, ts: "2025-09-01T00:00:00Z", messageId: "x" })], nameMap, conv);
    expect(pre.rows[0]!.quantity).toBe(450); // pre-changeover scaled up x10
    const post = replayLedger([ev({ kind: "add", amount: 300, ts: "2026-02-01T00:00:00Z", messageId: "y" })], nameMap, conv);
    expect(post.rows[0]!.quantity).toBe(300); // post unchanged (canonical scale)
  });

  it("rounds pre-conversion decimal cardio ×10 to an integer (13.67 → 137)", () => {
    const conv = "2026-01-01T00:00:00Z";
    const { rows } = replayLedger(
      [ev({ kind: "add", amount: 13.67, ts: "2024-08-01T00:00:00Z", messageId: "r1" })],
      nameMap, conv,
    );
    expect(rows[0]!.quantity).toBe(137); // 13.67×10=136.7 → Math.round → 137
  });

  it("rounds pre-conversion decimal cardio ×10 exactly (4.5 → 45, no rounding artifact)", () => {
    const conv = "2026-01-01T00:00:00Z";
    const { rows } = replayLedger(
      [ev({ kind: "add", amount: 4.5, ts: "2024-08-01T00:00:00Z", messageId: "r2" })],
      nameMap, conv,
    );
    expect(rows[0]!.quantity).toBe(45); // 4.5×10=45 → exact
  });

  it("rounds a decimal SUBTRACT to a negative integer (3.67 → -37)", () => {
    const conv = "2026-01-01T00:00:00Z";
    const { rows } = replayLedger(
      [ev({ kind: "subtract", amount: 3.67, ts: "2024-08-01T00:00:00Z", messageId: "r3" })],
      nameMap, conv,
    );
    expect(rows[0]!.quantity).toBe(-37); // -(3.67×10)=-36.7 → Math.round → -37
  });

  it("routes 'set' events to skipped (not rows), with a reason mentioning 'Set'", () => {
    const { rows, skipped } = replayLedger(
      [ev({ kind: "set", amount: 20, messageId: "s" })],
      nameMap, null,
    );
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/[Ss]et/);
  });
});

describe("parseLedgerLine (old-format extensions)", () => {
  it("parses a DECIMAL add amount (old cardio minutes)", () => {
    expect(parseLedgerLine("Added **4.5** to **<@111>** in **Cardio**."))
      .toEqual({ kind: "add", amount: 4.5, target: "<@111>", category: "cardio" });
  });
  it("parses a DECIMAL subtract", () => {
    expect(parseLedgerLine("Subtracted **3.5** points from **<@111>** in **Cardio**."))
      .toEqual({ kind: "subtract", amount: 3.5, target: "<@111>", category: "cardio" });
  });
  it("treats 'All points in X set to 0' as a zero-class reset (any category)", () => {
    expect(parseLedgerLine("All points in **Lifting** set to **0**."))
      .toEqual({ kind: "zero", amount: null, target: "", category: "lifting" });
    expect(parseLedgerLine("All points in **Cardio** set to **0**."))
      .toEqual({ kind: "zero", amount: null, target: "", category: "cardio" });
  });
  it("resolves 'Lifting (30+ lbs)' to lifting", () => {
    expect(parseLedgerLine("Added **185** to **<@111>** in **Lifting (30+ lbs)**.")!.category).toBe("lifting");
  });
  it("still rejects a genuinely-unknown category and a header line", () => {
    expect(parseLedgerLine("Added **9** to **<@1>** in **Yoga**.")).toBeNull();
    expect(parseLedgerLine("Add complete!")).toBeNull();
    expect(parseLedgerLine("Inserted **<@111>** to **Pushups**.")).toBeNull(); // roster op, no amount → ignore
  });
  it("keeps integer amounts working (no regression)", () => {
    expect(parseLedgerLine("Added **30** to **<@111>** in **Cardio**."))
      .toEqual({ kind: "add", amount: 30, target: "<@111>", category: "cardio" });
  });
  it("parses a 'Set points to' line as kind='set'", () => {
    expect(parseLedgerLine("Set points to **20** points for **<@111>** in **Pushups**."))
      .toEqual({ kind: "set", amount: 20, target: "<@111>", category: "pushups" });
  });
});

describe("extractEmbedTexts (old rich-embed format)", () => {
  it("pulls title + description from rich embeds", () => {
    const embeds = [{ type: "rich", title: "Add complete!", description: "Added **30** to **<@111>** in **Cardio**." }];
    expect(extractEmbedTexts(embeds)).toEqual(["Add complete!", "Added **30** to **<@111>** in **Cardio**."]);
  });
  it("returns [] for empty/missing embeds", () => {
    expect(extractEmbedTexts(undefined)).toEqual([]);
    expect(extractEmbedTexts([])).toEqual([]);
    expect(extractEmbedTexts([{ type: "rich" }])).toEqual([]);
  });
});
