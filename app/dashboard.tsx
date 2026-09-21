"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, CheckCheck, ChevronRight, Clock3, ExternalLink, Flag, Gamepad2, LayoutGrid, LoaderCircle, MapPin, Radio, RefreshCw, Search, Settings2, Shield, Star, Trophy, X, Zap } from "lucide-react";
import type { Category, ScheduleEvent, ScheduleResponse, Sport } from "../lib/types";
import { DEFAULT_TIMEZONE } from "../lib/types";
import { dateOffset, footballSeason, localDate, withinDates } from "../lib/time";
import { spotlight } from "../lib/priorities";
import { useDeviceTimezone, saveDeviceTimezone } from "../lib/device-timezone";

type View = "overview" | "agenda" | "spurs" | "results";
const SPORT_NAMES: Record<Sport, string> = { football: "Football", f1: "Formula 1", valorant: "VALORANT", cs2: "Counter-Strike 2" };
const SPORT_SHORT: Record<Sport, string> = { football: "Football", f1: "F1", valorant: "VALORANT", cs2: "CS2" };
const SPORT_ICONS: Record<Sport, typeof Shield> = { football: Shield, f1: Flag, valorant: Zap, cs2: Gamepad2 };
const CATEGORY_NAMES: Record<Category, string> = { spurs: "Tottenham", pl: "Premier League", ucl: "Champions League", uel: "Europa League", football: "Football", f1: "Formula 1", vct_international: "VCT International", vct_americas: "VCT Americas", vct_pacific: "VCT Pacific", vct_emea: "VCT EMEA", vct_china: "VCT China", cs2: "S-tier CS2" };
const NAV = [{ key: "overview", label: "Overview", Icon: LayoutGrid }, { key: "agenda", label: "Agenda", Icon: CalendarDays }, { key: "spurs", label: "Spurs", Icon: Shield }, { key: "results", label: "Results", Icon: CheckCheck }] as const;
const HEADINGS: Record<View, { title: string; lede: string; list: string }> = {
  overview: { title: "Your watchlist.", lede: "The games you care about. All in one place.", list: "On your calendar" },
  agenda: { title: "Make time for the game.", lede: "A little less searching. A lot more watching.", list: "On your calendar" },
  spurs: { title: "Every game. All Spurs.", lede: "League, cups, Europe and friendlies. Nothing left out.", list: "The season so far and ahead" },
  results: { title: "How it played out.", lede: "Confirmed final results from the last seven days.", list: "The final word" },
};
const RANGES = [{ value: 1, label: "Today" }, { value: 7, label: "7 days" }, { value: 30, label: "30 days" }];
const PRIORITIES = ["Every Tottenham game", "Premier League & European football", "F1 · McLaren & Lando Norris", "VCT internationals", "Americas → Pacific → EMEA → China", "Liquipedia S-tier Counter-Strike"];

function Badge({ sport }: { sport: Sport }) {
  const Icon = SPORT_ICONS[sport];
  return <span className="sport-badge" data-sport={sport}><Icon size={15} />{SPORT_NAMES[sport]}</span>;
}
function Logo({ src, name, className = "" }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  // Feed-owned crests use their original CDN URL and an onError fallback.
  // eslint-disable-next-line @next/next/no-img-element
  return src && !failed ? <img className={`team-logo ${className}`} src={src} alt={`${name} crest`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className={`team-fallback ${className}`} aria-label={name}>{name.split(" ").map(p => p[0]).slice(0, 2).join("") || "?"}</span>;
}
function formatTime(event: ScheduleEvent, timezone: string) {
  return event.startsAt ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.startsAt)) : "TBC";
}
function formatDay(event: ScheduleEvent, timezone: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const value = event.startsAt ?? (event.date ? `${event.date}T12:00:00Z` : null);
  return value ? new Intl.DateTimeFormat("en-GB", { timeZone: event.startsAt ? timezone : "UTC", ...options }).format(new Date(value)) : "Date to be confirmed";
}
function countdown(event: ScheduleEvent, now: Date) {
  if (event.status === "in_progress") return "In progress";
  if (!event.startsAt) return "Time to be confirmed";
  const remaining = Date.parse(event.startsAt) - now.getTime();
  if (remaining < 0) return "Awaiting an update";
  const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining % 86400000 / 3600000), mins = Math.floor(remaining % 3600000 / 60000);
  return days ? `${days}d ${hours}h to go` : hours ? `${hours}h ${mins}m to go` : `${mins}m to go`;
}

