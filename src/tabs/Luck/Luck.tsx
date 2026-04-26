// ===================================================================
// Luck & Streaks tab
// ===================================================================
//
// Four sub-panels, mirroring the legacy `#luck` panel
// (index.html lines 507-540):
//
//   1. Luck Rating          — Actual / Expected / Luck (one row per owner).
//   2. Current Streaks      — most recent run of identical W/L results.
//   3. Longest Win Streaks  — all-time top 5.
//   4. Longest Losing Streaks — all-time top 5.
//
// Reads from the shared `LeagueDataProvider` and waits for the
// `seasons-ready` (or terminal `ready`) tier — the player DB isn't
// needed here; everything is computed off the flat-matchups view.
//
// Pure stat selectors live in `app/src/lib/stats/luck.ts`; this file
// is composition + markup only.

import { useMemo } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import { TeamChip } from '../../lib/components/TeamChip';
import {
  selectAllTimeStreaks,
  selectCurrentStreaks,
  selectLuckRatings,
  type AllTimeStreak,
  type CurrentStreak,
  type LuckRating,
} from '../../lib/stats/luck';
import styles from './Luck.module.css';

export default function Luck() {
  const state = useLeagueData();

  // Luck & Streaks doesn't need the Sleeper player DB — it only reads
  // weekly scores. Wait for `seasons-ready` (which has weeklyMatchups
  // attached) or the terminal `ready` state.
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

  return <LuckReady seasons={state.seasons} ownerIndex={state.ownerIndex} />;
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface LuckReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
}

function LuckReady({ seasons, ownerIndex }: LuckReadyProps) {
  const ratings = useMemo(() => selectLuckRatings(seasons, ownerIndex), [seasons, ownerIndex]);
  const currentStreaks = useMemo(
    () => selectCurrentStreaks(seasons, ownerIndex),
    [seasons, ownerIndex],
  );
  const { winStreaks, lossStreaks } = useMemo(
    () => selectAllTimeStreaks(seasons, ownerIndex),
    [seasons, ownerIndex],
  );

  return (
    <>
      <LuckRatingSection rows={ratings} />
      <CurrentStreaksSection rows={currentStreaks} />
      <AllTimeStreakSection
        title="Longest Win Streaks"
        countLabel="ALL-TIME TOP 5"
        rows={winStreaks}
        barClass={styles.barGreen}
        valueClass={styles.numWin}
        valueSuffix="W"
        emptyText="No win streaks yet."
      />
      <AllTimeStreakSection
        title="Longest Losing Streaks"
        countLabel="ALL-TIME TOP 5"
        rows={lossStreaks}
        barClass={styles.barRed}
        valueClass={styles.numLoss}
        valueSuffix="L"
        emptyText="No loss streaks yet."
      />
    </>
  );
}

// -------------------------------------------------------------------
// Section 1 — Luck Rating
// -------------------------------------------------------------------

interface LuckRatingSectionProps {
  rows: LuckRating[];
}

