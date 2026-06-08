export interface Config {
  discordToken: string;
  guildId: string;
  recapChannelId: string;
  /** Channels the bot will respond in. Empty = respond in every channel it can see. */
  activeChannelIds: string[];
  /** Role IDs whose holders are admins (any one grants access). Empty = Administrator permission only. */
  adminRoleIds: string[];
  anthropicApiKey: string;
  model: string;
  anthropicTimeoutMs: number;
  databaseUrl: string;
  timezone: string;
  recapTime: string;
  cooldownSeconds: number;
  /** Discord user id the dragon may affectionately roast; null disables all roasting. */
  roastUserId: string | null;
  /** Nickname the dragon uses for the roast target (e.g. "magic"); null if unset. */
  roastNickname: string | null;
}

type Env = Record<string, string | undefined>;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: Env = process.env): Config {
  const required = ["DISCORD_TOKEN", "GUILD_ID", "RECAP_CHANNEL_ID", "ANTHROPIC_API_KEY", "DATABASE_URL"] as const;
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  const timezone = env.TIMEZONE?.trim() || "America/Chicago";
  if (!isValidTimezone(timezone)) throw new Error(`Invalid timezone: "${timezone}"`);

  return {
    discordToken: env.DISCORD_TOKEN!.trim(),
    guildId: env.GUILD_ID!.trim(),
    recapChannelId: env.RECAP_CHANNEL_ID!.trim(),
    // comma-separated allowlist of channels; blank = respond everywhere
    activeChannelIds: (env.ACTIVE_CHANNEL_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    // comma-separated list → array of role IDs (any one grants admin)
    adminRoleIds: (env.ADMIN_ROLE_ID ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    anthropicApiKey: env.ANTHROPIC_API_KEY!.trim(),
    model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5",
    anthropicTimeoutMs: Number(env.ANTHROPIC_TIMEOUT_MS) || 8000,
    databaseUrl: env.DATABASE_URL!.trim(),
    timezone,
    recapTime: env.RECAP_TIME?.trim() || "08:00",
    cooldownSeconds: Number(env.USER_COOLDOWN_SECONDS) || 5,
    roastUserId: env.ROAST_USER_ID?.trim() || null,
    roastNickname: env.ROAST_NICKNAME?.trim() || null,
  };
}
