CREATE TABLE IF NOT EXISTS achievements (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  discord_user_id TEXT,                 -- NULL for group-scoped achievements
  achievement_key TEXT NOT NULL,        -- "first_blood" | "over_9000" | "all_food_groups" | "milestone:<cat>:<tier>"
  period_key      TEXT NOT NULL,        -- "YYYY-MM"
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one award per (guild, user-or-group, key, period); COALESCE folds the NULL group user into one slot
CREATE UNIQUE INDEX IF NOT EXISTS achievements_unique
  ON achievements (guild_id, COALESCE(discord_user_id, ''), achievement_key, period_key);
