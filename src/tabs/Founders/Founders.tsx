// ===================================================================
// Founders tab
// ===================================================================
//
// Inaugural-season roster card grid. Reads the shared league data
// (history walk + users per season + owner index) from the
// `LeagueDataProvider` at the app shell, so cross-season owner colors
// stay stable without re-walking history per tab.
//
// Mirrors the markup of `renderFounders()` (index.html lines 2956-2967)
// and the visual treatment of `.founders-grid` / `.founder-card`
// (index.html lines 216-219), minus the unsafe innerHTML.

import { useLeagueData } from '../../lib/leagueData';
import { selectFounders } from '../../lib/stats/founders';
import styles from './Founders.module.css';

export default function Founders() {
  const state = useLeagueData();

  return (
    <section className={styles.section} aria-labelledby="founders-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="founders-heading" className={styles.sectionTitle}>
          The Founding Fathers
        </h2>
        <span className={styles.countPill}>INAUGURAL SEASON</span>
      </header>

      {state.status === 'loading' && <p className={styles.status}>Loading…</p>}

      {state.status === 'error' && (
        <p className={`${styles.status} ${styles.error}`} role="alert">
          {state.message}
        </p>
      )}

      {(state.status === 'core-ready' ||
        state.status === 'seasons-ready' ||
        state.status === 'ready') &&
        (() => {
          const founders = selectFounders(state.leagues, state.ownerIndex);
          if (!founders) {
            return (
              <p className={`${styles.status} ${styles.error}`} role="alert">
                Inaugural season not found.
              </p>
            );
          }
          return (
            <div className={styles.grid}>
              {founders.map((f) => (
                <article key={f.key} className={styles.card} style={{ borderTopColor: f.color }}>
                  <div className={styles.name}>{f.displayName}</div>
                  <div className={styles.team} style={{ color: f.color }}>
                    {f.teamName}
                  </div>
                </article>
              ))}
            </div>
          );
        })()}
    </section>
  );
}
