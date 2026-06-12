import { EmbedBuilder } from "discord.js";
import type {
  Renderer, LogReplyPayload, RecapPayload,
  CategoryBoardPayload, StatsCardPayload, HelpPayload, CeremonyPayload,
} from "./types.js";

const DRAGON_COLOR = 0xc0392b;

export class EmbedRenderer implements Renderer {
  logReply(p: LogReplyPayload): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(DRAGON_COLOR).setTitle(`🐉 ${p.loggedBy} logged`);
    for (const line of p.logged) {
      embed.addFields({
        name: `${line.category} +${line.quantity} ${line.unit}`,
        value: `month total: **${line.userMonthlyTotal.toLocaleString("en-US")}** ${line.unit}`,
        inline: true,
      });
    }
    let desc = p.powerMeterText;
    if (p.unparsed.length) {
      desc += `\n\n⚠️ didn't understand: ${p.unparsed.map((u) => `"${u}"`).join(", ")} — try rephrasing.`;
    }
    if (p.hypeLine) desc += `\n\n${p.hypeLine}`;
    embed.setDescription(desc);
    if (p.achievements?.length) {
      embed.addFields({ name: "🏅 ACHIEVEMENT UNLOCKED", value: p.achievements.join("\n"), inline: false });
    }
    return embed;
  }

  recap(p: RecapPayload): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(DRAGON_COLOR)
      .setTitle(p.title ?? "🐉 daily recap")
      .setDescription(p.powerMeterText);
    if (p.overall.length) {
      const body = p.overall
        .map((r, i) => `${i + 1}. <@${r.userId}> — ${r.total.toLocaleString("en-US")} pts`)
        .join("\n");
      embed.addFields({ name: "🏆 overall", value: body, inline: false });
    }
    for (const g of p.standings) {
      const body = g.rows.length
        ? g.rows
            .map((r, i) => `${i + 1}. <@${r.userId}> — ${r.total.toLocaleString("en-US")} ${g.unit}`)
            .join("\n")
        : "_no entries yet_";
      embed.addFields({ name: `${g.category} (${g.unit})`, value: body, inline: false });
    }
    return embed;
  }

  categoryBoard(p: CategoryBoardPayload): EmbedBuilder {
    const body = p.rows.length
      ? p.rows.map((r, i) => `${i + 1}. <@${r.userId}> — ${r.total.toLocaleString("en-US")} ${p.unit}`).join("\n")
      : "_no entries yet_";
    return new EmbedBuilder().setColor(DRAGON_COLOR).setTitle(p.title).setDescription(body);
  }

  statsCard(p: StatsCardPayload): EmbedBuilder {
    const rank = p.rank !== null ? `#${p.rank} of ${p.rankOf}` : "unranked (no logs yet)";
    const share = p.groupTotal > 0 ? Math.round((100 * p.userTotal) / p.groupTotal) : 0;
    const goalPart = p.goal ? ` · group goal ${p.goal.toLocaleString("en-US")}` : "";
    const embed = new EmbedBuilder().setColor(DRAGON_COLOR)
      .setTitle(`🐉 ${p.name} — ${rank}`)
      .setDescription(`your power this window: **${p.userTotal.toLocaleString("en-US")}** — ${share}% of the group's ${p.groupTotal.toLocaleString("en-US")}${goalPart}`);
    for (const l of p.lines) {
      embed.addFields({ name: `${l.category} (${l.unit})`, value: `**${l.total.toLocaleString("en-US")}**`, inline: true });
    }
    return embed;
  }

  help(p: HelpPayload): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(DRAGON_COLOR).setTitle("🐉 PumpDragon — what I can do")
      .setDescription("@mention me, then:");
    embed.addFields(
      { name: "💪 log a workout", value: "`50 pushups and 20 min cardio` — just tell me, I'll count it.", inline: false },
      { name: "📊 boards", value: "`board` · `cardio` (any category) · `me` · `stats @user` · `board last month` · `board may` · `year` · `alltime`", inline: false },
      { name: "📈 charts & insights", value: "`race [category]` · `mychart [category]` · `months [category]` · `insights`", inline: false },
      { name: "🔥 hype", value: "`hype me up`", inline: false },
    );
    if (p.isAdmin) {
      embed.addFields({ name: "🛠️ admin", value: "`admin add <qty> <cat> @user` · `admin remove <qty> <cat> @user` · `admin goal <n>` · `admin close-month [YYYY-MM]`", inline: false });
    }
    return embed;
  }

  ceremony(p: CeremonyPayload): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(DRAGON_COLOR).setTitle(p.title);
    let desc = `${p.collectiveLine}\n\n${p.powerMeterText}`;
    if (p.momentsLine) desc += `\n\n${p.momentsLine}`;
    embed.setDescription(desc);
    if (p.mvps.length) {
      embed.addFields({
        name: "💪 category MVPs",
        value: p.mvps.map((m) => `**${m.category}** — <@${m.userId}> (${m.total.toLocaleString("en-US")} ${m.unit})`).join("\n"),
        inline: false,
      });
    }
    if (p.risingStars.length) embed.addFields({ name: "📈 rising stars", value: p.risingStars.join("\n"), inline: false });
    if (p.ribs.length) embed.addFields({ name: "👀 don't fall off", value: p.ribs.join("\n"), inline: false });
    if (p.participants.length) {
      // cap the rendered mentions so the field value stays under discord's 1024-char limit (~46 mentions)
      const shown = p.participants.slice(0, 46);
      const overflow = p.participants.length - shown.length;
      const value = shown.map((id) => `<@${id}>`).join(" ") + (overflow > 0 ? ` +${overflow} more` : "");
      embed.addFields({ name: `🔥 ${p.participants.length} showed up`, value, inline: false });
    }
    embed.addFields({ name: "​", value: p.closeLine, inline: false });
    return embed;
  }
}
