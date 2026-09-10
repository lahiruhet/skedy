import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFootball, footballDecision } from "../lib/providers/espn.ts";
import { normalizeRace, raceResults } from "../lib/providers/jolpica.ts";
import { vctCategory, normalizeEsport } from "../lib/providers/pandascore.ts";
import { cs2Eligibility } from "../lib/cs2-catalogue.ts";
import { deriveTrophy, rankEvent, deduplicate, spotlight } from "../lib/priorities.ts";
import { localDate, withinDates, footballSeason } from "../lib/time.ts";
import type { ScheduleEvent, Standing, TrophyState } from "../lib/types.ts";
const event = (changes: Partial<ScheduleEvent> = {}): ScheduleEvent => ({ id: "espn:1", source: "espn", sport: "football", category: "spurs", title: "Spurs vs Opponent", competition: "Premier League", competitionId: "eng.1", stage: "", startsAt: "2026-09-12T16:30:00Z", date: "2026-09-12", timeConfirmed: true, status: "scheduled", participants: [], sourceUrl: "https://www.espn.com", season: 2026, ...changes });
const trophy = (state: TrophyState["state"], europa = false): TrophyState => ({ state, europa, reason: "", competitions: [] });
const table = (points: number, played = 30): Standing[] => Array.from({ length: 20 }, (_, i) => ({ id: i === 0 ? "367" : String(i), name: String(i), points: i === 0 ? points : 70, played }));
const football = (changes: any = {}) => ({ id: "1", date: "2026-09-12T16:30Z", timeValid: true, seasonType: { name: "Third Round" }, league: { slug: "eng.league_cup" }, competitions: [{ status: { type: { completed: true } }, competitors: [{ id: "367", homeAway: "home", team: { displayName: "Tottenham Hotspur" }, score: { value: 1 } }, { id: "2", homeAway: "away", team: { displayName: "Opponent" }, score: { value: 0 } }] }], ...changes });
test("VCT internationals overtake Spurs only after every trophy route is out", () => {
  const vct = event({ category: "vct_international" });
  for (const state of ["alive", "unknown"] as const) assert.ok(rankEvent(event(), trophy(state)).priority! > rankEvent(vct, trophy(state)).priority!);
  assert.ok(rankEvent(vct, trophy("out")).priority! > rankEvent(event(), trophy("out")).priority!);
});
test("Europa promotion and the complete regional ordering", () => {
  assert.ok(rankEvent(event({ category: "uel" }), trophy("alive", true)).priority! > rankEvent(event({ category: "ucl" }), trophy("alive", true)).priority!);
  const categories = ["f1", "vct_international", "vct_americas", "vct_pacific", "vct_emea", "vct_china", "cs2"] as const;
  const ranks = categories.map(category => rankEvent(event({ category }), trophy("alive")).priority!);
  assert.deepEqual([...ranks].sort((a, b) => b - a), ranks);
});
test("an attainable points ceiling preserves Spurs and an unknown cup prevents promotion", () => {
  assert.equal(deriveTrophy([], table(50), 2026).state, "alive");
  assert.equal(deriveTrophy([], table(0), 2026).state, "unknown");
});
test("league elimination plus both domestic cup exits releases the VCT override", () => {
  const cups = ["eng.fa", "eng.league_cup"].map(id => event({ id, competitionId: id, status: "completed", spursDecision: "lost" }));
  assert.equal(deriveTrophy(cups, table(0), 2026).state, "out");
  assert.equal(deriveTrophy(cups.map(e => ({ ...e, season: 2025 })), table(0), 2026).state, "unknown");
});
test("a points tie is not treated as proof of elimination", () => {
  const state = deriveTrophy([], table(46, 30), 2026);
  assert.equal(state.competitions[0].state, "alive");
});
test("duplicate fixtures remain a single Spurs match", () => {
  const merged = deduplicate([event(), event({ category: "pl", startsAt: "2026-09-13T15:00Z" })]);
  assert.equal(merged.length, 1); assert.equal(merged[0].category, "spurs"); assert.equal(merged[0].startsAt, "2026-09-13T15:00Z");
});
test("spotlight considers this week before distant higher-priority fixtures", () => {
  const choice = spotlight([event({ startsAt: "2026-10-12T16:30Z", priority: 100 }), event({ id: "f1", sport: "f1", startsAt: "2026-09-12T16:30Z", priority: 70 })], new Date("2026-09-10T00:00Z"));
  assert.equal(choice?.id, "f1");
});
test("Sri Lankan midnight and date-only fixtures are handled separately", () => {
  assert.equal(localDate("2026-09-10T20:00Z"), "2026-09-11");
  assert.equal(withinDates(event({ startsAt: "2026-09-10T20:00Z" }), "2026-09-11", "2026-09-11"), true);
  assert.equal(withinDates(event({ startsAt: null, date: "2026-09-10" }), "2026-09-10", "2026-09-10"), true);
  assert.equal(footballSeason(new Date("2027-01-02")), 2026);
});
test("football parses object scores and preserves unconfirmed kickoff dates", () => {
  const raw = football({ timeValid: false }); const result = normalizeFootball(raw)!;
  assert.equal(result.startsAt, null); assert.equal(result.date, "2026-09-12"); assert.equal(result.result, "1 – 0"); assert.equal(result.category, "spurs");
  assert.equal(normalizeFootball({}), null);
});
test("postponed and cancelled football events are not inferred to be completed", () => {
  for (const [name, status] of [["STATUS_POSTPONED", "postponed"], ["STATUS_CANCELED", "cancelled"]]) {
    const raw = football(); raw.competitions[0].status.type = { name, completed: false };
    assert.equal(normalizeFootball(raw)!.status, status);
  }
});
test("losing a first leg does not imply cup elimination", () => {
  const raw = football(); raw.competitions[0].notes = [{ headline: "1st Leg" }];
  assert.equal(footballDecision(raw, "uefa.europa", "Semifinals"), undefined);
});
test("two-leg decisions use aggregate, not the second-leg score", () => {
  const raw = football(); raw.competitions[0].notes = [{ headline: "2nd Leg" }];
  raw.competitions[0].competitors[0].aggregateScore = { value: 1 }; raw.competitions[0].competitors[1].aggregateScore = { value: 3 };
  assert.equal(footballDecision(raw, "uefa.europa", "Semifinals"), "lost");
  delete raw.competitions[0].competitors[0].aggregateScore;
  assert.equal(footballDecision(raw, "uefa.europa", "Semifinals"), undefined);
});
test("penalty shootouts resolve a drawn final", () => {
  const raw = football(); raw.competitions[0].competitors.forEach((p: any) => p.score = { value: 1 });
  raw.competitions[0].competitors[0].shootoutScore = { value: 5 }; raw.competitions[0].competitors[1].shootoutScore = { value: 4 };
  assert.equal(footballDecision(raw, "eng.fa", "Final"), "won");
});
test("F1 calendars include qualifying and sprints but exclude practices", () => {
  const race = { season: "2026", round: "1", raceName: "Australian Grand Prix", date: "2026-03-08", time: "04:00:00Z", Qualifying: { date: "2026-03-07", time: "05:00:00Z" }, FirstPractice: { date: "2026-03-06", time: "01:00:00Z" }, Sprint: { date: "2026-03-07" }, SprintShootout: { date: "2026-03-06", time: "05:00:00Z" } };
  const events = normalizeRace(race);
  assert.deepEqual(events.map(e => e.session), ["qualifying", "sprint-qualifying", "sprint", "race"]);
  assert.equal(events.find(e => e.session === "sprint")!.startsAt, null);
});
test("F1 results identify Norris and both McLaren drivers", () => {
  const result = raceResults({ Results: [{ position: "1", Driver: { driverId: "norris", givenName: "Lando", familyName: "Norris" }, Constructor: { constructorId: "mclaren", name: "McLaren" }, points: "25" }] }, "race");
  assert.equal(result[0].favorite, true); assert.equal(result[0].name, "Lando Norris");
});
test("legacy VCT Challengers slug does not exclude Champions", () => {
  const raw = { league: { id: 4531, name: "VCT", slug: "valorant-vct-2021-north-america-stage-1-challengers-1" }, serie: { name: "Champions", full_name: "Champions 2026" } };
  assert.equal(vctCategory(raw), "vct_international");
  for (const [name, category] of [["Americas", "vct_americas"], ["Pacific", "vct_pacific"], ["EMEA", "vct_emea"], ["China", "vct_china"]]) assert.equal(vctCategory({ ...raw, serie: { name } }), category);
  for (const name of ["Game Changers Brazil", "Ascension Pacific", "Challengers EMEA", "Offseason Masters"]) assert.equal(vctCategory({ ...raw, serie: { name } }), null);
});
const cs = (stage = "Playoffs", changes: any = {}) => ({ id: 10, league: { name: "FISSURE PLAYGROUND" }, serie: { full_name: "Season 3 2026", year: 2026 }, tournament: { name: stage, id: 21858, tier: "a" }, scheduled_at: "2026-09-11T09:00Z", ...changes });
test("Liquipedia S-tier takes precedence over a different PandaScore tier", () => { assert.equal(cs2Eligibility(cs()).allowed, true); assert.ok(normalizeEsport(cs(), "cs2")); });
test("CS2 qualifiers, play-ins, other editions and unknown stages stay hidden", () => {
  for (const stage of ["Play-In", "Closed Qualifier", "Unspecified stage"]) assert.equal(cs2Eligibility(cs(stage)).allowed, false);
  assert.equal(cs2Eligibility(cs("Playoffs", { serie: { name: "Season 2", year: 2025 } })).allowed, false);
  assert.equal(cs2Eligibility(cs("Playoffs", { serie: { full_name: "Season 3 Closed Qualifier", year: 2026 } })).allowed, false);
});
test("main-event Swiss qualification matches are not mistaken for preliminary qualifiers", () => {
  const raw = { ...cs(), name: "Qualification match: A vs B", league: { name: "ESL Pro League" }, serie: { name: "Season 24", year: 2026 }, tournament: { name: "Swiss Stage" }, scheduled_at: "2026-10-04T12:00Z" };
  assert.equal(cs2Eligibility(raw).allowed, true);
});
