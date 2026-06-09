# PumpDragon

PumpDragon is an @mention-triggered Discord bot for small friend groups who want to track fitness together. Members post natural-language workout logs (`@dragon 50 pushups and 30 min cardio`) and the bot records everything, keeps five independent scoreboards (cardio / pushups / pullups / core / lifting) in their native units, and tracks a shared monthly power-meter goal. Every log reply is a rich embed showing what was logged, each category's running monthly total for that user, and the group's combined progress bar. When someone crushes a personal record — more than 1.5x their recent average, with at least three prior entries in that category — the dragon adds a hype line from a hardcoded roster of gym-bro encouragement. Members can also summon hype on demand (`@dragon hype me up`) without spending an API call. Admins can manually add or remove entries for any user and set the month's shared goal. A scheduled daily recap posts the full standings and power meter to a configured channel. On demand, PumpDragon also renders PNG charts (a cumulative "race", personal trends, who-led-each-month), surfaces text insights (all-time champions and who's rising fastest), and — when @mentioned with anything that isn't a log or command — replies in character as an over-the-top mythic hype dragon. One member can optionally be configured as the dragon's affectionately-roasted target.

---

## Commands

All commands start with an @mention of the bot. If you set the bot's server nickname to `dragon` (recommended), the trigger is `@dragon`.

| Command | What it does |
|---|---|
| `@dragon <natural language log>` | Log one or more activities. E.g. `@dragon 50 pushups and 20 min cardio`. |
| `@dragon ping` | Sanity check — confirms the bot is alive. |
| `@dragon hype me up` | Returns a random hype phrase. No database write, no API call. |
| `@dragon board` | Full scoreboard for the current month (all categories + overall ranking + power meter). |
| `@dragon cardio` | Single-category leaderboard for this month. Works for any category: `pushups`, `pullups`, `core`, `lifting`. |
| `@dragon me` | Your personal stats card — rank, per-category totals, and your share of the group's combined total. |
| `@dragon stats @user` | Stats card for another member. The bot resolves their display name. |
| `@dragon board last month` | Full scoreboard for the previous calendar month. |
| `@dragon board <month>` | Full scoreboard for a named past month (e.g. `board may`, `board march`). Month names resolve to the most recent occurrence of that month. |
| `@dragon year` | Scoreboard for the current calendar year-to-date. Also accepts `this year` and `ytd`. |
| `@dragon alltime` | Scoreboard across all time. Also accepts `all time` and `lifetime`. |
| `@dragon help` | Lists all available commands. Admin section only shown to admins. |
| `@dragon race <category>` | A cumulative "race" chart (PNG): every member's running total in that category over all time, top lines bold and the rest faint. Bare `race` defaults to pushups. |
| `@dragon mychart <category>` | Your personal month-by-month trend (PNG) for one category. |
| `@dragon months <category>` | "Who carried each month" — stacked monthly bars (PNG) for one category. |
| `@dragon insights` | Text rundown: all-time per-category champions, the biggest recent climber, and the group's lifetime total. |
| `@dragon <anything else>` | If it isn't a log or a command, the dragon replies in character — hype, banter, encouragement. |
| `@dragon admin add <qty> <category> @user` | Admin only. Add qty to a user's monthly total for a category. |
| `@dragon admin remove <qty> <category> @user` | Admin only. Subtract qty from a user's monthly total (audited negative entry). |
| `@dragon admin goal <number>` | Admin only. Set the group's combined monthly goal. |
| `@dragon admin close-month [YYYY-MM]` | Admin only. Trigger the month-rollover ceremony on demand. Bare form uses the last completed month; optional `YYYY-MM` targets a specific month. Skipped automatically if the month had zero activity. |

**Activity flavor memory**

When you include specific activity words in a log — e.g. `@dragon 30 min trail running` — the bot captures that phrasing as the entry's "detail". If the log triggers an auto-hype line (because you crushed your personal record), the hype will call back your own words: `trail running?? the dragon felt that from across the lair.` No extra steps needed; the bot picks it up automatically.

**Month-rollover ceremony**

At 07:00 on the 1st of each month (in the configured timezone), the bot auto-posts a ceremony embed to `RECAP_CHANNEL_ID` celebrating the month that just ended. If that month had zero activity the post is skipped. The same embed can be triggered on demand by an admin using `admin close-month [YYYY-MM]`.

