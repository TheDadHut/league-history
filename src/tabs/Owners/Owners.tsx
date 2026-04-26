// ===================================================================
// Owner Stats tab
// ===================================================================
//
// Per-owner drilldown. Mirrors the legacy `#owners` panel
// (index.html lines 587-595 markup, lines 2647-2954 logic).
//
// Sections, in order:
//
//   1. Owner picker — alphabetical select, defaults to the first owner.
//   2. Stat tiles — regular-season record, playoff record, playoff
//      appearances rate, finals appearances + championships, reg/playoff
//      PCT split, optional Nemesis / Favorite Matchup, optional Trade
//      Record + Net Trade Value when the owner has scored trades.
//   3. Draft History — all-time GPA + composite letter pill, then a
//      per-season table of overall + DCE / RP / PWR pills with the
//      raw delta dim-monospaced under each pill. Rendered only when
//      the owner has at least one season with a draft grade.
//   4. Waiver History — headline (avg Impact letter + GPA), dominant
//      archetype, then a per-season six-metric table (VOL · SEL · IMP
//      · TIM · INT · PER). Rendered only when the owner has at least
//      one season of waiver pickups.
//   5. Head-to-Head Records — sorted table of every opponent, with
//      reg/playoff splits when at least one playoff meeting exists.
//
// Reads from the shared `LeagueDataProvider`. Waits for the terminal
// `ready` tier because Draft History and Waiver History both need
// `selectDraftGrades` / `selectWaiverProfile`, which both consume the
// Sleeper player DB. Pure selectors live in
// `app/src/lib/stats/owners.ts`; this file is composition + markup
// only.

import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import { latestTeamName } from '../../lib/owners';
import { TeamChip } from '../../lib/components/TeamChip';
import {
  buildPlayerSeasonStats,
  selectDraftGrades,
  selectWaiverProfile,
  type DraftGradeRow,
  type GradeLetter,
  type WaiverProfileRow,
} from '../../lib/stats/seasons';
import { buildTrades, type TradeOwnerStats } from '../../lib/stats/trades';
import { buildAllMatchups } from '../../lib/stats/util';
import {
  selectAllPlayoffResumes,
  selectOwnerDraftHistory,
  selectOwnerOptions,
  selectOwnerSummary,
  selectOwnerWaiverHistory,
  type OwnerDraftHistory,
  type OwnerH2HRow,
  type OwnerSummary,
  type OwnerWaiverHistory,
} from '../../lib/stats/owners';
import styles from './Owners.module.css';

// CSS custom property used to inject per-tile / per-pill owner color.
type OwnerColorStyle = CSSProperties & { '--owner-color': string };

