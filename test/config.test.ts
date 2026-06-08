import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  DISCORD_TOKEN: "t",
  GUILD_ID: "g",
  RECAP_CHANNEL_ID: "c",
  ANTHROPIC_API_KEY: "k",
  DATABASE_URL: "postgres://x",
};

describe("loadConfig", () => {
  it("loads with defaults applied", () => {
    const cfg = loadConfig(base);
    expect(cfg.model).toBe("claude-haiku-4-5");
    expect(cfg.timezone).toBe("America/Chicago");
    expect(cfg.cooldownSeconds).toBe(5);
    expect(cfg.anthropicTimeoutMs).toBe(8000);
    expect(cfg.adminRoleIds).toEqual([]);
  });
  it("parses a comma-separated ADMIN_ROLE_ID into a trimmed list", () => {
    expect(loadConfig({ ...base, ADMIN_ROLE_ID: "111, 222 ,333" }).adminRoleIds).toEqual(["111", "222", "333"]);
    expect(loadConfig({ ...base, ADMIN_ROLE_ID: "999" }).adminRoleIds).toEqual(["999"]);
  });
  it("defaults to an empty channel allowlist (respond everywhere)", () => {
    expect(loadConfig(base).activeChannelIds).toEqual([]);
  });
  it("parses a comma-separated ACTIVE_CHANNEL_IDS allowlist", () => {
    expect(loadConfig({ ...base, ACTIVE_CHANNEL_IDS: "c1, c2" }).activeChannelIds).toEqual(["c1", "c2"]);
  });
  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrow(/DISCORD_TOKEN/);
  });
  it("rejects an invalid timezone", () => {
    expect(() => loadConfig({ ...base, TIMEZONE: "Mars/Phobos" })).toThrow(/timezone/i);
  });
  it("defaults roast target + nickname to null when unset", () => {
    const cfg = loadConfig(base);
    expect(cfg.roastUserId).toBeNull();
    expect(cfg.roastNickname).toBeNull();
  });
  it("reads ROAST_USER_ID and ROAST_NICKNAME, trimming; blank → null", () => {
    expect(loadConfig({ ...base, ROAST_USER_ID: " 123 ", ROAST_NICKNAME: " magic " }).roastUserId).toBe("123");
    expect(loadConfig({ ...base, ROAST_USER_ID: "123", ROAST_NICKNAME: "magic" }).roastNickname).toBe("magic");
    expect(loadConfig({ ...base, ROAST_USER_ID: "   " }).roastUserId).toBeNull();
  });
});
