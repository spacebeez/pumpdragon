import { describe, it, expect } from "vitest";
import { badgeFor, medalString } from "../src/badges.js";

describe("badgeFor", () => {
  it("maps the fixed keys", () => {
    expect(badgeFor("over_9000")).toMatchObject({ emoji: "💥", rank: 100 });
    expect(badgeFor("first_blood")).toMatchObject({ emoji: "🩸", rank: 95 });
    expect(badgeFor("all_food_groups")).toMatchObject({ emoji: "🍽️" });
    expect(badgeFor("risen")).toMatchObject({ emoji: "🧟" });
    expect(badgeFor("witching_hour")).toMatchObject({ emoji: "🕯️" });
    expect(badgeFor("participation")).toMatchObject({ emoji: "🥉", rank: 10 });
  });
  it("maps parameterized keys with the category in the label", () => {
    expect(badgeFor("regicide:cardio")).toMatchObject({ emoji: "👑", label: "Regicide (cardio)", rank: 90 });
    expect(badgeFor("absolute_unit:pushups")).toMatchObject({ emoji: "🦏", label: "Absolute Unit (pushups)" });
    expect(badgeFor("cursed:core:69")).toMatchObject({ emoji: "😏", label: "Nice." });
    expect(badgeFor("cursed:core:666")).toMatchObject({ emoji: "😈" });
  });
  it("ranks milestone tiers bronze<silver<gold and labels with the number", () => {
    expect(badgeFor("milestone:pushups:500")).toMatchObject({ emoji: "🏔️", label: "500 pushups", rank: 35 });   // bronze
    expect(badgeFor("milestone:pushups:2000")).toMatchObject({ rank: 55 });                                      // silver
    expect(badgeFor("milestone:pushups:5000")).toMatchObject({ label: "5,000 pushups", rank: 75 });              // gold
  });
  it("falls back for an unknown key without throwing", () => {
    expect(badgeFor("wat:nonsense")).toEqual({ emoji: "🏅", label: "wat:nonsense", rank: 0 });
  });
});

describe("medalString", () => {
  it("empty → empty string", () => {
    expect(medalString([])).toBe("");
  });
  it("≤3 → emoji only, sorted by rank desc", () => {
    expect(medalString(["participation", "regicide:cardio"])).toBe("👑🥉"); // 90 before 10
  });
  it(">3 → top-3 emoji + overflow count", () => {
    const keys = ["over_9000", "regicide:cardio", "absolute_unit:core", "participation", "witching_hour"];
    expect(medalString(keys)).toBe("💥👑🦏+2");
  });
});
