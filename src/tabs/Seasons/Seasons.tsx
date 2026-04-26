// ===================================================================
// Seasons tab
// ===================================================================
//
// Per-season archive view. Mirrors the legacy `#seasons` panel
// (index.html lines 410-417 markup, lines 3023-3494 logic):
//
//   1. Season picker (newest first; "(In Progress)" suffix on active).
//   2. Awards row (completed seasons only): Champion, Finals MVP,
//      Season MVP, Champion's Best Player (if distinct), Highest PF,
//      Most PA, Toilet Bowl Winner.
//   3. Regular-season standings — wins, losses, PF, PA.
//   4. Draft Board — first two rounds inline, footer linking out for
//      rounds 3+ to the Sleeper app.
//   5. Draft value — Steals / Busts / Waiver Wire Heroes (top-5 each).
//   6. Draft Grades — DCE / RP / PWR with letter grades on a per-season
//      curve, plus an Overall composite.
//   7. Waiver Wire Profile — six-metric grades + archetype.
//   8. Best Pickups — top 10 individual waiver pickups by
//      points-while-rostered.
//   9. Season Highlights — recursive renderer for the manually-curated
//      `highlights.json` entries.
//
// Reads from the shared `LeagueDataProvider`. The full Seasons surface
// needs the Sleeper player DB (player names appear in awards, draft
// board, steals/busts, best pickups, etc.), so we wait for the
// terminal `ready` tier — earlier tiers (`core-ready`, `seasons-ready`)
// would render half the panel as anonymized rows. Pure stat selectors
// live in `app/src/lib/stats/seasons.ts`; this file is composition +
// markup only.

import { useMemo, useState } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import type { Highlights } from '../../lib/highlights';
import {
  buildPlayerSeasonStats,
  selectChampion,
  selectDraftBoard,
  selectDraftGrades,
  selectDraftValue,
  selectSeasonAwards,
  selectSeasonOptions,
  selectSeasonStandings,
  selectToiletBowlWinner,
  selectWaiverProfile,
  type SeasonOption,
  type SeasonStandingsRow,
} from '../../lib/stats/seasons';
import AwardsRow from './AwardsRow';
import BestPickups from './BestPickups';
import DraftBoard from './DraftBoard';
import DraftGradesTable from './DraftGradesTable';
import DraftValueTables from './DraftValueTables';
import SeasonHighlights from './SeasonHighlights';
import WaiverProfile from './WaiverProfile';
import { TeamChip, rankClass } from './shared';
import styles from './Seasons.module.css';

export default function Seasons() {
  const state = useLeagueData();

  // Seasons needs the Sleeper player DB (awards / draft board / draft
  // grades / waiver / best pickups all surface player names). Wait for
  // the terminal `ready` tier so we don't render with placeholder
  // names that pop in moments later.
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
    <SeasonsReady
      seasons={state.seasons}
      ownerIndex={state.ownerIndex}
      players={state.players}
      highlights={state.highlights}
    />
  );
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface SeasonsReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
  highlights: Highlights;
}

