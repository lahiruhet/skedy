import { paginatedPanda } from "../http.ts";
import { isoDate, dateOffset } from "../time.ts";
import { cs2Eligibility } from "../cs2-catalogue.ts";
import type { Category, EventStatus, ProviderBatch, ScheduleEvent } from "../types.ts";

export function vctCategory(raw: any): Category | null {
  // PandaScore's VCT league has a historical 'challengers' slug even for Champions.
  // Use the stable league ID/current names; never classify by that legacy slug.
  const name = [raw.league?.id === 4531 ? "VCT" : raw.league?.name, raw.serie?.full_name, raw.serie?.name].filter(Boolean).join(" ").replaceAll("-", " ");
  if (/challengers|game changers|ascension|off.?season|showmatch|esports world cup|\bewc\b/i.test(name)) return null;
  if (!/\bvct\b|valorant champions tour|valorant champions\b/i.test(name)) return null;
  if (/\bmasters\b|\bchampions\b(?! tour)/i.test(name.replace(/valorant champions tour/ig, "VCT"))) return "vct_international";
  if (/americas/i.test(name)) return "vct_americas";
  if (/pacific|apac/i.test(name)) return "vct_pacific";
  if (/emea/i.test(name)) return "vct_emea";
  if (/china|\bcn\b/i.test(name)) return "vct_china";
  return null;
}
export function normalizeEsport(raw: any, game: "valorant" | "cs2"): ScheduleEvent | null {
  if (!raw?.id) return null;
  const eligibility = game === "cs2" ? cs2Eligibility(raw) : undefined;
  if (eligibility && !eligibility.allowed) return null;
  const category = game === "valorant" ? vctCategory(raw) : "cs2";
  if (!category) return null;
  const status: EventStatus = raw.status === "finished" ? "completed" : raw.status === "running" ? "in_progress" : raw.status === "canceled" ? "cancelled" : raw.postponed ? "postponed" : "scheduled";
  const participants = (Array.isArray(raw.opponents) ? raw.opponents : []).map((p: any) => ({ id: String(p.opponent?.id ?? "tbc"), name: p.opponent?.name ?? "TBC", shortName: p.opponent?.acronym ?? p.opponent?.name ?? "TBC", logo: p.opponent?.image_url ?? undefined, score: status === "completed" ? String(raw.results?.find((r: any) => r.team_id === p.opponent?.id)?.score ?? "–") : undefined, winner: raw.winner_id === p.opponent?.id }));
  const start = isoDate(raw.begin_at ?? raw.scheduled_at);
  const competition = eligibility?.edition?.name ?? raw.serie?.full_name ?? `${raw.league?.name ?? "VCT"} ${raw.serie?.name ?? ""}`.trim();
  return { id: `pandascore:${raw.id}`, source: "pandascore", sport: game, category, title: participants.length >= 2 ? participants.map((p: any) => p.shortName).join(" vs ") : raw.name ?? "Matchup to be confirmed", competition, competitionId: String(raw.league?.id ?? ""), stage: raw.tournament?.name ?? "", startsAt: start, date: start?.slice(0, 10) ?? null, timeConfirmed: Boolean(start), status, participants, sourceUrl: eligibility?.edition?.source ?? "https://valorantesports.com/en-US/schedule", season: Number(raw.serie?.year ?? start?.slice(0, 4) ?? new Date().getUTCFullYear()), result: status === "completed" ? participants.map((p: any) => p.score ?? "–").join(" – ") : undefined };
}
export async function fetchEsports(token: string, now = new Date()): Promise<ProviderBatch> {
  const events: ScheduleEvent[] = [];
  let excluded = 0;
  const stageMappings: { edition: string; tournamentId: number; stage: string }[] = [];
  for (const [path, game] of [["valorant", "valorant"], ["csgo", "cs2"]] as const) {
    for (const kind of ["upcoming", "running", "past"]) {
      const params: Record<string, string> = { sort: "begin_at" };
      // A begin_at range drops matches whose dates are still TBC. Fetch upcoming
      // pages without it, then keep undated matches alongside the 30-day horizon.
      if (kind === "past") params["range[begin_at]"] = `${dateOffset(now, -7).toISOString()},${now.toISOString()}`;
      if (game === "cs2") params["filter[videogame_title]"] = "cs-2";
      const matches = await paginatedPanda(`${path}/matches/${kind}`, token, params);
      for (const match of matches) {
        const start = isoDate(match.begin_at ?? match.scheduled_at);
        if (kind === "upcoming" && start && (start < dateOffset(now, -1).toISOString() || start > dateOffset(now, 30).toISOString())) continue;
        const event = normalizeEsport(match, game);
        if (event) {
          events.push(event);
          if (game === "cs2") stageMappings.push({ edition: cs2Eligibility(match).edition!.key, tournamentId: Number(match.tournament.id), stage: match.tournament.name });
        } else if (game === "cs2") excluded++;
      }
    }
  }
  return { events, context: { excludedCsMatches: excluded, stageMappings } };
}