The ceremony includes: a collective "we ascended together" hero-hype lead with the group's total output vs the month's goal (e.g. "BLEW PAST IT — OVER 9,000" when ≥100%); per-category MVP shout-outs; 1–2 month-over-month rising-star call-outs; gentle magic/hero-themed encouragement for anyone who fell off (welcoming, not a roast); memorable activity-detail "moments" drawn from logged entries; and an encouraging close. All names render as non-pinging mentions and `allowedMentions: { parse: [] }` is set on every ceremony post to prevent @everyone abuse.

**Categories and units**

| Category | Unit | Accepted aliases |
|---|---|---|
| `cardio` | min | cardio, run, running, cycle, cycling, row, rowing, bike, biking, jog, jogging |
| `pushups` | reps | pushups, pushup, push-ups, push-up |
| `pullups` | reps | pullups, pullup, pull-ups, pull-up, chinups, chin-ups |
| `core` | min | core, abs, plank, planks |
| `lifting` | reps | lifting, lift, weights, weightlifting, strength |

Quantities must be whole positive numbers (1–100,000). Fractional values are rounded; anything that rounds below 1 is rejected and noted in the reply. Admin `remove` inserts a negative entry — full history is preserved and auditable.

---

## Charts

Three commands render a PNG locally with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (prebuilt binaries — no system build tooling, works on `node:alpine`) and reply with the image as a dragon-styled embed:

- **`@dragon race <category>`** — a cumulative-race line chart: each member is a line, x = months, y = running total. The top finishers are drawn bold and labeled; everyone else is a faint grey line so nobody is erased.
- **`@dragon mychart <category>`** — your own per-month totals for one category over time.
- **`@dragon months <category>`** — stacked monthly bars showing each month's group total split by member ("who carried the flame").

Fonts: the Docker image installs DejaVu (`apk add font-dejavu`) and the chart code registers it at startup (guarded by a file-exists check, so local dev on macOS/Windows falls back to a system font). No charts command needs the LLM.

## Talk to the dragon

When you @mention the bot with something that isn't a workout log or a known command, it replies in character — an ancient, swole, over-the-top hype dragon. The conversation is **lightly grounded** (it's told the speaker's all-time total and the current overall leader) and has **short memory** (it reads the last few channel messages for continuity). Replies are capped, never ping anyone, and fall back to a fixed dragon line if the LLM errors, so chat never hard-fails.

**Optional roast target.** Set `ROAST_USER_ID` (and `ROAST_NICKNAME`) and the dragon will affectionately rib that one member for never training — and *only* that member; the system prompt refuses to roast anyone else, even when asked. Leave `ROAST_USER_ID` unset to disable roasting entirely (pure hype).

Both the log parser and the conversation call mark their static system prompt with Anthropic **prompt caching** (`cache_control: ephemeral`); per-call context is kept in the user message so the cached prefix reuses across bursts.

---

## Discord Developer Portal setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**. Name it **PumpDragon**.
2. Under **Bot**, click **Add Bot**. Copy the **Bot Token** — this is `DISCORD_TOKEN`.
3. Still under **Bot**, enable both **Message Content Intent** and **Server Members Intent** under Privileged Gateway Intents.
4. Under **OAuth2 → URL Generator**, select scopes: `bot`. Select permissions: **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**. Copy the generated URL and paste it in a browser while logged into Discord as a server admin. Authorize it to your server.
5. Enable **Developer Mode** in Discord client settings (Advanced). Then:
   - Right-click your server → **Copy Server ID** → `GUILD_ID`
   - Right-click the channel you want daily recaps posted in → **Copy Channel ID** → `RECAP_CHANNEL_ID`
   - Right-click the admin role in Server Settings → **Copy Role ID** → `ADMIN_ROLE_ID` (optional; if omitted, only Discord Administrators can use admin commands)
6. Optionally, set the bot's server **nickname to `dragon`** (right-click the bot in the member list → Edit Server Profile). Members can then mention it as `@dragon` — mentions resolve by user ID so the nickname is cosmetic only.

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

