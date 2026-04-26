import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LeagueDataProvider } from './lib/leagueData';
import './App.css';

// Each tab is dynamically imported so Vite emits its own chunk; per the
// migration plan, every tab should be code-split on its own boundary.
const Overview = lazy(() => import('./tabs/Overview/Overview'));
const Records = lazy(() => import('./tabs/Records/Records'));
const HeadToHead = lazy(() => import('./tabs/HeadToHead/HeadToHead'));
const Seasons = lazy(() => import('./tabs/Seasons/Seasons'));
const FunStats = lazy(() => import('./tabs/FunStats/FunStats'));
const Trades = lazy(() => import('./tabs/Trades/Trades'));
const Founders = lazy(() => import('./tabs/Founders/Founders'));

interface TabDef {
  /** Hash-router path (no leading slash). */
  path: string;
  /** Label shown in the nav bar. */
  label: string;
}

// Final order should match the legacy nav (index.html lines 332-343):
// Overview -> Records -> Head-to-Head -> Seasons -> Fun Stats -> Luck & Streaks -> Trades -> Owner Stats -> Founders.
// Tabs are added in migration order today and will be reordered before the Phase 5 cutover.
const TABS: readonly TabDef[] = [
  { path: 'overview', label: 'Overview' },
  { path: 'records', label: 'Records' },
  { path: 'head-to-head', label: 'Head-to-Head' },
  { path: 'seasons', label: 'Seasons' },
  { path: 'fun-stats', label: 'Fun Stats' },
  { path: 'trades', label: 'Trades' },
  { path: 'founders', label: 'Founders' },
];

function App() {
  return (
    <div className="app-shell">
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
        {/* Inside <main>: only tab content needs league data; shell chrome doesn't. */}
        <LeagueDataProvider>
          <Suspense fallback={<p className="app-suspense">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/records" element={<Records />} />
              <Route path="/head-to-head" element={<HeadToHead />} />
              <Route path="/seasons" element={<Seasons />} />
              <Route path="/fun-stats" element={<FunStats />} />
              <Route path="/trades" element={<Trades />} />
              <Route path="/founders" element={<Founders />} />
            </Routes>
          </Suspense>
        </LeagueDataProvider>
      </main>

      <footer className="app-footer">
        Gaming Disability League · Powered by Sleeper API
      </footer>
    </div>
  );
}

export default App;
