import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LeagueDataProvider } from './lib/leagueData';
import { BroadcastBar } from './lib/components/BroadcastBar';
import { DebugOverlay } from './lib/components/DebugOverlay';
import './App.css';

// Each tab is dynamically imported so Vite emits its own chunk; per the
// migration plan, every tab should be code-split on its own boundary.
const Overview = lazy(() => import('./tabs/Overview/Overview'));
const Records = lazy(() => import('./tabs/Records/Records'));
const HeadToHead = lazy(() => import('./tabs/HeadToHead/HeadToHead'));
const Seasons = lazy(() => import('./tabs/Seasons/Seasons'));
const FunStats = lazy(() => import('./tabs/FunStats/FunStats'));
const Luck = lazy(() => import('./tabs/Luck/Luck'));
const PowerRankings = lazy(() => import('./tabs/PowerRankings/PowerRankings'));
const Trades = lazy(() => import('./tabs/Trades/Trades'));
const Owners = lazy(() => import('./tabs/Owners/Owners'));
const Founders = lazy(() => import('./tabs/Founders/Founders'));

interface TabDef {
  /** Hash-router path (no leading slash). */
  path: string;
  /** Label shown in the nav bar. */
  label: string;
}

// Order matches the legacy nav (index.html lines 332-343), with the
// new Power Rankings tab inserted between Luck & Streaks and Trades:
// it shares the all-play foundation with Luck and reads as the natural
// continuation of that section.
const TABS: readonly TabDef[] = [
  { path: 'overview', label: 'Overview' },
  { path: 'records', label: 'Records' },
  { path: 'head-to-head', label: 'Head-to-Head' },
  { path: 'seasons', label: 'Seasons' },
  { path: 'fun-stats', label: 'Fun Stats' },
  { path: 'luck', label: 'Luck & Streaks' },
  { path: 'power-rankings', label: 'Power Rankings' },
  { path: 'trades', label: 'Trades' },
  { path: 'owners', label: 'Owner Stats' },
  { path: 'founders', label: 'Founders' },
];

function App() {
  // `<LeagueDataProvider>` wraps the whole shell now: the broadcast
  // ticker reads champions / matchups / standings from the same
  // context the tabs do, so it has to live inside a provider. The
  // legacy `renderTicker()` ran off the same `state` object every
  // tab consumed; this hoist preserves that single-source-of-truth
  // shape. Shell chrome (header, tabs nav, footer) doesn't read the
  // context, but adding a provider one level up costs nothing.
  return (
    <div className="app-shell">
      <LeagueDataProvider>
        <BroadcastBar />

        {/* TODO: logo-mark and subtitle (with current season) deferred — port when a tab consumes league data at the shell level. */}
        <header className="app-header">
          <div className="app-header-inner">
            <span className="app-kicker">Gaming Disability League</span>
            <h1 className="app-title">
              GDL <span className="app-title-accent">HISTORY</span>
            </h1>
          </div>
        </header>

        <nav className="app-tabs" aria-label="Sections">
          <div className="app-tabs-inner">
            {TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/${tab.path}`}
                className={({ isActive }) => `app-tab${isActive ? ' app-tab-active' : ''}`}
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="app-main">
          <Suspense fallback={<p className="app-suspense">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/records" element={<Records />} />
              <Route path="/head-to-head" element={<HeadToHead />} />
              <Route path="/seasons" element={<Seasons />} />
              <Route path="/fun-stats" element={<FunStats />} />
              <Route path="/luck" element={<Luck />} />
              <Route path="/power-rankings" element={<PowerRankings />} />
              <Route path="/trades" element={<Trades />} />
              <Route path="/owners" element={<Owners />} />
              <Route path="/founders" element={<Founders />} />
            </Routes>
          </Suspense>
        </main>

        <footer className="app-footer">Gaming Disability League · Powered by Sleeper API</footer>

        {/* Mounted inside the provider so it can read the owner
         * index. Renders nothing until the user hits Ctrl+Shift+D. */}
        <DebugOverlay />
      </LeagueDataProvider>
    </div>
  );
}

export default App;
