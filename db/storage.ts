import type { ScheduleEvent, Source, SourceState } from "../lib/types.ts";
import { SOURCE_NAMES } from "../lib/types.ts";
export interface StatementResult { meta?: { changes?: number }; changes?: number }
export interface Statement { bind(...values: unknown[]): Statement; run(): Promise<StatementResult>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null> }
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
interface SourceRow { id: Source; status: SourceState["status"]; last_success: string | null; last_attempt: string | null; message: string | null; next_refresh: number }
export const SCHEMA_SQL = [
  "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, source TEXT NOT NULL, sport TEXT NOT NULL, starts_at TEXT, data TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_events_sport_start ON events(sport, starts_at)",
  "CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, status TEXT NOT NULL, last_success TEXT, last_attempt TEXT, message TEXT, next_refresh INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS snapshots (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)",
];
export class Store {
  db: Database;
  constructor(db: Database) { this.db = db; }
  async initialize() { await this.db.batch(SCHEMA_SQL.map(sql => this.db.prepare(sql))); }
  async events() { const rows = await this.db.prepare("SELECT data FROM events ORDER BY starts_at ASC").all<{ data: string }>(); return rows.results.map(row => JSON.parse(row.data) as ScheduleEvent); }
  async sources(now = Date.now()): Promise<SourceState[]> {
    const rows = (await this.db.prepare("SELECT * FROM sources").all<SourceRow>()).results;
    return (Object.keys(SOURCE_NAMES) as Source[]).map(id => {
      const row = rows.find(r => r.id === id);
      let status = row?.status ?? "pending";
      if (status === "ready" && row && row.next_refresh < now) status = "stale";
      return { id, name: SOURCE_NAMES[id], status, lastSuccess: row?.last_success ?? null, lastAttempt: row?.last_attempt ?? null, message: row?.message ?? null };
    });
  }
  async snapshot<T>(key: string, fallback: T): Promise<T> { const row = await this.db.prepare("SELECT data FROM snapshots WHERE key = ?").bind(key).first<{ data: string }>(); return row ? JSON.parse(row.data) : fallback; }
  async saveSnapshot(key: string, data: unknown) { await this.db.prepare("INSERT INTO snapshots(key,data,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at").bind(key, JSON.stringify(data), new Date().toISOString()).run(); }
  async acquire(source: Source, force = false, now = Date.now()): Promise<boolean> {
    // Shared leases prevent simultaneous tabs/serverless instances from multiplying API calls.
    const result = await this.db.prepare("INSERT INTO sources(id,status,last_attempt,next_refresh,lease_until) VALUES(?,'pending',?,0,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,lease_until=excluded.lease_until WHERE sources.lease_until < ? AND (sources.next_refresh <= ? OR (? = 1 AND sources.status IN ('ready','stale')))").bind(source, new Date(now).toISOString(), now + 300000, now, now, force ? 1 : 0).run();
    return Number(result.meta?.changes ?? result.changes ?? 0) > 0;
  }
  async saveEvents(source: Source, incoming: ScheduleEvent[]) {
    const prior = new Map((await this.events()).filter(e => e.source === source).map(e => [e.id, e]));
    const now = new Date().toISOString();
    const rows = incoming.map(event => {
      const old = prior.get(event.id);
      // Calendar responses must not erase a previously confirmed F1 classification.
      const merged = old?.status === "completed" && event.status === "scheduled" && old.startsAt === event.startsAt ? { ...event, status: old.status, result: old.result, resultLines: old.resultLines } : event;
      return this.db.prepare("INSERT INTO events(id,source,sport,starts_at,data,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,data=excluded.data,updated_at=excluded.updated_at,sport=excluded.sport").bind(merged.id, merged.source, merged.sport, merged.startsAt, JSON.stringify(merged), now);
    });
    for (let offset = 0; offset < rows.length; offset += 50) await this.db.batch(rows.slice(offset, offset + 50));
  }
  async finish(source: Source, status: SourceState["status"], message: string | null, ttlSeconds: number) {
    const now = Date.now();
    await this.db.prepare("UPDATE sources SET status=?,message=?,last_success=CASE WHEN ? IN ('ready','stale') THEN ? ELSE last_success END,next_refresh=?,lease_until=? WHERE id=?").bind(status, message, status, new Date(now).toISOString(), now + ttlSeconds * 1000, now + 60000, source).run();
  }
}
