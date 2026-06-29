// Achievement key → display badge (emoji, label, prestige rank) + a compact medal string for names.
import { MILESTONE_TIERS, TIER_EMOJI } from "./achievements.js";
import type { Category } from "./categories.js";

export interface Badge { emoji: string; label: string; rank: number; }

export function badgeFor(key: string): Badge {
  if (key === "over_9000") return { emoji: "💥", label: "It's Over 9,000", rank: 100 };
  if (key === "first_blood") return { emoji: "🩸", label: "First Blood", rank: 95 };
  if (key === "all_food_groups") return { emoji: "🍽️", label: "All The Food Groups", rank: 80 };
  if (key === "risen") return { emoji: "🧟", label: "Risen From The Dead", rank: 50 };
  if (key === "witching_hour") return { emoji: "🕯️", label: "The 3 A.M. Confessional", rank: 45 };
  if (key === "participation") return { emoji: "🥉", label: "Participation", rank: 10 };

  const parts = key.split(":");
  if (parts[0] === "regicide" && parts[1]) return { emoji: "👑", label: `Regicide (${parts[1]})`, rank: 90 };
  if (parts[0] === "absolute_unit" && parts[1]) return { emoji: "🦏", label: `Absolute Unit (${parts[1]})`, rank: 85 };
  if (parts[0] === "milestone" && parts[1] && parts[2]) {
    const cat = parts[1] as Category;
    const threshold = Number(parts[2]);
    const tiers = MILESTONE_TIERS[cat];
    const i = Array.isArray(tiers) ? tiers.findIndex((t) => t.threshold === threshold) : -1;
    if (i === -1) return { emoji: "🏅", label: key, rank: 0 };
    return { emoji: TIER_EMOJI[i]!, label: tiers[i]!.name, rank: 35 + i * 12 };  // 35,47,59,71,83
  }
  if (parts[0] === "cursed" && parts[1] && parts[2]) {
    const n = Number(parts[2]);
    if (n === 666) return { emoji: "😈", label: "Number of the Beast", rank: 30 };
    if (n === 420) return { emoji: "🔥", label: "Blaze It", rank: 28 };
    if (n === 69) return { emoji: "😏", label: "Nice.", rank: 26 };
  }
  return { emoji: "🏅", label: key, rank: 0 };
}

/** Top-3 highest-rank badge emoji + "+N" overflow (e.g. "👑🦏🏔️+4"); "" when no keys. */
export function medalString(keys: string[]): string {
  if (keys.length === 0) return "";
  const badges = keys.map(badgeFor).sort((a, b) => b.rank - a.rank);
  const top = badges.slice(0, 3).map((b) => b.emoji).join("");
  return keys.length > 3 ? `${top}+${keys.length - 3}` : top;
}