function SeasonsReady({ seasons, ownerIndex, players, highlights }: SeasonsReadyProps) {
  // Picker options — newest first, stable across renders.
  const options = useMemo(() => selectSeasonOptions(seasons), [seasons]);

  // Default to the first option (most recent season). Lazy initializer
  // means we only read `options` once at mount; subsequent re-renders
  // don't churn the picker selection unless the user touches it.
  const [selected, setSelected] = useState<string>(() => options[0]?.season ?? '');

  // Find the league record once per selection — many sub-selectors
  // operate on a single `SeasonDetails` rather than the whole array, so
  // hoist the lookup here.
  const league = useMemo(
    () => seasons.find((s) => s.season === selected) ?? null,
    [seasons, selected],
  );

  // Standings drive the awards' Highest-PF / Most-PA derivations, so
  // memoize them at the parent and share with both consumers.
  const standings = useMemo(
    () => (selected ? selectSeasonStandings(seasons, ownerIndex, selected) : []),
    [seasons, ownerIndex, selected],
  );

  // Heavy per-season player stats — shared across awards, steals/busts,
  // and draft grades. Recompute only when the league reference changes.
  const playerStats = useMemo(
    () => (league ? buildPlayerSeasonStats(league) : null),
    [league],
  );

  const champion = useMemo(
    () => (league ? selectChampion(league, ownerIndex) : null),
    [league, ownerIndex],
  );

  const toiletBowl = useMemo(
    () => (league ? selectToiletBowlWinner(league, ownerIndex) : null),
    [league, ownerIndex],
  );

  const awards = useMemo(
    () =>
      league && playerStats
        ? selectSeasonAwards(
            league,
            ownerIndex,
            players,
            champion,
            toiletBowl,
            playerStats,
            standings,
          )
        : [],
    [league, ownerIndex, players, champion, toiletBowl, playerStats, standings],
  );

  const draftBoard = useMemo(
    () => (league ? selectDraftBoard(league, ownerIndex) : null),
    [league, ownerIndex],
  );

  const draftValue = useMemo(
    () =>
      league && playerStats
        ? selectDraftValue(league, ownerIndex, players, playerStats)
        : null,
    [league, ownerIndex, players, playerStats],
  );

  const draftGrades = useMemo(
    () =>
      league && playerStats
        ? selectDraftGrades(league, ownerIndex, players, playerStats)
        : [],
    [league, ownerIndex, players, playerStats],
  );

  const waiverProfile = useMemo(
    () =>
      league
        ? selectWaiverProfile(league, ownerIndex, players)
        : { rows: [], bestPickups: [] },
    [league, ownerIndex, players],
  );

  const seasonHighlights = useMemo(
    () => (selected ? highlights[selected] ?? [] : []),
    [highlights, selected],
  );

  return (
    <>
      <section className={styles.section} aria-labelledby="seasons-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionBar} aria-hidden="true" />
          <h2 id="seasons-heading" className={styles.sectionTitle}>
            Season Archive
          </h2>
        </header>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Select Season</h3>
          </div>
          <div className={styles.cardBody}>
            <SeasonPicker
              options={options}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>
      </section>

      <AwardsRow awards={awards} />

      <StandingsSection standings={standings} season={selected} />

      <DraftBoard data={draftBoard} />

      <DraftValueTables data={draftValue} />

      <DraftGradesTable rows={draftGrades} />

      <WaiverProfile rows={waiverProfile.rows} />

      <BestPickups rows={waiverProfile.bestPickups} />

      <SeasonHighlights highlights={seasonHighlights} />
    </>
  );
}

// -------------------------------------------------------------------
// Season picker
// -------------------------------------------------------------------

interface SeasonPickerProps {
  options: SeasonOption[];
  selected: string;
  onSelect: (season: string) => void;
}

function SeasonPicker({ options, selected, onSelect }: SeasonPickerProps) {
  if (options.length === 0) {
    // Defensive only — the provider would have surfaced an error before
    // this component renders if there were truly no seasons.
    return <p className={styles.empty}>No seasons available.</p>;
  }

  return (
    <label className={styles.pickerLabel} htmlFor="season-picker">
      <span className={styles.visuallyHidden}>Season</span>
      <select
        id="season-picker"
        className={styles.picker}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.season} value={o.season}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// -------------------------------------------------------------------
// Standings table
// -------------------------------------------------------------------

interface StandingsSectionProps {
  standings: SeasonStandingsRow[];
  season: string;
}

function StandingsSection({ standings, season }: StandingsSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="standings-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="standings-heading" className={styles.sectionTitle}>
          Regular Season Standings
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Seed</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  W-L
                </th>
                <th scope="col" className={styles.num}>
                  PF
                </th>
                <th scope="col" className={styles.num}>
                  PA
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={`${season}-${row.ownerKey}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChip
                      name={row.teamName}
                      owner={row.displayName}
                      color={row.color}
                    />
                  </td>
                  <td className={styles.num}>
                    <span className={styles.winsLosses}>
                      <span className={styles.wins}>{row.wins}</span>
                      <span className={styles.dash} aria-hidden="true">
                        -
                      </span>
                      <span className={styles.losses}>{row.losses}</span>
                    </span>
                  </td>
                  <td className={styles.num}>{row.pf.toFixed(2)}</td>
                  <td className={styles.num}>{row.pa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
