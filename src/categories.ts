export type Category = "cardio" | "pushups" | "pullups" | "core" | "lifting";

export interface CategoryDef {
  name: Category;
  /** human-readable unit shown in replies */
  unit: string;
  /** lowercase alias tokens the parser/admin commands may use */
  aliases: string[];
}

export const CATEGORIES: CategoryDef[] = [
  { name: "cardio", unit: "min", aliases: ["cardio", "run", "running", "cycle", "cycling", "row", "rowing", "bike", "biking", "jog", "jogging"] },
  { name: "pushups", unit: "reps", aliases: ["pushups", "pushup", "push-ups", "push-up"] },
  { name: "pullups", unit: "reps", aliases: ["pullups", "pullup", "pull-ups", "pull-up", "chinups", "chin-ups"] },
  { name: "core", unit: "min", aliases: ["core", "abs", "plank", "planks"] },
  { name: "lifting", unit: "reps", aliases: ["lifting", "lift", "weights", "weightlifting", "strength"] },
];

export const CATEGORY_NAMES: Category[] = CATEGORIES.map((c) => c.name);

const ALIAS_MAP: Map<string, Category> = new Map(
  CATEGORIES.flatMap((c) => [
    [c.name, c.name] as const,
    ...c.aliases.map((a) => [a, c.name] as const),
  ]),
);

/** Resolve a single token to a canonical Category, or null. Case-insensitive. */
export function findCategory(token: string): Category | null {
  return ALIAS_MAP.get(token.trim().toLowerCase()) ?? null;
}

/** The display unit for a category name (e.g. "reps", "min"); "" if unknown. */
export function unitFor(category: string): string {
  return CATEGORIES.find((c) => c.name === category)?.unit ?? "";
}
