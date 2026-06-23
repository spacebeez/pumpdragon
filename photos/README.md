# PumpDragon photos — usage guide

Three Gemini-generated images of the dragon in **IRON DRAGON GYM**, one per emotional register.
Names are mood-based so the (future) image-posting feature can map a bot moment → the right pic.

> Not yet wired into the bot. This folder + labels are the groundwork for the image-posting feature
> (we still need to decide: where they live at runtime, and what triggers a post). See "Open questions" below.

| File | Vibe | Post it when… |
|------|------|---------------|
| **dragon-roar.png** | Feral, aggressive — seated at a loaded bar, **jaws wide open mid-roar**, steam everywhere. | The savage moments: **REGICIDE**, a brutal burn, an **ABSOLUTE UNIT** single-log, a "prove it / get in the gym" challenge, raw feral hype. Pair with the meanest lines. |
| **dragon-smug.png** | Cocky, composed — same seated-at-the-bar pose but **mouth shut, smug, staring you down**. | The roast-flirt tease: replies to **magic**, smug comebacks, the unprompted jab, "come prove it, big boy." The default "I'm unimpressed but intrigued" face. |
| **dragon-flex.png** | Triumphant — **standing double-biceps flex**, glowing backlight, showoff grin. | Celebration: **milestones / achievements unlocked**, monthly **goal hit**, **FIRST BLOOD** / **OVER 9,000**, "hype me up," a genuine W. The reward pic. |

## Quick mapping (mood → file)

- **savage / roar / regicide / monster-lift** → `dragon-roar.png`
- **roast / flirt / smug jab / magic** → `dragon-smug.png`
- **celebrate / milestone / goal / hype** → `dragon-flex.png`

## Open questions for the posting feature (when we build it)

1. **Runtime storage** — bundle in the Docker image at `/opt/dragon-bot/photos` (simple, but ~25 MB in git/image), or host them and fetch by URL? Leaning bundle, since it's only 3 files and avoids an external dependency.
2. **Trigger** — random chance on the unprompted jab? When magic specifically talks? On an achievement unlock? An admin command? Probably a mix, keyed by the mood table above.
3. **Caption** — drop the pic alone, or pair it with a roast/hype line? (Likely: line + image, mood-matched.)

These get decided in that feature's brainstorm — this file just makes sure each image has a clear, agreed purpose first.
