"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, CheckCheck, ChevronRight, CircleHelp, Clock3, ExternalLink, Flag, LayoutGrid, ListFilter, LoaderCircle, MapPin, Radio, RefreshCw, Search, Settings2, Shield, Star, Trophy, X, Zap, Gamepad2 } from "lucide-react";
import type { Category, ScheduleEvent, ScheduleResponse, Sport } from "../lib/types";
import { DEFAULT_TIMEZONE } from "../lib/types";
import { dateOffset, footballSeason, localDate, withinDates } from "../lib/time";
import { spotlight } from "../lib/priorities";
import { refreshBrowserFootball } from "../lib/browser-football";
import { useDeviceTimezone, saveDeviceTimezone } from "../lib/device-timezone";

type View = "overview" | "agenda" | "spurs" | "results";
const SPORT_NAMES: Record<Sport, string> = { football: "Football", f1: "Formula 1", valorant: "VALORANT", cs2: "Counter-Strike 2" };
const CATEGORY_NAMES: Record<Category, string> = { spurs: "Tottenham", pl: "Premier League", ucl: "Champions League", uel: "Europa League", football: "Football", f1: "Formula 1", vct_international: "VCT International", vct_americas: "VCT Americas", vct_pacific: "VCT Pacific", vct_emea: "VCT EMEA", vct_china: "VCT China", cs2: "S-tier CS2" };
const NAV = [{ key: "overview", label: "Overview", Icon: LayoutGrid }, { key: "agenda", label: "My agenda", Icon: CalendarDays }, { key: "spurs", label: "Spurs season", Icon: Shield }, { key: "results", label: "Results", Icon: CheckCheck }] as const;

