import { EmbedBuilder } from "discord.js";
import type { Pool } from "./db/pool.js";
import type { Config } from "./config.js";
import { getStandings, getOverallStandings, getCurrentMonthCombinedTotal, type StandingRow, type OverallRow } from "./db/queries.js";
import { CATEGORIES, unitFor, type Category } from "./categories.js";
import { lastCompletedMonth, previousMonthOf } from "./deltas.js";

const DRAGON_COLOR = 0xc0392b;

export interface Leader { category: Category; userId: string; total: number; }

/** Top user per category from standings already ordered (category, total DESC). Categories with no data are omitted. */
export function pickCategoryLeaders(standings: StandingRow[]): Leader[] {
  return CATEGORIES.map((c) => {
    const top = standings.find((r) => r.category === c.name);
    return top ? { category: c.name, userId: top.userId, total: top.total } : null;
  }).filter((x): x is Leader => x !== null);
}

export interface Climber { userId: string; delta: number; }

/** The user with the largest positive (last − prev) combined-total delta, or null if nobody grew. */
export function pickBiggestClimber(last: OverallRow[], prev: OverallRow[]): Climber | null {
  const prevMap = new Map(prev.map((r) => [r.userId, r.total]));
  let best: Climber | null = null;
  for (const r of last) {
    const delta = r.total - (prevMap.get(r.userId) ?? 0);
    if (delta > 0 && (best === null || delta > best.delta)) best = { userId: r.userId, delta };
  }
  return best;
}

/** Mythic-hype insights embed: group lifetime total + per-category champions + the fastest riser. */
export async function buildInsightsEmbed(
  pool: Pool, config: Pick<Config, "guildId" | "timezone">, now: Date = new Date(),
): Promise<EmbedBuilder> {
  const lastM = lastCompletedMonth(now, config.timezone);
  const prevM = previousMonthOf(lastM);
  const [allStandings, lastOverall, prevOverall, lifetimeTotal] = await Promise.all([
    getStandings(pool, config.guildId, config.timezone, { kind: "allTime" }),
    getOverallStandings(pool, config.guildId, config.timezone, { kind: "namedMonth", year: lastM.year, month: lastM.month }),
    getOverallStandings(pool, config.guildId, config.timezone, { kind: "namedMonth", year: prevM.year, month: prevM.month }),
    getCurrentMonthCombinedTotal(pool, config.guildId, config.timezone, { kind: "allTime" }),
  ]);

  const leaders = pickCategoryLeaders(allStandings);
  const climber = pickBiggestClimber(lastOverall, prevOverall);

  const embed = new EmbedBuilder()
    .setColor(DRAGON_COLOR)
    .setTitle("🐉 THE DRAGON'S LEDGER — our legend so far")
    .setDescription(
      `Together we have forged **${lifetimeTotal.toLocaleString("en-US")}** points of pure power. ` +
      `Every rep a scale on the dragon. We are ALL of us heroes. 🔥`,
    );

  if (leaders.length) {
    embed.addFields({
      name: "👑 all-time champions",
      value: leaders.map((l) => `**${l.category}** — <@${l.userId}> · ${l.total.toLocaleString("en-US")} ${unitFor(l.category)}`).join("\n"),
      inline: false,
    });
  }
  embed.addFields({
    name: "📈 rising fastest",
    value: climber
      ? `<@${climber.userId}> surged **+${climber.delta.toLocaleString("en-US")}** last month — ascension in motion. ⚡`
      : "_the forge was quiet last month — who steps up next?_",
    inline: false,
  });
  return embed;
}
