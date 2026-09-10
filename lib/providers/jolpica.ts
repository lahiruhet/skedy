import { fetchJson, FeedError } from "../http.ts";
import { isoDate } from "../time.ts";
import type { ProviderBatch, ResultLine, ScheduleEvent } from "../types.ts";

const ROOT = "https://api.jolpi.ca/ergast/f1";
const SESSIONS = [{ key: "Qualifying", code: "qualifying", label: "Qualifying" }, { key: "SprintQualifying", code: "sprint-qualifying", label: "Sprint qualifying" }, { key: "Sprint", code: "sprint", label: "Sprint" }, { key: "Race", code: "race", label: "Grand Prix" }];
export function normalizeRace(race: any): ScheduleEvent[] {
  if (!race?.round || !race.season || !race.raceName) return [];
  return SESSIONS.flatMap(session => {
    const timing = session.key === "Race" ? race : race[session.key] ?? (session.key === "SprintQualifying" ? race.SprintShootout : undefined);
    if (!timing?.date) return [];
    const start = timing.time ? isoDate(`${timing.date}T${timing.time}`) : null;
    return [{ id: `jolpica:${race.season}:${race.round}:${session.code}`, source: "jolpica", sport: "f1", category: "f1", title: race.raceName, competition: "Formula 1", competitionId: "f1", stage: session.label, startsAt: start, date: timing.date, timeConfirmed: Boolean(start), status: "scheduled", participants: [], venue: race.Circuit?.circuitName, sourceUrl: "https://www.formula1.com/en/racing/" + race.season, season: Number(race.season), session: session.code, round: String(race.round) } satisfies ScheduleEvent];
  });
}
export function raceResults(race: any, kind: "race" | "qualifying" | "sprint"): ResultLine[] {
  const list = kind === "qualifying" ? race?.QualifyingResults : kind === "sprint" ? race?.SprintResults : race?.Results;
  return (Array.isArray(list) ? list : []).map((r: any) => ({ position: String(r.position), name: `${r.Driver?.givenName ?? ""} ${r.Driver?.familyName ?? ""}`.trim(), team: r.Constructor?.name ?? "", detail: kind === "qualifying" ? r.Q3 ?? r.Q2 ?? r.Q1 ?? "" : `${r.points ?? "0"} pts · ${r.Time?.time ?? r.status ?? ""}`, favorite: r.Driver?.driverId === "norris" || r.Constructor?.constructorId === "mclaren" }));
}
export async function fetchFormulaOne(now = new Date()): Promise<ProviderBatch> {
  const year = now.getUTCFullYear();
  let lastRequest = 0;
  async function get(path: string) {
    const wait = Math.max(0, 300 - (Date.now() - lastRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return fetchJson(`${ROOT}/${path}`);
  }
  const data = await get(`${year}/races/?limit=100`);
  const races = data?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) throw new FeedError("Jolpica returned an invalid race calendar.");
  const events: ScheduleEvent[] = races.flatMap(normalizeRace);
  const recent = races.filter((r: any) => r.Qualifying?.date <= now.toISOString().slice(0, 10) || r.date <= now.toISOString().slice(0, 10)).slice(-2);
  let partial = false;
  for (const race of recent) {
    for (const [kind, endpoint] of [["qualifying", "qualifying"], ["sprint", "sprint"], ["race", "results"]] as const) {
      const event = events.find(e => e.round === String(race.round) && e.session === kind);
      if (!event?.startsAt || new Date(event.startsAt) > now) continue;
      try {
        const result = await get(`${year}/${race.round}/${endpoint}/?limit=100`);
        const lines = raceResults(result?.MRData?.RaceTable?.Races?.[0], kind);
        if (lines.length) { event.status = "completed"; event.resultLines = lines; event.result = lines.filter(line => line.favorite).map(line => `${line.name.split(" ").at(-1)} P${line.position}`).join(" · ") || `${lines[0].name} P1`; }
      } catch { partial = true; }
    }
  }
  if (now.getUTCMonth() >= 10) {
    try { const next = await get(`${year + 1}/races/?limit=100`); events.push(...(next?.MRData?.RaceTable?.Races ?? []).flatMap(normalizeRace)); } catch { /* Next year's calendar may not be available yet. */ }
  }
  return { events, context: { warning: partial ? "Some F1 results could not be refreshed. Saved results are retained." : null } };
}
