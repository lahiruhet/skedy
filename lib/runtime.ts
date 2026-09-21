import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { Store } from "../db/storage.ts";
import { libsqlDatabase } from "../db/libsql.ts";
const LOCAL_DATABASE = "file:.data/skedy.db";
let ready: Promise<Store> | undefined;
async function open() {
  // Vercel's filesystem is ephemeral, so production must point at Turso.
  const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "" : LOCAL_DATABASE);
  if (!url) throw new Error("Skedy’s schedule storage is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  if (url === LOCAL_DATABASE) mkdirSync(".data", { recursive: true });
  const store = new Store(libsqlDatabase(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })));
  await store.initialize();
  return store;
}
export function getStore() {
  ready ??= open().catch(error => { ready = undefined; throw error; });
  return ready;
}
export function pandaToken() { return String(process.env.PANDASCORE_TOKEN ?? "").trim(); }