function EventMark({ event }: { event: ScheduleEvent }) {
  const [home, away] = event.participants;
  const Icon = SPORT_ICONS[event.sport];
  return <span className="event-mark" aria-hidden="true">{home ? <><Logo src={home.logo} name={home.name} />{away && <Logo src={away.logo} name={away.name} />}</> : <span className="event-icon"><Icon size={18} /></span>}</span>;
}
function EventRow({ event, timezone, onOpen, compact = false }: { event: ScheduleEvent; timezone: string; onOpen: (event: ScheduleEvent) => void; compact?: boolean }) {
  const isSpurs = event.category === "spurs";
  const status = event.status === "completed" ? "Final" : event.status === "in_progress" ? "In progress" : event.status === "postponed" ? "Postponed" : compact ? formatDay(event, timezone, { month: "short", day: "numeric" }) : null;
  return <button className={`event-row${compact ? " compact" : ""}`} data-sport={isSpurs ? "spurs" : event.sport} onClick={() => onOpen(event)}>
    <span className="event-time"><strong>{formatTime(event, timezone)}</strong>{status && <small>{status}</small>}</span>
    <EventMark event={event} />
    <span className="event-copy">
      <strong>{event.title}{isSpurs && <Star size={13} fill="currentColor" aria-label="Spurs" />}</strong>
      <small>{event.competition}{event.stage && !event.stage.includes("Premier League") ? ` · ${event.stage}` : ""}</small>
    </span>
    {event.result ? <span className="event-result">{event.result}</span> : !compact && <span className="event-tag">{isSpurs ? "Don’t miss" : event.sport === "f1" ? event.stage : CATEGORY_NAMES[event.category]}</span>}
    <ChevronRight size={18} className="event-arrow" aria-hidden="true" />
  </button>;
}

