declare module "cloudflare:workers" { export const env: { DB: import("../db/storage.ts").Database; PANDASCORE_TOKEN?: string }; }
type Fetcher = { fetch(request: Request): Promise<Response> };
type D1Database = import("../db/storage.ts").Database;