```
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | yes | — | Bot token from the Discord Developer Portal. |
| `GUILD_ID` | yes | — | Discord server (guild) ID. The bot ignores messages from other guilds. |
| `RECAP_CHANNEL_ID` | yes | — | Channel ID where the daily recap embed is posted. |
| `ANTHROPIC_API_KEY` | yes | — | Anthropic API key used for natural-language parsing. |
| `DATABASE_URL` | yes | — | Postgres connection string. Use `postgres://pumpdragon:pumpdragon@db:5432/pumpdragon` with docker compose. |
| `ADMIN_ROLE_ID` | no | (none) | Comma-separated Discord role IDs that gate admin commands (any one grants access). If unset, only users with the Discord Administrator permission can use admin commands. |
| `ROAST_USER_ID` | no | (none) | Discord user ID the conversational dragon may affectionately roast. Unset = no roasting (pure hype). |
| `ROAST_NICKNAME` | no | (none) | The nickname the dragon uses for the roast target (e.g. `magic`). |
| `ANTHROPIC_MODEL` | no | `claude-haiku-4-5` | Anthropic model for parsing. Haiku is fast and cheap for structured JSON extraction. |
| `ANTHROPIC_TIMEOUT_MS` | no | `8000` | Timeout (ms) for Anthropic API calls. A stalled call never hangs the message handler. |
| `TIMEZONE` | no | `America/Chicago` | IANA timezone. All month boundaries and the cron schedule use this zone. |
| `RECAP_TIME` | no | `08:00` | When the daily recap fires. Accepts `HH:MM` or a full 5-field cron expression. |
| `USER_COOLDOWN_SECONDS` | no | `5` | Minimum seconds between logged messages from the same user. Silent rate-limit. |
| `DATABASE_URL_TEST` | no | `postgres://pumpdragon:pumpdragon@localhost:5433/pumpdragon_test` | Used by the test suite only. Points at the test Postgres started via `docker-compose.test.yml`. |

---

## Running with Docker Compose

```bash
docker compose up -d --build
```

Check that it started:

```bash
docker compose logs -f bot
```

You should see something like:

```
[pumpdragon] applied migrations: 001_init.sql
[pumpdragon] recap scheduled: "0 8 * * *" (America/Chicago)
[pumpdragon] logged in as PumpDragon#1234
```

The bot and Postgres both have `restart: unless-stopped`. The Postgres data is on a named volume (`pumpdragon-db`) that survives container recreation. Migrations run automatically on every boot and are idempotent.

---

## Tests

Start the test database (ephemeral, in-memory via tmpfs):

```bash
docker compose -f docker-compose.test.yml up -d
```

Run the full suite (265 tests):

```bash
npm test
```

The db suite (`test/db.queries.test.ts`) connects to `localhost:5433` using `DATABASE_URL_TEST`. All other tests are pure unit tests with no external dependencies.

---

## Backup and restore (homelab)

> **Container name:** Compose derives it from the project (directory) name, so the db container is `dragon-bot-db-1` by default. Run `docker ps` to confirm before using the snippets below, and adjust the name if your directory differs.

**Backup** (run from a machine that can reach the Docker host, or add to a cron on the host):

```bash
docker exec dragon-bot-db-1 pg_dump -U pumpdragon pumpdragon | gzip > /mnt/backups/pumpdragon-$(date +%F).sql.gz
```

**Restore:**

```bash
gunzip -c pumpdragon-2026-06-05.sql.gz | docker exec -i dragon-bot-db-1 psql -U pumpdragon pumpdragon
```

Stop the bot container before restoring to a live database to avoid write conflicts.

---

## Architecture

All source lives in `src/`. The module graph is intentionally flat and dependency-directed — nothing circular.