export default function Owners() {
  const state = useLeagueData();

  // Draft History + Waiver History both need the Sleeper player DB
  // (they call `selectDraftGrades` / `selectWaiverProfile`, which
  // surface position lookups). Wait for the terminal `ready` tier so
  // every section paints with real names from the start.
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
    <OwnersReady seasons={state.seasons} ownerIndex={state.ownerIndex} players={state.players} />
  );
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo` selectors only run once the
// provider has finished loading.
// -------------------------------------------------------------------

interface OwnersReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

function OwnersReady({ seasons, ownerIndex, players }: OwnersReadyProps) {
  const owners = useMemo(() => selectOwnerOptions(ownerIndex), [ownerIndex]);
  const [selected, setSelected] = useState<string>(() => owners[0]?.key ?? '');

  // ----- Cross-owner caches (computed once, sliced per selection) -----

  // Flat regular-season + playoff matchups for every owner. The
  // per-owner summary slices this once per selection — much cheaper
  // than re-walking every season's weeklyMatchups for every picker
  // change.
  const matchups = useMemo(() => buildAllMatchups(seasons), [seasons]);

  // Playoff resumes for every owner in a single pass — see
  // `selectAllPlayoffResumes` for the legacy-equivalent walk.
  const playoffResumes = useMemo(
    () => selectAllPlayoffResumes(seasons, ownerIndex),
    [seasons, ownerIndex],
  );

  // Per-owner trade roll-ups. The trade list itself is throwaway here;
  // we only consume `statsByOwner` (the Trade Record / Net Trade Value
  // tiles).
  const tradeStatsByOwner = useMemo(
    () => buildTrades(seasons, ownerIndex).statsByOwner,
    [seasons, ownerIndex],
  );

  // Draft grades + waiver profiles per season. Both selectors are
  // expensive (the draft selector pre-computes positional finish ranks,
  // ownership timelines, and the within-season grade curve), so we
  // memoize once across all seasons and slice per owner.
  const draftGradesBySeason = useMemo(() => {
    const out: Record<string, DraftGradeRow[]> = {};
    for (const league of seasons) {
      const stats = buildPlayerSeasonStats(league);
      out[league.season] = selectDraftGrades(league, ownerIndex, players, stats);
    }
    return out;
  }, [seasons, ownerIndex, players]);

  const waiverProfilesBySeason = useMemo(() => {
    const out: Record<string, WaiverProfileRow[]> = {};
    for (const league of seasons) {
      out[league.season] = selectWaiverProfile(league, ownerIndex, players).rows;
    }
    return out;
  }, [seasons, ownerIndex, players]);

  // ----- Per-selection slices -----

  const summary = useMemo(
    () => (selected ? selectOwnerSummary(selected, seasons, matchups, playoffResumes) : null),
    [selected, seasons, matchups, playoffResumes],
  );

  const draftHistory = useMemo(
    () => (selected ? selectOwnerDraftHistory(selected, draftGradesBySeason) : null),
    [selected, draftGradesBySeason],
  );

  const waiverHistory = useMemo(
    () => (selected ? selectOwnerWaiverHistory(selected, waiverProfilesBySeason) : null),
    [selected, waiverProfilesBySeason],
  );

  const owner = selected ? ownerIndex[selected] : undefined;
  const tradeStats = selected ? tradeStatsByOwner[selected] : undefined;

  return (
    <>
      <section className={styles.section} aria-labelledby="owners-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionBar} aria-hidden="true" />
          <h2 id="owners-heading" className={styles.sectionTitle}>
            Owner Stats
          </h2>
        </header>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Select Owner</h3>
          </div>
          <div className={styles.cardBody}>
            <OwnerPicker options={owners} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      </section>

      {owner && summary ? (
        <OwnerHeadline
          owner={owner}
          summary={summary}
          tradeStats={tradeStats}
          ownerIndex={ownerIndex}
        />
      ) : null}

      {draftHistory && draftHistory.rows.length > 0 ? (
        <DraftHistorySection history={draftHistory} />
      ) : null}

      {waiverHistory && waiverHistory.rows.length > 0 ? (
        <WaiverHistorySection history={waiverHistory} />
      ) : null}

      {summary && summary.h2hRows.length > 0 ? (
        <H2HRecordsSection rows={summary.h2hRows} ownerIndex={ownerIndex} />
      ) : null}
    </>
  );
}

// -------------------------------------------------------------------
// Owner picker
// -------------------------------------------------------------------

interface OwnerPickerProps {
  options: ReturnType<typeof selectOwnerOptions>;
  selected: string;
  onSelect: (key: string) => void;
}

function OwnerPicker({ options, selected, onSelect }: OwnerPickerProps) {
  if (options.length === 0) {
    // Defensive only — the provider would have surfaced an error before
    // this component renders if there were truly no owners.
    return <p className={styles.empty}>No owners on record.</p>;
  }

  return (
    <label className={styles.pickerLabel} htmlFor="owner-picker">
      <span className={styles.visuallyHidden}>Owner</span>
      <select
        id="owner-picker"
        className={styles.picker}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

// -------------------------------------------------------------------
// Headline section: owner banner + stat tiles
// -------------------------------------------------------------------

interface OwnerHeadlineProps {
  owner: OwnerIndex[string];
  summary: OwnerSummary;
  tradeStats: TradeOwnerStats | undefined;
  ownerIndex: OwnerIndex;
}

function OwnerHeadline({ owner, summary, tradeStats, ownerIndex }: OwnerHeadlineProps) {
  const { regWins, regLosses, regPct, totalSeasons, playoffResume, playoffPct } = summary;
  const playoffGames = playoffResume.wins + playoffResume.losses;
  const ownerColorStyle: OwnerColorStyle = { '--owner-color': owner.color };

  // Mirrors the legacy "Reg vs Playoff PCT" tile (line 2762). The dual
  // pct is shown as `${reg} / ${po}` with an em-dash for an empty
  // playoff record.
  const playoffPerformer = playoffGames > 0 && playoffPct > regPct;

  return (
    <>
      <header className={`${styles.sectionHeader} ${styles.ownerHeader}`} style={ownerColorStyle}>
        <span className={`${styles.sectionBar} ${styles.sectionBarOwner}`} aria-hidden="true" />
        <h2 className={styles.sectionTitle}>{owner.displayName}</h2>
      </header>

      <div className={styles.statGrid}>
        <StatTile
          label="Regular Season Record"
          value={`${regWins}-${regLosses}`}
          sub={`${formatPct(regPct)} across ${totalSeasons} season${totalSeasons === 1 ? '' : 's'}`}
          accent={owner.color}
        />
        <StatTile
          label="Playoff Record"
          value={`${playoffResume.wins}-${playoffResume.losses}`}
          sub={
            playoffGames === 0
              ? 'No playoff games yet'
              : `${formatPct(playoffPct)} across ${playoffResume.appearances} appearance${playoffResume.appearances === 1 ? '' : 's'}`
          }
          accent={owner.color}
        />
        <StatTile
          label="Playoff Appearances"
          value={
            <>
              {playoffResume.appearances}
              {totalSeasons > 0 ? (
                <span className={styles.statValueDim}> / {totalSeasons}</span>
              ) : null}
            </>
          }
          sub={
            totalSeasons === 0
              ? '—'
              : playoffResume.appearances === totalSeasons
                ? 'Never missed'
                : `${Math.round((playoffResume.appearances / totalSeasons) * 100)}% rate`
          }
          accent={owner.color}
        />
        <StatTile
          label="Finals Appearances"
          value={String(playoffResume.finalsAppearances)}
          sub={
            playoffResume.championships > 0
              ? `\u{1F3C6} ${playoffResume.championships} championship${playoffResume.championships === 1 ? '' : 's'}`
              : 'Still chasing the trophy'
          }
          accent={owner.color}
        />
        <StatTile
          label="Reg Season vs Playoff PCT"
          value={`${formatPct(regPct)} / ${playoffGames > 0 ? formatPct(playoffPct) : '—'}`}
          sub={
            playoffGames === 0
              ? 'No playoff games yet'
              : playoffPerformer
                ? 'Playoff performer'
                : 'Reg season specialist'
          }
          accent={owner.color}
        />

        {summary.nemesis ? (
          <OpponentCalloutTile
            label={'\u{1F624} Nemesis'}
            row={summary.nemesis}
            ownerIndex={ownerIndex}
            tileClass={styles.statTileRed}
          />
        ) : null}

        {summary.favorite && summary.favorite.opponentKey !== summary.nemesis?.opponentKey ? (
          <OpponentCalloutTile
            label={'\u{1F608} Favorite Matchup'}
            row={summary.favorite}
            ownerIndex={ownerIndex}
            tileClass={styles.statTileGreen}
          />
        ) : null}

        {tradeStats && tradeStats.tradeCount > 0 ? (
          <>
            <TradeRecordTile stats={tradeStats} />
            <TradeNetTile stats={tradeStats} />
          </>
        ) : null}
      </div>
    </>
  );
}

// -------------------------------------------------------------------
// Stat tile primitives
// -------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  /** Color of the top accent stripe — defaults to the page accent. */
  accent?: string;
}

function StatTile({ label, value, sub, accent }: StatTileProps) {
  const style = accent ? ({ borderTopColor: accent } as CSSProperties) : undefined;
  return (
    <div className={styles.statTile} style={style}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statSub}>{sub}</div>
    </div>
  );
}

// The Nemesis / Favorite tiles share one shape: a colored top stripe,
// a label with an emoji, the opponent's display name colored to match
// the opponent (not the owner viewing the tab), and a sub-line with
// the head-to-head record.

interface OpponentCalloutTileProps {
  label: string;
  row: OwnerH2HRow;
  ownerIndex: OwnerIndex;
  /** Module class controlling the top accent stripe color. */
  tileClass: string;
}

function OpponentCalloutTile({ label, row, ownerIndex, tileClass }: OpponentCalloutTileProps) {
  const opp = ownerIndex[row.opponentKey];
  // If the opponent has been deleted from the index, fall back to a
  // neutral string rather than dropping the tile entirely.
  const displayName = opp?.displayName ?? row.opponentKey;
  const color = opp?.color;
  const valueStyle = color ? ({ color } as CSSProperties) : undefined;

  return (
    <div className={`${styles.statTile} ${tileClass}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={valueStyle}>
        {displayName}
      </div>
      <div className={styles.statSub}>
        {row.wins}-{row.losses} head-to-head
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Trade tiles
// -------------------------------------------------------------------

