import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LeagueDataProvider } from './lib/leagueData';
import './App.css';

// Each tab is dynamically imported so Vite emits its own chunk; per the
// migration plan, every tab should be code-split on its own boundary.
const Founders = lazy(() => import('./tabs/Founders/Founders'));

interface TabDef {
  /** Hash-router path (no leading slash). */
  path: string;
  /** Label shown in the nav bar. */
  label: string;
}

// Order mirrors the legacy site's tab nav (index.html lines 332-343).
// Tabs are added here as they're ported in Phase 3.
const TABS: readonly TabDef[] = [{ path: 'founders', label: 'Founders' }] as const;

function App() {
  return (
    <div className="app-shell">
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
        <LeagueDataProvider>
          <Suspense fallback={<p className="app-suspense">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/founders" replace />} />
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
