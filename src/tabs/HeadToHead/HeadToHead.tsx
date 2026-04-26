// ===================================================================
// Head-to-Head tab
// ===================================================================
//
// Owner-vs-owner lookup. Mirrors the legacy `#h2h` panel
// (index.html lines 395-408 markup, lines 2969-3021 logic):
//
//   1. Two owner pickers (Team A vs Team B), defaulting to the first
//      two owners alphabetically.
//   2. A VS card showing each side's combined win count, with the
//      leader styled green and the trailing side red. Ties show
//      neither modifier.
//   3. A chronological list of every individual game between them —
//      week label (with a 🏆 marker on playoff games), each side's
//      score, with the winning score green and the losing score red.
//
// Reads from the shared `LeagueDataProvider` and renders against the
// `seasons-ready` tier — the H2H view doesn't need the Sleeper player
// DB. The pure stat selectors live in `src/lib/stats/h2h.ts`;
// this file is composition + markup only.

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import {
  selectH2HOwners,
  selectH2HSeries,
  type H2HGame,
  type H2HOwnerOption,
} from '../../lib/stats/h2h';
import styles from './HeadToHead.module.css';

// CSS custom property used to inject the per-side owner color into
// the VS card without sprinkling inline styles across every cell.
type OwnerColorStyle = CSSProperties & { '--owner-color': string };

export default function HeadToHead() {
  const state = useLeagueData();

  // H2H needs per-season details (rosters + matchups) but not the
  // Sleeper player DB. Wait for `seasons-ready` (or the terminal
  // `ready` state) before rendering. Earlier tiers (`core-ready`)
  // don't have weekly matchups attached yet.
  if (state.status === 'loading' || state.status === 'core-ready') {
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

  return <HeadToHeadReady seasons={state.seasons} ownerIndex={state.ownerIndex} />;
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface HeadToHeadReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
}

function HeadToHeadReady({ seasons, ownerIndex }: HeadToHeadReadyProps) {
  // Picker options — alphabetical, stable across renders.
  const owners = useMemo(() => selectH2HOwners(ownerIndex), [ownerIndex]);

  // Default to the first two owners (legacy: `owners[0]` / `owners[1]`).
  // The picker keys are guaranteed stable across the provider state,
  // so leaning on `useState`'s lazy initializer is safe.
  const [aKey, setAKey] = useState<string>(() => owners[0]?.key ?? '');
  const [bKey, setBKey] = useState<string>(() => owners[1]?.key ?? owners[0]?.key ?? '');

  // Recompute the series when either selection changes. The selector
  // is pure and rebuilds the flat-matchups view internally — fast
  // enough that we don't need to memoize the matchups separately.
  const series = useMemo(() => selectH2HSeries(seasons, aKey, bKey), [seasons, aKey, bKey]);

  const ownerA = ownerIndex[aKey];
  const ownerB = ownerIndex[bKey];

  return (
    <section className={styles.section} aria-labelledby="h2h-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="h2h-heading" className={styles.sectionTitle}>
          Head-to-Head Lookup
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Select Two Teams</h3>
          <span className={styles.hint}>All-time, regular season + playoffs</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel} htmlFor="h2h-a">
                Team A
              </label>
              <select
                id="h2h-a"
                className={styles.select}
                value={aKey}
                onChange={(e) => setAKey(e.target.value)}
              >
                {owners.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.vsBadge}>VS</div>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel} htmlFor="h2h-b">
                Team B
              </label>
              <select
                id="h2h-b"
                className={styles.select}
                value={bKey}
                onChange={(e) => setBKey(e.target.value)}
              >
                {owners.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <H2HOutput
            ownerA={ownerA}
            ownerB={ownerB}
            sameOwner={aKey === bKey}
            games={series.games}
            totalWinsA={series.record.totalWinsA}
            totalWinsB={series.record.totalWinsB}
            owners={owners}
          />
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Output panel — empty state + VS card + game list
// -------------------------------------------------------------------

interface H2HOutputProps {
  ownerA: OwnerIndex[string] | undefined;
  ownerB: OwnerIndex[string] | undefined;
  sameOwner: boolean;
  games: H2HGame[];
  totalWinsA: number;
  totalWinsB: number;
  owners: H2HOwnerOption[];
}

function H2HOutput({
  ownerA,
  ownerB,
  sameOwner,
  games,
  totalWinsA,
  totalWinsB,
  owners,
}: H2HOutputProps) {
  // Defensive: if either picker resolves to an unknown owner (e.g.
  // the provider state is mid-update), bail to a friendly message.
  if (!ownerA || !ownerB || owners.length < 2) {
    return <p className={styles.empty}>Not enough owners to compare.</p>;
  }

  // Legacy: `if (a === b) return "Pick two different teams."`.
  if (sameOwner) {
    return <p className={styles.empty}>Pick two different teams.</p>;
  }

  // Legacy: `if (games.length === 0) return "No matchups found..."`.
  if (games.length === 0) {
    return <p className={styles.empty}>No matchups found between these two teams.</p>;
  }

  const aSideClass =
    totalWinsA > totalWinsB
      ? `${styles.side} ${styles.winner}`
      : totalWinsA < totalWinsB
        ? `${styles.side} ${styles.loser}`
        : styles.side;
  const bSideClass =
    totalWinsB > totalWinsA
      ? `${styles.side} ${styles.winner}`
      : totalWinsB < totalWinsA
        ? `${styles.side} ${styles.loser}`
        : styles.side;

  const aStyle: OwnerColorStyle = { '--owner-color': ownerA.color };
  const bStyle: OwnerColorStyle = { '--owner-color': ownerB.color };

  return (
    <div className={styles.result}>
      <div className={styles.vs}>
        <div className={aSideClass} style={aStyle}>
          <div className={styles.winsBig}>{totalWinsA}</div>
          <div className={styles.sideName}>{ownerA.displayName}</div>
        </div>
        <div className={styles.vsText}>SERIES</div>
        <div className={bSideClass} style={bStyle}>
          <div className={styles.winsBig}>{totalWinsB}</div>
          <div className={styles.sideName}>{ownerB.displayName}</div>
        </div>
      </div>

      <div className={styles.gamesList}>
        {games.map((g) => (
          <GameRow key={`${g.season}-${g.week}`} game={g} />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// One game row in the chronological list
// -------------------------------------------------------------------

interface GameRowProps {
  game: H2HGame;
}

function GameRow({ game }: GameRowProps) {
  // Legacy: A wins ⇒ A's score green, B's score red, and vice versa.
  // Ties are intentionally rendered neutrally; the legacy site painted
  // A=lose / B=win on ties, which was a small legacy bug. We treat both
  // sides as neutral (no win/lose class).
  const aClass =
    game.winner === 'A'
      ? `${styles.score} ${styles.win}`
      : game.winner === 'B'
        ? `${styles.score} ${styles.lose}`
        : styles.score;
  const bClass =
    game.winner === 'B'
      ? `${styles.score} ${styles.win}`
      : game.winner === 'A'
        ? `${styles.score} ${styles.lose}`
        : styles.score;

  return (
    <div className={styles.gameRow}>
      <span className={styles.weekLabel}>
        {game.season} W{game.week}
        {game.isPlayoff ? ' \u{1F3C6}' : ''}
      </span>
      <span className={`${aClass} ${styles.scoreLeft}`}>{game.scoreA.toFixed(2)}</span>
      <span className={styles.dash} aria-hidden="true">
        —
      </span>
      <span className={bClass}>{game.scoreB.toFixed(2)}</span>
    </div>
  );
}
