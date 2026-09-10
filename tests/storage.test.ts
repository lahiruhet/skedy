import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { mkdirSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Store, type Database, type Statement } from "../db/storage.ts";
import type { ScheduleEvent } from "../lib/types.ts";
function adapter(sqlite: DatabaseSync): Database {
  function prepare(sql: string, values: any[] = []): Statement { return { bind: (...params) => prepare(sql, params), run: async () => { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }, all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }), first: async <T>() => sqlite.prepare(sql).get(...values) as T ?? null }; }
  return { prepare, batch: async rows => { sqlite.exec("BEGIN"); try { const result = []; for (const row of rows) result.push(await row.run()); sqlite.exec("COMMIT"); return result; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}
const event: ScheduleEvent = { id: "jolpica:2026:1:race", source: "jolpica", sport: "f1", category: "f1", title: "Australian Grand Prix", competition: "F1", competitionId: "f1", stage: "Race", startsAt: "2026-03-08T04:00:00Z", date: "2026-03-08", timeConfirmed: true, status: "scheduled", participants: [], sourceUrl: "https://formula1.com", season: 2026 };
test("durable fixtures survive a database reopen and retain confirmed results", async () => {
  const directory = resolve("work", "storage-tests"); mkdirSync(directory, { recursive: true }); const filename = resolve(directory, randomUUID() + ".sqlite"); let sqlite = new DatabaseSync(filename);
  try { let store = new Store(adapter(sqlite)); await store.initialize(); await store.saveEvents("jolpica", [{ ...event, status: "completed", result: "Norris P1" }]); sqlite.close(); sqlite = new DatabaseSync(filename); store = new Store(adapter(sqlite)); await store.initialize(); await store.saveEvents("jolpica", [event]); assert.equal((await store.events())[0].result, "Norris P1"); assert.equal((await store.events())[0].status, "completed"); } finally { sqlite.close(); unlinkSync(filename); }
});
test("rescheduled events update in place; a failed refresh retains prior fixtures", async () => {
  const sqlite = new DatabaseSync(":memory:"); const store = new Store(adapter(sqlite));
  try { await store.initialize(); await store.acquire("jolpica"); await store.saveEvents("jolpica", [event]); await store.saveEvents("jolpica", [{ ...event, startsAt: "2026-03-08T05:00Z" }]); await store.finish("jolpica", "error", "Unavailable", 120); const events = await store.events(); assert.equal(events.length, 1); assert.equal(events[0].startsAt, "2026-03-08T05:00Z"); assert.equal((await store.sources()).find(s => s.id === "jolpica")!.status, "error"); } finally { sqlite.close(); }
});
test("multiple tabs share a sync lease and manual refresh respects rate-limit backoff", async () => {
  const sqlite = new DatabaseSync(":memory:"); const store = new Store(adapter(sqlite));
  try { await store.initialize(); const now = Date.now(); assert.equal(await store.acquire("espn", false, now), true); assert.equal(await store.acquire("espn", true, now + 1), false); await store.finish("espn", "error", "Rate limited", 3600); assert.equal(await store.acquire("espn", true, now + 120000), false); assert.equal(await store.acquire("espn", false, now + 3700000), true); } finally { sqlite.close(); }
});
