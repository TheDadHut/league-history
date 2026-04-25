// ===================================================================
// Founders tab
// ===================================================================
//
// Inaugural-season roster card grid. Loads every season's users on
// mount so cross-season owner colors stay stable (the same person
// always gets the same color across tabs).
//
// Mirrors the markup of `renderFounders()` (index.html lines 2956-2967)
// and the visual treatment of `.founders-grid` / `.founder-card`
// (index.html lines 216-219), minus the unsafe innerHTML.

import { useEffect, useState } from 'react';
import { CURRENT_LEAGUE_ID } from '../../config';
import { walkPreviousLeagues } from '../../lib/history';
import { getUsers } from '../../lib/sleeper';
import { buildOwnerIndex } from '../../lib/owners';
import { selectFounders, type FounderEntry } from '../../lib/stats/founders';
import type { League, User } from '../../types/sleeper';
import styles from './Founders.module.css';

type LeagueWithUsers = League & { users: User[] };

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; founders: FounderEntry[] };

export default function Founders() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const leagues = await walkPreviousLeagues(CURRENT_LEAGUE_ID);
        if (cancelled) return;

        // Founders only needs users per season; skip rosters/matchups.
        // Pair each league with its users in a single zip so we never have
        // to align two parallel arrays by index after the await.
        const enriched: LeagueWithUsers[] = await Promise.all(
          leagues.map(async (league) => {
            const users = await getUsers(league.league_id);
            return { ...league, users };
          }),
        );
        if (cancelled) return;

        const ownerIndex = buildOwnerIndex(enriched);
        const founders = selectFounders(enriched, ownerIndex);

        if (!founders) {
          setState({ status: 'error', message: 'Inaugural season not found.' });
          return;
        }
        setState({ status: 'ready', founders });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error loading founders.';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.section} aria-labelledby="founders-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="founders-heading" className={styles.sectionTitle}>
          The Founding Fathers
        </h2>
        <span className={styles.countPill}>Inaugural Season</span>
      </header>

      {state.status === 'loading' && <p className={styles.status}>Loading…</p>}

      {state.status === 'error' && (
        <p className={`${styles.status} ${styles.error}`} role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <div className={styles.grid}>
          {state.founders.map((f) => (
            <article key={f.key} className={styles.card} style={{ borderTopColor: f.color }}>
              <div className={styles.name}>{f.displayName}</div>
              <div className={styles.team} style={{ color: f.color }}>
                {f.teamName}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
