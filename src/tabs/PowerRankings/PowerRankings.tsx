// ===================================================================
// Power Rankings tab
// ===================================================================
//
// Three sub-panels:
//
//   1. Header + Week selector — pill row of every regular-season week
//      that's been played in the rated season. Defaults to the most
//      recent played week.
//   2. Rankings table       — one row per team, sorted by `powerScore`
//      desc, with movement vs. the prior week, the W-L record, PPG,
//      and a five-component breakdown row that expands on click /
//      tap.
//   3. Trajectory chart     — Recharts `LineChart` of every team's
//      rank across weeks 1..max-played. Y-axis is reversed so rank 1
//      is at the top. First use of Recharts in the project; it lazy-
//      loads with this tab.
//
// Reads from the shared `LeagueDataProvider` and waits for the
// `seasons-ready` (or terminal `ready`) tier — Power Rankings is
// computed entirely off `seasons`/`ownerIndex` and the flat-matchups
// view, no player DB needed.
//
// Pure stat selectors live in `src/lib/stats/powerRankings.ts`; this
// file is composition + markup only. The mid-week trajectory scan is
// memoized at the top of `PowerRankingsReady` so the table and chart
// share a single computation.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLeagueData } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import { TeamChip } from '../../lib/components/TeamChip';
import {
  maxPlayedWeek,
  resolveCurrentSnapshot,
  selectPowerRankings,
  type PowerRankingRow,
  type PowerRankingsResult,
} from '../../lib/stats/powerRankings';
import styles from './PowerRankings.module.css';

export default function PowerRankings() {
  const state = useLeagueData();

  // Power Rankings reads only seasons + ownerIndex — no player DB.
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

  return <PowerRankingsReady seasons={state.seasons} ownerIndex={state.ownerIndex} />;
}

// -------------------------------------------------------------------
// Body — split out so the heavy `useMemo`s only run once the provider
// finishes loading.
// -------------------------------------------------------------------

interface PowerRankingsReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
}

