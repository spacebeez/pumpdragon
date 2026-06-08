import { Client, GatewayIntentBits, Events, type Message, EmbedBuilder } from "discord.js";
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";
import type { Pool } from "./db/pool.js";
import { EmbedRenderer } from "./renderer/embed.js";
import { handleMention, isScoreboardRequest } from "./commands.js";
import { parseActivities } from "./parser.js";
import { converse, type ConversationMessage } from "./converse.js";
import { isHypeRequest } from "./hype.js";
import { isHelpRequest, categoryViewOf, parseStatsRequest, parseChartRequest, isInsightsRequest } from "./views.js";
import { parseTimeWindow } from "./timewindow.js";

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });
}

/**
 * Strip the bot's own mention(s) from the message. Discord can mention the bot as
 * a user (`<@id>` / `<@!id>`) OR, when autocomplete picks the managed role Discord
 * auto-creates for the bot, as a role (`<@&roleId>`). We accept either.
 * Returns the remaining text, or null if the bot was not actually mentioned.
 */
function stripMention(content: string, botId: string, botRoleId: string | null): string | null {
  const userRe = new RegExp(`<@!?${botId}>`, "g");
  const roleRe = botRoleId ? new RegExp(`<@&${botRoleId}>`, "g") : null;
  const mentioned = userRe.test(content) || (roleRe ? roleRe.test(content) : false);
  if (!mentioned) return null;
  let out = content.replace(userRe, " ");
  if (roleRe) out = out.replace(roleRe, " ");
  return out.replace(/\s+/g, " ").trim();
}

export function startBot(client: Client, config: Config, pool: Pool): void {
  const renderer = new EmbedRenderer();
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const cooldowns = new Map<string, number>();

  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || message.webhookId) return;
      if (!message.inGuild() || message.guildId !== config.guildId) return;
      // channel allowlist: if configured, only respond in those channels
      if (config.activeChannelIds.length > 0 && !config.activeChannelIds.includes(message.channelId)) return;

      const botId = client.user?.id;
      if (!botId) return;
      // Discord auto-creates a managed role with the bot's name; autocomplete may mention
      // the role instead of the user. Accept either as a valid trigger.
      const botRoleId = message.guild?.members.me?.roles.botRole?.id ?? null;
      const mentioned =
        message.mentions.users.has(botId) || (botRoleId !== null && message.mentions.roles.has(botRoleId));
      if (!mentioned) return;

      const rest = stripMention(message.content, botId, botRoleId);
      if (rest === null) return;

      // Cooldown applies ONLY to the LLM log path (cost protection). The cheap
      // deterministic commands (ping / admin / hype / help / category / stats /
      // windowed-board) always respond instantly. This MUST mirror the routing
      // branches in commands.ts handleMention — keep the two in sync.
      const lower = rest.toLowerCase();
      const win = parseTimeWindow(rest, new Date(message.createdTimestamp));
      const isDeterministic =
        rest === "" ||
        lower === "ping" ||
        lower.startsWith("admin") ||
        isHypeRequest(rest) ||
        isScoreboardRequest(rest) ||
        isHelpRequest(rest) ||
        categoryViewOf(rest) !== null ||
        parseStatsRequest(rest) !== null ||
        parseChartRequest(rest) !== null ||
        isInsightsRequest(rest) ||
        (win !== null && win.kind !== "namedMonth");
      if (!isDeterministic) {
        const now = message.createdTimestamp;
        const last = cooldowns.get(message.author.id) ?? 0;
        if (now - last < config.cooldownSeconds * 1000) {
          await message.react("⏳").catch(() => {});
          return;
        }
        cooldowns.set(message.author.id, now);
      }

      const member = message.member ?? (await message.guild!.members.fetch(message.author.id));

      const reply = await handleMention(rest, {
        renderer,
        config,
        pool,
        parse: (r) => parseActivities(r, { client: anthropic as never, model: config.model, timeoutMs: config.anthropicTimeoutMs }),
        member,
        authorId: message.author.id,
        authorName: member.displayName,
        messageId: message.id,
        now: () => new Date(message.createdTimestamp),
        converse: (input) => converse(input, { client: anthropic as never, model: config.model, timeoutMs: config.anthropicTimeoutMs }),
        fetchRecentMessages: async (): Promise<ConversationMessage[]> => {
          try {
            const fetched = await message.channel.messages.fetch({ limit: 7, before: message.id });
            const out: ConversationMessage[] = [];
            // discord.js returns newest→oldest; reverse to oldest→newest for a natural transcript
            for (const m of [...fetched.values()].reverse()) {
              const content = m.content?.trim();
              if (!content) continue; // skip embed-only / empty messages
              out.push({ author: m.member?.displayName ?? m.author.username, text: content.slice(0, 300), isDragon: m.author.id === botId });
            }
            return out.slice(-6);
          } catch {
            return [];
          }
        },
      });

      // allowedMentions:{parse:[]} — never let user-derived content (logged activity "detail",
      // names) ping @everyone/@here/roles from a bot reply. <@id> in embeds already doesn't ping.
      const files = reply.files?.map((f) => ({ name: f.name, attachment: f.buffer }));
      if (reply.embed) {
        await message.reply({ embeds: [reply.embed], files, allowedMentions: { parse: [] } });
      } else if (reply.content) {
        await message.reply({ content: reply.content, files, allowedMentions: { parse: [] } });
      } else if (reply.files?.length) {
        await message.reply({ files, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error("[pumpdragon] message handler error:", err);
      try {
        await message.reply("🐉 something went sideways — try again in a sec.");
      } catch {
        /* ignore secondary failure */
      }
    }
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[pumpdragon] logged in as ${c.user.tag}`);
  });
}

export { EmbedBuilder };
