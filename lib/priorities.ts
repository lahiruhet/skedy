import type { ScheduleEvent, Standing, TrophyState } from "./types.ts";
import { SPURS_ID } from "./types.ts";

export function deriveTrophy(events: ScheduleEvent[], standings: Standing[], season: number): TrophyState {
  const spurs = events.filter(e => e.category === "spurs" && e.season === season);
  const own = standings.find(s => s.id === SPURS_ID);
  const games = (standings.length - 1) * 2;
  // A strict points ceiling proves elimination. Ties and unresolved tiebreaks keep Spurs first.
  const leagueOut = Boolean(own && standings.length >= 18 && own.played <= games && own.points + Math.max(0, games - own.played) * 3 < Math.max(...standings.map(s => s.points)));
  const leagueFinished = Boolean(own && games > 0 && standings.every(s => s.played >= games));
  const competitions: TrophyState["competitions"] = [{ name: "Premier League", state: leagueOut || leagueFinished ? "out" : own ? "alive" : "unknown" }];
  const cups = new Map([["eng.fa", "FA Cup"], ["eng.league_cup", "Carabao Cup"]]);
  for (const e of spurs) if (e.competitionId.startsWith("uefa.")) cups.set(e.competitionId, e.competition);
  for (const [id, name] of cups) {
    const fixtures = spurs.filter(e => e.competitionId === id);
    const lost = fixtures.some(e => e.status === "completed" && e.spursDecision === "lost");
    const won = fixtures.some(e => e.status === "completed" && /^final$/i.test(e.stage) && e.spursDecision === "won");
    const competitionFinished = events.some(e => e.season === season && e.competitionId === id && /^final$/i.test(e.stage) && e.status === "completed");
    const upcoming = fixtures.some(e => e.status === "scheduled" || e.status === "in_progress");
    competitions.push({ name, state: lost || (competitionFinished && !won) ? "out" : won ? "won" : upcoming ? "alive" : "unknown" });
  }
  const state = competitions.some(c => c.state === "alive") ? "alive" : competitions.some(c => c.state === "unknown") ? "unknown" : "out";
  return { state, competitions, europa: spurs.some(e => e.competitionId === "uefa.europa"), reason: state === "out" ? "Spurs have no remaining trophy route. VCT internationals take priority." : state === "alive" ? "Spurs still have a league or cup route. They stay first." : "Trophy status is not fully confirmed. Spurs keep priority." };
}

export function rankEvent(event: ScheduleEvent, trophy: TrophyState): ScheduleEvent {
  const ranks = { spurs: 100, pl: 85, ucl: 83, uel: trophy.europa ? 84 : 81, football: 78, f1: 70, vct_international: 60, vct_americas: 55, vct_pacific: 54, vct_emea: 53, vct_china: 52, cs2: 40 };
  const priority = event.category === "vct_international" && trophy.state === "out" ? 110 : ranks[event.category];
  const priorityReason = event.category === "spurs" ? "Every Spurs game. Always on your radar." : event.category === "vct_international" && trophy.state === "out" ? "International VCT takes the spotlight while Spurs are out of trophy contention." : event.category === "f1" ? "McLaren first. Lando always." : event.category === "cs2" ? "Liquipedia S-tier · main event only" : undefined;
  return { ...event, priority, priorityReason };
}
export function deduplicate(events: ScheduleEvent[]) {
  const byId = new Map<string, ScheduleEvent>();
  for (const event of events) {
    const previous = byId.get(event.id);
    byId.set(event.id, previous ? { ...previous, ...event, category: previous.category === "spurs" ? "spurs" : event.category } : event);
  }
  return [...byId.values()];
}
export function spotlight(events: ScheduleEvent[], now = new Date()) {
  const upcoming = events.filter(e => e.status === "scheduled" || e.status === "in_progress").filter(e => !e.startsAt || new Date(e.startsAt).getTime() > now.getTime() - 6 * 3600000);
  const week = upcoming.filter(e => e.startsAt && new Date(e.startsAt).getTime() <= now.getTime() + 7 * 86400000);
  return (week.length ? week : upcoming).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999"))[0];
}