function PowerRankingsReady({ seasons, ownerIndex }: PowerRankingsReadyProps) {
  // Resolve the rated season + final played week once. The `season`
  // string here is the same string the snapshots will report back —
  // any mismatch would mean the resolver and the per-week selector
  // disagreed, which is a bug.
  const snapshot = useMemo(() => resolveCurrentSnapshot(seasons), [seasons]);
  const ratedSeason = useMemo(
    () => seasons.find((s) => s.season === snapshot.season) ?? null,
    [seasons, snapshot.season],
  );

  // Total weeks the chart and picker iterate over. Falls back to the
  // resolver's `throughWeek` if the season lookup somehow fails.
  const totalWeeks = useMemo(() => {
    if (!ratedSeason) return snapshot.throughWeek;
    const max = maxPlayedWeek(ratedSeason);
    return max > 0 ? max : snapshot.throughWeek;
  }, [ratedSeason, snapshot.throughWeek]);

  // Per-week snapshot scan. The trajectory chart and the rankings
  // table both pull from this single memoized array. Each entry is
  // the full `PowerRankingsResult` for `throughWeek = i + 1`.
  const weeklySnapshots = useMemo<PowerRankingsResult[]>(() => {
    if (totalWeeks < 1) return [];
    const out: PowerRankingsResult[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      out.push(selectPowerRankings(seasons, ownerIndex, w));
    }
    return out;
  }, [seasons, ownerIndex, totalWeeks]);

  // The week the user is viewing. Defaults to the most recent played
  // week; falls back to total weeks if the resolver lagged behind.
  const defaultWeek = snapshot.throughWeek > 0 ? snapshot.throughWeek : totalWeeks;
  const [selectedWeek, setSelectedWeek] = useState<number>(defaultWeek);

  // If the user picks a week beyond the available range (shouldn't
  // happen via the picker, but defensive), clamp it.
  const safeWeek = Math.min(Math.max(selectedWeek, 1), Math.max(totalWeeks, 1));
  const currentResult = weeklySnapshots[safeWeek - 1];

  if (!ratedSeason || totalWeeks === 0 || !currentResult) {
    return (
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <span className={`${styles.sectionBar} ${styles.barGold}`} aria-hidden="true" />
          <h2 className={styles.sectionTitleSm}>Power Rankings</h2>
        </header>
        <div className={styles.card}>
          <p className={styles.status}>No regular-season games have been played yet.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <RankingsHeader
        season={currentResult.season}
        throughWeek={currentResult.throughWeek}
        totalWeeks={totalWeeks}
        selectedWeek={safeWeek}
        onWeekChange={setSelectedWeek}
      />
      <RankingsTable result={currentResult} />
      <TrajectorySection
        snapshots={weeklySnapshots}
        ownerIndex={ownerIndex}
        selectedWeek={safeWeek}
      />
    </>
  );
}

// -------------------------------------------------------------------
// Section 1 — Header + week picker
// -------------------------------------------------------------------

interface RankingsHeaderProps {
  season: string;
  throughWeek: number;
  totalWeeks: number;
  selectedWeek: number;
  onWeekChange: (week: number) => void;
}

function RankingsHeader({
  season,
  throughWeek,
  totalWeeks,
  selectedWeek,
  onWeekChange,
}: RankingsHeaderProps) {
  // One pill per played week. Tap to jump the table + chart to that
  // snapshot. Wrap and scroll on phone widths.
  const weeks: number[] = [];
  for (let w = 1; w <= totalWeeks; w++) weeks.push(w);

  return (
    <section className={styles.section} aria-labelledby="power-rankings-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barGold}`} aria-hidden="true" />
        <h2 id="power-rankings-heading" className={styles.sectionTitleSm}>
          <span aria-hidden="true">⚡</span> Power Rankings
        </h2>
        <span className={styles.countPill}>
          THROUGH WEEK {throughWeek} · {season}
        </span>
      </header>

      <div className={styles.weekPicker} role="tablist" aria-label="Select week">
        {weeks.map((w) => {
          const active = w === selectedWeek;
          return (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.weekPill}${active ? ` ${styles.weekPillActive}` : ''}`}
              onClick={() => onWeekChange(w)}
            >
              W{w}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Section 2 — Rankings table
// -------------------------------------------------------------------

interface RankingsTableProps {
  result: PowerRankingsResult;
}

function RankingsTable({ result }: RankingsTableProps) {
  // Track the row whose component breakdown is open. Tap-to-toggle on
  // every device — keeps the touch + mouse paths identical and avoids
  // hover-only tooltips that mobile users can't reach.
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className={styles.section} aria-labelledby="power-rankings-table-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barAccent}`} aria-hidden="true" />
        <h2 id="power-rankings-table-heading" className={styles.sectionTitleSm}>
          Standings
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Power Score</h3>
          <span className={styles.hint}>Tap a row to see the component breakdown</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Team</th>
                <th scope="col" className={styles.num}>
                  Score
                </th>
                <th scope="col" className={styles.num}>
                  Move
                </th>
                <th scope="col" className={styles.num}>
                  Record
                </th>
                <th scope="col" className={styles.num}>
                  PPG
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rankings.map((row, i) => {
                const isOpen = expanded === row.ownerKey;
                return (
                  <RankingRow
                    key={row.ownerKey}
                    row={row}
                    idx={i}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : row.ownerKey)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface RankingRowProps {
  row: PowerRankingRow;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;
}

function RankingRow({ row, idx, isOpen, onToggle }: RankingRowProps) {
  const movement = row.movement;
  const movementCell =
    movement == null ? (
      <span className={styles.numNeutral}>—</span>
    ) : movement > 0 ? (
      <span className={styles.numWin}>▲ {movement}</span>
    ) : movement < 0 ? (
      <span className={styles.numLoss}>▼ {Math.abs(movement)}</span>
    ) : (
      <span className={styles.numNeutral}>—</span>
    );

  // `row.wins` includes 0.5 for each tie. Display whole numbers when
  // there are no ties to keep the legacy "10-4" look, otherwise show
  // the decimal so the math is visible.
  const winLabel = row.ties > 0 ? row.wins.toFixed(1) : String(Math.round(row.wins));
  const lossLabel = row.ties > 0 ? row.losses.toFixed(1) : String(Math.round(row.losses));

  return (
    <>
      <tr className={`${styles.rowTappable}${isOpen ? ` ${styles.rowOpen}` : ''}`}>
        <td className={rankClass(idx)}>
          <button
            type="button"
            className={styles.expandButton}
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} component breakdown for ${row.displayName}`}
          >
            <span className={styles.rankNumber}>{idx + 1}</span>
            <span
              className={`${styles.expandChevron}${isOpen ? ` ${styles.expandChevronOpen}` : ''}`}
              aria-hidden="true"
            >
              ▸
            </span>
          </button>
        </td>
        <td>
          <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
        </td>
        <td className={`${styles.num} ${styles.scoreBig}`}>{row.powerScore.toFixed(3)}</td>
        <td className={styles.num}>{movementCell}</td>
        <td className={styles.num}>
          <span className={styles.recordWin}>{winLabel}</span>
          <span className={styles.recordDash}>-</span>
          <span className={styles.recordLoss}>{lossLabel}</span>
        </td>
        <td className={`${styles.num} ${styles.numNeutral}`}>{row.pointsPerGame.toFixed(1)}</td>
      </tr>
      {isOpen && (
        <tr className={styles.breakdownRow}>
          <td colSpan={6} className={styles.breakdownCell}>
            <ComponentBreakdown row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

interface ComponentBreakdownProps {
  row: PowerRankingRow;
}

function ComponentBreakdown({ row }: ComponentBreakdownProps) {
  const c = row.components;
  return (
    <div className={styles.breakdown}>
      <ComponentBar label="Record" hint="Win rate" comp={c.record} />
      <ComponentBar label="All-Play" hint="Expected wins" comp={c.allPlay} />
      <ComponentBar label="Points" hint="PPG" comp={c.pointsFor} />
      <ComponentBar label="Recent" hint="Last 3 weeks" comp={c.recentForm} />
      <ComponentBar label="Streak" hint={`${row.streakLength}${row.streakType}`} comp={c.streak} />
    </div>
  );
}

interface ComponentBarProps {
  label: string;
  hint: string;
  comp: { raw: number; normalized: number; weight: number; contribution: number };
}

function ComponentBar({ label, hint, comp }: ComponentBarProps) {
  // Normalized fill on the bar; weight + contribution surfaced
  // numerically so the breakdown is honest about how much each
  // component actually moves the final score.
  const fill = `${(comp.normalized * 100).toFixed(0)}%`;
  return (
    <div className={styles.bar}>
      <div className={styles.barHeader}>
        <span className={styles.barLabel}>{label}</span>
        <span className={styles.barHint}>{hint}</span>
      </div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: fill }} aria-hidden="true" />
      </div>
      <div className={styles.barFooter}>
        <span className={styles.barWeight}>w {comp.weight.toFixed(2)}</span>
        <span className={styles.barContribution}>+{comp.contribution.toFixed(3)}</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Section 3 — Trajectory chart
// -------------------------------------------------------------------

interface TrajectorySectionProps {
  snapshots: PowerRankingsResult[];
  ownerIndex: OwnerIndex;
  selectedWeek: number;
}

function TrajectorySection({ snapshots, ownerIndex, selectedWeek }: TrajectorySectionProps) {
  // Recharts wants a `data` array shaped `{ x, owner1: y1, owner2: y2, ... }`.
  // We wide-pivot the per-week snapshots into one row per week and one
  // column per owner. Owners not yet in the rankings at a given week
  // get `null`, which Recharts skips cleanly.
  type ChartDatum = Record<string, number | null | string>;

  const { data, owners } = useMemo<{
    data: ChartDatum[];
    owners: Array<{ key: string; displayName: string; color: string }>;
  }>(() => {
    const ownersMap = new Map<string, { key: string; displayName: string; color: string }>();
    for (const snap of snapshots) {
      for (const row of snap.rankings) {
        if (!ownersMap.has(row.ownerKey)) {
          ownersMap.set(row.ownerKey, {
            key: row.ownerKey,
            displayName: row.displayName,
            color: row.color,
          });
        }
      }
    }
    const ownerList = Array.from(ownersMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );

    const rows: ChartDatum[] = snapshots.map((snap) => {
      const row: ChartDatum = { week: `W${snap.throughWeek}`, weekNum: snap.throughWeek };
      const byKey = new Map(snap.rankings.map((r) => [r.ownerKey, r.rank] as const));
      for (const o of ownerList) {
        row[o.key] = byKey.get(o.key) ?? null;
      }
      return row;
    });

    return { data: rows, owners: ownerList };
  }, [snapshots]);

  const teamCount = owners.length;
  // Y-axis ticks every rank 1..N. Reversed so rank 1 sits at top.
  const yTicks: number[] = [];
  for (let i = 1; i <= teamCount; i++) yTicks.push(i);

  // Look up the owner index entry for the tooltip so we can render
  // colored chips that match the rest of the app. Falls back to the
  // pivoted `owners` list if the owner index doesn't have an entry.
  const ownerLookup = useMemo(
    () =>
      new Map(
        owners.map((o) => {
          const fromIndex = ownerIndex[o.key];
          return [
            o.key,
            {
              displayName: fromIndex?.displayName ?? o.displayName,
              color: fromIndex?.color ?? o.color,
            },
          ] as const;
        }),
      ),
    [owners, ownerIndex],
  );

  return (
    <section className={styles.section} aria-labelledby="power-rankings-trajectory-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barGreen}`} aria-hidden="true" />
        <h2 id="power-rankings-trajectory-heading" className={styles.sectionTitleSm}>
          <span aria-hidden="true">📈</span> Trajectory
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Rank by Week</h3>
          <span className={styles.hint}>Lower line = better rank · current week dashed</span>
        </div>
        <div className={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="week"
                stroke="var(--text-dim)"
                tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
              />
              <YAxis
                reversed
                domain={[1, teamCount]}
                ticks={yTicks}
                allowDecimals={false}
                stroke="var(--text-dim)"
                tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
                width={32}
              />
              <Tooltip content={(props) => renderTrajectoryTooltip(props, ownerLookup)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {owners.map((o) => (
                <Line
                  key={o.key}
                  type="monotone"
                  dataKey={o.key}
                  name={o.displayName}
                  stroke={o.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className={styles.chartCaption}>
          Currently viewing W{selectedWeek}. Tap a week pill above to jump the table.
        </p>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Recharts tooltip — colored chip + rank for each line at the hovered week.
// -------------------------------------------------------------------
//
// Recharts passes `<Tooltip content={fn}>` a `TooltipContentProps`
// payload (active flag, the hovered series array, and the X-axis
// label). We render-prop the function instead of declaring a typed
// component because the `Tooltip` content type wants either a React
// element or a function — typing a custom component to match
// `TooltipContentProps` directly fights Recharts' generic
// inference. A plain render function is the path of least
// resistance and stays inside the Recharts type contract.

interface TrajectoryTooltipPayload {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: number | string | ReadonlyArray<number | string>;
  name?: string | number;
  color?: string;
}

interface TrajectoryTooltipParams {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TrajectoryTooltipPayload>;
}

function renderTrajectoryTooltip(
  props: TrajectoryTooltipParams,
  ownerLookup: Map<string, { displayName: string; color: string }>,
): ReactNode {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  // Sort hovered series by rank ascending so the leader is at the top.
  const items = props.payload
    .filter((p): p is TrajectoryTooltipPayload & { value: number } => typeof p.value === 'number')
    .sort((a, b) => a.value - b.value);
  if (items.length === 0) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHeader}>{props.label}</div>
      <ul className={styles.tooltipList}>
        {items.map((entry) => {
          const owner = ownerLookup.get(String(entry.dataKey));
          const color = owner?.color ?? entry.color ?? 'var(--accent)';
          const name = owner?.displayName ?? String(entry.name ?? entry.dataKey ?? '');
          return (
            <li key={String(entry.dataKey)} className={styles.tooltipRow}>
              <span
                className={styles.tooltipDot}
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className={styles.tooltipName} style={{ color }}>
                {name}
              </span>
              <span className={styles.tooltipRank}>#{entry.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
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
