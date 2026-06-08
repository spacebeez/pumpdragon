import { describe, it, expect } from "vitest";
import { pickCategoryLeaders, pickBiggestClimber } from "../src/insights.js";

describe("pickCategoryLeaders", () => {
  it("takes the top row per category from category-ordered, total-desc standings", () => {
    const standings = [
      { category: "pushups" as const, userId: "a", total: 100 },
      { category: "pushups" as const, userId: "b", total: 40 },
      { category: "cardio" as const, userId: "c", total: 999 },
    ];
    const leaders = pickCategoryLeaders(standings);
    expect(leaders.find((l) => l.category === "pushups")).toEqual({ category: "pushups", userId: "a", total: 100 });
    expect(leaders.find((l) => l.category === "cardio")).toEqual({ category: "cardio", userId: "c", total: 999 });
    expect(leaders.find((l) => l.category === "core")).toBeUndefined(); // no data → omitted
  });
});

describe("pickBiggestClimber", () => {
  it("returns the user with the largest positive month-over-month delta", () => {
    const last = [{ userId: "a", total: 300 }, { userId: "b", total: 120 }];
    const prev = [{ userId: "a", total: 100 }, { userId: "b", total: 110 }];
    expect(pickBiggestClimber(last, prev)).toEqual({ userId: "a", delta: 200 });
  });
  it("counts a user absent last month as climbing from 0", () => {
    expect(pickBiggestClimber([{ userId: "new", total: 75 }], [])).toEqual({ userId: "new", delta: 75 });
  });
  it("returns null when nobody climbed", () => {
    expect(pickBiggestClimber([{ userId: "a", total: 5 }], [{ userId: "a", total: 50 }])).toBeNull();
  });
});
