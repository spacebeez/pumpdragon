import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import {
  pickPhrase, photoMoodForAwards, createCooldownGate, isTinySubmission,
  SMALL_ACHIEVEMENT_PHOTO_CHANCE, ZEN_PHOTO_CHANCE, GENERAL_HYPE_CHANCE,
} from "../src/photos.js";
import type { Award } from "../src/achievements.js";

const award = (key: string): Award => ({ key, scope: "user", flare: key });

describe("pickPhrase", () => {
  it("returns a member of the mood pool, deterministic for fixed rng", () => {
    expect(typeof pickPhrase("roar", () => 0)).toBe("string");
    expect(typeof pickPhrase("zen", () => 0)).toBe("string");
    expect(typeof pickPhrase("weak", () => 0)).toBe("string");
    expect(pickPhrase("flex", () => 0)).toBe(pickPhrase("flex", () => 0));
  });
});

describe("photoMoodForAwards", () => {
  const hi = () => 0.99; // above the small-chance threshold
  const lo = () => 0.01; // below it
  it("big achievements always map (rng ignored), with a matching caption", () => {
    expect(photoMoodForAwards([award("over_9000")], hi)).toEqual({ mood: "flex", caption: "It's Over 9,000" });
    expect(photoMoodForAwards([award("regicide:cardio")], hi)).toEqual({ mood: "roar", caption: "Regicide (cardio)" });
    expect(photoMoodForAwards([award("absolute_unit:pushups")], hi)?.mood).toBe("roar");
    expect(photoMoodForAwards([award("first_blood")], hi)?.mood).toBe("flex");
    expect(photoMoodForAwards([award("all_food_groups")], hi)?.mood).toBe("flex");
    // top pushups tier → flex, caption is the tier name
    expect(photoMoodForAwards([award("milestone:pushups:5000")], hi)).toEqual({ mood: "flex", caption: "Beat the Mattress" });
  });
  it("priority: over_9000 wins over a roar achievement (and drives the caption)", () => {
    expect(photoMoodForAwards([award("regicide:cardio"), award("over_9000")], hi)).toEqual({ mood: "flex", caption: "It's Over 9,000" });
  });
  it("small achievements are rng-gated", () => {
    expect(photoMoodForAwards([award("milestone:pushups:500")], hi)).toBeNull();        // retired key, roll misses
    expect(photoMoodForAwards([award("milestone:pushups:500")], lo)?.mood).toBe("flex"); // roll hits
    expect(photoMoodForAwards([award("participation")], lo)).toEqual({ mood: "smug", caption: "Participation" });
    expect(photoMoodForAwards([award("cursed:pushups:69")], lo)?.mood).toBe("smug");
    expect(photoMoodForAwards([award("risen")], lo)?.mood).toBe("flex");
  });
  it("empty awards → null", () => {
    expect(photoMoodForAwards([], lo)).toBeNull();
  });
});

describe("isTinySubmission", () => {
  it("flags <10 on pushups/cardio/core, exempts pullups & lifting", () => {
    expect(isTinySubmission("pushups", 9)).toBe(true);
    expect(isTinySubmission("cardio", 9)).toBe(true);
    expect(isTinySubmission("core", 9)).toBe(true);
    expect(isTinySubmission("pushups", 10)).toBe(false);
    expect(isTinySubmission("pullups", 5)).toBe(false);  // legit/hard
    expect(isTinySubmission("lifting", 5)).toBe(false);  // heavy
  });
});

describe("createCooldownGate", () => {
  it("respects chance and cooldown, updating only on a posted hit", () => {
    const gate = createCooldownGate({ chance: 1, cooldownMs: 1000 });
    expect(gate.allow(new Date(0), () => 0)).toBe(true);     // first hit
    expect(gate.allow(new Date(500), () => 0)).toBe(false);  // within cooldown
    expect(gate.allow(new Date(1500), () => 0)).toBe(true);  // cooldown elapsed
  });
  it("a missed chance does not start the cooldown", () => {
    const gate = createCooldownGate({ chance: 0.2, cooldownMs: 1000 });
    expect(gate.allow(new Date(0), () => 0.9)).toBe(false); // chance miss
    expect(gate.allow(new Date(10), () => 0.0)).toBe(true); // not blocked by a prior (missed) attempt
  });
  it("the documented chance constants", () => {
    expect(SMALL_ACHIEVEMENT_PHOTO_CHANCE).toBe(0.12);
    expect(ZEN_PHOTO_CHANCE).toBe(0.1);
    expect(GENERAL_HYPE_CHANCE).toBe(0.2);
  });
});

describe("renderPhoto", () => {
  beforeEach(() => { vi.resetModules(); });

  it("renders a valid PNG with a caption when the base exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pd-photos-"));
    writeFileSync(join(dir, "dragon-smug.png"), createCanvas(40, 60).toBuffer("image/png"));
    process.env.PHOTOS_DIR = dir;
    const { renderPhoto } = await import("../src/photos.js");
    const out = await renderPhoto("smug", () => 0);
    expect(out).not.toBeNull();
    expect(out!.name).toBe("dragon-smug.png");
    expect([...out!.buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG signature
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses an explicit caption when given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pd-photos-cap-"));
    writeFileSync(join(dir, "dragon-flex.png"), createCanvas(40, 60).toBuffer("image/png"));
    process.env.PHOTOS_DIR = dir;
    const { renderPhoto } = await import("../src/photos.js");
    const out = await renderPhoto("flex", () => 0, "Beat the Mattress");
    expect(out).not.toBeNull();
    expect([...out!.buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // valid PNG (caption branch didn't crash)
    rmSync(dir, { recursive: true, force: true });
  });

  it("picks among multiple files for a mood by rng", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pd-photos-multi-"));
    writeFileSync(join(dir, "dragon-roar.png"), createCanvas(40, 60).toBuffer("image/png"));
    writeFileSync(join(dir, "dragon-roar-2.png"), createCanvas(40, 60).toBuffer("image/png"));
    process.env.PHOTOS_DIR = dir;
    const { renderPhoto } = await import("../src/photos.js");
    const a = await renderPhoto("roar", () => 0);    // index 0
    const b = await renderPhoto("roar", () => 0.99); // index 1
    expect(a!.name).toMatch(/^dragon-roar.*\.png$/);
    expect(b!.name).toMatch(/^dragon-roar.*\.png$/);
    expect(a!.name).not.toBe(b!.name); // different rng → different file in a 2-file pool
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when the base file is missing (never throws)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pd-photos-empty-"));
    process.env.PHOTOS_DIR = dir;
    const { renderPhoto } = await import("../src/photos.js");
    expect(await renderPhoto("roar", () => 0)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
