export function localDate(iso: string | Date, timezone = "Asia/Colombo") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function footballSeason(now = new Date()) { return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; }
export function dateOffset(now: Date, days: number) { return new Date(now.getTime() + days * 86400000); }
export function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function withinDates(event: { startsAt: string | null; date: string | null }, from: string, to: string, timezone = "Asia/Colombo") {
  const day = event.startsAt ? localDate(event.startsAt, timezone) : event.date;
  return day !== null && day >= from && day <= to;
}
