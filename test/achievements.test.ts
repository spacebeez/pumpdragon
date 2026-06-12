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
  loggedHourLocal: 12,
  localDateKey: "2026-06-12",
  daysSincePrevEntry: 1,
  priorCategoryLeader: {},
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

describe("witching_hour", () => {
  it("fires only at local hour 3", () => {
    expect(keys({ ...base, loggedHourLocal: 3 })).toContain("witching_hour");
    expect(keys({ ...base, loggedHourLocal: 2 })).not.toContain("witching_hour");
    expect(keys({ ...base, loggedHourLocal: 4 })).not.toContain("witching_hour");
  });
  it("is user-scoped", () => {
    const a = evaluateAchievements({ ...base, loggedHourLocal: 3 }).find((x) => x.key === "witching_hour")!;
    expect(a.scope).toBe("user");
  });
});

describe("cursed_numbers", () => {
  it("fires when a category month total lands exactly on 69/420/666", () => {
    expect(keys({ ...base, logged: [{ category: "pushups", quantity: 9, monthTotalAfter: 69 }] })).toContain("cursed:pushups:69");
    expect(keys({ ...base, logged: [{ category: "cardio", quantity: 20, monthTotalAfter: 420 }] })).toContain("cursed:cardio:420");
    expect(keys({ ...base, logged: [{ category: "core", quantity: 6, monthTotalAfter: 666 }] })).toContain("cursed:core:666");
  });
  it("does not fire one off the number", () => {
    expect(keys({ ...base, logged: [{ category: "pushups", quantity: 9, monthTotalAfter: 68 }] })).not.toContain("cursed:pushups:69");
    expect(keys({ ...base, logged: [{ category: "pushups", quantity: 9, monthTotalAfter: 70 }] })).not.toContain("cursed:pushups:69");
  });
  it("fires for two cursed hits across a multi-category log", () => {
    const ks = keys({ ...base, logged: [
      { category: "pushups", quantity: 9, monthTotalAfter: 69 },
      { category: "lifting", quantity: 20, monthTotalAfter: 420 },
    ] });
    expect(ks).toEqual(expect.arrayContaining(["cursed:pushups:69", "cursed:lifting:420"]));
  });
});

describe("regicide", () => {
  it("fires when the logger passes a different prior #1", () => {
    const ctx = { ...base, logged: [{ category: "cardio" as const, quantity: 100, monthTotalAfter: 600 }],
      priorCategoryLeader: { cardio: { userId: "u2", total: 580 } } };
    const a = evaluateAchievements(ctx).find((x) => x.key === "regicide:cardio")!;
    expect(a).toBeTruthy();
    expect(a.flare).toContain("<@u2>"); // names the deposed king
  });
  it("does not fire when the logger was already #1 (extending a lead)", () => {
    expect(keys({ ...base, logged: [{ category: "cardio", quantity: 100, monthTotalAfter: 600 }],
      priorCategoryLeader: { cardio: { userId: "u1", total: 500 } } })).not.toContain("regicide:cardio");
  });
  it("does not fire with no prior leader, or on a tie", () => {
    expect(keys({ ...base, logged: [{ category: "cardio", quantity: 100, monthTotalAfter: 600 }],
      priorCategoryLeader: {} })).not.toContain("regicide:cardio");
    expect(keys({ ...base, logged: [{ category: "cardio", quantity: 100, monthTotalAfter: 580 }],
      priorCategoryLeader: { cardio: { userId: "u2", total: 580 } } })).not.toContain("regicide:cardio");
  });
});

describe("participation", () => {
  it("fires when any single line logged exactly 1", () => {
    expect(keys({ ...base, logged: [{ category: "pullups", quantity: 1, monthTotalAfter: 1 }] })).toContain("participation");
  });
  it("does not fire when all lines are > 1", () => {
    expect(keys({ ...base, logged: [{ category: "pullups", quantity: 5, monthTotalAfter: 5 }] })).not.toContain("participation");
  });
});

describe("risen", () => {
  it("fires only on a gap of 14+ days, with a day-scoped period key", () => {
    expect(keys({ ...base, daysSincePrevEntry: 13 })).not.toContain("risen");
    expect(keys({ ...base, daysSincePrevEntry: null })).not.toContain("risen");
    const a = evaluateAchievements({ ...base, daysSincePrevEntry: 23, localDateKey: "2026-06-12" }).find((x) => x.key === "risen")!;
    expect(a).toBeTruthy();
    expect(a.periodKey).toBe("2026-06-12");
    expect(a.flare).toContain("23 days");
  });
});

describe("absolute_unit", () => {
  it("fires when a single log hits the per-category monster threshold", () => {
    const a = evaluateAchievements({ ...base, logged: [{ category: "pushups", quantity: 300, monthTotalAfter: 300 }], localDateKey: "2026-06-12" }).find((x) => x.key === "absolute_unit:pushups")!;
    expect(a).toBeTruthy();
    expect(a.periodKey).toBe("2026-06-12");
  });
  it("does not fire one under threshold", () => {
    expect(keys({ ...base, logged: [{ category: "pullups", quantity: 74, monthTotalAfter: 74 }] })).not.toContain("absolute_unit:pullups");
    expect(keys({ ...base, logged: [{ category: "pullups", quantity: 75, monthTotalAfter: 75 }] })).toContain("absolute_unit:pullups");
  });
});
