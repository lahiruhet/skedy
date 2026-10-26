import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import { Store } from "../db/storage.ts";
import type { Database } from "../db/storage.ts";
import type { ScheduleEvent } from "../lib/types.ts";

test("D1 persists batched events, confirmed results, snapshots and refresh backoff across runtime restarts", async () => {
  const directory = resolve("work", "d1-tests");
  await mkdir(directory, { recursive: true });
  const path = await mkdtemp(resolve(directory, "state-"));
  const options = { configPath: "wrangler.jsonc", persist: { path }, envFiles: [] };
  let platform = await getPlatformProxy<{ DB: Database }>(options);
  try {
    let store = new Store(platform.env.DB);
    await store.initialize();
    const now = Date.now();
    assert.equal(await store.acquire("jolpica", false, now), true);
    assert.equal(await store.acquire("jolpica", true, now + 1), false);
    const events: ScheduleEvent[] = Array.from({ length: 101 }, (_, i) => ({
      id: `jolpica:d1:${i}`, source: "jolpica", sport: "f1", category: "f1",
      title: `Grand Prix ${i}`, competition: "F1", competitionId: "f1", stage: "Race",
      startsAt: "2026-10-25T04:00:00Z", date: "2026-10-25", timeConfirmed: true,
      status: "completed", result: "Norris P1", participants: [],
      sourceUrl: "https://formula1.com", season: 2026,
    }));
    await store.saveEvents("jolpica", events);
    await store.saveSnapshot("standings", { season: 2026, rows: [] });
    await store.finish("jolpica", "error", "Rate limited", 3600);
    await platform.dispose();

    platform = await getPlatformProxy<{ DB: Database }>(options);
    store = new Store(platform.env.DB);
    await store.initialize();
    await store.saveEvents("jolpica", [{ ...events[0], status: "scheduled", result: undefined }]);
    const saved = await store.events();
    assert.equal(saved.length, 101);
    assert.equal(saved.find(event => event.id === events[0].id)?.result, "Norris P1");
    assert.deepEqual(await store.snapshot("standings", null), { season: 2026, rows: [] });
    assert.equal((await store.sources()).find(source => source.id === "jolpica")?.status, "error");
    assert.equal(await store.acquire("jolpica", true, now + 120000), false);
    assert.equal(await store.acquire("jolpica", false, now + 3700000), true);
  } finally {
    await platform.dispose();
    await rm(path, { recursive: true, force: true });
  }
});
