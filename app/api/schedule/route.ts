import { getStore } from "../../../lib/runtime.ts";
import { schedule } from "../../../lib/sync.ts";
import { withinDates } from "../../../lib/time.ts";
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to"), sport = url.searchParams.get("sport");
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return Response.json({ error: "Choose a valid date range." }, { status: 400 });
    if (sport && !["football", "f1", "valorant", "cs2"].includes(sport)) return Response.json({ error: "Unknown sport." }, { status: 400 });
    const data = await schedule(await getStore());
    data.events = data.events.filter(e => (!sport || e.sport === sport) && (!(from || to) || withinDates(e, from ?? "0000-01-01", to ?? "9999-12-31")));
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Your schedule could not be loaded. Please try again." }, { status: 503 }); }
}