interface TradeTileProps {
  stats: TradeOwnerStats;
}

function TradeRecordTile({ stats }: TradeTileProps) {
  const recordStr = stats.ties
    ? `${stats.wins}-${stats.losses}-${stats.ties}`
    : `${stats.wins}-${stats.losses}`;
  const wrColor = tradeNetColor(stats.netWR);
  return (
    <div className={`${styles.statTile} ${styles.statTileBlue}`}>
      <div className={styles.statLabel}>{'\u{1F91D} '}Trade Record</div>
      <div className={styles.statValue} style={{ color: wrColor }}>
        {recordStr}
      </div>
      <div className={styles.statSub}>
        {stats.tradeCount} trade{stats.tradeCount === 1 ? '' : 's'} · W-L counts head-to-head only
      </div>
    </div>
  );
}

function TradeNetTile({ stats }: TradeTileProps) {
  const wrColor = tradeNetColor(stats.netWR);
  return (
    <div className={`${styles.statTile} ${styles.statTileBlue}`}>
      <div className={styles.statLabel}>{'\u{1F4CA} '}Net Trade Value</div>
      <div className={`${styles.statValue} ${styles.statValueSmall}`} style={{ color: wrColor }}>
        {stats.netWR > 0 ? '+' : ''}
        {stats.netWR.toFixed(0)} <span className={styles.statValueUnit}>WR</span>
      </div>
      <div className={styles.statSub}>
        {stats.netST > 0 ? '+' : ''}
        {stats.netST.toFixed(0)} ST · sum across all trades
      </div>
    </div>
  );
}