export default function Dashboard({ initialNow }: { initialNow: string }) {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [now, setNow] = useState(new Date(initialNow));
  const [view, setView] = useState<View>("overview");
  const [sport, setSport] = useState<Sport | "all">("all");
  const [days, setDays] = useState(7);
  const [query, setQuery] = useState("");
  const [footballTab, setFootballTab] = useState<Category>("pl");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = useDeviceTimezone();
  const [selected, setSelected] = useState<ScheduleEvent | null>(null);
  const [settings, setSettings] = useState(false);
  const [pagination, setPagination] = useState({ key: "", count: 12 });
  const filterKey = `${view}/${sport}/${days}/${query}`;
  const limit = pagination.key === filterKey ? pagination.count : 12;
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/schedule");
      if (!response.ok) throw new Error("Your schedule couldn’t be loaded. Try refreshing.");
      setData(await response.json()); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Your schedule couldn’t be loaded."); }
  }, []);
  const refresh = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true; setSyncing(true);
    try {
      // The sync response is the refreshed schedule; per-feed failures are reported in its sources.
      const response = await fetch(`/api/sync${force ? "?force=1" : ""}`, { method: "POST" });
      if (!response.ok) throw new Error("Refresh is unavailable. Your saved schedule is still here.");
      setData(await response.json()); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh is unavailable."); }
    finally { busy.current = false; setSyncing(false); }
  }, []);

  useEffect(() => {
    // Loading the cached schedule synchronizes with external HTTP state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then(() => refresh());
    const clock = setInterval(() => setNow(new Date()), 30000);
    const sync = setInterval(() => { if (!document.hidden) void refresh(); }, 300000);
    const poll = setInterval(() => { if (busy.current && !document.hidden) void load(); }, 15000);
    const visible = () => { if (!document.hidden) { setNow(new Date()); void load().then(() => refresh()); } };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(clock); clearInterval(sync); clearInterval(poll); document.removeEventListener("visibilitychange", visible); };
  }, [load, refresh]);
  useEffect(() => { if (selected || settings) dialog.current?.showModal(); else dialog.current?.close(); }, [selected, settings]);

  const events = data?.events ?? [];
  const today = localDate(now, timezone);
  const upcoming = events.filter(e => e.status !== "completed" && e.status !== "cancelled" && (!e.startsAt || Date.parse(e.startsAt) >= now.getTime() - 6 * 3600000));
  const feature = spotlight(events, now);
  const nextF1 = upcoming.find(e => e.sport === "f1");
  const nextVct = upcoming.find(e => e.sport === "valorant");
  const nextCs = upcoming.find(e => e.sport === "cs2");
  const football = upcoming.filter(e => e.category === footballTab).sort((a, b) => (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999"));
  const end = localDate(dateOffset(now, days - 1), timezone);
  const filtered = events.filter(e => {
    if (view === "results") { if (e.status !== "completed" || !withinDates(e, localDate(dateOffset(now, -7), timezone), today, timezone)) return false; }
    else if (view === "spurs") { if (e.category !== "spurs" || e.season < footballSeason(now)) return false; }
    else if (e.status === "completed" || e.status === "cancelled" || (!withinDates(e, today, end, timezone) && e.date !== null)) return false;
    if (sport !== "all" && e.sport !== sport) return false;
    return !query || `${e.title} ${e.competition} ${e.stage} ${e.participants.map(p => p.name).join(" ")}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => view === "results" ? (b.startsAt ?? "").localeCompare(a.startsAt ?? "") : (a.startsAt ?? a.date ?? "9999").localeCompare(b.startsAt ?? b.date ?? "9999"));
  const visibleEvents = filtered.slice(0, limit);
  const groups = new Map<string, ScheduleEvent[]>();
  for (const event of visibleEvents) {
    const day = event.startsAt ? localDate(event.startsAt, timezone) : event.date ?? "tbc";
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  const sourcesReady = data?.sources.filter(s => s.lastSuccess).length ?? 0;
  const sportCounts = (name: Sport) => upcoming.filter(e => e.sport === name && withinDates(e, today, localDate(dateOffset(now, 29), timezone), timezone)).length;
  const navigate = (target: View, filter: Sport | "all" = "all") => { setView(target); setSport(filter); setQuery(""); if (target !== "overview") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const closeDialog = () => { setSelected(null); setSettings(false); };
  const isDefaultZone = timezone === DEFAULT_TIMEZONE;
  const zoneName = isDefaultZone ? "Sri Lanka" : timezone.split("/").at(-1)?.replaceAll("_", " ");
  const zoneOffset = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(now).find(p => p.type === "timeZoneName")?.value;
  const heading = HEADINGS[view];
  const sportCards = [
    { sport: "f1", title: "Formula 1", event: nextF1, description: "McLaren & Lando Norris" },
    { sport: "valorant", title: "VCT", event: nextVct, description: "Internationals, then your regions" },
    { sport: "cs2", title: "Counter-Strike 2", event: nextCs, description: "S-tier main events only" },
  ] as const;

  return <div className="app">
    <a className="skip-link" href="#main-content">Skip to schedule</a>
    <header className="masthead">
      <div className="masthead-inner">
        <button className="brand" onClick={() => navigate("overview")} aria-label="Skedy home">skedy<span>.</span></button>
        <nav className="tabs" aria-label="Main navigation">
          {NAV.map(({ key, label, Icon }) => <button key={key} className="tab" aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={20} aria-hidden="true" />{label}</button>)}
        </nav>
        <div className="masthead-actions">
          <span className="zone">{zoneName}<span>{zoneOffset}</span></span>
          <button className={`icon-button${syncing ? " is-syncing" : ""}`} onClick={() => refresh(true)} disabled={syncing} aria-label="Refresh schedules"><RefreshCw size={18} /><span>{syncing ? "Syncing" : "Refresh"}</span></button>
          <button className="icon-button" onClick={() => setSettings(true)} aria-label="Preferences and sources"><Settings2 size={18} /></button>
        </div>
      </div>
    </header>

    <main id="main-content">
      <section className="page-head">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(now)}</p>
          <h1>{heading.title}</h1>
          <p className="lede">{heading.lede}</p>
        </div>
        <button className="sync-status" onClick={() => setSettings(true)}><span className={syncing ? "status-dot pulse" : "status-dot"} />{syncing ? "Updating your watchlist" : `${sourcesReady} of ${data?.sources.length ?? 3} sources connected`}</button>
      </section>
      {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => refresh(true)}>Try again <ArrowRight size={15} /></button></div>}
      {data?.sources.some(s => s.status === "error") && <div className="notice"><Radio size={18} /><span>Some feeds couldn’t refresh. Your last saved fixtures are still here.</span><button onClick={() => setSettings(true)}>View sources</button></div>}

      {view === "overview" && <>
        <div className="overview-grid">
          <section className="spotlight" aria-label="Priority event">
            {feature ? <>
              <div className="spotlight-top">
                <span className="spotlight-label" data-sport={feature.category === "spurs" ? "spurs" : feature.sport}><Star size={14} fill="currentColor" />{feature.category === "spurs" ? "Your No. 1" : "In the spotlight"}</span>
                <span className="spotlight-competition">{feature.competition}</span>
              </div>
              <div className="spotlight-body">
                {feature.participants.length >= 2 && <div className="spotlight-crests" aria-hidden="true">{feature.participants.slice(0, 2).map(p => <span className="crest" key={p.id}><Logo src={p.logo} name={p.name} /></span>)}</div>}
                <p className="spotlight-kicker">{feature.category === "spurs" ? "Come on you Spurs" : feature.sport === "f1" ? "Lights out. Eyes on Lando." : "Clear your calendar"}</p>
                <h2>{feature.participants.length >= 2 ? <>{feature.participants[0].shortName}<span className="versus">vs</span>{feature.participants[1].shortName}</> : feature.title}</h2>
                <div className="spotlight-meta">
                  <span><CalendarDays size={18} />{formatDay(feature, timezone)}</span>
                  <span><Clock3 size={18} />{formatTime(feature, timezone)} {isDefaultZone ? "SLST" : "local"}</span>
                  {feature.venue && <span><MapPin size={18} />{feature.venue}</span>}
                </div>
              </div>
              <div className="spotlight-foot">
                <span className="countdown" data-sport={feature.category === "spurs" ? "spurs" : feature.sport}><span className={feature.status === "in_progress" ? "live-dot pulse" : "live-dot"} />{countdown(feature, now)}</span>
                <button onClick={() => setSelected(feature)}>Details <ArrowUpRight size={18} /></button>
              </div>
            </> : <div className="spotlight-empty">
              <h2>{syncing || !data ? "Finding your next game." : "Waiting for the next fixture."}</h2>
              <p>{syncing || !data ? "Your watchlist is coming together." : "Newly announced matches will appear after the next refresh."}</p>
            </div>}
          </section>

          <section className="card football-panel" aria-labelledby="football-title">
            <h2 id="football-title">Around the grounds</h2>
            <div className="segmented" role="group" aria-label="Competition">
              {(["pl", ...(data?.trophy.europa ? ["uel", "ucl"] : ["ucl", "uel"])] as Category[]).map(c => <button key={c} aria-pressed={footballTab === c} onClick={() => setFootballTab(c)}>{c.toUpperCase()}</button>)}
            </div>
            <div className="football-list">
              {football.slice(0, 3).map(e => <EventRow key={e.id} event={e} timezone={timezone} onOpen={setSelected} compact />)}
              {!football.length && <p className="quiet">{syncing || !data ? "Fetching the football calendar…" : "No other football fixtures announced in the next 30 days."}</p>}
            </div>
            <button className="text-link" onClick={() => { navigate("agenda", "football"); setDays(30); }}>All football <ArrowRight size={16} /></button>
          </section>
        </div>

        <div className="section-head"><h2>Beyond the pitch</h2></div>
        <div className="sport-cards">
          {sportCards.map(card => {
            const Icon = SPORT_ICONS[card.sport];
            return <button className="sport-card" data-sport={card.sport} key={card.sport} onClick={() => { navigate("agenda", card.sport); setDays(30); }}>
              <span className="sport-card-head"><span className="sport-icon"><Icon size={20} /></span><strong>{card.title}</strong><span className="count" title="Events in the next 30 days">{sportCounts(card.sport)}</span></span>
              <span className="sport-card-follow">{card.description}</span>
              <span className="sport-card-next">
                <small>Up next</small>
                <strong>{card.event ? card.event.sport === "f1" ? card.event.title.replace("Grand Prix", "GP") : card.event.title : data?.sources.find(s => s.id === "pandascore")?.status === "setup" && card.sport !== "f1" ? "Connect your esports feed" : syncing ? "Checking the schedule…" : "Awaiting the next schedule"}</strong>
                <span>{card.event ? `${formatDay(card.event, timezone)} · ${formatTime(card.event, timezone)}` : "We’ll save you a spot."}{card.event?.sport === "f1" && ` · ${card.event.stage}`}</span>
              </span>
            </button>;
          })}
        </div>
      </>}

      <section className="agenda" aria-labelledby="agenda-title">
        <div className="section-head">
          <h2 id="agenda-title">{heading.list}<span className="count">{filtered.length}</span></h2>
          {view !== "spurs" && view !== "results" && <div className="segmented" role="group" aria-label="Date range">
            {RANGES.map(option => <button key={option.value} aria-pressed={days === option.value} onClick={() => setDays(option.value)}>{option.label}</button>)}
          </div>}
        </div>
        <div className="agenda-controls">
          {view !== "spurs" && <div className="chips" role="group" aria-label="Filter by sport">
            <button className="chip" aria-pressed={sport === "all"} onClick={() => setSport("all")}>All</button>
            {(Object.keys(SPORT_NAMES) as Sport[]).map(key => <button className="chip" data-sport={key} key={key} aria-pressed={sport === key} onClick={() => setSport(key)}><span className="dot" />{SPORT_SHORT[key]}</button>)}
          </div>}
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a team or event" aria-label="Search schedules" />
            {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button>}
          </label>
        </div>
        <div className="agenda-list">
          {[...groups.entries()].map(([day, rows]) => <div className="day-group" key={day}>
            <h3 className="day-heading">{day === "tbc" ? "Date to be confirmed" : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}{day === today && <em>Today</em>}</h3>
            <div className="day-rows">{rows.map(event => <EventRow key={event.id} event={event} timezone={timezone} onOpen={setSelected} />)}</div>
          </div>)}
          {!filtered.length && <div className="empty">
            {syncing ? <LoaderCircle size={28} className="spin" /> : <CalendarDays size={28} />}
            <h3>{syncing ? "Getting your calendar ready" : query ? "No matches found" : view === "results" ? "No confirmed results in this window" : "A little breathing room"}</h3>
            <p>{syncing ? "Fixtures will appear as each source connects." : query ? "Try another team, tournament or competition." : sport === "cs2" ? "Only verified S-tier main-event matches appear here. Unconfirmed stages stay hidden." : "No matching events in this view. Try a longer date range or another sport."}</p>
            {!syncing && view !== "results" && view !== "spurs" && <button className="text-link" onClick={() => { setDays(30); setSport("all"); setQuery(""); }}>See the next 30 days <ArrowRight size={16} /></button>}
          </div>}
          {filtered.length > limit && <button className="load-more" onClick={() => setPagination({ key: filterKey, count: limit + 30 })}>Show {filtered.length - limit} more <ArrowDown size={18} /></button>}
        </div>
      </section>

      <footer className="page-footer">
        <span><Clock3 size={16} />All times in {isDefaultZone ? "Sri Lanka time (UTC+5:30)" : timezone.replaceAll("_", " ")}</span>
        <button onClick={() => setSettings(true)}>Spurs first. Unless the rules say otherwise. <strong>Your priorities <ArrowUpRight size={14} /></strong></button>
      </footer>
    </main>

    <dialog ref={dialog} className="sheet" onCancel={closeDialog} aria-label={settings ? "Preferences and sources" : selected?.title ?? "Event details"}>
      <div className="sheet-inner">
        <button className="sheet-close" aria-label="Close" onClick={closeDialog}><X size={20} /></button>
        {settings ? <>
          <p className="eyebrow">Preferences</p>
          <h2>Your kind of sport.</h2>
          <p className="sheet-intro">A watchlist with a very particular order.</p>
          <ol className="priority-list">{PRIORITIES.map((label, i) => <li key={label}><span>{String(i + 1).padStart(2, "0")}</span>{label}{i === 0 && <Star size={15} fill="currentColor" />}</li>)}</ol>
          <div className="callout">
            <Trophy size={22} />
            <div>
              <strong>The international exception</strong>
              <p>{data?.trophy.reason ?? "VCT internationals go first only when Spurs have no remaining trophy chance."}</p>
              {!!data?.trophy.competitions.length && <div className="trophy-chips">{data.trophy.competitions.map(c => <span key={c.name}>{c.name}: {c.state === "unknown" ? "unconfirmed" : c.state === "alive" ? "in contention" : c.state}</span>)}</div>}
            </div>
          </div>
          <label className="field">Display timezone
            <select value={timezone} onChange={e => saveDeviceTimezone(e.target.value)}><option value="Asia/Colombo">Sri Lanka · UTC+5:30</option><option value="Europe/London">London · UK time</option><option value="UTC">UTC</option></select>
          </label>
          <h3 className="sheet-subtitle">Data sources</h3>
          <div className="sources">{data?.sources.map(source => <div className="source" key={source.id}>
            <div className="source-head"><span className="source-dot" data-status={source.status} /><strong>{source.name}</strong><span>{source.status === "setup" ? "Setup needed" : source.status === "ready" ? "Connected" : source.status}</span></div>
            <p>{source.message ?? (source.lastSuccess ? `Last updated ${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(source.lastSuccess))}` : "Waiting for the first update.")}</p>
            {source.id === "pandascore" && source.status === "setup" && <a className="text-link" href="https://app.pandascore.co/" target="_blank" rel="noreferrer">Get a free PandaScore token <ExternalLink size={14} /></a>}
          </div>)}</div>
          <p className="fine-print">Schedules refresh while Skedy is open. Final results can arrive after an event ends. CS2 selections follow a curated Liquipedia list, reviewed {data?.catalogueUpdatedAt ?? "2026-09-10"}.</p>
        </> : selected && <>
          <Badge sport={selected.sport} />
          <h2>{selected.title}</h2>
          <p className="sheet-intro">{selected.competition} · {selected.stage}</p>
          {selected.participants.length > 0 && <div className="detail-teams">{selected.participants.map(p => <div key={p.id}><Logo src={p.logo} name={p.name} /><strong>{p.name}</strong>{selected.status === "completed" && <span className="detail-score">{p.score ?? "–"}</span>}</div>)}</div>}
          <ul className="facts">
            <li><CalendarDays size={18} />{formatDay(selected, timezone)}</li>
            <li><Clock3 size={18} />{formatTime(selected, timezone)} · {timezone.replaceAll("_", " ")}</li>
            {selected.venue && <li><MapPin size={18} />{selected.venue}</li>}
            <li><Radio size={18} /><span className="capitalize">{selected.status.replaceAll("_", " ")}</span></li>
          </ul>
          {selected.resultLines && <div className="classification"><h3 className="sheet-subtitle">Final classification</h3>{selected.resultLines.map(line => <div className={line.favorite ? "favorite" : ""} key={`${line.position}:${line.name}`}><span>{line.position}</span><strong>{line.name}<small>{line.team}</small></strong><span>{line.detail}</span></div>)}</div>}
          {selected.priorityReason && <div className="callout"><Star size={18} fill="currentColor" /><p>{selected.priorityReason}</p></div>}
          <a className="primary-action" href={selected.sourceUrl} target="_blank" rel="noreferrer">View event source <ArrowUpRight size={18} /></a>
          <p className="fine-print">Start times can change. Refresh for the latest published schedule.</p>
        </>}
      </div>
    </dialog>
  </div>;
}
