import { describe, it, expect } from "vitest";
import { parseAdminCommand, isAdmin } from "../src/admin.js";

describe("parseAdminCommand", () => {
  it("parses add", () => {
    expect(parseAdminCommand("admin add 50 pushups <@123>")).toEqual({
      ok: true, command: { kind: "add", quantity: 50, category: "pushups", targetUserId: "123" },
    });
  });
  it("parses remove with nickname-style mention", () => {
    expect(parseAdminCommand("admin remove 20 cardio <@!456>")).toEqual({
      ok: true, command: { kind: "remove", quantity: 20, category: "cardio", targetUserId: "456" },
    });
  });
  it("parses goal", () => {
    expect(parseAdminCommand("admin goal 2000")).toEqual({
      ok: true, command: { kind: "goal", amount: 2000 },
    });
  });
  it("resolves category aliases in admin add", () => {
    const r = parseAdminCommand("admin add 15 running <@1>");
    expect(r.ok && r.command.kind === "add" && r.command.category).toBe("cardio");
  });
  it("rejects a mention used where quantity belongs", () => {
    const r = parseAdminCommand("admin add <@123> pushups 50");
    expect(r.ok).toBe(false);
  });
  it("rejects unknown category", () => {
    expect(parseAdminCommand("admin add 50 yoga <@1>").ok).toBe(false);
  });
  it("rejects out-of-range quantity", () => {
    expect(parseAdminCommand("admin add 0 pushups <@1>").ok).toBe(false);
    expect(parseAdminCommand("admin add 999999 pushups <@1>").ok).toBe(false);
  });
  it("rejects unknown subcommand", () => {
    expect(parseAdminCommand("admin frobnicate 1").ok).toBe(false);
  });
  it("is case-insensitive on the subcommand", () => {
    expect(parseAdminCommand("admin ADD 50 pushups <@1>").ok).toBe(true);
  });
  it("rejects trailing junk / extra tokens (fail loudly, don't silently drop)", () => {
    expect(parseAdminCommand("admin goal 50 extra").ok).toBe(false);
    expect(parseAdminCommand("admin add 50 pushups <@1> <@2>").ok).toBe(false);
    expect(parseAdminCommand("admin add 50 pushups <@1> junk").ok).toBe(false);
  });
  it("rejects non-mention and partial-digit mention in the user slot", () => {
    expect(parseAdminCommand("admin add 50 pushups @everyone").ok).toBe(false);
    expect(parseAdminCommand("admin add 50 pushups bob").ok).toBe(false);
    expect(parseAdminCommand("admin add 50 pushups <@123abc>").ok).toBe(false);
  });
  it("rejects non-integer quantity formats (signs, floats, scientific notation)", () => {
    expect(parseAdminCommand("admin add +50 pushups <@1>").ok).toBe(false);
    expect(parseAdminCommand("admin add -50 pushups <@1>").ok).toBe(false);
    expect(parseAdminCommand("admin add 1e3 pushups <@1>").ok).toBe(false);
    expect(parseAdminCommand("admin add 2.5 pushups <@1>").ok).toBe(false);
  });
  it("accepts the quantity boundaries 1 and 100000", () => {
    expect(parseAdminCommand("admin add 1 pushups <@1>").ok).toBe(true);
    expect(parseAdminCommand("admin add 100000 pushups <@1>").ok).toBe(true);
    expect(parseAdminCommand("admin add 100001 pushups <@1>").ok).toBe(false);
  });
});

function member(opts: { roles: string[]; admin: boolean }) {
  return {
    permissions: { has: (_p: unknown) => opts.admin },
    roles: { cache: { has: (id: string) => opts.roles.includes(id) } },
  } as never;
}

describe("isAdmin", () => {
  it("passes a user with the configured role", () => {
    expect(isAdmin(member({ roles: ["R"], admin: false }), ["R"])).toBe(true);
  });
  it("passes a user holding ANY of multiple configured roles", () => {
    expect(isAdmin(member({ roles: ["B"], admin: false }), ["A", "B"])).toBe(true);
    expect(isAdmin(member({ roles: ["C"], admin: false }), ["A", "B"])).toBe(false);
  });
  it("passes a Discord administrator even without the role", () => {
    expect(isAdmin(member({ roles: [], admin: true }), ["R"])).toBe(true);
  });
  it("rejects a non-admin without any configured role", () => {
    expect(isAdmin(member({ roles: [], admin: false }), ["R"])).toBe(false);
  });
  it("falls back to Administrator-only when no roles configured", () => {
    expect(isAdmin(member({ roles: [], admin: true }), [])).toBe(true);
    expect(isAdmin(member({ roles: ["anything"], admin: false }), [])).toBe(false);
  });
});

describe("parseAdminCommand close-month", () => {
  it("bare close-month → closeMonth with null month (last completed)", () => {
    const r = parseAdminCommand("admin close-month");
    expect(r).toEqual({ ok: true, command: { kind: "closeMonth", month: null } });
  });
  it("close-month YYYY-MM → closeMonth with that month", () => {
    const r = parseAdminCommand("admin close-month 2026-05");
    expect(r).toEqual({ ok: true, command: { kind: "closeMonth", month: { year: 2026, month: 5 } } });
  });
  it("rejects a malformed or out-of-range month/year", () => {
    expect(parseAdminCommand("admin close-month 2026-13").ok).toBe(false); // month > 12
    expect(parseAdminCommand("admin close-month 2026-00").ok).toBe(false); // month < 1
    expect(parseAdminCommand("admin close-month 1999-05").ok).toBe(false); // year < 2000
    expect(parseAdminCommand("admin close-month mayish").ok).toBe(false);
    expect(parseAdminCommand("admin close-month 2026-05 extra").ok).toBe(false); // too many args
  });
});