function tradeNetColor(net: number): string {
  if (net > 0) return 'var(--color-win)';
  if (net < 0) return 'var(--color-loss)';
  return 'var(--text)';
}

// -------------------------------------------------------------------
// Draft History
// -------------------------------------------------------------------

interface DraftHistorySectionProps {
  history: OwnerDraftHistory;
}

function DraftHistorySection({ history }: DraftHistorySectionProps) {
  // Display order: newest season first. The selector returns ascending
  // so the all-time average GPA can be computed in chronological
  // order; copy + reverse here without mutating the cached selector
  // output.
  const rowsDesc = useMemo(() => [...history.rows].reverse(), [history.rows]);

  return (
    <section className={styles.section} aria-labelledby="owners-draft-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarGold}`} aria-hidden="true" />
        <h2 id="owners-draft-heading" className={styles.sectionTitle}>
          Draft History
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>All-Time Draft Grade</h3>
          <span className={styles.hint}>
            Average across {history.rows.length} draft
            {history.rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className={styles.headlineBlock}>
          {history.avgLetter ? <GradePill grade={history.avgLetter} headline /> : null}
          <div className={styles.headlineSub}>GPA {history.avgGpa.toFixed(2)}</div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th scope="col" className={styles.num}>
                  Overall
                </th>
                <th scope="col" className={styles.num} title="Draft Capital Efficiency">
                  DCE
                </th>
                <th scope="col" className={styles.num} title="Raw Points">
                  RP
                </th>
                <th scope="col" className={styles.num} title="Points While Rostered">
                  PWR
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsDesc.map((row) => (
                <tr key={row.season}>
                  <td className={styles.seasonCell}>{row.season}</td>
                  <td className={styles.num}>
                    <GradePill grade={row.overallGrade} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.dceGrade}
                      value={`${row.dce > 0 ? '+' : ''}${row.dce.toFixed(0)}`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.rpGrade} value={row.rp.toFixed(0)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.pwrGrade} value={row.pwr.toFixed(0)} />
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
// Waiver History
// -------------------------------------------------------------------

interface WaiverHistorySectionProps {
  history: OwnerWaiverHistory;
}

function WaiverHistorySection({ history }: WaiverHistorySectionProps) {
  const rowsDesc = useMemo(() => [...history.rows].reverse(), [history.rows]);

  return (
    <section className={styles.section} aria-labelledby="owners-waiver-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarBlue}`} aria-hidden="true" />
        <h2 id="owners-waiver-heading" className={styles.sectionTitle}>
          Waiver History
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Waiver Identity</h3>
          <span className={styles.hint}>
            Across {history.rows.length} season
            {history.rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className={styles.headlineBlock}>
          {history.avgImpactLetter ? (
            <>
              <div className={styles.headlineEyebrow}>HEADLINE GRADE</div>
              <GradePill grade={history.avgImpactLetter} headline />
              <div className={styles.headlineSub}>
                Avg Impact GPA {history.avgImpactGpa.toFixed(2)}
              </div>
              <div className={styles.headlineDivider} aria-hidden="true" />
            </>
          ) : null}

          <div className={styles.headlineEyebrow}>DOMINANT ARCHETYPE</div>
          <div className={styles.headlineArchetype}>{history.dominantArchetype?.name ?? '—'}</div>
          <div className={styles.headlineArchetypeDesc}>
            {history.dominantArchetype?.description ?? ''}
          </div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Headline grade — based on Impact (Value Over Baseline)"
                >
                  Headline
                </th>
                <th scope="col">Archetype</th>
                <th scope="col" className={styles.num} title="Volume: pickup count">
                  VOL
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Selection: avg pts/week per pickup while rostered"
                >
                  SEL
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Impact: Value Over Baseline (3-pt/wk floor)"
                >
                  IMP
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Timing: % of pickups whose post-pickup avg beat their pre-pickup avg"
                >
                  TIM
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Integration: % of pickup roster-weeks where the player was started"
                >
                  INT
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Persistence: avg weeks held when a pickup proved productive"
                >
                  PER
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsDesc.map((row) => (
                <tr key={row.season}>
                  <td className={styles.seasonCell}>{row.season}</td>
                  <td className={styles.num}>
                    {row.impactGrade ? <GradePill grade={row.impactGrade} /> : '—'}
                  </td>
                  <td className={styles.archetypeCell}>{row.archetype?.name ?? '—'}</td>
                  <td className={styles.num}>
                    <GradeCell grade={row.volumeGrade} value={row.volume} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.selectionGrade} value={row.selection.toFixed(2)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.impactGrade} value={row.vob.toFixed(0)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.timingGrade}
                      value={`${(row.timing * 100).toFixed(0)}%`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.integrationGrade}
                      value={`${(row.integration * 100).toFixed(0)}%`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.persistenceGrade}
                      value={`${row.persistence.toFixed(1)}wk`}
                    />
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
// Head-to-Head Records — full table against every opponent
// -------------------------------------------------------------------

interface H2HRecordsSectionProps {
  rows: OwnerH2HRow[];
  ownerIndex: OwnerIndex;
}

function H2HRecordsSection({ rows, ownerIndex }: H2HRecordsSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="owners-h2h-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="owners-h2h-heading" className={styles.sectionTitle}>
          Head-to-Head Records
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col" className={styles.num}>
                  W
                </th>
                <th scope="col" className={styles.num}>
                  L
                </th>
                <th scope="col" className={styles.num}>
                  PCT
                </th>
                <th scope="col" className={styles.num}>
                  Breakdown
                </th>
                <th scope="col" className={styles.num}>
                  Games
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const opp = ownerIndex[row.opponentKey];
                if (!opp) {
                  // Defensive — an opponent from a deleted account; render
                  // a neutral row rather than dropping the data entirely.
                  return (
                    <tr key={row.opponentKey}>
                      <td>
                        <span className={styles.unknownOpponent}>{row.opponentKey}</span>
                      </td>
                      <td className={styles.num}>
                        <span className={styles.recordWin}>{row.wins}</span>
                      </td>
                      <td className={styles.num}>
                        <span className={styles.recordLoss}>{row.losses}</span>
                      </td>
                      <td className={`${styles.num} ${styles.pctCell}`}>{formatPct(row.pct)}</td>
                      <td className={`${styles.num} ${styles.breakdownCell}`}>
                        <span className={styles.breakdownDim}>regular season</span>
                      </td>
                      <td className={styles.num}>{row.games}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={row.opponentKey}>
                    <td>
                      <TeamChip
                        name={latestTeamName(opp)}
                        owner={opp.displayName}
                        color={opp.color}
                      />
                    </td>
                    <td className={styles.num}>
                      <span className={styles.recordWin}>{row.wins}</span>
                    </td>
                    <td className={styles.num}>
                      <span className={styles.recordLoss}>{row.losses}</span>
                    </td>
                    <td className={`${styles.num} ${styles.pctCell}`}>{formatPct(row.pct)}</td>
                    <td className={`${styles.num} ${styles.breakdownCell}`}>
                      {row.hasPlayoff ? (
                        <>
                          <span className={styles.breakdownDim}>
                            {row.regW}-{row.regL} reg
                          </span>{' '}
                          <span className={styles.breakdownSep}>|</span>{' '}
                          <span className={styles.breakdownPo}>
                            {row.poW}-{row.poL} po
                          </span>
                        </>
                      ) : (
                        <span className={styles.breakdownDim}>regular season</span>
                      )}
                    </td>
                    <td className={styles.num}>{row.games}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Grade pill / cell — local to Owner Stats so the Seasons-tab versions
// stay scoped to that tab. The visual contract matches the legacy
// `.grade-pill` family (index.html lines 276-298) and the per-pill
// numeric breakdown rendered under each cell.
// -------------------------------------------------------------------

interface GradePillProps {
  grade: GradeLetter | null | undefined;
  /** Larger pill used for the headline GPA letter. */
  headline?: boolean;
}

function GradePill({ grade, headline = false }: GradePillProps) {
  if (!grade) return <>{'—'}</>;
  const cls = `${styles.gradePill} ${headline ? styles.gradePillHeadline : ''} ${gradeClass(grade)}`;
  return <span className={cls.trim()}>{grade}</span>;
}

function gradeClass(grade: GradeLetter): string {
  switch (grade) {
    case 'A+':
      return styles.gradeAPlus;
    case 'A':
      return styles.gradeA;
    case 'B':
      return styles.gradeB;
    case 'C':
      return styles.gradeC;
    case 'D':
      return styles.gradeD;
    case 'F':
      return styles.gradeF;
  }
}

interface GradeCellProps {
  grade: GradeLetter | null | undefined;
  value: ReactNode;
}

function GradeCell({ grade, value }: GradeCellProps) {
  return (
    <>
      <div>
        <GradePill grade={grade} />
      </div>
      <div className={styles.gradeUnder}>{value}</div>
    </>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** "0.500"-style PCT, leading zero stripped — mirrors the legacy
 * `pct.toFixed(3).replace(/^0/, '')` formatting. */
function formatPct(pct: number): string {
  return pct.toFixed(3).replace(/^0/, '');
}
