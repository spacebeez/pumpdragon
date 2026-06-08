import { describe, it, expect } from "vitest";
import { HYPE_PHRASES, HYPE_DETAIL_PHRASES, randomHypePhrase, isHypeRequest } from "../src/hype.js";

describe("HYPE_PHRASES", () => {
  it("has at least 15 phrases", () => {
    expect(HYPE_PHRASES.length).toBeGreaterThanOrEqual(15);
  });
  it("has no empty phrases", () => {
    for (const p of HYPE_PHRASES) expect(p.trim().length).toBeGreaterThan(0);
  });
});

describe("randomHypePhrase", () => {
  it("always returns a phrase from the list", () => {
    for (let i = 0; i < 50; i++) {
      expect(HYPE_PHRASES).toContain(randomHypePhrase());
    }
  });
  it("uses an injected rng deterministically", () => {
    expect(randomHypePhrase(() => 0)).toBe(HYPE_PHRASES[0]);
    expect(randomHypePhrase(() => 0.9999)).toBe(HYPE_PHRASES[HYPE_PHRASES.length - 1]);
  });
});

describe("isHypeRequest", () => {
  it("matches hype variants", () => {
    expect(isHypeRequest("hype me up")).toBe(true);
    expect(isHypeRequest("HYPE")).toBe(true);
    expect(isHypeRequest("  Hype Me  ")).toBe(true);
    expect(isHypeRequest("pump me up")).toBe(true);
  });
  it("does not match a normal log", () => {
    expect(isHypeRequest("50 pushups")).toBe(false);
    expect(isHypeRequest("pumped out 50 pushups")).toBe(false);
  });
});

describe("randomHypePhrase with detail", () => {
  it("substitutes {detail} when a detail is given", () => {
    const phrase = randomHypePhrase(() => 0, "trail running");
    expect(phrase).toContain("trail running");
    expect(phrase).not.toContain("{detail}");
  });
  it("falls back to a plain phrase when detail is null", () => {
    const phrase = randomHypePhrase(() => 0, null);
    expect(phrase).not.toContain("{detail}");
    expect(HYPE_PHRASES).toContain(phrase);
  });
  it("falls back to a plain phrase when detail is whitespace-only", () => {
    const phrase = randomHypePhrase(() => 0, "   ");
    expect(HYPE_PHRASES).toContain(phrase);
  });
  it("trims the substituted detail", () => {
    const phrase = randomHypePhrase(() => 0, "  trail running  ");
    expect(phrase).toContain("trail running");
    expect(phrase).not.toContain("  trail running  ");
  });
});

describe("HYPE_DETAIL_PHRASES", () => {
  it("every entry contains exactly one {detail} token", () => {
    for (const p of HYPE_DETAIL_PHRASES) {
      expect((p.match(/\{detail\}/g) ?? []).length).toBe(1);
    }
  });
});
