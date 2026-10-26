import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Store } from "../db/storage.ts";

// Scope initialization to the binding, including when local dev replaces it.
const stores = new WeakMap<object, Promise<Store>>();
export function getStore() {
  const { DB } = getCloudflareContext().env;
  if (!DB) throw new Error("Skedy’s schedule storage is not configured. Add the DB D1 binding in wrangler.jsonc.");
  let ready = stores.get(DB);
  if (!ready) {
    const store = new Store(DB);
    ready = store.initialize().then(() => store).catch(error => { stores.delete(DB); throw error; });
    stores.set(DB, ready);
  }
  return ready;
}
export function pandaToken() {
  return String(getCloudflareContext().env.PANDASCORE_TOKEN ?? process.env.PANDASCORE_TOKEN ?? "").trim();
}
