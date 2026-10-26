# Skedy

A personal schedule for Lahiru: every Spurs game, football around it, McLaren and Lando, VCT, and S-tier CS2. Built with Next.js, React and TypeScript, deployed on Cloudflare Workers through OpenNext with D1 storage at https://skedy.stackmoth.com. Times default to Asia/Colombo.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
# Copy .env.example to .env and set PANDASCORE_TOKEN locally.
npm run dev
```

Open http://localhost:3000. `initOpenNextCloudflareForDev()` supplies a local D1 binding; its data persists under `.wrangler/state` (ignored by Git). Local development and preview do not connect to production D1. No Cloudflare login is required for local development. `.env` is ignored by Git; never use a `NEXT_PUBLIC_` prefix for the PandaScore token. It stays on the server.

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

ESPN is an unofficial, keyless feed and can change. All three sources refresh on the server; browsers only read the saved schedule.

Provider outages never replace the saved calendar with an empty error response. Undated matches remain TBC. Result availability depends on the provider; there is no promise of live updates. F1 excludes practice sessions. VCT excludes Challengers, Game Changers, Ascension and offseason events.

## Maintaining the CS2 list

`lib/cs2-catalogue.ts` is an edition-specific allowlist reviewed on 2026-09-10. It uses **Liquipedia S-tier**, which differs from PandaScore tiers. Unknown editions and stages are excluded. Qualifiers and play-ins are excluded even if the parent tournament is S-tier. A main-event Swiss match named “Qualification match” remains eligible; that wording does not make it a separate qualifying event.

For each new edition, verify its Liquipedia page and main-event dates/format; add a year, edition matcher and explicit stage-name matcher. Pin known PandaScore tournament IDs where available. Provider context saved under the `pandascore:context` snapshot records admitted edition/stage mappings. Never admit an edition using a broad brand name or PandaScore `tier` alone. New CS2 editions require this maintenance before they appear.

## Storage and endpoints

A Cloudflare D1 database stores normalized events, source status/leases and standings/provider snapshots. `lib/runtime.ts` passes the `DB` binding directly to `Store`. `db/storage.ts` defines the schema and creates it idempotently on first use. Stable provider IDs update postponed/rescheduled fixtures in place and prevent Spurs duplicates across competition feeds. libSQL is a development-only dependency used by `db/libsql.ts` for the SQLite unit tests; production does not use Turso or a filesystem database.

- `GET /api/schedule` — cached ranked events, trophy state and source status; optional `sport`, `from`, `to` filters.
- `POST /api/sync` — refresh due football, F1 and esports feeds and return the schedule; `?force=1` requests a manual refresh without bypassing rate-limit backoff.

The app has no sign-in: anyone with the URL can view it and trigger refreshes, which shared leases and provider backoff keep within rate limits. Nothing a visitor sends is stored. Its database is a single personal watchlist; do not make it a shared multi-user service without adding user-scoped storage and authorization.

## Verification and deployment

```sh
npm test
npm run typecheck
npm run lint
npm run build
# Build and serve the production bundle in the local Workers runtime:
npm run preview
# With the local server running and a token in .env:
npm run test:smoke
```

Unit tests cover priority exceptions, trophy elimination, timezone boundaries, feed normalization, strict CS2 exclusions, pagination, backoff and durable SQLite persistence. The HTTP smoke check exercises real feeds, refreshes and route filtering; it is not a browser rendering test.

### Deploy to Cloudflare Workers + D1

1. Run `npx wrangler login` and select the account hosting the `stackmoth.com` DNS zone. If you have multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
2. Run `npx wrangler d1 create skedy`. Add the returned `database_id` to the existing `DB` entry in `wrangler.jsonc`. If a `skedy` database already exists, use `npx wrangler d1 list` to find its ID instead. Without an ID, current Wrangler can provision a database during deployment; explicitly setting the ID makes the target clear and allows D1 CLI commands to use it.
3. Run `npx wrangler secret put PANDASCORE_TOKEN` and paste the token at its prompt. This enables VCT and CS2; football and F1 work without it. The token is a runtime secret and is not needed at build time.
4. Run `npm run deploy`. This builds Next.js, adapts it with OpenNext, and deploys the Worker and static assets. The custom domain in `wrangler.jsonc` makes Cloudflare provision DNS and TLS for `skedy.stackmoth.com`. The zone must be active in the same Cloudflare account; resolve any existing conflicting DNS record before attaching the domain.

Tables are created on the first request. The database holds cached feeds and refresh state, so a fresh D1 database can refill from the providers without importing Turso. Existing Turso and `.data/skedy.db` data are not modified by this migration.

`npm run build:worker` builds the deployable Worker without publishing. `npm run cf-typegen` regenerates the ignored Cloudflare binding/runtime types; it runs automatically before development, type checking, and Worker builds. `cloudflare-secrets.d.ts` declares the optional runtime token.

On Windows, OpenNext support is limited. If the Worker build fails due to platform tooling, use a Linux checkout under WSL or a Linux CI runner with `npm ci` and `npm run deploy` (do not share Windows `node_modules` with Linux).

To use Workers Builds, connect the repository to the Worker and set the build command to `npm run build:worker` and deploy command to `npx opennextjs-cloudflare deploy`. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in external CI; keep `PANDASCORE_TOKEN` as a Worker runtime secret.

After deployment, open the dashboard and check **Preferences & sources** for feed status. To run the HTTP/feed smoke check against it, set `SKEDY_URL=https://skedy.stackmoth.com` in your shell and run `npm run test:smoke`.
