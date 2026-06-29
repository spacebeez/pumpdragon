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
  it("maps milestone tiers to their name + ascending tier medal", () => {
    expect(badgeFor("milestone:pushups:100")).toMatchObject({ emoji: "🥉", label: "Just the Tip", rank: 35 });
    expect(badgeFor("milestone:pushups:5000")).toMatchObject({ emoji: "👑", label: "Beat the Mattress", rank: 83 });
    expect(badgeFor("milestone:cardio:700")).toMatchObject({ emoji: "🥇", label: "Big Load Volume", rank: 59 });
  });
  it("falls back for a retired/unknown milestone threshold", () => {
    expect(badgeFor("milestone:pushups:500")).toEqual({ emoji: "🏅", label: "milestone:pushups:500", rank: 0 });
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
