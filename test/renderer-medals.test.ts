import { describe, it, expect } from "vitest";
import { EmbedRenderer } from "../src/renderer/embed.js";

const r = new EmbedRenderer();

describe("medals in embeds", () => {
  it("recap appends a user's medals to the overall line, not to category sub-lists", () => {
    const embed = r.recap({
      title: "🐉 scoreboard",
      powerMeterText: "pm",
      overall: [{ userId: "u1", total: 100 }],
      standings: [{ category: "pushups", unit: "reps", rows: [{ userId: "u1", total: 100 }] }],
      medals: { u1: "👑🦏+2" },
    });
    const json = JSON.stringify(embed.toJSON());
    expect(json).toContain("<@u1> 👑🦏+2 — 100 pts"); // overall line has medals
    expect(json).toContain("<@u1> — 100 reps");        // category line does NOT
  });
  it("statsCard appends medals to the title", () => {
    const embed = r.statsCard({ name: "Jeddy", rank: 1, rankOf: 8, lines: [], userTotal: 0, groupTotal: 0, goal: null, medals: "👑🦏" });
    expect(JSON.stringify(embed.toJSON())).toContain("🐉 Jeddy 👑🦏 — #1 of 8");
  });
});
