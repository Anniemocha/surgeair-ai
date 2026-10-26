// Test-only SQL adapter. Production never imports this file; test build aliases
// @workspace/db here so no development/production database is touched.
type Usage = { category: string; ip: string; time: number };
let events: Usage[] = [];
let now = Date.now();
let lock = Promise.resolve();
export function resetMockUsage() { events = []; now = Date.now(); }
export function advanceMockTime(ms: number) { now += ms; }
export const pool = {
  async query() { return { rows: [] }; },
  async connect() {
    let unlock: (() => void) | undefined;
    return {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("pg_advisory_xact_lock")) {
          const previous = lock;
          lock = new Promise<void>(resolve => { unlock = resolve; });
          await previous;
        }
        if (sql.includes("DELETE FROM")) events = events.filter(event => event.time >= now - 86_400_000);
        if (sql.includes("count(*)")) {
          const [category, ip, seconds] = params;
          const daily = events.filter(event => event.category === category && event.time > now - 86_400_000);
          const own = daily.filter(event => event.ip === ip);
          return { rows: [{
            recent: String(own.filter(event => event.time > now - Number(seconds) * 1000).length),
            daily: String(own.length), global_daily: String(daily.length),
          }] };
        }
        if (sql.includes("INSERT INTO")) events.push({ category: String(params[0]), ip: String(params[1]), time: now });
        if (sql === "COMMIT" || sql === "ROLLBACK") { unlock?.(); unlock = undefined; }
        return { rows: [] };
      },
      release() { unlock?.(); },
    };
  },
};
