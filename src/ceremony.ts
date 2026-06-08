// dragon-bot/src/ceremony.ts
import type { Rng } from "./hype.js";
import type { Improvement, FallOff } from "./deltas.js";
import type { RecentDetail } from "./db/queries.js";
import { powerMeter } from "./scoring.js";

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.max(0, Math.min(arr.length - 1, Math.floor(rng() * arr.length)))]!;
}

/**
 * The ceremony's flagship "ascension" power line (spec §2.4 centerpiece). Unlike the vanilla
 * daily-recap meter, this is dialed to 11 and never leaks "logged this month (no goal set yet)".
 */
export function ceremonyPowerLine(total: number, goal: number | null): string {
  if (goal === null || goal <= 0) {
    return `**${total.toLocaleString("en-US")}** of raw, shared power — no goal was set, but the lair FELT it. 🐉`;
  }
  const bar = powerMeter(total, goal).text; // "{bar} {pct}% — {total} / {goal}"
  if (total >= goal) {
    return `${bar}\nwe didn't just hit ${goal.toLocaleString("en-US")} — we **BLEW PAST IT**. power level: OVER 9,000. 🐉🔥`;
  }
  return `${bar}\nso close you could taste it — next month we **BREAK THROUGH**. 💪`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Over-the-top collective hype: we are all dragons / heroes, we ascended together. */
export const COLLECTIVE_LINES: string[] = [
  "{n} warriors moved as ONE. our combined power this month: **{total}**. that's not a number — that's a power level. 🐉",
  "{n} of us. **{total}** of pure, shared power. we didn't just train — we ASCENDED together.",
  "look what WE did: {n} heroes, **{total}** logged. nobody carried us — we carried each other. 🔥",
  "{n} dragons in the lair, **{total}** of raw output. the whole crew leveled up this month.",
];

export function collectiveLine(total: number, participants: number, rng: Rng): string {
  return pick(rng, COLLECTIVE_LINES)
    .replaceAll("{n}", String(participants))
    .replaceAll("{total}", total.toLocaleString("en-US"));
}

export function risingStarLine(imp: Improvement): string {
  return `📈 <@${imp.userId}>'s ${imp.category} jumped **+${imp.pct}%** — ascending.`;
}

/** Gentle, welcoming nudges for anyone who fell off — magic/hero idiom, NEVER the full roast. */
export const RIB_LINES: string[] = [
  "careful <@{id}> — wouldn't want you going weak like magic. back to the dojo. 🐉",
  "the dragon noticed <@{id}> went quiet this month. we miss the gains — come home.",
  "<@{id}>, your power dipped a little. no shame — next month we get it back together. 💪",
  "<@{id}> we left a spot in the lineup for you. fill it next month, hero.",
];

export function ribLine(f: FallOff, rng: Rng): string {
  return pick(rng, RIB_LINES).replaceAll("{id}", f.userId);
}

/** A "moments we won't forget" line citing up to two real activity details. Null if none. */
export function momentsLine(details: RecentDetail[]): string | null {
  if (!details.length) return null;
  const bits = details.slice(0, 2).map((d) => `<@${d.userId}> out here ${d.detail}`);
  return `moments we won't forget: ${bits.join(", ")} — legends. 🐉`;
}

export const CLOSE_LINES: string[] = [
  "next month we go HIGHER. somebody set an ambitious goal and let's chase it together. 🐉",
  "that's the new bar. now RAISE it — set a bigger goal and we'll smash it as one.",
  "we ascended once. let's do it again, but bigger. name next month's goal, heroes.",
  "the lair demands MORE. set an audacious goal and let's make next month legendary.",
];

export function closeLine(rng: Rng): string {
  return pick(rng, CLOSE_LINES);
}
