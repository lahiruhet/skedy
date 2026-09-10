/** Edition-specific allowlist. Never infer Liquipedia S-tier from PandaScore's tier.
 * IDs can be pinned after inspecting the authenticated feed. An unpinned stage is
 * admitted only when its explicit name matches a verified format below.
 * Recheck source pages when adding editions: advertised tiers can change.
 */
export const CATALOGUE_UPDATED_AT = "2026-09-10";
export interface CsEdition { key: string; name: string; year: number; from: string; to: string; source: string; match: RegExp; stages: RegExp; tournamentIds: number[] }
export const CS2_EDITIONS: CsEdition[] = [
  { key: "esl-pro-league-24", name: "ESL Pro League Season 24", year: 2026, from: "2026-10-03", to: "2026-10-11", source: "https://liquipedia.net/counterstrike/ESL/Pro_League/Season_24", match: /esl.*pro.*league.*(?:season )?24\b/i, stages: /^(?:group stage|swiss(?: stage)?|playoffs?)$/i, tournamentIds: [] },
  { key: "blast-open-fall-2026", name: "BLAST Open Fall 2026", year: 2026, from: "2026-08-26", to: "2026-09-06", source: "https://liquipedia.net/counterstrike/BLAST/Open/2026/Fall", match: /blast.*open.*(?:fall|autumn)/i, stages: /^(?:group(?: stage)?(?: [ab])?|playoffs?)$/i, tournamentIds: [] },
  { key: "fissure-playground-3", name: "FISSURE Playground #3", year: 2026, from: "2026-09-08", to: "2026-09-13", source: "https://liquipedia.net/counterstrike/FISSURE/Playground/3", match: /fissure.*playground.*(?:#?3\b|season 3\b)/i, stages: /^(?:group(?: stage)?(?: [ab])?|playoffs?)$/i, tournamentIds: [] },
  { key: "starseries-fall-2026", name: "StarLadder StarSeries Fall 2026", year: 2026, from: "2026-09-17", to: "2026-09-20", source: "https://liquipedia.net/counterstrike/StarLadder/StarSeries/2026/Fall", match: /star(?:ladder|series).*fall/i, stages: /^playoffs?$/i, tournamentIds: [] },
];

export function cs2Eligibility(raw: any): { allowed: boolean; edition?: CsEdition; reason: string } {
  const editionText = [raw.league?.name, raw.serie?.full_name, raw.serie?.name, raw.serie?.slug].filter(Boolean).join(" ").replaceAll("-", " ");
  const stage = String(raw.tournament?.name ?? "").trim();
  const allText = `${editionText} ${stage}`;
  if (/qualif|play[ -]?in|preliminary|closed.*stage|open.*stage|\brmr\b/i.test(allText)) return { allowed: false, reason: "Qualification or play-in stage" };
  const date = String(raw.scheduled_at ?? raw.begin_at ?? "").slice(0, 10);
  const year = Number(raw.serie?.year ?? date.slice(0, 4));
  const edition = CS2_EDITIONS.find(e => e.year === year && e.match.test(editionText) && (!date || (date >= e.from && date <= e.to)));
  if (!edition) return { allowed: false, reason: "Tournament edition has not been verified as Liquipedia S-tier" };
  if (!edition.tournamentIds.includes(Number(raw.tournament?.id)) && !edition.stages.test(stage)) return { allowed: false, edition, reason: "Main-event stage needs verification" };
  return { allowed: true, edition, reason: "Verified S-tier main event" };
}
