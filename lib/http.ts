export class FeedError extends Error { status: number; retryAfter: number; constructor(message: string, status = 502, retryAfter = 60) { super(message); this.status = status; this.retryAfter = retryAfter; } }
export async function fetchJson(url: string, headers: Record<string, string> = {}, request: typeof fetch = fetch): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try { response = await request(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(18000) }); }
    catch { if (attempt === 0) continue; throw new FeedError("The schedule provider could not be reached."); }
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = retry ? (Number(retry) || Math.ceil((Date.parse(retry) - Date.now()) / 1000)) : 60;
      if (response.status === 429) throw new FeedError("The provider asked us to wait before refreshing.", 429, Math.max(60, seconds || 60));
      if (response.status >= 500 && attempt === 0) continue;
      if (response.status === 401 || response.status === 403) throw new FeedError("The provider rejected access. Check the API token and subscription.", response.status, 900);
      throw new FeedError("The schedule provider returned an unexpected response.", response.status);
    }
    try { return await response.json(); } catch { throw new FeedError("The schedule provider returned unreadable data."); }
  }
  throw new FeedError("The schedule provider could not be reached.");
}
export async function paginatedPanda(path: string, token: string, params: Record<string, string> = {}, request: typeof fetch = fetch) {
  const items: any[] = [];
  for (let page = 1; page <= 40; page++) {
    const query = new URLSearchParams({ ...params, per_page: "100", page: String(page) });
    const data = await fetchJson(`https://api.pandascore.co/${path}?${query}`, { Authorization: `Bearer ${token}` }, request);
    if (!Array.isArray(data)) throw new FeedError("The esports provider returned an invalid match list.");
    items.push(...data);
    if (data.length < 100) return items;
  }
  throw new FeedError("The esports feed exceeded its pagination limit; the previous schedule has been preserved.");
}
