import Dashboard from "./dashboard";
export default function Home() { return <Dashboard initialNow={new Date().toISOString()} />; }
