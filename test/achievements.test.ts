import { describe, it, expect } from "vitest";
import { evaluateAchievements, MILESTONE_TIERS, type AchievementContext } from "../src/achievements.js";

const base: AchievementContext = {
  userId: "u1",
  periodKey: "2026-06",
  logged: [],
  groupMonthBefore: 0,
  groupMonthAfter: 0,
  monthEntryCountBefore: 5,
  userCategoriesAfter: 1,
  addedNewCategory: false,
};
const keys = (ctx: AchievementContext) => evaluateAchievements(ctx).map((a) => a.key);

describe("first_blood", () => {
  it("fires only when this is the month's first entry", () => {
    expect(keys({ ...base, monthEntryCountBefore: 0 })).toContain("first_blood");
    expect(keys({ ...base, monthEntryCountBefore: 3 })).not.toContain("first_blood");
  });
  it("is group-scoped", () => {
    const a = evaluateAchievements({ ...base, monthEntryCountBefore: 0 }).find((x) => x.key === "first_blood")!;
    expect(a.scope).toBe("group");
  });
});

describe("over_9000", () => {
  it("fires only on the upward crossing of 9000", () => {
    expect(keys({ ...base, groupMonthBefore: 8990, groupMonthAfter: 9010 })).toContain("over_9000");
    expect(keys({ ...base, groupMonthBefore: 9000, groupMonthAfter: 9100 })).not.toContain("over_9000"); // already above
    expect(keys({ ...base, groupMonthBefore: 100, groupMonthAfter: 200 })).not.toContain("over_9000");
  });
});

describe("all_food_groups", () => {
  it("fires only when this log completes all five categories", () => {
    expect(keys({ ...base, addedNewCategory: true, userCategoriesAfter: 5 })).toContain("all_food_groups");
    expect(keys({ ...base, addedNewCategory: false, userCategoriesAfter: 5 })).not.toContain("all_food_groups"); // already had 5
    expect(keys({ ...base, addedNewCategory: true, userCategoriesAfter: 4 })).not.toContain("all_food_groups");
  });
});

describe("milestones", () => {
  it("fires for each tier crossed by this log in a category", () => {
    // pushups tiers 500/2000/5000 — logging 600 with month total 600 crosses 500 only
    const ks = keys({ ...base, logged: [{ category: "pushups", quantity: 600, monthTotalAfter: 600 }] });
    expect(ks).toContain("milestone:pushups:500");
    expect(ks).not.toContain("milestone:pushups:2000");
  });
  it("can cross two tiers in one big log", () => {
    // before = 5100-5000 = 100; after 5100 crosses 500, 2000, AND 5000
    const ks = keys({ ...base, logged: [{ category: "pushups", quantity: 5000, monthTotalAfter: 5100 }] });
    expect(ks).toEqual(expect.arrayContaining(["milestone:pushups:500", "milestone:pushups:2000", "milestone:pushups:5000"]));
  });
  it("does not re-fire a tier already passed before this log", () => {
    // before = 700-100 = 600 (already past 500); after 700 still below 2000 → no tier crossed
    const ks = keys({ ...base, logged: [{ category: "pushups", quantity: 100, monthTotalAfter: 700 }] });
    expect(ks.filter((k) => k.startsWith("milestone:pushups"))).toEqual([]);
  });
  it("uses per-category tiers", () => {
    expect(MILESTONE_TIERS.core).toEqual([60, 150, 250]);
    expect(MILESTONE_TIERS.pullups).toEqual([150, 300, 450]);
    const ks = keys({ ...base, logged: [{ category: "core", quantity: 60, monthTotalAfter: 60 }] });
    expect(ks).toContain("milestone:core:60");
  });
});
