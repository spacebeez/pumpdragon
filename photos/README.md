# PumpDragon photos — image map

The dragon posts a captioned photo on certain moments. Selection is **mood-based**: a moment picks a
mood, the bot globs every `dragon-<mood>*.png` in this folder, picks one at random, overlays a bold
impact caption, downscales to ~1024px wide, and attaches it. **Achievement** photos caption with the
**unlocked tier's name** (e.g. `BEAT THE MATTRESS`), matching the flare line; all other triggers use a
random phrase from that mood's pool.

**Live in production.** PNGs are **gitignored** (large binaries) and bundled into the container at deploy
(`COPY photos ./photos` → `/app/photos`). Only this README is tracked. Code: `src/photos.ts`
(`renderPhoto`, `PHRASE_POOLS`, `photoMoodForAwards`, the cooldown gate) and the `src/commands.ts` log
branch (trigger priority).

## The five moods

| Mood | Count | Fires on… | Caption pool vibe |
|------|------|-----------|-------------------|
| 🦁 **flex** | 12 | **Big achievements** (always): OVER 9,000, FIRST BLOOD, ALL THE FOOD GROUPS, a 👑 top-tier milestone. Plus small achievements (~12%): lower milestones, RISEN. Plus the general-hype drop (see below). | Triumphant: `ASCENDED`, `LEGEND`, `CERTIFIED UNIT`, eruption double-entendres. |
| 🔥 **roar** | 8 | **REGICIDE** + **ABSOLUTE UNIT** achievements. Plus the general-hype drop. | Savage/effort: `CRUSHER`, `RAW POWER`, `DESTROYER`, eruption lines. |
| 🦎 **weak** | 6 | **Tiny submissions** — a log under 10 of pushups/cardio/core (pullups & lifting exempt; low reps there are legit). Plus **magic burns** (the roast target, ~20% chance, 15-min cooldown). | Mocking: `WEAK WYRM`, `SCRAWNY SMAUG`, `LOSER LIZARD`, `COUCH DRAGON`. |
| 🧘 **zen** | 3 | ~10% of **core/cardio** logs (recovery easter egg). | Calm-beast: `NAMASTE, BEAST`, `RECOVERY IS A WEAPON`, `STRETCH OR SNAP`. |
| 😏 **smug** | 3 | **Small-achievement drops only** (~12%): PARTICIPATION, cursed numbers (NICE/BLAZE IT/BEAST), THE 3 A.M. CONFESSIONAL. *(Magic burns moved to `weak`.)* | Cocky + a few jabs: `DRAGON PUMP`, `FULL SEND`, `PROVE IT`. |

**Trigger priority** on a workout log (first match wins): achievement photo → `weak` (tiny submission) →
`zen` (~10% core/cardio) → **general hype** (~20%, picks `roar` or `flex` 50/50). So a normal log with no
achievement still has a ~20% shot at a roar/flex hype dragon — that's what keeps the big pools in rotation.

## Adding more

Drop a PNG named `dragon-<mood>-<n>.png` (e.g. `dragon-roar-9.png`) into this folder. The glob
auto-includes it — **no code change** — it just needs the next deploy to bundle it. To add a phrase to a
mood's caption pool, edit `PHRASE_POOLS` in `src/photos.ts`.

## Not yet wired (planned)

- **Category-specific dragons** — a future `dragon-<category>-*.png` axis (cardio/core/pushups/pullups/
  lifting) so a cardio milestone pulls a *cardio* dragon (instead of a generic flex/roar). Generate via the
  gym-dragon style prompts; wiring is a small follow-on keyed by category, reusing the caption-match path.

> Note: the medal emojis shown next to names on the scoreboard/stats are a **separate** feature (the badge
> catalog in `src/badges.ts`), not these photos.
