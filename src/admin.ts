import { findCategory, unitFor } from "./categories.js";
import type { AdminCommand } from "./types.js";
import { PermissionsBitField, type GuildMember } from "discord.js";
import type { Pool } from "./db/pool.js";
import { insertAdminEntry, setGoal } from "./db/queries.js";

export type AdminParseResult =
  | { ok: true; command: AdminCommand }
  | { ok: false; error: string };

const MENTION_RE = /^<@!?(\d+)>$/;
const QTY_MIN = 1;
const QTY_MAX = 100000;

const USAGE =
  "Usage: `@PumpDragon admin add <qty> <category> @user` · `admin remove <qty> <category> @user` · `admin goal <number>` · `admin close-month [YYYY-MM]`";

function parseQty(token: string): number | null {
  if (!/^\d+$/.test(token)) return null;
  const n = Number(token);
  if (!Number.isInteger(n) || n < QTY_MIN || n > QTY_MAX) return null;
  return n;
}

export function parseAdminCommand(rest: string): AdminParseResult {
  const tokens = rest.trim().split(/\s+/);
  if ((tokens[0] ?? "").toLowerCase() !== "admin") return { ok: false, error: USAGE };
  const sub = (tokens[1] ?? "").toLowerCase();

  if (sub === "goal") {
    // exact arity — extra tokens mean a typo; fail loudly rather than silently ignore
    if (tokens.length !== 3) return { ok: false, error: `Goal takes exactly one number. ${USAGE}` };
    const amount = parseQty(tokens[2] ?? "");
    if (amount === null) return { ok: false, error: `Goal must be a whole number 1–${QTY_MAX}. ${USAGE}` };
    return { ok: true, command: { kind: "goal", amount } };
  }

  if (sub === "add" || sub === "remove") {
    // exact arity — extra tokens (e.g. a second @mention) must not be silently dropped
    if (tokens.length !== 5) return { ok: false, error: `Wrong number of arguments. ${USAGE}` };
    const qty = parseQty(tokens[2] ?? "");
    if (qty === null) return { ok: false, error: `Quantity must be a whole number 1–${QTY_MAX}. ${USAGE}` };
    const category = findCategory(tokens[3] ?? "");
    if (!category) return { ok: false, error: `Unknown category "${tokens[3] ?? ""}". ${USAGE}` };
    const m = (tokens[4] ?? "").match(MENTION_RE);
    if (!m) return { ok: false, error: `You must @mention a real user. ${USAGE}` };
    return { ok: true, command: { kind: sub, quantity: qty, category, targetUserId: m[1]! } };
  }

  if (sub === "close-month") {
    if (tokens.length === 2) return { ok: true, command: { kind: "closeMonth", month: null } };
    if (tokens.length === 3) {
      const m = (tokens[2] ?? "").match(/^(\d{4})-(\d{2})$/);
      if (!m) return { ok: false, error: `close-month takes an optional YYYY-MM. ${USAGE}` };
      const year = Number(m[1]), month = Number(m[2]);
      if (month < 1 || month > 12) return { ok: false, error: `Month must be 01–12. ${USAGE}` };
      if (year < 2000 || year > 2100) return { ok: false, error: `Year must be 2000–2100. ${USAGE}` };
      return { ok: true, command: { kind: "closeMonth", month: { year, month } } };
    }
    return { ok: false, error: `close-month takes an optional YYYY-MM. ${USAGE}` }; // >3 tokens: too many args
  }

  return { ok: false, error: USAGE };
}

export function isAdmin(member: GuildMember, adminRoleIds: string[]): boolean {
  const isDiscordAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (adminRoleIds.length === 0) return isDiscordAdmin;
  return isDiscordAdmin || adminRoleIds.some((id) => member.roles.cache.has(id));
}

export async function executeAdmin(
  command: AdminCommand,
  ctx: { pool: Pool; guildId: string; timezone: string; actorId: string },
): Promise<string> {
  switch (command.kind) {
    case "goal":
      await setGoal(ctx.pool, ctx.guildId, ctx.timezone, command.amount);
      return `🐉 monthly goal set to **${command.amount.toLocaleString("en-US")}**.`;
    case "add":
      await insertAdminEntry(ctx.pool, {
        guildId: ctx.guildId, targetUserId: command.targetUserId, category: command.category,
        quantity: command.quantity, source: "admin_add", note: `by ${ctx.actorId}`,
      });
      return `🐉 added **${command.quantity} ${unitFor(command.category)}** of ${command.category} to <@${command.targetUserId}>.`;
    case "remove":
      await insertAdminEntry(ctx.pool, {
        guildId: ctx.guildId, targetUserId: command.targetUserId, category: command.category,
        quantity: -command.quantity, source: "admin_remove", note: `by ${ctx.actorId}`,
      });
      return `🐉 removed **${command.quantity} ${unitFor(command.category)}** of ${command.category} from <@${command.targetUserId}>.`;
    case "closeMonth":
      // close-month returns an embed and is handled in commands.ts before executeAdmin; never reached here.
      return "🐉 close-month is handled elsewhere.";
  }
}
