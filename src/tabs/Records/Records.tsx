// ===================================================================
// Records tab
// ===================================================================
//
// Four leaderboards, mirroring the legacy `#records` panel
// (index.html lines 370-393):
//
//   1. Team Scores · Weekly Highs        — top 10 single-team scores.
//   2. Team Scores · Weekly Lows         — bottom 10 single-team scores.
//   3. Player High Scores · Single Week  — top 10 individual weekly performances.
//   4. Player High Scores · Full Season  — top 10 player season totals.
//
// Reads from the shared `LeagueDataProvider` and waits for the `ready`
// state because the player tables need the Sleeper player DB. The pure
// stat selectors live in `src/lib/stats/records.ts`; this file is
// composition + markup only.

import { useMemo } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import { TeamChip, TeamChipCompact } from '../../lib/components/TeamChip';
import {
  selectPlayerSeasonHighs,
  selectPlayerSingleWeekHighs,
  selectWeeklyHighs,
  selectWeeklyLows,
  type PlayerSeasonRecord,
  type PlayerWeekRecord,
  type TeamScoreRecord,
} from '../../lib/stats/records';
import styles from './Records.module.css';

export default function Records() {
  const state = useLeagueData();

  // Records needs the Sleeper player DB for the bottom two tables —
  // wait for the terminal `ready` state. Earlier tiers (`core-ready`,
  // `seasons-ready`) leave the player tables un-renderable so we keep
  // the loading state to avoid mid-load layout shift.
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
    <RecordsReady seasons={state.seasons} ownerIndex={state.ownerIndex} players={state.players} />
  );
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface RecordsReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

function RecordsReady({ seasons, ownerIndex, players }: RecordsReadyProps) {
  // Each selector is pure — memoize against the provider state so we
  // don't recompute on every unrelated render (Suspense, tab switches,
  // owner-context updates).
  const highs = useMemo(() => selectWeeklyHighs(seasons, ownerIndex), [seasons, ownerIndex]);
  const lows = useMemo(() => selectWeeklyLows(seasons, ownerIndex), [seasons, ownerIndex]);
  const playerWeeks = useMemo(
    () => selectPlayerSingleWeekHighs(seasons, ownerIndex, players),
    [seasons, ownerIndex, players],
  );
  const playerSeasons = useMemo(
    () => selectPlayerSeasonHighs(seasons, ownerIndex, players),
    [seasons, ownerIndex, players],
  );

  return (
    <>
      <TeamScoresSection
        title="Team Scores · Weekly Highs"
        countLabel="TOP 10"
        rows={highs}
        valueClass={styles.numHigh}
      />
      <TeamScoresSection
        title="Team Scores · Weekly Lows"
        countLabel="BOTTOM 10"
        rows={lows}
        valueClass={styles.numLow}
      />
      <PlayerWeeksSection rows={playerWeeks} />
      <PlayerSeasonsSection rows={playerSeasons} />
    </>
  );
}

// -------------------------------------------------------------------
// Team scores leaderboard (highs OR lows)
// -------------------------------------------------------------------

interface TeamScoresSectionProps {
  title: string;
  countLabel: string;
  rows: TeamScoreRecord[];
  /** Color class applied to the points cell — gold for highs, red for lows. */
  valueClass: string;
}

function TeamScoresSection({ title, countLabel, rows, valueClass }: TeamScoresSectionProps) {
  // ID stable + URL-safe: `Team Scores · Weekly Highs` →
  // `team-scores-weekly-highs`. Used to wire `aria-labelledby` on the
  // section back to its heading.
  const slug = slugify(title);
  return (
    <section className={styles.section} aria-labelledby={slug}>
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id={slug} className={styles.sectionTitle}>
          {title}
        </h2>
        <span className={styles.countPill}>{countLabel}</span>
      </header>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Points
                </th>
                <th scope="col">Year</th>
                <th scope="col">Week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.ownerKey}-${row.season}-${row.week}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
                  </td>
                  <td className={`${styles.num} ${valueClass}`}>{row.points.toFixed(2)}</td>
                  <td>{row.season}</td>
                  <td>Week {row.week}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Player single-week leaderboard
// -------------------------------------------------------------------

interface PlayerWeeksSectionProps {
  rows: PlayerWeekRecord[];
}

function PlayerWeeksSection({ rows }: PlayerWeeksSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="player-week-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarBlue}`} aria-hidden="true" />
        <h2 id="player-week-heading" className={styles.sectionTitle}>
          Player High Scores · Single Week
        </h2>
        <span className={styles.countPill}>TOP 10</span>
      </header>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Points
                </th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${i}-${row.playerId}-${row.ownerKey}-${row.season}-${row.week}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td className={styles.playerName}>{row.player.name}</td>
                  <td className={styles.position}>{row.player.position}</td>
                  <td>
                    <TeamChipCompact name={row.teamName} color={row.color} />
                  </td>
                  <td className={`${styles.num} ${styles.numHigh}`}>{row.points.toFixed(2)}</td>
                  <td>
                    {row.season} W{row.week}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Player season leaderboard
// -------------------------------------------------------------------

interface PlayerSeasonsSectionProps {
  rows: PlayerSeasonRecord[];
}

function PlayerSeasonsSection({ rows }: PlayerSeasonsSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="player-season-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarBlue}`} aria-hidden="true" />
        <h2 id="player-season-heading" className={styles.sectionTitle}>
          Player High Scores · Full Season
        </h2>
        <span className={styles.countPill}>TOP 10</span>
      </header>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Points
                </th>
                <th scope="col">Year</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.playerId}-${row.ownerKey}-${row.season}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td className={styles.playerName}>{row.player.name}</td>
                  <td className={styles.position}>{row.player.position}</td>
                  <td>
                    <TeamChipCompact name={row.teamName} color={row.color} />
                  </td>
                  <td className={`${styles.num} ${styles.numHigh}`}>{row.points.toFixed(1)}</td>
                  <td>{row.season}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Local helpers (chips lifted to `src/lib/components/TeamChip`)
// -------------------------------------------------------------------

/** Gold/silver/bronze tinting for the top three rows; default for the rest. */
function rankClass(idx: number): string {
  if (idx === 0) return `${styles.rank} ${styles.rank1}`;
  if (idx === 1) return `${styles.rank} ${styles.rank2}`;
  if (idx === 2) return `${styles.rank} ${styles.rank3}`;
  return styles.rank;
}

/** Lower-case + replace non-alphanumerics with a single hyphen, trimming the ends. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
