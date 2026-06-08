import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORY_NAMES, findCategory } from "../src/categories.js";

describe("categories", () => {
  it("defines exactly the five categories", () => {
    expect(CATEGORY_NAMES).toEqual(["cardio", "pushups", "pullups", "core", "lifting"]);
  });

  it("resolves an exact category name case-insensitively", () => {
    expect(findCategory("Pushups")).toBe("pushups");
  });

  it("resolves an alias to its canonical category", () => {
    expect(findCategory("running")).toBe("cardio");
  });

  it("returns null for an unknown token", () => {
    expect(findCategory("yoga")).toBeNull();
  });

  it("every category has a unit label", () => {
    for (const c of CATEGORIES) expect(c.unit.length).toBeGreaterThan(0);
  });
});
