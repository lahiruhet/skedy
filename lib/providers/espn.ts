import { fetchJson, FeedError } from "../http.ts";
import { dateOffset, footballSeason, isoDate } from "../time.ts";
import { deduplicate } from "../priorities.ts";
import { SPURS_ID } from "../types.ts";
import type { Category, EventStatus, ProviderBatch, ScheduleEvent, Standing } from "../types.ts";

const ROOT = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const COMPETITIONS: Record<string, string> = { "eng.1": "Premier League", "uefa.champions": "Champions League", "uefa.europa": "Europa League", "eng.fa": "FA Cup", "eng.league_cup": "Carabao Cup" };
function numericScore(value: any) { if (value === null || value === undefined || value === "") return null; const number = Number(typeof value === "object" ? value.value ?? value.displayValue : value); return Number.isFinite(number) ? number : null; }
function score(value: any) { const number = numericScore(value); return number === null ? undefined : String(number); }

export function footballDecision(event: any, competitionId: string, stage: string): "won" | "lost" | undefined {
  const c = event.competitions?.[0];
  if (!c?.status?.type?.completed) return undefined;
  const own = c.competitors?.find((p: any) => String(p.id) === SPURS_ID);
  const other = c.competitors?.find((p: any) => String(p.id) !== SPURS_ID);
  if (!own || !other) return undefined;
  const notes = (c.notes ?? []).map((n: any) => n.headline ?? n.text ?? "").join(" ");
  const firstLeg = /(?:1st|first) leg/i.test(notes);
  const secondLeg = /(?:2nd|second) leg/i.test(notes);
  if (firstLeg) return undefined;
  const twoLegged = (competitionId.startsWith("uefa.") && !/^final$/i.test(stage)) || (competitionId === "eng.league_cup" && /semi/i.test(stage));
  if (twoLegged && !secondLeg) return undefined;
  if (!competitionId.startsWith("uefa.") && !["eng.fa", "eng.league_cup"].includes(competitionId)) return undefined;
  if (/league|group/i.test(stage)) return undefined;
  const penalties = [numericScore(own.shootoutScore), numericScore(other.shootoutScore)];
  const aggregate = [numericScore(own.aggregateScore), numericScore(other.aggregateScore)];
  const goals = [numericScore(own.score), numericScore(other.score)];
  const values = penalties.every(v => v !== null) && penalties[0] !== penalties[1] ? penalties : twoLegged ? aggregate : goals;
  if (values.some(v => v === null) || values[0] === values[1]) return undefined;
  return values[0]! > values[1]! ? "won" : "lost";
}

