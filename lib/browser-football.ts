import { fetchFootball } from "./providers/espn.ts";
import type { ScheduleResponse } from "./types.ts";
export async function refreshBrowserFootball(force = false): Promise<ScheduleResponse | null> {
  const post = async (body: unknown) => fetch("/api/football", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const claimResponse = await post({ action: "claim", force });
  if (!claimResponse.ok) throw new Error("Football refresh could not start.");
  const claim = await claimResponse.json();
  if (!claim.claimed) return null;
  try {
    const result = await fetchFootball();
    const saved = await post({ action: "save", ticket: claim.ticket, events: result.events, standings: result.standings, warning: result.context?.warning });
    if (!saved.ok) throw new Error("Football refresh could not be saved.");
    return saved.json();
  } catch {
    const response = await post({ action: "error", ticket: claim.ticket });
    if (response.ok) return response.json();
    throw new Error("Football could not refresh. Your saved schedule is still available.");
  }
}
