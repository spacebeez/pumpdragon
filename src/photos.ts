// Dragon photo posting: mood selection, caption render (canvas), and the magic-burn cooldown gate.
// Everything is null-safe — a missing file / render error returns null so the text still posts.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts, type Image } from "@napi-rs/canvas";
import { MILESTONE_TIERS, type Award } from "./achievements.js";
import { badgeFor } from "./badges.js";
import type { Category } from "./categories.js";

export type PhotoMood = "roar" | "smug" | "flex" | "zen" | "weak";
export interface PhotoFile { name: string; buffer: Buffer; }

// Each mood maps to ANY file named `dragon-<mood>*.png` in the photos dir (e.g. dragon-roar.png,
// dragon-roar-2.png …). Drop a correctly-named PNG in the folder and it's auto-included — no code change.

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
  // zen = recovery / mobility easter egg (rare drop on core/cardio logs): centered but still a beast
  zen: [
    "NAMASTE, BEAST", "RECOVERY IS A WEAPON", "STRETCH OR SNAP", "SWOLE AND CENTERED",
    "GAINS IN STILLNESS", "BREATHE, THEN DESTROY", "LIMBER LEGEND", "MOBILITY MOGUL", "BENDY BEAST",
  ],
  // weak = magic burns + tiny submissions: mock the weakling
  weak: [
    "WEAK WYRM", "SCRAWNY SMAUG", "LOSER LIZARD", "ALL SCALES, NO MUSCLE", "COUCH DRAGON",
    "PARTICIPATION SCALES", "FEATHERWEIGHT FLAME", "BABY GECKO ENERGY", "DAMP NOODLE",
  ],
};

const RENDER_WIDTH = 1024;
export const SMALL_ACHIEVEMENT_PHOTO_CHANCE = 0.12;
/** ~10% chance a core/cardio log (no achievement) drops a zen recovery dragon. */
export const ZEN_PHOTO_CHANCE = 0.1;
/** ~20% chance a normal workout log (no achievement / tiny / zen) drops a roar/flex hype dragon. */
export const GENERAL_HYPE_CHANCE = 0.2;

/** A "tiny submission" worth a weak-dragon clown: under 10 of a category where single digits = genuinely weak.
 *  Pullups & lifting are exempt — low reps there are legit/hard, not weak. */
const TINY_SUBMISSION_QTY = 10;
const TINY_MOCK_CATEGORIES: Category[] = ["pushups", "cardio", "core"];
export function isTinySubmission(category: Category, quantity: number): boolean {
  return TINY_MOCK_CATEGORIES.includes(category) && quantity < TINY_SUBMISSION_QTY;
}
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

function isTopMilestone(key: string): boolean {
  const m = key.match(/^milestone:([a-z]+):(\d+)$/);
  if (!m || !m[1] || !m[2]) return false; // narrow m[1]/m[2] to string (noUncheckedIndexedAccess)
  const tiers = MILESTONE_TIERS[m[1] as Category];
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  return Number(m[2]) === tiers[tiers.length - 1]!.threshold;
}

/** Pick a mood + caption for the just-earned achievements: BIG ones always; small ones at a low random
 *  chance. The caption is the headline (priority-driving) achievement's name, so the dragon's overlaid
 *  text matches the unlock line. Returns null when no photo should fire. */
export function photoMoodForAwards(awards: Award[], rng: () => number): { mood: PhotoMood; caption: string } | null {
  const keys = awards.map((a) => a.key);
  const hit = (key: string, mood: PhotoMood) => ({ mood, caption: badgeFor(key).label });
  let k: string | undefined;
  if (keys.includes("over_9000")) return hit("over_9000", "flex");
  if ((k = keys.find((x) => x.startsWith("regicide:")))) return hit(k, "roar");
  if ((k = keys.find((x) => x.startsWith("absolute_unit:")))) return hit(k, "roar");
  if (keys.includes("first_blood")) return hit("first_blood", "flex");
  if (keys.includes("all_food_groups")) return hit("all_food_groups", "flex");
  if ((k = keys.find(isTopMilestone))) return hit(k, "flex");
  // SMALL — variable reward
  if (awards.length === 0) return null;
  if (rng() >= SMALL_ACHIEVEMENT_PHOTO_CHANCE) return null;
  if ((k = keys.find((x) => x.startsWith("milestone:")))) return hit(k, "flex");
  if (keys.includes("risen")) return hit("risen", "flex");
  k = keys.find((x) => x === "participation" || x.startsWith("cursed:") || x === "witching_hour") ?? keys[0];
  return k ? hit(k, "smug") : null; // participation / cursed / witching
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

function photosDir(): string {
  return process.env.PHOTOS_DIR ?? path.join(process.cwd(), "photos");
}

// List of `dragon-<mood>*.png` filenames per mood (cached after the first readdir).
const fileListCache = new Map<PhotoMood, string[]>();
function filesForMood(mood: PhotoMood): string[] {
  const cached = fileListCache.get(mood);
  if (cached) return cached;
  let files: string[] = [];
  try {
    files = readdirSync(photosDir()).filter((f) => f.startsWith(`dragon-${mood}`) && f.toLowerCase().endsWith(".png"));
  } catch { files = []; }
  fileListCache.set(mood, files);
  return files;
}

// Decoded base image per filename; a null entry means "known missing" (don't re-stat).
const baseCache = new Map<string, Image | null>();

async function loadBaseFile(file: string): Promise<Image | null> {
  if (baseCache.has(file)) return baseCache.get(file)!;
  try {
    const img = await loadImage(path.join(photosDir(), file));
    baseCache.set(file, img);
    return img;
  } catch {
    baseCache.set(file, null);
    return null;
  }
}

/** Load the base image, overlay a caption (explicit `caption` if given, else a random mood phrase), return
 *  the composite PNG. Null on any miss/error. */
export async function renderPhoto(mood: PhotoMood, rng: () => number, caption?: string): Promise<PhotoFile | null> {
  try {
    const files = filesForMood(mood);
    if (files.length === 0) return null;
    const file = files[Math.min(files.length - 1, Math.max(0, Math.floor(rng() * files.length)))]!;
    const base = await loadBaseFile(file);
    if (!base) return null;
    const w = RENDER_WIDTH;
    const h = Math.round((base.height / base.width) * w);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(base, 0, 0, w, h);

    const text = (caption ?? pickPhrase(mood, rng)).toUpperCase();
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

    return { name: file, buffer: canvas.toBuffer("image/png") };
  } catch (e) {
    console.error("[pumpdragon] photo render error:", e);
    return null;
  }
}
