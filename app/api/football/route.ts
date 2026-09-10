import { getStore } from "../../../lib/runtime.ts";
import { schedule } from "../../../lib/sync.ts";
import { footballSeason } from "../../../lib/time.ts";
import type { ScheduleEvent, Standing } from "../../../lib/types.ts";

function validEvent(e: ScheduleEvent) {
  return e && typeof e.id === "string" && /^espn:\d+$/.test(e.id) && e.source === "espn" && e.sport === "football" && ["spurs","pl","ucl","uel","football"].includes(e.category) && typeof e.title === "string" && e.title.length < 300 && typeof e.competitionId === "string" && Array.isArray(e.participants) && e.participants.length === 2 && e.participants.every(p => typeof p.id === "string" && typeof p.name === "string" && typeof p.shortName === "string" && (!p.logo || /^https:\/\//.test(p.logo))) && ["scheduled","completed","in_progress","postponed","cancelled"].includes(e.status) && (e.startsAt === null || typeof e.startsAt === "string" && Number.isFinite(Date.parse(e.startsAt))) && (e.date === null || /^\d{4}-\d{2}-\d{2}$/.test(e.date)) && Number.isInteger(e.season) && typeof e.sourceUrl === "string" && /^https:\/\/(?:www\.)?espn\.com\//.test(e.sourceUrl);
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Refresh must come from Skedy." }, { status: 403 });
  try {
    const text = await request.text(); if (text.length > 2000000) return Response.json({ error: "The football update is too large." }, { status: 413 });
    const body = JSON.parse(text); const store = await getStore();
    if (body.action === "claim") {
      if (await store.snapshot("espn:transport", "") !== "browser") {
        await store.db.prepare("UPDATE sources SET next_refresh=0,lease_until=0 WHERE id='espn'").run();
        await store.saveSnapshot("espn:transport", "browser");
      }
      const claimed = await store.acquire("espn", body.force === true);
      const ticket = claimed ? crypto.randomUUID() : null;
      if (ticket) await store.saveSnapshot("espn:claim", { ticket, expires: Date.now() + 300000 });
      return Response.json({ claimed, ticket });
    }
    const lease = await store.snapshot<{ ticket: string; expires: number } | null>("espn:claim", null);
    if (!lease || body.ticket !== lease.ticket || lease.expires < Date.now()) return Response.json({ error: "This refresh expired. Please try again." }, { status: 409 });
    if (body.action === "error") {
      await store.finish("espn", "error", "Football could not be refreshed from this browser. Saved fixtures are retained.", 120);
      await store.saveSnapshot("espn:claim", null);
      return Response.json(await schedule(store));
    }
    if (body.action !== "save" || !Array.isArray(body.events) || body.events.length > 2500 || !body.events.every(validEvent)) return Response.json({ error: "The football update is invalid." }, { status: 400 });
    await store.saveEvents("espn", body.events);
    const standings: Standing[] = body.standings;
    if (Array.isArray(standings) && standings.length >= 18 && standings.length <= 24 && standings.every(s => typeof s.id === "string" && Number.isFinite(s.points) && Number.isInteger(s.played) && s.played >= 0 && s.played <= 50)) await store.saveSnapshot("standings", { season: footballSeason(), rows: standings });
    const warning = typeof body.warning === "string" ? body.warning.slice(0, 500) : null;
    const hot = body.events.some((e: ScheduleEvent) => e.startsAt && e.status !== "completed" && Date.now() - Date.parse(e.startsAt) > 0 && Date.now() - Date.parse(e.startsAt) < 8 * 3600000);
    await store.finish("espn", warning ? "stale" : "ready", warning, hot || warning ? 300 : 3600);
    await store.saveSnapshot("espn:claim", null);
    return Response.json(await schedule(store), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "The football update could not be saved." }, { status: 503 }); }
}
