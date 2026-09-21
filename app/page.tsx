import Dashboard from "./dashboard";
// Render per request so the dashboard starts from the current time, not the build time.
export const dynamic = "force-dynamic";
export default function Home() { return <Dashboard initialNow={new Date().toISOString()} />; }
