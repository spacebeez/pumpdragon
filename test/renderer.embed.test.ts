import { describe, it, expect } from "vitest";
import { EmbedRenderer } from "../src/renderer/embed.js";

const r = new EmbedRenderer();

describe("EmbedRenderer.logReply", () => {
  it("includes a field per logged category and the power meter", () => {
    const embed = r.logReply({
      loggedBy: "Matt",
      logged: [
        { category: "pushups", quantity: 50, userMonthlyTotal: 150, unit: "reps" },
        { category: "cardio", quantity: 30, userMonthlyTotal: 90, unit: "min" },
      ],
      unparsed: [],
      hypeLine: null,
      powerMeterText: "████████░░ 78% — 1,560 / 2,000",
    });
    const json = embed.toJSON();
    const fieldNames = (json.fields ?? []).map((f) => f.name.toLowerCase());
    expect(fieldNames.some((n) => n.includes("pushups"))).toBe(true);
    expect(fieldNames.some((n) => n.includes("cardio"))).toBe(true);
    expect(JSON.stringify(json)).toContain("78%");
    expect(json.title).toContain("Matt"); // names the person who logged
  });

  it("notes unparsed portions", () => {
    const embed = r.logReply({
      loggedBy: "Matt",
      logged: [{ category: "pushups", quantity: 50, userMonthlyTotal: 50, unit: "reps" }],
      unparsed: ["plank stuff"],
      hypeLine: null,
      powerMeterText: "1,560 logged this month (no goal set yet)",
    });
    expect(JSON.stringify(embed.toJSON())).toContain("plank stuff");
  });

  it("includes the hype line when present", () => {
    const embed = r.logReply({
      loggedBy: "Matt",
      logged: [{ category: "pushups", quantity: 200, userMonthlyTotal: 200, unit: "reps" }],
      unparsed: [],
      hypeLine: "YUM. that was a lot of power juice. 🐉",
      powerMeterText: "x",
    });
    expect(JSON.stringify(embed.toJSON())).toContain("power juice");
  });
});

describe("EmbedRenderer.recap", () => {
  it("renders the overall ranking, standings per category, and the power meter", () => {
    const embed = r.recap({
      overall: [
        { userId: "u1", total: 150 },
        { userId: "u2", total: 50 },
      ],
      standings: [
        { category: "pushups", unit: "reps", rows: [{ userId: "u1", total: 100 }] },
        { category: "cardio", unit: "min", rows: [{ userId: "u2", total: 50 }] },
      ],
      powerMeterText: "█████░░░░░ 50% — 1,000 / 2,000",
    });
    const json = embed.toJSON();
    const s = JSON.stringify(json);
    expect(s).toContain("50%");
    expect(s).toContain("<@u1>");
    // overall section present and ranked (u1 first with 150 pts)
    const overallField = (json.fields ?? []).find((f) => f.name.toLowerCase().includes("overall"));
    expect(overallField).toBeDefined();
    expect(overallField!.value).toMatch(/1\. <@u1> — 150 pts/);
  });

  it("omits the overall section when there are no entries", () => {
    const embed = r.recap({ overall: [], standings: [], powerMeterText: "0 logged this month (no goal set yet)" });
    const names = (embed.toJSON().fields ?? []).map((f) => f.name.toLowerCase());
    expect(names.some((n) => n.includes("overall"))).toBe(false);
  });
});