function LuckRatingSection({ rows }: LuckRatingSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="luck-rating-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barGold}`} aria-hidden="true" />
        <h2 id="luck-rating-heading" className={styles.sectionTitleSm}>
          <span aria-hidden="true">🍀</span> Luck Rating
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Actual Record vs Would-Be Record</h3>
          <span className={styles.hint}>
            What your record would be if you played every opponent each week (all-play metric)
          </span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Actual
                </th>
                <th scope="col" className={styles.num}>
                  Expected
                </th>
                <th scope="col" className={styles.num}>
                  Luck
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <LuckRatingRow key={row.ownerKey} row={row} idx={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface LuckRatingRowProps {
  row: LuckRating;
  idx: number;
}

function LuckRatingRow({ row, idx }: LuckRatingRowProps) {
  // Match legacy thresholds: > 0.5 lucky (green), < -0.5 unlucky (red),
  // otherwise neutral. The `+` prefix only appears when luck > 0;
  // negatives already carry a `-` from `toFixed`.
  const luckClass =
    row.luck > 0.5
      ? `${styles.num} ${styles.numWin}`
      : row.luck < -0.5
        ? `${styles.num} ${styles.numLoss}`
        : `${styles.num} ${styles.numNeutral}`;
  const sign = row.luck > 0 ? '+' : '';
  const expectedLosses = row.games - row.expectedWins;

  return (
    <tr>
      <td className={rankClass(idx)}>{idx + 1}</td>
      <td>
        <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
      </td>
      <td className={styles.num}>
        <span className={styles.recordWin}>{row.actualWins}</span>
        <span className={styles.recordDash}>-</span>
        <span className={styles.recordLoss}>{row.games - row.actualWins}</span>
      </td>
      <td className={`${styles.num} ${styles.numNeutral}`}>
        {row.expectedWins.toFixed(1)}-{expectedLosses.toFixed(1)}
      </td>
      <td className={luckClass}>
        {sign}
        {row.luck.toFixed(1)}
      </td>
    </tr>
  );
}

// -------------------------------------------------------------------
// Section 2 — Current Streaks
// -------------------------------------------------------------------

interface CurrentStreaksSectionProps {
  rows: CurrentStreak[];
}

function CurrentStreaksSection({ rows }: CurrentStreaksSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="current-streaks-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barGreen}`} aria-hidden="true" />
        <h2 id="current-streaks-heading" className={styles.sectionTitleSm}>
          <span aria-hidden="true">🔥</span> Current Streaks
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Heating Up / Cooling Off</h3>
          <span className={styles.hint}>Most recent consecutive wins or losses</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Streak
                </th>
                <th scope="col" className={styles.num}>
                  Since
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CurrentStreakRow key={row.ownerKey} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface CurrentStreakRowProps {
  row: CurrentStreak;
}

function CurrentStreakRow({ row }: CurrentStreakRowProps) {
  const streakClass =
    row.streakType === 'W'
      ? `${styles.streakBig} ${styles.numWin}`
      : row.streakType === 'L'
        ? `${styles.streakBig} ${styles.numLoss}`
        : `${styles.streakBig} ${styles.numNeutral}`;
  const icon = row.streakType === 'W' ? '🔥' : row.streakType === 'L' ? '❄️' : '—';

  return (
    <tr>
      <td>
        <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
      </td>
      <td className={styles.num}>
        <span className={streakClass}>
          {icon} {row.streak}
          {row.streakType}
        </span>
      </td>
      <td className={`${styles.num} ${styles.weekLabel}`}>
        {row.startSeason} W{row.startWeek}
      </td>
    </tr>
  );
}

// -------------------------------------------------------------------
// Sections 3 & 4 — All-Time Win / Loss Streaks (shared layout)
// -------------------------------------------------------------------

interface AllTimeStreakSectionProps {
  title: string;
  countLabel: string;
  rows: AllTimeStreak[];
  barClass: string;
  valueClass: string;
  valueSuffix: 'W' | 'L';
  emptyText: string;
}

function AllTimeStreakSection({
  title,
  countLabel,
  rows,
  barClass,
  valueClass,
  valueSuffix,
  emptyText,
}: AllTimeStreakSectionProps) {
  const slug = slugify(title);
  const emoji = valueSuffix === 'W' ? '📈' : '📉';
  return (
    <section className={styles.section} aria-labelledby={slug}>
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${barClass}`} aria-hidden="true" />
        <h2 id={slug} className={styles.sectionTitleSm}>
          <span aria-hidden="true">{emoji}</span> {title}
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
                  {valueSuffix === 'W' ? 'Wins' : 'Losses'}
                </th>
                <th scope="col">From</th>
                <th scope="col">To</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={`${row.ownerKey}-${row.fromSeason}-${row.fromWeek}-${row.toSeason}-${row.toWeek}`}
                  >
                    <td className={rankClass(i)}>{i + 1}</td>
                    <td>
                      <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
                    </td>
                    <td className={`${styles.num} ${valueClass}`}>
                      {row.length}
                      {valueSuffix}
                    </td>
                    <td className={styles.weekLabel}>
                      {row.fromSeason} W{row.fromWeek}
                    </td>
                    <td className={styles.weekLabel}>
                      {row.toSeason} W{row.toWeek}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Local helpers
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
