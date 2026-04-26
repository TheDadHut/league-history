// ===================================================================
// Fun Stats tab
// ===================================================================
//
// Eleven leaderboards / cards mirroring the legacy `#fun` panel
// (index.html lines 419-505 markup, lines 2111-2353 logic):
//
//   1. Biggest Blowouts             — Top 5 by score margin (desc).
//   2. Closest Games                — Top 5 by score margin (asc, > 0).
//   3. Hard Luck Losses             — Top 5 highest losing scores.
//   4. Lucky Wins                   — Top 5 lowest winning scores.
//   5. Biggest Rivalry              — Most-contested all-time pair.
//   6. Most Consistent Teams        — Top 5 lowest σ (≥ 5 games).
//   7. Most Volatile Teams          — Top 5 highest σ (≥ 5 games).
//   8. Clutch Index                 — Record in games decided by < 10.
//   9. Blowout Record               — Record in games decided by ≥ 30.
//   10. Points Missed by Benching   — Optimal-vs-actual lineup gap.
//   11. Shoulda Started Him         — Top 10 single-mistake decisions.
//
// Reads from the shared `LeagueDataProvider`. The bench-stats
// sections (#10, #11) need the Sleeper player DB so the optimal-lineup
// pass can resolve player positions; the rest could technically render
// at `seasons-ready`, but waiting for `ready` keeps the tab from
// painting half-empty and then popping in two more cards a few
// hundred ms later. Pure stat selectors live in
// `app/src/lib/stats/funstats.ts`; this file is composition + markup
// only.

import { useMemo } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import {
  selectBenchStats,
  selectBiggestBlowouts,
  selectBiggestRivalry,
  selectCloseGameTables,
  selectClosestGames,
  selectConsistencyTables,
  selectHardLuckLosses,
  selectLuckyWins,
} from '../../lib/stats/funstats';
import BenchTotalsTable from './BenchTotalsTable';
import CloseGameTable from './CloseGameTable';
import ConsistencyTable from './ConsistencyTable';
import MarginTable from './MarginTable';
import RivalryCard from './RivalryCard';
import ScoreTable from './ScoreTable';
import ShouldaStartedTable from './ShouldaStartedTable';
import styles from './FunStats.module.css';

export default function FunStats() {
  const state = useLeagueData();

  // The bench-stats sections need the Sleeper player DB to resolve
  // player positions during the optimal-lineup pass. Wait for the
  // terminal `ready` tier so the whole tab paints in one go rather
  // than having two cards pop in late.
  if (
    state.status === 'loading' ||
    state.status === 'core-ready' ||
    state.status === 'seasons-ready'
  ) {
    return (
      <section className={styles.section} aria-busy="true">
        <p className={styles.status}>Loading…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={styles.section}>
        <p className={`${styles.status} ${styles.error}`} role="alert">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <FunStatsReady
      seasons={state.seasons}
      ownerIndex={state.ownerIndex}
      players={state.players}
    />
  );
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface FunStatsReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

function FunStatsReady({ seasons, ownerIndex, players }: FunStatsReadyProps) {
  // Each selector is pure — memoize against the provider state so
  // unrelated re-renders don't re-walk the full matchup history.
  const blowouts = useMemo(
    () => selectBiggestBlowouts(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const closest = useMemo(
    () => selectClosestGames(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const hardluck = useMemo(
    () => selectHardLuckLosses(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const lucky = useMemo(
    () => selectLuckyWins(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const rivalry = useMemo(
    () => selectBiggestRivalry(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const consistency = useMemo(
    () => selectConsistencyTables(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const closeGames = useMemo(
    () => selectCloseGameTables(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const bench = useMemo(
    () => selectBenchStats(seasons, ownerIndex, players),
    [seasons, ownerIndex, players],
  );

  return (
    <>
      <SectionHeader title="Biggest Blowouts" countLabel="TOP 5" barClass={styles.barRed} />
      <MarginTable rows={blowouts} showPlusSign />

      <SectionHeader title="Closest Games" countLabel="TOP 5" barClass={styles.barGreen} />
      <MarginTable rows={closest} showPlusSign={false} />

      <SectionHeader title="Hard Luck Losses" countLabel="TOP 5" barClass={styles.barBlue} />
      <ScoreTable rows={hardluck} variant="hardluck" />

      <SectionHeader title="Lucky Wins" countLabel="TOP 5" barClass={styles.barGold} />
      <ScoreTable rows={lucky} variant="lucky" />

      <SectionHeader emoji="⚔️" title="Biggest Rivalry" barClass={styles.barAccent} />
      <RivalryCard result={rivalry} />

      <SectionHeader
        emoji="📏"
        title="Most Consistent Teams"
        countLabel="TOP 5"
        barClass={styles.barGreen}
      />
      <ConsistencyTable rows={consistency.consistent} variant="consistent" />

      <SectionHeader
        emoji="🎢"
        title="Most Volatile Teams"
        countLabel="TOP 5"
        barClass={styles.barRed}
      />
      <ConsistencyTable rows={consistency.volatile} variant="volatile" />

      <SectionHeader emoji="🎯" title="Clutch Index" barClass={styles.barGold} />
      <CloseGameTable rows={closeGames.clutch} variant="clutch" />

      <SectionHeader emoji="💣" title="Blowout Record" barClass={styles.barBlue} />
      <CloseGameTable rows={closeGames.blowout} variant="blowout" />

      <SectionHeader emoji="🪑" title="Points Missed by Benching" barClass={styles.barRed} />
      <BenchTotalsTable rows={bench.totals} />

      <SectionHeader
        emoji="🤦"
        title="Shoulda Started Him"
        countLabel="TOP 10"
        barClass={styles.barRed}
      />
      <ShouldaStartedTable rows={bench.shoulda} />
    </>
  );
}

// -------------------------------------------------------------------
// Section header — a thin wrapper around the legacy `.section-header`
// markup. Centralized here so every Fun Stats sub-section uses the
// same `aria-labelledby` wiring + slug derivation.
// -------------------------------------------------------------------

interface SectionHeaderProps {
  /** Decorative emoji prefix; rendered aria-hidden so screen readers skip it. */
  emoji?: string;
  title: string;
  /** Optional pill on the right (e.g. "TOP 5"). Omit when the section has no count. */
  countLabel?: string;
  /** CSS Module class controlling the bar color. Defaults to the standard accent. */
  barClass?: string;
}

function SectionHeader({ emoji, title, countLabel, barClass }: SectionHeaderProps) {
  const slug = slugify(title);
  return (
    <header className={styles.sectionHeader} aria-labelledby={slug}>
      <span
        className={`${styles.sectionBar} ${barClass ?? ''}`.trim()}
        aria-hidden="true"
      />
      <h2 id={slug} className={styles.sectionTitle}>
        {emoji ? (
          <>
            <span aria-hidden="true">{emoji}</span>{' '}
          </>
        ) : null}
        {title}
      </h2>
      {countLabel ? <span className={styles.countPill}>{countLabel}</span> : null}
    </header>
  );
}

/** Lower-case + replace non-alphanumerics with a single hyphen. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