describe("EmbedRenderer new views", () => {
  const r = new EmbedRenderer();

  it("categoryBoard lists ranked rows with the unit and title", () => {
    const e = r.categoryBoard({ title: "🐉 cardio — this month", category: "cardio", unit: "min",
      rows: [{ userId: "u1", total: 120 }, { userId: "u2", total: 45 }] }).toJSON();
    expect(e.title).toContain("cardio");
    expect(JSON.stringify(e)).toContain("<@u1>");
    expect(JSON.stringify(e)).toContain("120");
  });

  it("statsCard shows per-category totals, rank, and the user's contribution", () => {
    const e = r.statsCard({ name: "Matt", rank: 2, rankOf: 5,
      lines: [{ category: "pushups", unit: "reps", total: 300 }, { category: "cardio", unit: "min", total: 90 }],
      userTotal: 390, groupTotal: 1000, goal: 2000 }).toJSON();
    expect(e.title).toContain("Matt");
    expect(e.title).toContain("#2");
    expect(JSON.stringify(e)).toContain("300");
    expect(JSON.stringify(e)).toContain("390"); // the user's own total appears
  });

  it("statsCard handles an unranked user (no logs) without crashing", () => {
    const e = r.statsCard({ name: "New Guy", rank: null, rankOf: 5, lines: [], userTotal: 0, groupTotal: 0, goal: null }).toJSON();
    expect(JSON.stringify(e).toLowerCase()).toContain("unranked");
  });

  it("help lists command groups (admin section only when isAdmin)", () => {
    const pub = r.help({ isAdmin: false }).toJSON();
    expect(JSON.stringify(pub)).toContain("board");
    expect(JSON.stringify(pub).toLowerCase()).not.toContain("close-month");
    const adm = r.help({ isAdmin: true }).toJSON();
    expect(JSON.stringify(adm)).toContain("admin");
    expect(JSON.stringify(adm)).toContain("close-month");
  });
});

describe("EmbedRenderer ceremony", () => {
  const r = new EmbedRenderer();
  const base = {
    title: "🐉 MAY 2026 — WE ASCENDED TOGETHER",
    collectiveLine: "6 warriors moved as ONE. **8,400**.",
    powerMeterText: "████████░░ 84% — 8,400 / 10,000",
    mvps: [{ category: "cardio" as const, userId: "u1", total: 300, unit: "min" }],
    risingStars: ["📈 <@u2>'s pushups jumped **+60%** — ascending."],
    ribs: ["careful <@u3> — back to the dojo. 🐉"],
    momentsLine: "moments we won't forget: <@u1> out here trail running — legends. 🐉",
    participants: ["u1", "u2", "u3"],
    closeLine: "next month we go HIGHER. 🐉",
  };

  it("renders title, collective + power meter, and all sections", () => {
    const e = r.ceremony(base).toJSON();
    expect(e.title).toContain("ASCENDED");
    const s = JSON.stringify(e);
    expect(s).toContain("8,400");
    expect(s).toContain("MVP"); // category MVP field present
    expect(s).toContain("<@u1>");
    expect(s).toContain("rising"); // rising stars field
    expect(s).toContain("<@u2>");
    expect(s).toContain("<@u3>"); // rib + participant
    expect(s).toContain("trail running");
    expect(s).toContain("HIGHER"); // close line
    // exact MVP format + dynamic participant count
    const mvpField = e.fields!.find((f) => f.name.includes("MVP"))!;
    expect(mvpField.value).toContain("**cardio**");
    expect(mvpField.value).toContain("<@u1> (300 min)");
    expect(e.fields!.some((f) => f.name.includes("3 showed up"))).toBe(true);
  });

  it("caps the participants field and notes the overflow (stays under discord's 1024 limit)", () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}`);
    const e = r.ceremony({ ...base, participants: many }).toJSON();
    const field = e.fields!.find((f) => f.name.includes("showed up"))!;
    expect(field.name).toContain("60 showed up"); // full count in the name
    expect(field.value.length).toBeLessThanOrEqual(1024);
    expect(field.value).toContain("+14 more"); // 60 - 46 shown
  });

  it("omits empty optional sections without crashing", () => {
    const e = r.ceremony({ ...base, mvps: [], risingStars: [], ribs: [], momentsLine: null, participants: [] }).toJSON();
    const s = JSON.stringify(e);
    expect(s).toContain("8,400"); // collective + meter still present
    expect(s).toContain("HIGHER"); // close still present
    // the optional sections must actually be GONE (guards not silently inverted)
    expect(s).not.toContain("MVP");
    expect(s).not.toContain("rising");
    expect(s).not.toContain("showed up");
    expect(s).not.toContain("trail running"); // momentsLine omitted
    // only the close-line sentinel field remains
    expect(e.fields).toHaveLength(1);
  });
});
