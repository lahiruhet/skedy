# Skedy

A personal schedule for Lahiru: every Spurs game, football around it, McLaren and Lando, VCT, and S-tier CS2. Built with Next.js, React and TypeScript, deployed on Vercel with Turso (libSQL) storage. Times default to Asia/Colombo.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
# Copy .env.example to .env and set PANDASCORE_TOKEN locally.
npm run dev
```

Open http://localhost:3000. Without `TURSO_DATABASE_URL`, data is saved to a local SQLite file at `.data/skedy.db` (ignored by Git). `.env` is ignored by Git; never use a `NEXT_PUBLIC_` prefix for the PandaScore token. It stays on the server.

The first visit fetches the feeds. Subsequent visits show saved data immediately and refresh sources when due. Refreshing is coordinated across tabs and respects provider backoff. The dashboard checks while it is open; there are no background jobs, notifications or live scores. Completed events show published final results.

## Views and priorities

- Overview: a priority spotlight, quieter PL/UCL/UEL panel, F1/VCT/CS2 cards and an agenda.
- My agenda: chronological events, sport filters, search, and 7/14/30-day windows.
- Spurs season: all published current and upcoming season fixtures, including cups and friendlies.
- Results: confirmed results from the last seven days. F1 classifications highlight Norris and McLaren.
- Preferences & sources: timezone, priority explanation, trophy status, feed freshness and errors. Only the display timezone is stored on the device.

Default priority is Spurs → PL → European football → F1 → VCT internationals → Americas → Pacific/APAC → EMEA → China → CS2. UEL goes ahead of UCL when Spurs have Europa fixtures. Masters and Champions overtake everything only once all remaining Spurs trophy routes are confirmed exhausted. The spotlight chooses among the next seven days, then later published events when that window is empty.

Trophy tracking is deliberately conservative. A league points ceiling proves mathematical elimination; a tie does not. Cup decisions account for first legs, aggregate scores and penalties. Missing cup/standings data keeps Spurs first. This can delay an international VCT promotion when a provider has not confirmed elimination.

## Data sources

| Source | Coverage | Refresh interval |
| --- | --- | --- |
| [ESPN public feeds](https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/367/schedule) | Full published Spurs season; PL, UCL and UEL over the next 30 days; seven days of other results; PL standings | 1 hour; 5 minutes around events |
| [Jolpica](https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md) | Published F1 season, qualifying, sprint qualifying, sprint and GP; recent final classifications | 6 hours; 5 minutes around events |
| [PandaScore](https://developers.pandascore.co/docs) | VCT Masters/Champions and four main regions; curated S-tier CS2 matches over the next 30 days; seven days of results | 15 minutes; 5 minutes around events |

ESPN is an unofficial, keyless feed and can change. Its public endpoint supports browser CORS but rejected server-side requests during development. Football is therefore fetched directly in the browser, normalized, validated and saved through a same-origin endpoint under a short refresh lease. Football can fail if the browser or network blocks ESPN; saved fixtures remain available. F1 and PandaScore refresh on the server.

Provider outages never replace the saved calendar with an empty error response. Undated matches remain TBC. Result availability depends on the provider; there is no promise of live updates. F1 excludes practice sessions. VCT excludes Challengers, Game Changers, Ascension and offseason events.

## Maintaining the CS2 list

`lib/cs2-catalogue.ts` is an edition-specific allowlist reviewed on 2026-09-10. It uses **Liquipedia S-tier**, which differs from PandaScore tiers. Unknown editions and stages are excluded. Qualifiers and play-ins are excluded even if the parent tournament is S-tier. A main-event Swiss match named “Qualification match” remains eligible; that wording does not make it a separate qualifying event.

For each new edition, verify its Liquipedia page and main-event dates/format; add a year, edition matcher and explicit stage-name matcher. Pin known PandaScore tournament IDs where available. Provider context saved under the `pandascore:context` snapshot records admitted edition/stage mappings. Never admit an edition using a broad brand name or PandaScore `tier` alone. New CS2 editions require this maintenance before they appear.

## Storage and endpoints

A libSQL database (Turso in production, `.data/skedy.db` locally) stores normalized events, source status/leases and standings/provider snapshots. `db/storage.ts` defines the schema and creates it idempotently on first use; `db/libsql.ts` adapts the libSQL client. Stable provider IDs update postponed/rescheduled fixtures in place and prevent Spurs duplicates across competition feeds.

- `GET /api/schedule` — cached ranked events, trophy state and source status; optional `sport`, `from`, `to` filters.
- `POST /api/sync` — refresh due F1/esports feeds; `?force=1` requests a manual refresh without bypassing rate-limit backoff.
- `POST /api/football` — claim, save or report failure for a browser football refresh. A short-lived ticket prevents replay and competing writes.

The app has no sign-in: anyone with the URL can view it, and a visitor's browser can post football updates through `/api/football`. Its database is a single personal watchlist; do not make it a shared multi-user service without adding user-scoped storage and authorization.

## Verification and deployment

```sh
npm test
npm run typecheck
npm run lint
npm run build
# With the local server running and a token in .env:
npm run test:smoke
```

Unit tests cover priority exceptions, trophy elimination, timezone boundaries, feed normalization, strict CS2 exclusions, pagination, backoff and durable SQLite persistence. The HTTP smoke check exercises real feeds, refresh/save/replay protection and route filtering. It uses native Node for the browser's ESPN transport; it is not a browser rendering test.

### Deploy to Vercel

1. Push this repository to GitHub, then import it at https://vercel.com/new (framework: Next.js, defaults are fine).
2. In the Vercel project, open **Storage → Marketplace → Turso** and create a database (free plan) and connect it to the project. Check **Settings → Environment Variables**: the app reads exactly `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. If the connect dialog added a prefix, add those two names with the same values. Tables are created on first request.
3. In **Settings → Environment Variables**, add `PANDASCORE_TOKEN`, then redeploy.

Pushes to the default branch then deploy automatically. To smoke-test the deployment, open it and check **Preferences & sources** for feed status.
