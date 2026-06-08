import type { Pool } from "./pool.js";
import type { Category } from "../categories.js";
import type { LogResultRow, ParsedItem } from "../types.js";
import { windowSql, type TimeWindow } from "../timewindow.js";

// NOTE: tz is validated against IANA in config (loadConfig) before reaching here, so this interpolation is safe.
const MONTH = (tz: string) =>
  `date_trunc('month', created_at AT TIME ZONE '${tz}') = date_trunc('month', now() AT TIME ZONE '${tz}')`;

export interface InsertArgs {
  guildId: string;
  userId: string;
  messageId: string | null;
  items: ParsedItem[];
  timezone: string;
}

export async function insertEntries(pool: Pool, args: InsertArgs): Promise<LogResultRow[]> {
  const out: LogResultRow[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of args.items) {
      // Compute trailing average BEFORE inserting the new row (source='user' AND quantity>0 only)
      const avgRes = await client.query<{ avg: string | null; cnt: string }>(
        `SELECT AVG(quantity)::float8 AS avg, COUNT(*)::int AS cnt FROM (
           SELECT quantity FROM entries
           WHERE guild_id=$1 AND discord_user_id=$2 AND category=$3 AND source='user' AND quantity>0
           ORDER BY created_at DESC LIMIT 10
         ) t`,
        [args.guildId, args.userId, item.category],
      );
      const ins = await client.query(
        `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, detail)
         VALUES ($1,$2,$3,$4,$5,'user',$6)
         ON CONFLICT (discord_message_id, category) WHERE discord_message_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [args.guildId, args.userId, args.messageId, item.category, item.quantity, item.detail ?? null],
      );
      // Skip deduped (conflicted) rows — they are not included in the returned array
      if (ins.rowCount === 0) continue;

      const totRes = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(quantity),0)::int AS total FROM entries
         WHERE guild_id=$1 AND discord_user_id=$2 AND category=$3 AND ${MONTH(args.timezone)}`,
        [args.guildId, args.userId, item.category],
      );
      out.push({
        category: item.category,
        quantity: item.quantity,
        userMonthlyTotal: Number(totRes.rows[0]!.total),
        trailingAverage: avgRes.rows[0]!.avg === null ? 0 : Number(avgRes.rows[0]!.avg),
        priorCount: Number(avgRes.rows[0]!.cnt),
        hype: false,
        detail: item.detail ?? null,
      });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return out;
}

export async function getCurrentMonthCombinedTotal(
  pool: Pool, guildId: string, tz: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<number> {
  const r = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(quantity),0)::int AS total FROM entries
     WHERE guild_id=$1 AND ${windowSql(tz, window)}`,
    [guildId],
  );
  return Number(r.rows[0]!.total);
}

export async function getCurrentGoal(pool: Pool, guildId: string, tz: string): Promise<number | null> {
  // NOTE: tz interpolated into SQL — config-validated IANA zone (see top of file)
  const r = await pool.query<{ goal_amount: number }>(
    `SELECT goal_amount FROM monthly_goals
     WHERE guild_id=$1 AND month = date_trunc('month', now() AT TIME ZONE '${tz}')::date`,
    [guildId],
  );
  return r.rowCount ? Number(r.rows[0]!.goal_amount) : null;
}

export async function setGoal(pool: Pool, guildId: string, tz: string, amount: number): Promise<void> {
  // NOTE: tz interpolated into SQL — config-validated IANA zone (see top of file)
  await pool.query(
    `INSERT INTO monthly_goals (guild_id, month, goal_amount)
     VALUES ($1, date_trunc('month', now() AT TIME ZONE '${tz}')::date, $2)
     ON CONFLICT (guild_id, month) DO UPDATE SET goal_amount = EXCLUDED.goal_amount`,
    [guildId, amount],
  );
}

export interface StandingRow {
  category: Category;
  userId: string;
  total: number;
}

export async function getStandings(
  pool: Pool, guildId: string, tz: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<StandingRow[]> {
  const r = await pool.query<{ category: Category; discord_user_id: string; total: string }>(
    `SELECT category, discord_user_id, SUM(quantity)::int AS total FROM entries
     WHERE guild_id=$1 AND ${windowSql(tz, window)}
     GROUP BY category, discord_user_id
     HAVING SUM(quantity) > 0
     ORDER BY category, total DESC`,
    [guildId],
  );
  return r.rows.map((row) => ({ category: row.category, userId: row.discord_user_id, total: Number(row.total) }));
}

export interface OverallRow {
  userId: string;
  total: number;
}

/** Per-user total across ALL categories (naive sum) for the window (default: current month), ranked high→low. */
export async function getOverallStandings(
  pool: Pool, guildId: string, tz: string, window: TimeWindow = { kind: "thisMonth" },
): Promise<OverallRow[]> {
  const r = await pool.query<{ discord_user_id: string; total: string }>(
    `SELECT discord_user_id, SUM(quantity)::int AS total FROM entries
     WHERE guild_id=$1 AND ${windowSql(tz, window)}
     GROUP BY discord_user_id
     HAVING SUM(quantity) > 0
     ORDER BY total DESC`,
    [guildId],
  );
  return r.rows.map((row) => ({ userId: row.discord_user_id, total: Number(row.total) }));
}

/** The group goal for a specific calendar month (year, month 1–12), or null. */
export async function getGoalForMonth(pool: Pool, guildId: string, year: number, month: number): Promise<number | null> {
  const mm = String(month).padStart(2, "0"); // year/month are numbers → injection-safe
  const r = await pool.query<{ goal_amount: number }>(
    `SELECT goal_amount FROM monthly_goals WHERE guild_id=$1 AND month = date '${year}-${mm}-01'`,
    [guildId],
  );
  return r.rowCount ? Number(r.rows[0]!.goal_amount) : null;
}

export interface RecentDetail {
  userId: string;
  detail: string;
}

/** Distinct recent (user, detail) moments in the window, most recent first (for ceremony call-backs). */
export async function getRecentDetails(
  pool: Pool, guildId: string, tz: string, window: TimeWindow, limit = 6,
): Promise<RecentDetail[]> {
  const r = await pool.query<{ discord_user_id: string; detail: string }>(
    `SELECT discord_user_id, detail, MAX(created_at) AS last FROM entries
     WHERE guild_id=$1 AND source='user' AND detail IS NOT NULL AND ${windowSql(tz, window)}
     GROUP BY discord_user_id, detail
     ORDER BY last DESC
     LIMIT $2`,
    [guildId, limit],
  );
  return r.rows.map((row) => ({ userId: row.discord_user_id, detail: row.detail }));
}

export interface AdminEntryArgs {
  guildId: string;
  targetUserId: string;
  category: Category;
  quantity: number;
  source: "admin_add" | "admin_remove";
  note: string | null;
}

export async function insertAdminEntry(pool: Pool, a: AdminEntryArgs): Promise<void> {
  await pool.query(
    `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, admin_note)
     VALUES ($1,$2,NULL,$3,$4,$5,$6)`,
    [a.guildId, a.targetUserId, a.category, a.quantity, a.source, a.note],
  );
}

export interface ImportRow {
  messageId: string;
  userId: string;
  category: Category;
  quantity: number;
  ts: string; // ISO; becomes created_at
}

/** Insert replayed Scoreboarder rows as source='import'. Idempotent via the existing partial unique index
 *  on (discord_message_id, category) — returns the count of NEW rows. NOTE: ON CONFLICT DO NOTHING does NOT
 *  update an existing row, so to re-import with different parameters first DELETE … WHERE source='import'. */
export async function insertImportRows(pool: Pool, guildId: string, rows: ImportRow[]): Promise<number> {
  let inserted = 0;
  for (const r of rows) {
    const res = await pool.query(
      `INSERT INTO entries (guild_id, discord_user_id, discord_message_id, category, quantity, source, created_at)
       VALUES ($1,$2,$3,$4,$5,'import',$6)
       ON CONFLICT (discord_message_id, category) WHERE discord_message_id IS NOT NULL DO NOTHING`,
      [guildId, r.userId, r.messageId, r.category, r.quantity, r.ts],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export interface CumulativeSeriesRow { userId: string; month: string; cumulative: number; }

/** Per-user running cumulative total for a category over ALL time, bucketed by month ("YYYY-MM"). */
export async function getCumulativeMonthlySeries(
  pool: Pool, guildId: string, tz: string, category: Category,
): Promise<CumulativeSeriesRow[]> {
  const r = await pool.query<{ user_id: string; month: string; cumulative: string }>(
    `WITH monthly AS (
       SELECT discord_user_id AS user_id,
              date_trunc('month', created_at AT TIME ZONE '${tz}') AS m,
              SUM(quantity)::int AS qty
       FROM entries WHERE guild_id=$1 AND category=$2
       GROUP BY 1, 2
     )
     SELECT user_id, to_char(m, 'YYYY-MM') AS month,
            SUM(qty) OVER (PARTITION BY user_id ORDER BY m ROWS UNBOUNDED PRECEDING)::int AS cumulative
     FROM monthly ORDER BY user_id, m`,
    [guildId, category],
  );
  return r.rows.map((row) => ({ userId: row.user_id, month: row.month, cumulative: Number(row.cumulative) }));
}

export interface MonthQtyRow { month: string; qty: number; }

/** One user's per-month (non-cumulative) totals for a category, chronological. */
export async function getUserMonthlySeries(
  pool: Pool, guildId: string, tz: string, userId: string, category: Category,
): Promise<MonthQtyRow[]> {
  const r = await pool.query<{ month: string; qty: string }>(
    `SELECT to_char(date_trunc('month', created_at AT TIME ZONE '${tz}'), 'YYYY-MM') AS month,
            SUM(quantity)::int AS qty
     FROM entries WHERE guild_id=$1 AND discord_user_id=$2 AND category=$3
     GROUP BY 1 ORDER BY 1`,
    [guildId, userId, category],
  );
  return r.rows.map((row) => ({ month: row.month, qty: Number(row.qty) }));
}

export interface UserMonthQtyRow { month: string; userId: string; qty: number; }

/** Per-user monthly totals for a category over all time (positive months only), chronological. */
export async function getGroupMonthlyByUser(
  pool: Pool, guildId: string, tz: string, category: Category,
): Promise<UserMonthQtyRow[]> {
  const r = await pool.query<{ month: string; user_id: string; qty: string }>(
    `SELECT to_char(date_trunc('month', created_at AT TIME ZONE '${tz}'), 'YYYY-MM') AS month,
            discord_user_id AS user_id, SUM(quantity)::int AS qty
     FROM entries WHERE guild_id=$1 AND category=$2
     GROUP BY 1, 2 HAVING SUM(quantity) > 0 ORDER BY 1, 2`,
    [guildId, category],
  );
  return r.rows.map((row) => ({ month: row.month, userId: row.user_id, qty: Number(row.qty) }));
}
