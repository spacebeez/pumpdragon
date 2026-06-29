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

/** Per-category monthly milestone ladder — 5 ascending named tiers. Calibrated 2026-06-29 against ~2y of
 *  real monthly per-user totals (Jeddy-robust percentiles; pushups anchored to the median cluster, not the
 *  bimodal high end). Units match the category (pushups/pullups/lifting = reps, cardio/core = min). */
export interface MilestoneTier { threshold: number; name: string; }

export const MILESTONE_TIERS: Record<Category, MilestoneTier[]> = {
  cardio: [
    { threshold: 200, name: "Light Panting" },
    { threshold: 400, name: "Getting Warmed Up" },
    { threshold: 700, name: "Big Load Volume" },
    { threshold: 1000, name: "Going All Night" },
    { threshold: 1500, name: "Cardio Stallion" },
  ],
  core: [
    { threshold: 25, name: "Tight Squeeze" },
    { threshold: 75, name: "Hard Thruster" },
    { threshold: 150, name: "Deep Hold" },
    { threshold: 220, name: "Quivering Finish" },
    { threshold: 280, name: "Rock Solid Core" },
  ],
  pushups: [
    { threshold: 100, name: "Just the Tip" },
    { threshold: 400, name: "Pushing Deep" },
    { threshold: 1000, name: "All the Way Down" },
    { threshold: 2500, name: "Full Extension" },
    { threshold: 5000, name: "Beat the Mattress" },
  ],
  pullups: [
    { threshold: 30, name: "First Grip" },
    { threshold: 100, name: "Tugging Hard" },
    { threshold: 200, name: "Chin Over the Bar" },
    { threshold: 325, name: "Hung & Held" },
    { threshold: 450, name: "Dead Hang Daddy" },
  ],
  lifting: [
    { threshold: 200, name: "Light Handful" },
    { threshold: 500, name: "Nice Rack" },
    { threshold: 1000, name: "Heavy Load" },
    { threshold: 1750, name: "Full Clean & Jerk" },
    { threshold: 2500, name: "Maxed Out & Throbbing" },
  ],
};

/** Ascending tier medals, index 0–4. */
export const TIER_EMOJI = ["🥉", "🥈", "🥇", "💎", "👑"] as const;

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
        const tiers = MILESTONE_TIERS[d.category];
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i]!;
          if (before < t.threshold && d.monthTotalAfter >= t.threshold) {
            out.push({
              key: `milestone:${d.category}:${t.threshold}`,
              scope: "user",
              flare: `${TIER_EMOJI[i]!} ${mention(ctx.userId)} just unlocked **${t.name}** — ${t.threshold.toLocaleString("en-US")}+ ${d.category} this month. 🐉`,
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
