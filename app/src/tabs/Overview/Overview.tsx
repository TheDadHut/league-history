// ===================================================================
// Overview tab
// ===================================================================
//
// Three sections, mirroring the legacy `#overview` panel
// (index.html lines 347-368):
//
//   1. Hall of Champs        — champion cards, most-recent-first.
//   2. League Pulse          — six-tile grid of headline stats.
//   3. All-Time Standings    — sortable table of every owner's record.
//
// All data comes from the shared `LeagueDataProvider` so we don't
// re-walk history per tab. The pure stat selectors live in
// `app/src/lib/stats/overview.ts`; this file is composition + markup
// only.

import { useMemo, useState } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import {
  selectAllTimeStandings,
  selectChampions,
  selectPulseTiles,
  type StandingsRow,
} from '../../lib/stats/overview';
import styles from './Overview.module.css';

export default function Overview() {
  const state = useLeagueData();

  if (state.status === 'loading') {
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

  return <OverviewReady seasons={state.seasons} ownerIndex={state.ownerIndex} />;
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run when the
// provider has finished loading.
// -------------------------------------------------------------------

interface OverviewReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
}

function OverviewReady({ seasons, ownerIndex }: OverviewReadyProps) {
  // Each selector is pure — memoize against the provider state so we
  // don't recompute on every unrelated render (Suspense + tab switches).
  const champions = useMemo(
    () => selectChampions(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const tiles = useMemo(
    () => selectPulseTiles(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const standings = useMemo(
    () => selectAllTimeStandings(seasons, ownerIndex),
    [seasons, ownerIndex],
  );

  return (
    <>
      <ChampionsSection champions={champions} />
      <PulseSection tiles={tiles} />
      <StandingsSection rows={standings} />
    </>
  );
}

// -------------------------------------------------------------------
// Hall of Champs
// -------------------------------------------------------------------

interface ChampionsSectionProps {
  champions: ReturnType<typeof selectChampions>;
}

function ChampionsSection({ champions }: ChampionsSectionProps) {
  const count = champions.length;
  const countLabel = `${count} CHAMPION${count === 1 ? '' : 'S'}`;

  return (
    <section className={styles.section} aria-labelledby="champs-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="champs-heading" className={styles.sectionTitle}>
          Hall of Champs
        </h2>
        <span className={styles.countPill}>{count > 0 ? countLabel : '—'}</span>
      </header>

      {count === 0 ? (
        <p className={styles.emptyChamps}>
          No champion crowned yet — current season still in progress.
        </p>
      ) : (
        <div className={styles.champsGrid}>
          {champions.map((c) => (
            <article
              key={c.season}
              className={styles.champCard}
              style={{ borderLeftColor: c.color }}
            >
              <div className={styles.champYear}>{c.season} CHAMPION</div>
              <div className={styles.champTeam} style={{ color: c.color }}>
                {c.teamName}
              </div>
              <div className={styles.champOwner}>{c.displayName}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------------
// League Pulse
// -------------------------------------------------------------------

interface PulseSectionProps {
  tiles: ReturnType<typeof selectPulseTiles>;
}

function PulseSection({ tiles }: PulseSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="pulse-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="pulse-heading" className={styles.sectionTitle}>
          League Pulse
        </h2>
      </header>
      <div className={styles.statGrid}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.statTile}>
            <div className={styles.statLabel}>{t.label}</div>
            <div className={styles.statValue}>{t.value}</div>
            <div className={styles.statSub}>{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// All-Time Standings (sortable)
// -------------------------------------------------------------------

/** Columns the user can click to sort. Each maps to a comparator builder. */
type SortKey = 'team' | 'wins' | 'losses' | 'pct' | 'pf' | 'titles';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey;
  dir: SortDir;
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  numeric: boolean;
}> = [
  { key: 'team', label: 'Team', numeric: false },
  { key: 'wins', label: 'W', numeric: true },
  { key: 'losses', label: 'L', numeric: true },
  { key: 'pct', label: 'PCT', numeric: true },
  { key: 'pf', label: 'PF', numeric: true },
  { key: 'titles', label: '🏆', numeric: true },
];

/**
 * Stable, deterministic comparison on a single column. Mirrors the
 * legacy compare logic in `renderAllTimeTable()` (lines 2021-2027):
 * team is compared as a lower-cased string; everything else numerically.
 */
function compareRows(a: StandingsRow, b: StandingsRow, key: SortKey): number {
  if (key === 'team') {
    return a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase());
  }
  return a[key] - b[key];
}

interface StandingsSectionProps {
  rows: StandingsRow[];
}

function StandingsSection({ rows }: StandingsSectionProps) {
  const [sort, setSort] = useState<SortState>({ key: 'wins', dir: 'desc' });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sort.key);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const toggle = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      }
      // New column — team starts ascending (alphabetical), everything else descending.
      return { key, dir: key === 'team' ? 'asc' : 'desc' };
    });
  };

  return (
    <section className={styles.section} aria-labelledby="standings-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="standings-heading" className={styles.sectionTitle}>
          All-Time Standings
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Regular Season · All Years</h3>
          <span className={styles.hint}>Click headers to sort</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                {COLUMNS.map((col) => {
                  const isActive = sort.key === col.key;
                  const indicator = !isActive ? '' : sort.dir === 'desc' ? '▼' : '▲';
                  const ariaSort: 'ascending' | 'descending' | 'none' = !isActive
                    ? 'none'
                    : sort.dir === 'asc'
                      ? 'ascending'
                      : 'descending';
                  const classes = [styles.sortable];
                  if (col.numeric) classes.push(styles.num);
                  if (isActive) classes.push(styles.sorted);
                  return (
                    <th
                      key={col.key}
                      className={classes.join(' ')}
                      aria-sort={ariaSort}
                      scope="col"
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggle(col.key)}
                      >
                        {col.label}
                        <span className={styles.sortInd} aria-hidden="true">
                          {indicator}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <StandingsRowView key={row.ownerKey} row={row} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// One row of the standings table
// -------------------------------------------------------------------

interface StandingsRowViewProps {
  row: StandingsRow;
  rank: number;
}

function StandingsRowView({ row, rank }: StandingsRowViewProps) {
  // PCT: ".789" — strip the leading zero like the legacy `replace(/^0/, '')`.
  const pct = row.pct.toFixed(3).replace(/^0/, '');
  const titles = row.titles > 0 ? '🏆'.repeat(row.titles) : '—';

  // Ranks 1-3 get gold/silver/bronze tinting.
  const rankClass =
    rank === 1
      ? `${styles.rank} ${styles.rank1}`
      : rank === 2
        ? `${styles.rank} ${styles.rank2}`
        : rank === 3
          ? `${styles.rank} ${styles.rank3}`
          : styles.rank;

  return (
    <tr>
      <td className={rankClass}>{rank}</td>
      <td>
        <span className={styles.teamChip}>
          <span className={styles.teamDot} style={{ background: row.color }} aria-hidden="true" />
          <span style={{ color: row.color }}>{row.teamName}</span>
          <span className={styles.teamOwner}>{row.displayName}</span>
        </span>
      </td>
      <td className={`${styles.num} ${styles.wins}`}>{row.wins}</td>
      <td className={`${styles.num} ${styles.losses}`}>{row.losses}</td>
      <td className={styles.num}>{pct}</td>
      <td className={styles.num}>{row.pf.toFixed(1)}</td>
      <td className={styles.num}>{titles}</td>
    </tr>
  );
}
