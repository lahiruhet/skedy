import { env } from "cloudflare:workers";
import { Store, type Database } from "../db/storage.ts";
const initialized = new WeakMap<object, Promise<void>>();
export async function getStore() {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Skedy’s schedule storage is not configured.");
  const store = new Store(db);
  if (!initialized.has(db)) initialized.set(db, store.initialize().catch(error => { initialized.delete(db); throw error; }));
  await initialized.get(db);
  return store;
}
export function pandaToken() { return String((env as unknown as { PANDASCORE_TOKEN?: string }).PANDASCORE_TOKEN ?? process.env.PANDASCORE_TOKEN ?? "").trim(); }