function Badge({ sport, small = false }: { sport: Sport; small?: boolean }) {
  const Icon = sport === "football" ? Shield : sport === "f1" ? Flag : sport === "valorant" ? Zap : Gamepad2;
  return <span className={`sport-badge ${sport} ${small ? "small" : ""}`}><Icon size={small ? 13 : 16} />{SPORT_NAMES[sport]}</span>;
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
  const agendaRef = useRef<HTMLElement>(null);

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
      const outcomes = await Promise.allSettled([
        (async () => { const response = await fetch(`/api/sync${force ? "?force=1" : ""}`, { method: "POST" }); if (!response.ok) throw new Error("Refresh is unavailable. Your saved schedule is still here."); })(),
        refreshBrowserFootball(force),
      ]);
      const response = await fetch("/api/schedule");
      if (response.ok) setData(await response.json());
      const failed = outcomes.find(r => r.status === "rejected");
      setError(failed ? "Some schedules couldn’t refresh. Your saved fixtures are still here." : null);
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

  function EventRow({ event, compact = false }: { event: ScheduleEvent; compact?: boolean }) {
    const isSpurs = event.category === "spurs";
    return <button className={`event-row ${compact ? "compact" : ""} ${isSpurs ? "spurs-row" : ""}`} onClick={() => setSelected(event)}>
      <div className="event-time"><strong>{formatTime(event, timezone)}</strong><span>{event.status === "completed" ? "FINAL" : event.status === "in_progress" ? "IN PROGRESS" : event.status === "postponed" ? "POSTPONED" : compact ? formatDay(event, timezone, { month: "short", day: "numeric" }) : timezone === DEFAULT_TIMEZONE ? "SLST" : "LOCAL"}</span></div>
      <div className={`event-mark ${event.sport}`}>{event.participants[0] ? <div className="paired-logos"><Logo src={event.participants[0]?.logo} name={event.participants[0]?.name ?? "TBC"} />{event.participants[1] && <Logo src={event.participants[1].logo} name={event.participants[1].name} />}</div> : event.sport === "f1" ? <Flag size={22} /> : <Gamepad2 size={22} />}</div>
      <div className="event-copy"><strong>{event.title}{isSpurs && <Star size={12} fill="currentColor" />}</strong><span>{event.competition}{event.stage && !event.stage.includes("Premier League") ? ` · ${event.stage}` : ""}</span></div>
      {event.result ? <span className="event-result">{event.result}</span> : !compact && <span className={`category-pill ${event.sport}`}>{isSpurs ? "DON’T MISS" : event.sport === "f1" ? event.stage : CATEGORY_NAMES[event.category]}</span>}
      <ChevronRight size={16} className="row-arrow" />
    </button>;
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to schedule</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("overview")} aria-label="Skedy home"><span className="brand-mark">s<span /></span>skedy<span className="brand-dot">.</span></button>
      <div className="sidebar-label">YOUR SPACE</div>
      <nav aria-label="Main navigation">{NAV.map(({ key, label, Icon }) => <button key={key} className={`nav-item ${view === key ? "active" : ""}`} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={18} />{label}{key === "spurs" && <span className="nav-star">★</span>}</button>)}</nav>
      <div className="sidebar-label following-label">IN YOUR CORNER</div>
      <div className="following-list"><button onClick={() => navigate("spurs")}><span className="following-dot football" />Tottenham Hotspur<Star size={12} /></button><button onClick={() => navigate("agenda", "f1")}><span className="following-dot f1" />McLaren & Lando<span className="driver-number">LN</span></button><button onClick={() => navigate("agenda", "valorant")}><span className="following-dot valorant" />VALORANT Champions Tour</button><button onClick={() => navigate("agenda", "cs2")}><span className="following-dot cs2" />S-tier Counter-Strike</button></div>
      <div className="sidebar-bottom"><div className="personal-note"><span className="tiny-eyebrow">THE RULE IS SIMPLE</span><p>More of your sport.<br />Less of everything else.</p><span className="note-lines" /></div><button className="settings-link" onClick={() => setSettings(true)}><Settings2 size={18} />Preferences & sources</button><div className="profile"><span>L</span><div><strong>Lahiru’s watchlist</strong><small>Just your kind of sport</small></div><span className="profile-online" /></div></div>
    </aside>

    <div className="main-wrap"><header className="topbar"><div className="breadcrumb">My workspace <ChevronRight size={13} /><strong>{NAV.find(n => n.key === view)?.label}</strong></div><div className="topbar-right"><span className="timezone"><span />{timezone === DEFAULT_TIMEZONE ? "Sri Lanka" : timezone.split("/").at(-1)?.replaceAll("_", " ")}<span className="timezone-offset">{new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(now).find(p => p.type === "timeZoneName")?.value}</span></span><button className={`refresh-button ${syncing ? "is-syncing" : ""}`} onClick={() => refresh(true)} disabled={syncing} aria-label="Refresh schedules"><RefreshCw size={15} /><span>{syncing ? "Syncing" : "Refresh"}</span></button></div></header>
    <main id="main-content">
      <section className="page-heading"><div><div className="eyebrow">{new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</div><h1>{view === "overview" ? "Your watchlist." : view === "agenda" ? "Make time for the game." : view === "spurs" ? "Every game. All Spurs." : "How it played out."}<span className="heading-dot" /></h1><p>{view === "overview" ? "The games you care about. All in one place." : view === "agenda" ? "A little less searching. A lot more watching." : view === "spurs" ? "League, cups, Europe and friendlies. Nothing left out." : "Confirmed final results from the last seven days."}</p></div><div className="heading-status"><span className={syncing ? "pulse-dot" : "status-dot"} />{syncing ? "Updating your watchlist" : `${sourcesReady} of 3 sources connected`}<button aria-label="View data sources" onClick={() => setSettings(true)}><CircleHelp size={14} /></button></div></section>
      {error && <div className="notice" role="alert">{error}<button onClick={() => refresh(true)}>Try again <ArrowRight size={14} /></button></div>}
      {data?.sources.some(s => s.status === "error") && <div className="notice source-notice"><Radio size={16} /><span>Some feeds couldn’t refresh. Your last saved fixtures are still here.</span><button onClick={() => setSettings(true)}>View sources</button></div>}

      {view === "overview" && <>
        <div className="spotlight-grid"><section className={`spotlight-card ${feature?.sport ?? "football"}`} aria-label="Priority event"><div className="spotlight-texture" /><div className="spotlight-top"><span className="spotlight-label"><Star size={13} fill="currentColor" />{feature?.category === "spurs" ? "YOUR NO. 1" : "IN THE SPOTLIGHT"}</span><span className="spotlight-competition">{feature?.competition ?? "TOTTENHAM HOTSPUR"}</span></div>
          {feature ? <><div className="spotlight-content"><div className="hero-kicker">{feature.category === "spurs" ? "COME ON YOU SPURS" : feature.sport === "f1" ? "LIGHTS OUT. EYES ON LANDO." : "CLEAR YOUR CALENDAR"}</div><h2>{feature.participants.length >= 2 ? <>{feature.participants[0].shortName}<span className="hero-versus">vs</span>{feature.participants[1].shortName}</> : feature.title}</h2><div className="hero-meta"><span><CalendarDays size={15} />{formatDay(feature, timezone)}</span><span><Clock3 size={15} />{formatTime(feature, timezone)} {timezone === DEFAULT_TIMEZONE ? "SLST" : "local"}</span></div>{feature.venue && <div className="hero-venue"><MapPin size={14} />{feature.venue}</div>}</div><div className="hero-art" aria-hidden="true">{feature.category === "spurs" ? <><span className="hero-ring ring-one" /><span className="hero-ring ring-two" /><Logo src={feature.participants.find(p => p.id === "367")?.logo ?? "https://a.espncdn.com/i/teamlogos/soccer/500/367.png"} name="Tottenham Hotspur" /><span className="coys">COYS</span></> : feature.sport === "f1" ? <Flag size={150} strokeWidth={1} /> : <Trophy size={150} strokeWidth={1} />}</div><div className="spotlight-footer"><span><span className="live-dot" />{countdown(feature, now)}</span><button onClick={() => setSelected(feature)}>Match details <ArrowUpRight size={17} /></button></div></> : <div className="spotlight-empty"><Shield size={50} strokeWidth={1} /><h2>{syncing || !data ? "Finding your next game." : "Waiting for the next fixture."}</h2><p>{syncing || !data ? "Your watchlist is coming together." : "Newly announced matches will appear after the next refresh."}</p></div>}
        </section>
        <section className="football-panel"><div className="panel-title"><span className="tiny-eyebrow">ALSO ON THE PITCH</span><Shield size={16} aria-hidden="true" /></div><h2>Around the grounds<span>.</span></h2><div className="competition-tabs">{(["pl", ...(data?.trophy.europa ? ["uel", "ucl"] : ["ucl", "uel"])] as Category[]).map(c => <button key={c} className={footballTab === c ? "selected" : ""} aria-pressed={footballTab === c} onClick={() => setFootballTab(c)}>{c.toUpperCase()}</button>)}</div><div className="football-mini-list">{football.slice(0, 3).map(e => <EventRow key={e.id} event={e} compact />)}{!football.length && <p className="quiet-empty">{syncing || !data ? "Fetching the football calendar…" : "No other football fixtures announced in the next 30 days."}</p>}</div><button className="text-action" onClick={() => { navigate("agenda", "football"); setDays(30); }}>All football <ArrowRight size={15} /></button></section></div>

        <div className="section-line"><h2>Beyond the pitch</h2><span>YOUR OTHER MUST-WATCHES</span></div>
        <div className="sport-cards">{([{ sport: "f1", kicker: "PAPAYA, ALL THE WAY", title: "Formula 1", event: nextF1, description: "McLaren & Lando Norris", Icon: Flag }, { sport: "valorant", kicker: "THE WORLD IS WATCHING", title: "VCT", event: nextVct, description: "Internationals → your regions", Icon: Zap }, { sport: "cs2", kicker: "ONLY THE BIG STAGE", title: "Counter-Strike 2", event: nextCs, description: "S-tier. No play-ins. No qualifiers.", Icon: Gamepad2 }] as const).map(card => <button className={`sport-card ${card.sport}`} key={card.sport} onClick={() => { navigate("agenda", card.sport); setDays(30); }}><div className="sport-card-top"><span className="tiny-eyebrow">{card.kicker}</span><ArrowUpRight size={17} /></div><div className="sport-card-title"><card.Icon size={25} /><h3>{card.title}</h3><span>{sportCounts(card.sport)}</span></div><p className="sport-follow">{card.description}</p><div className="sport-card-divider" /><div className="sport-card-bottom"><span className="card-next-label">UP NEXT</span><strong>{card.event ? card.event.sport === "f1" ? card.event.title.replace("Grand Prix", "GP") : card.event.title : data?.sources.find(s => s.id === "pandascore")?.status === "setup" && card.sport !== "f1" ? "Connect your esports feed" : syncing ? "Checking the schedule…" : "Awaiting the next schedule"}</strong><span className="next-event-date">{card.event ? `${formatDay(card.event, timezone)} · ${formatTime(card.event, timezone)}` : "We’ll save you a spot."}{card.event?.sport === "f1" && <em>{card.event.stage}</em>}</span></div></button>)}</div>
      </>}

      <section className="agenda-section" ref={agendaRef} aria-label="Schedule"><div className="agenda-heading"><div><h2>{view === "results" ? "The final word" : view === "spurs" ? "The season ahead — and so far" : "On your calendar"}<span>{filtered.length}</span></h2>{view === "overview" && <p>All your sport, in start-time order.</p>}</div>{view !== "spurs" && view !== "results" && <div className="date-switch" aria-label="Date range">{[{ value: 1, label: "Today" }, { value: 7, label: "Next 7 days" }, { value: 30, label: "Next 30 days" }].map(option => <button key={option.value} className={days === option.value ? "active" : ""} onClick={() => setDays(option.value)} aria-pressed={days === option.value}>{option.label}</button>)}</div>}</div>
        <div className="agenda-controls">{view !== "spurs" && <div className="sport-filters" aria-label="Filter by sport"><button className={sport === "all" ? "active" : ""} onClick={() => setSport("all")}><ListFilter size={13} />All sports</button>{Object.entries(SPORT_NAMES).map(([key, name]) => <button className={sport === key ? `active ${key}` : key} key={key} onClick={() => setSport(key as Sport)}><span className={`filter-dot ${key}`} />{name === "Counter-Strike 2" ? "CS2" : name}</button>)}</div>}<label className="search-field"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a team or event" aria-label="Search schedules" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}</label></div>
        <div className="agenda-list">{[...groups.entries()].map(([day, rows]) => <div className="day-group" key={day}><div className="day-heading"><span>{day === "tbc" ? "DATE TO BE CONFIRMED" : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</span>{day === today && <em>TODAY</em>}<span className="day-rule" /></div>{rows.map(event => <EventRow key={event.id} event={event} />)}</div>)}
        {!filtered.length && <div className="agenda-empty">{syncing ? <LoaderCircle size={28} className="spin" /> : <CalendarDays size={30} strokeWidth={1.4} />}<h3>{syncing ? "Getting your calendar ready" : query ? "No matches found" : view === "results" ? "No confirmed results in this window" : "A little breathing room"}</h3><p>{syncing ? "Fixtures will appear as each source connects." : query ? "Try another team, tournament or competition." : sport === "cs2" ? "Only verified S-tier main-event matches appear here. Unconfirmed stages stay hidden." : "No matching events in this view. Try a longer date range or another sport."}</p>{!syncing && view !== "results" && view !== "spurs" && <button className="text-action" onClick={() => { setDays(30); setSport("all"); setQuery(""); }}>See the next 30 days <ArrowRight size={15} /></button>}</div>}
        {filtered.length > limit && <button className="load-more" onClick={() => setPagination({ key: filterKey, count: limit + 30 })}>Show more events <ArrowDown size={15} /><span>{filtered.length - limit} more</span></button>}</div>
      </section>
      <footer className="page-footer"><span><Clock3 size={13} />All times in {timezone === DEFAULT_TIMEZONE ? "Sri Lanka time (UTC+5:30)" : timezone.replaceAll("_", " ")}</span><span>Spurs first. Unless the rules say otherwise.<button onClick={() => setSettings(true)}>Your priorities <ArrowUpRight size={12} /></button></span></footer>
    </main></div>

    <dialog ref={dialog} className="detail-dialog" onCancel={() => { setSelected(null); setSettings(false); }} aria-label={settings ? "Preferences and sources" : selected?.title ?? "Event details"}><div className="dialog-inner"><button className="dialog-close" aria-label="Close details" onClick={() => { setSelected(null); setSettings(false); }}><X size={20} /></button>
      {settings ? <><div className="eyebrow">MADE FOR YOU</div><h2>Your kind of sport.</h2><p className="dialog-intro">A watchlist with a very particular order.</p><div className="priority-list">{["Every Tottenham game", "Premier League & European football", "F1 · McLaren & Lando Norris", "VCT internationals", "Americas → Pacific → EMEA → China", "Liquipedia S-tier Counter-Strike"].map((label, i) => <div key={label}><span>{String(i + 1).padStart(2, "0")}</span><strong>{label}</strong>{i === 0 && <Star size={14} />}</div>)}</div><div className="trophy-note"><Trophy size={20} /><div><strong>The international exception</strong><p>{data?.trophy.reason ?? "VCT internationals go first only when Spurs have no remaining trophy chance."}</p>{data?.trophy.competitions.map(c => <span className="trophy-chip" key={c.name}>{c.name}: {c.state === "unknown" ? "unconfirmed" : c.state === "alive" ? "in contention" : c.state}</span>)}</div></div><label className="timezone-setting">Display timezone<select value={timezone} onChange={e => saveDeviceTimezone(e.target.value)}><option value="Asia/Colombo">Sri Lanka · UTC+5:30</option><option value="Europe/London">London · UK time</option><option value="UTC">UTC</option></select></label><h3 className="source-title">Your data sources</h3>{data?.sources.map(source => <div className="source-item" key={source.id}><div><span className={`source-dot ${source.status}`} /><strong>{source.name}</strong><span className="source-state">{source.status === "setup" ? "Setup needed" : source.status === "ready" ? "Connected" : source.status}</span></div><p>{source.message ?? (source.lastSuccess ? `Last updated ${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(source.lastSuccess))}` : "Waiting for the first update.")}</p>{source.id === "pandascore" && source.status === "setup" && <a href="https://app.pandascore.co/" target="_blank" rel="noreferrer">Get a free PandaScore token <ExternalLink size={12} /></a>}</div>)}<p className="fine-print">Schedules refresh while Skedy is open. Final results can arrive after an event ends. CS2 selections follow a curated Liquipedia list, reviewed {data?.catalogueUpdatedAt ?? "2026-09-10"}.</p></> : selected && <><Badge sport={selected.sport} /><h2 className="detail-title">{selected.title}</h2><p className="dialog-intro">{selected.competition} · {selected.stage}</p>{selected.participants.length > 0 && <div className="detail-teams">{selected.participants.map(p => <div key={p.id}><Logo src={p.logo} name={p.name} /><strong>{p.name}</strong>{selected.status === "completed" && <span className="detail-score">{p.score ?? "–"}</span>}</div>)}</div>}<div className="detail-facts"><div><CalendarDays size={17} /><span>{formatDay(selected, timezone)}</span></div><div><Clock3 size={17} /><span>{formatTime(selected, timezone)} · {timezone.replaceAll("_", " ")}</span></div>{selected.venue && <div><MapPin size={17} /><span>{selected.venue}</span></div>}<div><Radio size={17} /><span>{selected.status.replaceAll("_", " ")}</span></div></div>{selected.resultLines && <div className="classification"><h3>Final classification</h3>{selected.resultLines.map(line => <div className={line.favorite ? "favorite-driver" : ""} key={`${line.position}:${line.name}`}><span>{line.position}</span><strong>{line.name}<small>{line.team}</small></strong><span>{line.detail}</span>{line.favorite && <Star size={12} />}</div>)}</div>}{selected.priorityReason && <div className="detail-priority"><Star size={15} /><p>{selected.priorityReason}</p></div>}<a className="primary-action" href={selected.sourceUrl} target="_blank" rel="noreferrer">View event source <ArrowUpRight size={17} /></a><p className="fine-print">Start times can change. Refresh for the latest published schedule.</p></>}
    </div></dialog>
  </div>;
}