| Module | File | Job |
|---|---|---|
| `config` | `src/config.ts` | Load and validate `.env`; fail fast with clear errors; validate IANA timezone. |
| `categories` | `src/categories.ts` | **Single source of truth** for the five categories — names, units, and parser aliases. The parser prompt, validation whitelist, and renderer all derive from here. Adding a category is a near-one-file change. |
| `db/pool` | `src/db/pool.ts` | Create the pg connection pool. |
| `db/migrate` | `src/db/migrate.ts` | Idempotent migration runner — applies any unapplied `.sql` files in `db/migrations/` on boot. |
| `db/queries` | `src/db/queries.ts` | Typed parameterized query functions: insert entries with ON CONFLICT dedup, trailing-average computation, monthly totals, goal UPSERT, standings. |
| `parser` | `src/parser.ts` | Natural language → `{category, quantity}[]` via Anthropic. Strict validate/coerce layer: category whitelist, integer rounding, `<1` rejection, graceful malformed-JSON handling. Never throws. |
| `scoring` | `src/scoring.ts` | Pure functions: trailing average, hype detection (1.5x threshold, ≥3 priors), power-meter text bar. |
| `hype` | `src/hype.ts` | Hardcoded hype-phrase list (17 lines). `randomHypePhrase()` shared by auto-hype and on-demand `hype me up` (DRY). Hype-request matcher. |
| `timewindow` | `src/timewindow.ts` | `TimeWindow` union type, `windowSql(tz, window)` → SQL predicate, `parseTimeWindow(text, now)` for natural-language window parsing. |
| `views` | `src/views.ts` | Pure routing matchers: `categoryViewOf`, `parseStatsRequest`, `isHelpRequest`. No I/O. |
| `renderer/types` | `src/renderer/types.ts` | `Renderer` interface — `logReply`, `recap`, `categoryBoard`, `statsCard`, `help` methods. Lets an `ImageRenderer` slot in with no changes elsewhere. |
| `renderer/embed` | `src/renderer/embed.ts` | `EmbedRenderer` — discord.js rich embeds for all views. |
| `converse` | `src/converse.ts` | Conversational dragon: static persona/roast system prompt (cached) + per-call context (speaker stats, recent transcript, roast directives) + Anthropic call with output cap and deterministic fallback. Mirrors `parser.ts`. |
| `chart` | `src/chart/` | Local PNG charts. `series.ts` is pure data-shaping (month axes, forward-fill, top-N bucketing); `renderer.ts` wraps `@napi-rs/canvas` primitives; `raceChart`/`trendChart`/`monthsChart` compose them; `build.ts` queries + resolves names + renders → a reply. |
| `insights` | `src/insights.ts` | Pure selectors (per-category leaders, biggest month-over-month climber) + the dragon-hype insights embed. |
| `admin` | `src/admin.ts` | Strict deterministic grammar for `admin add/remove/goal`. Role gate (`ADMIN_ROLE_ID` or Discord Administrator). Admin commands never touch the parser. |
| `commands` | `src/commands.ts` | Route `rest` text: empty/ping → sanity; `admin` → admin path; hype request → hype; else → parse → insert → render. Dependency injection via `MentionCtx` (testable without real pool/Discord). |
| `bot` | `src/bot.ts` | discord.js client wiring, intents, top-level error boundary. Per-user cooldown gate. |
| `cron` | `src/cron.ts` | Daily recap scheduled with node-cron in the configured timezone. |
| `index` | `src/index.ts` | Entry point: load config → pool → migrate → create client → start bot → login → schedule recap. |

**Timezone:** `America/Chicago` by default, configurable via `TIMEZONE`. All month-boundary SQL uses `created_at AT TIME ZONE '${tz}'`. The cron schedule is created with `{ timezone: config.timezone }`.

**Security note on timezone SQL interpolation:** the timezone string is validated against IANA on startup (`Intl.DateTimeFormat` constructor throws on invalid zones) before it ever reaches any query. It is not user-supplied at runtime.

---

## Roadmap

**v1.1 — Visibility (shipped)**

The visibility slice added five new scoreboard views, a help command, and activity-flavor memory:

- **Single-category boards:** `@dragon cardio` (any of the five categories) shows that category's ranked leaderboard.
- **Personal stats:** `@dragon me` / `@dragon stats @user` — rank, per-category totals, and share of the group combined total.
- **Time windows:** `board last month`, `board <month>`, `year` / `ytd`, `alltime` — all purely read the existing `entries` table through a `TimeWindow` predicate.
- **Help command:** `@dragon help` lists commands; admin section appears only for admins.
- **Activity-flavor memory:** the parser captures the user's own phrasing (e.g. "trail running") into an `entries.detail` column; auto-hype lines weave it back in when a personal record is hit.
- All new view commands are deterministic (no LLM call, no cooldown).

**v1.2 — Ceremony (shipped)**

Month-rollover ceremony — auto-posts at 07:00 on the 1st of each month (tz-aware) to `RECAP_CHANNEL_ID`; `admin close-month [YYYY-MM]` for on-demand triggering; dead-month skip (zero activity = no post). Ceremony content: collective hero-hype lead + goal comparison; per-category MVP shout-outs; 1–2 month-over-month rising stars; gentle magic-themed encouragement for members who fell off; memorable activity-detail moments; `allowedMentions: { parse: [] }` hardening.

**v2 — Charts & Insights (shipped)**

On-demand PNG charts (`race`, `mychart`, `months`) rendered locally with `@napi-rs/canvas`, plus a text `insights` command. Pure data-shaping (`src/chart/series.ts`) is unit-tested; rendering is smoke-tested for valid-PNG output.

**v3 — Conversational dragon (shipped)**

Non-log mentions get an in-character LLM reply (lightly data-aware, short channel memory), with an optional, hard-contained affectionate roast of one configured member. Anthropic prompt caching on both LLM calls.

**Also on the table:**

- **New categories:** all category definitions live in `src/categories.ts`; adding one is a near-one-file change.
- Personal records / PR detection; streaks; achievements; history / undo.
