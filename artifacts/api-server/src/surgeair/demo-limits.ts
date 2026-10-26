import { createHmac } from "node:crypto";
import type { Request } from "express";
import { pool } from "@workspace/db";

export const LIMIT_MESSAGE = "Demo limit reached, please try again later";
type Category = "chat" | "booking" | "email" | "sms";

// The database, not an individual web process, owns the counters. This also
// prevents a restart or Autoscale instance from resetting the SMS budget.
let ready: Promise<void> | undefined;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS surgeair_demo_usage (
      id BIGSERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).then(async () => {
    await pool.query("CREATE INDEX IF NOT EXISTS surgeair_demo_usage_window ON surgeair_demo_usage (category, ip_hash, created_at)");
    await pool.query("CREATE INDEX IF NOT EXISTS surgeair_demo_usage_recent ON surgeair_demo_usage (created_at)");
  }).catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function reserveDemoUsage(category: Category, request: Request): Promise<boolean> {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is required for public demo limits.");
  const ipHash = createHmac("sha256", secret).update(request.ip ?? "unknown").digest("hex");
  await ensureTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SMS global lock also serializes per-IP SMS counts across instances.
    const lock = category === "sms" ? "surgeair:sms:global" : `surgeair:${category}:${ipHash}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lock]);
    await client.query("DELETE FROM surgeair_demo_usage WHERE created_at < now() - interval '24 hours'");
    const { rows } = await client.query<{ recent: string; daily: string; global_daily: string }>(`
      SELECT
        count(*) FILTER (WHERE ip_hash = $2 AND created_at > now() - ($3::integer * interval '1 second')) AS recent,
        count(*) FILTER (WHERE ip_hash = $2) AS daily,
        count(*) AS global_daily
      FROM surgeair_demo_usage
      WHERE category = $1 AND created_at > now() - interval '24 hours'
    `, [category, ipHash, category === "chat" ? 60 : 3600]);
    const counts = rows[0]!;
    const denied = category === "chat"
      ? Number(counts.recent) >= 20 || Number(counts.daily) >= 100
      : category === "booking" || category === "email"
        ? Number(counts.recent) >= 5
        : Number(counts.recent) >= 3 || Number(counts.global_daily) >= 30;
    if (!denied) {
      await client.query("INSERT INTO surgeair_demo_usage (category, ip_hash) VALUES ($1, $2)", [category, ipHash]);
    }
    await client.query("COMMIT");
    return !denied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