export function normalizeFootball(raw: any, leagueId?: string, season = footballSeason()): ScheduleEvent | null {
  const c = raw?.competitions?.[0];
  if (!raw?.id || !c || !Array.isArray(c.competitors) || c.competitors.length < 2) return null;
  const id = String(raw.league?.slug ?? leagueId ?? "");
  const participants = [...c.competitors].sort((a: any, b: any) => (a.homeAway === "home" ? -1 : 1) - (b.homeAway === "home" ? -1 : 1)).map((p: any) => ({ id: String(p.id), name: p.team?.displayName ?? "TBC", shortName: p.team?.shortDisplayName ?? p.team?.abbreviation ?? "TBC", logo: p.team?.logo ?? p.team?.logos?.[0]?.href, score: c.status?.type?.completed ? score(p.score) : undefined, winner: p.winner }));
  const isSpurs = participants.some(p => p.id === SPURS_ID);
  const category: Category = isSpurs ? "spurs" : id === "eng.1" ? "pl" : id === "uefa.champions" ? "ucl" : id === "uefa.europa" ? "uel" : "football";
  const type = c.status?.type ?? raw.status?.type ?? {};
  const status: EventStatus = /postponed|suspended/i.test(type.name) ? "postponed" : /cancel|abandon/i.test(type.name) ? "cancelled" : type.completed ? "completed" : type.state === "in" ? "in_progress" : "scheduled";
  const date = isoDate(c.date ?? raw.date);
  const confirmed = raw.timeValid !== false && c.timeValid !== false && !/TBD|TBC/i.test(type.detail ?? "");
  const stage = raw.seasonType?.name ?? c.type?.text ?? raw.week?.text ?? "";
  return { id: `espn:${raw.id}`, source: "espn", sport: "football", category, title: participants.map(p => p.shortName).join(" vs "), competition: COMPETITIONS[id] ?? raw.league?.name ?? "Club fixture", competitionId: id, stage, startsAt: confirmed ? date : null, date: date?.slice(0, 10) ?? null, timeConfirmed: confirmed, status, participants, venue: c.venue?.fullName, sourceUrl: raw.links?.find((link: any) => link.rel?.includes("summary") && link.rel?.includes("desktop"))?.href ?? `https://www.espn.com/soccer/match/_/gameId/${raw.id}`, season: Number(raw.season?.year ?? season), spursDecision: isSpurs ? footballDecision(raw, id, stage) : undefined, result: status === "completed" ? participants.map(p => p.score ?? "–").join(" – ") : undefined };
}
export function normalizeStandings(data: any): Standing[] {
  const entries = data?.standings?.entries ?? data?.children?.flatMap((child: any) => child.standings?.entries ?? []) ?? [];
  return entries.map((entry: any) => ({ id: String(entry.team?.id), name: entry.team?.displayName ?? "", points: entry.stats?.find((s: any) => s.name === "points")?.value, played: entry.stats?.find((s: any) => s.name === "gamesPlayed")?.value })).filter((s: Standing) => Number.isFinite(s.points) && Number.isFinite(s.played));
}
// ESPN's scoreboard rejects date ranges (HTTP 400) but accepts whole months as YYYYMM.
export function scoreboardMonths(from: Date, to: Date): string[] {
  const months: string[] = [];
  for (const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  return months;
}
export async function fetchFootball(now = new Date()): Promise<ProviderBatch> {
  const season = footballSeason(now);
  // Team feeds include domestic cups and friendlies; competition feeds provide the quieter panels.
  const teamQueries = [fetchJson(`${ROOT}/all/teams/${SPURS_ID}/schedule?season=${season}&fixture=true`), fetchJson(`${ROOT}/all/teams/${SPURS_ID}/schedule?season=${season}`)];
  const [future, past] = await Promise.all(teamQueries);
  if (!Array.isArray(future.events) || !Array.isArray(past.events)) throw new FeedError("ESPN changed its team schedule format.");
  const events: ScheduleEvent[] = [...future.events, ...past.events].map(e => normalizeFootball(e, undefined, season)).filter((e): e is ScheduleEvent => Boolean(e));
  const warnings: string[] = [];
  const from = dateOffset(now, -7), to = dateOffset(now, 30);
  const [firstDay, lastDay] = [from, to].map(d => d.toISOString().slice(0, 10));
  for (const league of ["eng.1", "uefa.champions", "uefa.europa"]) {
    for (const month of scoreboardMonths(from, to)) {
      try {
        const data = await fetchJson(`${ROOT}/${league}/scoreboard?dates=${month}&limit=200`);
        if (!Array.isArray(data.events) || data.events.length >= 200) throw new FeedError("The football competition feed is incomplete.");
        for (const event of data.events) { const normalized = normalizeFootball(event, league, season); if (normalized && (!normalized.date || (normalized.date >= firstDay && normalized.date <= lastDay))) events.push(normalized); }
      } catch { warnings.push(COMPETITIONS[league]); break; }
    }
  }
  let standings: Standing[] | undefined;
  try { standings = normalizeStandings(await fetchJson(`https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings?season=${season}`)); } catch { warnings.push("League standings"); }
  // In June, also fetch the next season when fixtures are announced.
  if (now.getUTCMonth() === 5) {
    try { const next = await fetchJson(`${ROOT}/all/teams/${SPURS_ID}/schedule?season=${season + 1}&fixture=true`); if (Array.isArray(next.events)) for (const e of next.events) { const n = normalizeFootball(e, undefined, season + 1); if (n) events.push(n); } } catch { /* The next season may not be published. */ }
  }
  return { events: deduplicate(events), standings, context: { warning: warnings.length ? `${[...new Set(warnings)].join(", ")} could not be refreshed. Saved fixtures are retained.` : null } };
}
