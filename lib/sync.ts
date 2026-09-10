import type { Store } from "../db/storage.ts";
import type { ScheduleResponse, Source, Standing, ProviderBatch } from "./types.ts";
import { fetchFormulaOne } from "./providers/jolpica.ts";
import { fetchEsports } from "./providers/pandascore.ts";
import { deriveTrophy, rankEvent, deduplicate } from "./priorities.ts";
import { footballSeason } from "./time.ts";
import { CATALOGUE_UPDATED_AT } from "./cs2-catalogue.ts";
import { FeedError } from "./http.ts";

export async function schedule(store: Store, now = new Date()): Promise<ScheduleResponse> {
  const [events, standings, sources] = await Promise.all([store.events(), store.snapshot<{ season: number; rows: Standing[] }>("standings", { season: 0, rows: [] }), store.sources()]);
  const trophy = deriveTrophy(events, standings.season === footballSeason(now) ? standings.rows : [], footballSeason(now));
  return { events: deduplicate(events).map(e => rankEvent(e, trophy)), sources, trophy, timezone: "Asia/Colombo", updatedAt: now.toISOString(), catalogueUpdatedAt: CATALOGUE_UPDATED_AT };
}
export async function synchronize(store: Store, token: string, force = false, now = new Date()) {
  const existing = await store.events();
  const tasks: { id: Source; fetch: () => Promise<ProviderBatch>; ttl: number }[] = [
    { id: "jolpica", fetch: () => fetchFormulaOne(now), ttl: 21600 },
    { id: "pandascore", fetch: () => fetchEsports(token, now), ttl: 900 },
  ];
  await Promise.allSettled(tasks.map(async task => {
    if (!await store.acquire(task.id, force, now.getTime())) return;
    if (task.id === "pandascore" && !token) { await store.finish(task.id, "setup", "Add a free PandaScore token to enable VCT and CS2 schedules.", 60); return; }
    try {
      const data = await task.fetch();
      await store.saveEvents(task.id, data.events);
      if (data.standings?.length) await store.saveSnapshot("standings", { season: footballSeason(now), rows: data.standings });
      if (data.context) await store.saveSnapshot(`${task.id}:context`, data.context);
      const relevant = [...existing, ...data.events].some(e => e.source === task.id && e.startsAt && e.status !== "completed" && e.status !== "cancelled" && now.getTime() - Date.parse(e.startsAt) > 0 && now.getTime() - Date.parse(e.startsAt) < 8 * 3600000);
      const warning = typeof data.context?.warning === "string" ? data.context.warning : null;
      await store.finish(task.id, warning ? "stale" : "ready", warning, relevant || warning ? 300 : task.ttl);
    } catch (error) {
      const message = error instanceof FeedError ? error.message : "This source could not be refreshed. Your saved schedule is still available.";
      await store.finish(task.id, "error", message, error instanceof FeedError ? error.retryAfter : 120);
    }
  }));
  return schedule(store, now);
}
