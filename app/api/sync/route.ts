import { getStore, pandaToken } from "../../../lib/runtime.ts";
import { synchronize } from "../../../lib/sync.ts";
// A full F1 + PandaScore refresh takes ~10s; allow headroom on every Vercel plan.
export const maxDuration = 60;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Refresh must come from Skedy." }, { status: 403 });
  try { return Response.json(await synchronize(await getStore(), pandaToken(), new URL(request.url).searchParams.get("force") === "1"), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Refresh is unavailable. Your saved schedule has been kept." }, { status: 503 }); }
}
