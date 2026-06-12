// Declarative achievement engine. PURE — no DB, no Discord. The command layer builds the context and
// does the ledger writes; each `check` only inspects the context and returns the awards newly earned by
// THIS log (crossing-based, so already-true conditions never re-fire).
import type { Category } from "./categories.js";

export type AchievementScope = "user" | "group";

/** Per-category effect of the current log (the just-inserted rows). */
export interface LoggedDelta { category: Category; quantity: number; monthTotalAfter: number; }

export interface AchievementContext {
  userId: string;                 // the logger; flare references <@userId>
  periodKey: string;              // current month "YYYY-MM" (unused by checks; carried for the ledger)
  logged: LoggedDelta[];          // categories in this log
  groupMonthBefore: number;       // group combined month total before this log
  groupMonthAfter: number;        // ...and after
  monthEntryCountBefore: number;  // # of entries in the month before this log (group-wide)
  userCategoriesAfter: number;    // # distinct categories this user has points in this month (after)
  addedNewCategory: boolean;      // did this log add a category the user had 0 of this month?
}

export interface Award { key: string; scope: AchievementScope; flare: string; }
export interface AchievementDef { id: string; check: (ctx: AchievementContext) => Award[]; }

/** Per-category monthly milestone tiers [Bronze, Silver, Gold]. Units match the category
 *  (pushups/pullups/lifting = reps, cardio/core = min). Calibrated against 2y of live monthly totals. */
export const MILESTONE_TIERS: Record<Category, number[]> = {
  pushups: [500, 2000, 5000],
  pullups: [150, 300, 450],
  cardio:  [300, 600, 1000],
  core:    [60, 150, 250],
  lifting: [500, 1000, 2000],
};

const mention = (id: string) => `<@${id}>`;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_blood",
    check: (ctx) =>
      ctx.monthEntryCountBefore === 0
        ? [{ key: "first_blood", scope: "group", flare: `🩸 **FIRST BLOOD** — ${mention(ctx.userId)} drew first this month. the dragon remembers who shows up.` }]
        : [],
  },
  {
    id: "over_9000",
    check: (ctx) =>
      ctx.groupMonthBefore < 9000 && ctx.groupMonthAfter >= 9000
        ? [{ key: "over_9000", scope: "group", flare: `💥 **IT'S OVER 9,000!!!** the crew just blasted past 9K combined this month. WE ARE LEGEND. 🔥` }]
        : [],
  },
  {
    id: "all_food_groups",
    check: (ctx) =>
      ctx.addedNewCategory && ctx.userCategoriesAfter === 5
        ? [{ key: "all_food_groups", scope: "user", flare: `🍽️ **ALL THE FOOD GROUPS** — ${mention(ctx.userId)} logged every category this month. a balanced beast.` }]
        : [],
  },
  {
    id: "milestones",
    check: (ctx) => {
      const out: Award[] = [];
      for (const d of ctx.logged) {
        const before = d.monthTotalAfter - d.quantity;
        for (const tier of MILESTONE_TIERS[d.category]) {
          if (before < tier && d.monthTotalAfter >= tier) {
            out.push({
              key: `milestone:${d.category}:${tier}`,
              scope: "user",
              flare: `🏔️ ${mention(ctx.userId)} just crossed **${tier.toLocaleString("en-US")} ${d.category}** this month. the ascension continues.`,
            });
          }
        }
      }
      return out;
    },
  },
];

/** Run every definition against the context; flat list of awards newly earned by this log. */
export function evaluateAchievements(ctx: AchievementContext): Award[] {
  return ACHIEVEMENTS.flatMap((d) => d.check(ctx));
}
