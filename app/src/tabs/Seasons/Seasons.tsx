// ===================================================================
// Seasons tab
// ===================================================================
//
// Per-season archive view. Mirrors the legacy `#seasons` panel
// (index.html lines 410-417 markup, lines 3023-3141 logic):
//
//   1. A season picker that lists every season newest first, with an
//      "(In Progress)" suffix on any league whose status isn't yet
//      `'complete'`.
//   2. The selected season's regular-season standings — wins, losses,
//      PF, PA — sorted by wins (PF as tiebreaker).
//
// Reads from the shared `LeagueDataProvider` and renders against the
// `seasons-ready` tier — like H2H, the standings panel doesn't need
// the Sleeper player DB. The pure stat selectors live in
// `app/src/lib/stats/seasons.ts`; this file is composition + markup
// only.
//
// Scope note: The legacy Seasons tab also draws awards (champion,
// finals MVP, season MVP, toilet bowl, etc.), a draft board, and
// draft steals/busts/waiver heroes. Each depends on data that
// migrates with the tab that owns it (player DB, toilet-bowl
// computation, draft picks). Those land later — porting the standings
// panel first preserves the migration plan's "small, reviewable, easy
// to revert" cadence.

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import {
  selectSeasonOptions,
  selectSeasonStandings,
  type SeasonOption,
  type SeasonStandingsRow,
} from '../../lib/stats/seasons';
import styles from './Seasons.module.css';

// CSS custom property used to inject the per-row owner color into the
// team-chip dot + name without per-cell inline styles. TypeScript
// requires the `--*` form so we attach it via a typed alias.
type OwnerColorStyle = CSSProperties & { '--owner-color': string };

export default function Seasons() {
  const state = useLeagueData();

  // Seasons needs per-season details (rosters + matchups) but not the
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

  return <SeasonsReady seasons={state.seasons} ownerIndex={state.ownerIndex} />;
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface SeasonsReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
}

function SeasonsReady({ seasons, ownerIndex }: SeasonsReadyProps) {
  // Picker options — newest first, stable across renders.
  const options = useMemo(() => selectSeasonOptions(seasons), [seasons]);

  // Default to the first option (most recent season). Lazy initializer
  // means we only read `options` once at mount; subsequent re-renders
  // don't churn the picker selection unless the user touches it.
  const [selected, setSelected] = useState<string>(() => options[0]?.season ?? '');

  // Recompute standings only when the selection (or the underlying
  // provider state) changes. The selector is pure and rebuilds the
  // flat-matchups view internally — fast enough that we don't need to
  // memoize the matchups separately at this point.
  const standings = useMemo(
    () => (selected ? selectSeasonStandings(seasons, ownerIndex, selected) : []),
    [seasons, ownerIndex, selected],
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

      <StandingsSection standings={standings} season={selected} />
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

// -------------------------------------------------------------------
// Shared chips / helpers
// -------------------------------------------------------------------

interface TeamChipProps {
  name: string;
  owner: string;
  color: string;
}

/** Full team chip — color dot + team name (in owner color) + dim owner sub-name. */
function TeamChip({ name, owner, color }: TeamChipProps) {
  const style: OwnerColorStyle = { '--owner-color': color };
  return (
    <span className={styles.teamChip} style={style}>
      <span className={styles.teamDot} aria-hidden="true" />
      <span className={styles.teamName}>{name}</span>
      <span className={styles.teamOwner}>{owner}</span>
    </span>
  );
}

/** Gold/silver/bronze tinting for the top three rows; default for the rest. */
function rankClass(idx: number): string {
  if (idx === 0) return `${styles.rank} ${styles.rank1}`;
  if (idx === 1) return `${styles.rank} ${styles.rank2}`;
  if (idx === 2) return `${styles.rank} ${styles.rank3}`;
  return styles.rank;
}
