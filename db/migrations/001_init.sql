CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_message_id TEXT,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  source TEXT NOT NULL DEFAULT 'user',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- per-(message,category) dedup; NULL message_ids (admin entries) never collide
CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_message_category
  ON entries (discord_message_id, category)
  WHERE discord_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entries_trailing
  ON entries (guild_id, discord_user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_month
  ON entries (guild_id, created_at);

CREATE TABLE IF NOT EXISTS monthly_goals (
  guild_id TEXT NOT NULL,
  month DATE NOT NULL,
  goal_amount INTEGER NOT NULL,
  PRIMARY KEY (guild_id, month)
);
