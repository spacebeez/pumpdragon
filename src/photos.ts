// Dragon photo posting: mood selection, caption render (canvas), and the magic-burn cooldown gate.
// Everything is null-safe — a missing file / render error returns null so the text still posts.
import { existsSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts, type Image } from "@napi-rs/canvas";
import { MILESTONE_TIERS, type Award } from "./achievements.js";
import type { Category } from "./categories.js";

export type PhotoMood = "roar" | "smug" | "flex";
export interface PhotoFile { name: string; buffer: Buffer; }

const MOOD_FILE: Record<PhotoMood, string> = {
  roar: "dragon-roar.png",
  smug: "dragon-smug.png",
  flex: "dragon-flex.png",
};

/** Curated mood-matched captions (double-entendre gym/bro energy; suggestive, not explicit). Edit freely. */
const PHRASE_POOLS: Record<PhotoMood, string[]> = {
  // roar = the logger's savage win (regicide / monster lift): triumphant eruption energy
  roar: [
    "CRUSHER", "RAW POWER", "DESTROYER", "PACKING HEAT", "FERAL", "MAX EFFORT",
    "Dragon's fully roused", "Erupted on the final rep", "Pumped 'til I popped",
    "Emptied the chamber clean", "Gripped it, ripped it, dripped it", "Throbbing, dripping, and done",
    "Throbbed through the cooldown", "Let the beast loose and didn't hold back",
    "Geysered fire 'til the embers died", "Coiled tight, then sprang and spent it all",
    "Blew the cave wide open", "Drenched, drained, delighted",
  ],
  // smug = magic-burn / cocky: mock the weakness
  smug: [
    "DRAGON PUMP", "FULL SEND", "ALL GAS", "BIG IRON ENERGY", "PROVE IT", "NICE FORM",
    "Wet noodle wingspan", "All hiss, no thrust", "Soft-scaled", "Big roar, little tail",
    "Damp matchstick energy", "Folded like wet wings", "Blew your load early", "Long flight, hard landing",
    "Couldn't breathe fire if you ate a candle",
  ],
  // flex = celebration / milestone: triumphant build-and-finish
  flex: [
    "ASCENDED", "CERTIFIED UNIT", "PEAK FORM", "BUILT DIFFERENT", "LEGEND", "SWOLE",
    "Built it up slow, let it rip fast", "Quivering on the last one, but I delivered",
    "Mounted the summit and let it all go", "Dripping smoke, draped in glory",
  ],
};

const RENDER_WIDTH = 1024;
export const SMALL_ACHIEVEMENT_PHOTO_CHANCE = 0.12;
const CAPTION_FONT = "PhotoCaption";

// Register a bold font for captions if available (Alpine image installs font-dejavu; dev fallbacks below).
for (const p of [
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
]) {
  if (existsSync(p)) { GlobalFonts.registerFromPath(p, CAPTION_FONT); break; }
}

export function pickPhrase(mood: PhotoMood, rng: () => number): string {
  const pool = PHRASE_POOLS[mood];
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[i]!;
}

function isGoldMilestone(key: string): boolean {
  const m = key.match(/^milestone:([a-z]+):(\d+)$/);
  if (!m || !m[1] || !m[2]) return false; // narrow m[1]/m[2] to string (noUncheckedIndexedAccess)
  const tiers = MILESTONE_TIERS[m[1] as Category];
  return Array.isArray(tiers) && Number(m[2]) === Math.max(...tiers);
}

/** Pick a mood for the just-earned achievements: BIG ones always; small ones at a low random chance. */
export function photoMoodForAwards(awards: Award[], rng: () => number): PhotoMood | null {
  const keys = awards.map((a) => a.key);
  if (keys.includes("over_9000")) return "flex";
  if (keys.some((k) => k.startsWith("regicide:"))) return "roar";
  if (keys.some((k) => k.startsWith("absolute_unit:"))) return "roar";
  if (keys.includes("first_blood")) return "flex";
  if (keys.includes("all_food_groups")) return "flex";
  if (keys.some(isGoldMilestone)) return "flex";
  // SMALL — variable reward
  if (awards.length === 0) return null;
  if (rng() >= SMALL_ACHIEVEMENT_PHOTO_CHANCE) return null;
  if (keys.some((k) => k.startsWith("milestone:"))) return "flex";
  if (keys.includes("risen")) return "flex";
  return "smug"; // participation / cursed / witching
}

/** Stateful gate: at most one `true` per cooldown, and only when the chance roll hits. */
export function createCooldownGate({ chance, cooldownMs }: { chance: number; cooldownMs: number }) {
  let lastPostedAt = -Infinity; // first post always allowed, regardless of the absolute clock
  return {
    allow(now: Date, rng: () => number): boolean {
      const t = now.getTime();
      if (t - lastPostedAt < cooldownMs) return false;
      if (rng() >= chance) return false;
      lastPostedAt = t;
      return true;
    },
  };
}

// Cache the decoded base image per mood; a null entry means "known missing" (don't re-stat).
const baseCache = new Map<PhotoMood, Image | null>();

async function loadBase(mood: PhotoMood): Promise<Image | null> {
  if (baseCache.has(mood)) return baseCache.get(mood)!;
  const dir = process.env.PHOTOS_DIR ?? path.join(process.cwd(), "photos");
  try {
    const img = await loadImage(path.join(dir, MOOD_FILE[mood]));
    baseCache.set(mood, img);
    return img;
  } catch {
    baseCache.set(mood, null);
    return null;
  }
}

/** Load the base image, overlay a random mood caption, return the composite PNG. Null on any miss/error. */
export async function renderPhoto(mood: PhotoMood, rng: () => number): Promise<PhotoFile | null> {
  try {
    const base = await loadBase(mood);
    if (!base) return null;
    const w = RENDER_WIDTH;
    const h = Math.round((base.height / base.width) * w);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(base, 0, 0, w, h);

    const text = pickPhrase(mood, rng).toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // auto-fit: shrink until the caption fits within ~92% of the width
    let size = Math.round(w / 8);
    ctx.font = `bold ${size}px ${CAPTION_FONT}, sans-serif`;
    while (size > 24 && ctx.measureText(text).width > w * 0.92) {
      size -= 4;
      ctx.font = `bold ${size}px ${CAPTION_FONT}, sans-serif`;
    }
    const y = Math.round(h * 0.86);
    ctx.lineWidth = Math.round(size / 5);
    ctx.strokeStyle = "rgba(0,0,0,0.92)";
    ctx.strokeText(text, w / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, w / 2, y);

    return { name: MOOD_FILE[mood], buffer: canvas.toBuffer("image/png") };
  } catch (e) {
    console.error("[pumpdragon] photo render error:", e);
    return null;
  }
}
