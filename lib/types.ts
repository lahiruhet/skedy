export type Sport = "football" | "f1" | "valorant" | "cs2";
export type Source = "espn" | "jolpica" | "pandascore";
export type EventStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
export type Category = "spurs" | "pl" | "ucl" | "uel" | "football" | "f1" | "vct_international" | "vct_americas" | "vct_pacific" | "vct_emea" | "vct_china" | "cs2";
export interface Participant { id: string; name: string; shortName: string; logo?: string; score?: string; winner?: boolean }
export interface ResultLine { position: string; name: string; team: string; detail: string; favorite: boolean }
export interface ScheduleEvent {
  id: string; source: Source; sport: Sport; category: Category;
  title: string; competition: string; competitionId: string; stage: string;
  startsAt: string | null; date: string | null; timeConfirmed: boolean; status: EventStatus;
  participants: Participant[]; venue?: string; sourceUrl: string; season: number;
  result?: string; resultLines?: ResultLine[]; session?: string; round?: string;
  spursDecision?: "won" | "lost"; priority?: number; priorityReason?: string;
}
export interface SourceState { id: Source; name: string; status: "ready" | "stale" | "error" | "setup" | "pending"; lastSuccess: string | null; lastAttempt: string | null; message: string | null }
export interface Standing { id: string; name: string; points: number; played: number }
export interface TrophyState { state: "alive" | "out" | "unknown"; reason: string; europa: boolean; competitions: { name: string; state: "alive" | "out" | "won" | "unknown" }[] }
export interface ScheduleResponse { events: ScheduleEvent[]; sources: SourceState[]; trophy: TrophyState; updatedAt: string; timezone: string; catalogueUpdatedAt: string }
export interface ProviderBatch { events: ScheduleEvent[]; standings?: Standing[]; context?: Record<string, unknown> }

export const SOURCE_NAMES: Record<Source, string> = { espn: "Football · ESPN", jolpica: "Formula 1 · Jolpica", pandascore: "Esports · PandaScore" };
export const SPURS_ID = "367";
export const DEFAULT_TIMEZONE = "Asia/Colombo";
