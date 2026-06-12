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
  loggedHourLocal: number;        // 0–23, the log time in guild tz
  localDateKey: string;           // "YYYY-MM-DD" in guild tz (day-scoped dedup)
  daysSincePrevEntry: number | null; // whole days since this user's previous entry; null if first-ever
  priorCategoryLeader: Partial<Record<Category, { userId: string; total: number }>>; // #1 BEFORE this log, per logged category
}

export interface Award { key: string; scope: AchievementScope; flare: string; periodKey?: string; }
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

/** Single-log "monster" thresholds for ABSOLUTE UNIT. Units match the category. */
export const SINGLE_LOG_UNIT: Record<Category, number> = {
  pushups: 300, pullups: 75, cardio: 90, core: 60, lifting: 300,
};

const CURSED_NUMBERS: { n: number; flare: (m: string, cat: Category) => string }[] = [
  { n: 69,  flare: (m, c) => `😏 **NICE.** — ${m} landed on exactly 69 ${c} this month. the dragon has nothing further to add.` },
  { n: 420, flare: (m, c) => `🔥 **BLAZE IT** — ${m} hit exactly 420 ${c} this month. the dragon does not condone. the dragon merely observes.` },
  { n: 666, flare: (m, c) => `😈 **THE NUMBER OF THE BEAST** — ${m} reached exactly 666 ${c} this month. something has noticed you. it approves.` },
];

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
  {
    id: "witching_hour",
    check: (ctx) =>
      ctx.loggedHourLocal === 3
        ? [{ key: "witching_hour", scope: "user", flare: `🕯️ **THE 3 A.M. CONFESSIONAL** — ${mention(ctx.userId)} logged in the witching hour. the veil is thin. so are your excuses. the dragon was awake. the dragon is always awake.` }]
        : [],
  },
  {
    id: "cursed_numbers",
    check: (ctx) => {
      const out: Award[] = [];
      for (const d of ctx.logged) {
        for (const c of CURSED_NUMBERS) {
          if (d.monthTotalAfter === c.n) {
            out.push({ key: `cursed:${d.category}:${c.n}`, scope: "user", flare: c.flare(mention(ctx.userId), d.category) });
          }
        }
      }
      return out;
    },
  },
  {
    id: "regicide",
    check: (ctx) => {
      const out: Award[] = [];
      for (const d of ctx.logged) {
        const lead = ctx.priorCategoryLeader[d.category];
        if (lead && lead.userId !== ctx.userId && d.monthTotalAfter > lead.total) {
          out.push({
            key: `regicide:${d.category}`,
            scope: "user",
            flare: `👑 **REGICIDE** — ${mention(ctx.userId)} has overthrown ${mention(lead.userId)} for the **${d.category}** crown. long live the new flesh. the old king is crying. the dragon brought a small, sad trumpet.`,
          });
        }
      }
      return out;
    },
  },
  {
    id: "participation",
    check: (ctx) => {
      const d = ctx.logged.find((x) => x.quantity === 1);
      return d
        ? [{ key: "participation", scope: "user", flare: `🥉 **PARTICIPATION** — ${mention(ctx.userId)} logged exactly 1 ${d.category}. one. the dragon has dutifully recorded your heroism. this is all you did.` }]
        : [];
    },
  },
  {
    id: "risen",
    check: (ctx) =>
      ctx.daysSincePrevEntry !== null && ctx.daysSincePrevEntry >= 14
        ? [{ key: "risen", scope: "user", periodKey: ctx.localDateKey, flare: `🧟 **RISEN FROM THE DEAD** — ${mention(ctx.userId)} emerges after ${ctx.daysSincePrevEntry} days of silence. blinking. weak. but alive. the dragon had already divided up your stuff.` }]
        : [],
  },
  {
    id: "absolute_unit",
    check: (ctx) => {
      const out: Award[] = [];
      for (const d of ctx.logged) {
        if (d.quantity >= SINGLE_LOG_UNIT[d.category]) {
          out.push({
            key: `absolute_unit:${d.category}`,
            scope: "user",
            periodKey: ctx.localDateKey,
            flare: `🦏 **ABSOLUTE UNIT** — ${mention(ctx.userId)} dropped ${d.quantity.toLocaleString("en-US")} ${d.category} in a SINGLE log. the dragon felt that one in its teeth.`,
          });
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
