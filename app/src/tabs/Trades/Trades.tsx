// ===================================================================
// Trades tab
// ===================================================================
//
// Three sections, mirroring the legacy `#trades` panel
// (index.html lines 543-585 markup, lines 1256-1429 builder, lines
// 2357-2487 renderer):
//
//   1. Grand Larceny · While Rostered  — Top 10 by WR margin.
//   2. Grand Larceny · Season Total    — Top 10 by ST margin.
//   3. Full Trade History              — chronological, filterable by
//      season, sortable by date or margin.
//
// Plus a methodology box at the bottom that documents WR vs ST and
// notes the draft-pick-trade caveat.
//
// Reads from the shared `LeagueDataProvider` and waits for the `ready`
// state because every party block surfaces individual player names +
// positions out of the Sleeper player DB. Pure stat selectors live in
// `app/src/lib/stats/trades.ts`; this file is composition + markup
// only.

import { useMemo, useState } from 'react';
import { useLeagueData } from '../../lib/leagueData';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerIndex, SeasonDetails } from '../../lib/owners';
import {
  buildTrades,
  selectFilteredTrades,
  selectMostLopsidedByST,
  selectMostLopsidedByWR,
  selectTradeSeasons,
  type Trade,
  type TradeSortMode,
} from '../../lib/stats/trades';
import TradeCard from './TradeCard';
import styles from './Trades.module.css';

export default function Trades() {
  const state = useLeagueData();

  // The trade cards surface individual player names + positions out of
  // the Sleeper player DB. Wait for the terminal `ready` tier so the
  // tab paints with names from the start rather than rendering as
  // anonymized rows that pop in moments later.
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
    <TradesReady
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

interface TradesReadyProps {
  seasons: SeasonDetails[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

function TradesReady({ seasons, ownerIndex, players }: TradesReadyProps) {
  // Build the full chronological trade list once; downstream selectors
  // are O(N) walks of a list that's at most a few hundred entries even
  // across the league's full history.
  const { trades } = useMemo(
    () => buildTrades(seasons, ownerIndex),
    [seasons, ownerIndex],
  );

  const lopsidedWR = useMemo(() => selectMostLopsidedByWR(trades), [trades]);
  const lopsidedST = useMemo(() => selectMostLopsidedByST(trades), [trades]);
  const seasonsWithTrades = useMemo(() => selectTradeSeasons(trades), [trades]);

  // Filter / sort state for the chronological list. Defaults match
  // the legacy `<select>` initial values (lines 564, 568).
  const [seasonFilter, setSeasonFilter] = useState<string>('');
  const [sortMode, setSortMode] = useState<TradeSortMode>('date-desc');

  const filtered = useMemo(
    () =>
      selectFilteredTrades(trades, {
        season: seasonFilter || undefined,
        sort: sortMode,
      }),
    [trades, seasonFilter, sortMode],
  );

  // Empty-history fast path — mirrors the legacy guard (line 2358).
  if (trades.length === 0) {
    return (
      <>
        <header className={`${styles.sectionHeader}`}>
          <span className={styles.sectionBar} aria-hidden="true" />
          <h2 className={styles.sectionTitleLarge}>Trade History</h2>
        </header>
        <div className={styles.card}>
          <div className={styles.empty}>No trades yet.</div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Top-of-tab headline. Bigger than the per-card sub-headers. */}
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 className={styles.sectionTitleLarge}>Trade History</h2>
      </header>

      {/* ----- Grand Larceny · While Rostered ----- */}
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barRed}`} aria-hidden="true" />
        <h2 className={styles.sectionTitle}>
          <span aria-hidden="true">🚨</span> Grand Larceny · While Rostered
        </h2>
        <span className={styles.countPill}>TOP 10</span>
      </header>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Most Lopsided by WR</h3>
          <span className={styles.cardHint}>
            Based on points scored while the new owner still held them
          </span>
        </div>
        <TradeList
          trades={lopsidedWR}
          ownerIndex={ownerIndex}
          players={players}
          ranked
          emptyMessage="Not enough scorable trades yet."
        />
      </div>

      {/* ----- Grand Larceny · Season Total ----- */}
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barRed}`} aria-hidden="true" />
        <h2 className={styles.sectionTitle}>
          <span aria-hidden="true">🚨</span> Grand Larceny · Season Total
        </h2>
        <span className={styles.countPill}>TOP 10</span>
      </header>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Most Lopsided by ST</h3>
          <span className={styles.cardHint}>
            Based on total post-trade points regardless of later drops
          </span>
        </div>
        <TradeList
          trades={lopsidedST}
          ownerIndex={ownerIndex}
          players={players}
          ranked
          emptyMessage="Not enough scorable trades yet."
        />
      </div>

      {/* ----- Full Trade History ----- */}
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.barAccent}`} aria-hidden="true" />
        <h2 className={styles.sectionTitle}>
          <span aria-hidden="true">📜</span> Full Trade History
        </h2>
        <span className={styles.countPill}>{trades.length} TRADES</span>
      </header>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>All Trades, Chronological</h3>
          <div className={styles.cardControls}>
            <label htmlFor="trade-filter-season" className={styles.visuallyHidden}>
              Filter by season
            </label>
            <select
              id="trade-filter-season"
              className={styles.cardControl}
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
            >
              <option value="">All seasons</option>
              {seasonsWithTrades.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label htmlFor="trade-sort" className={styles.visuallyHidden}>
              Sort
            </label>
            <select
              id="trade-sort"
              className={styles.cardControl}
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as TradeSortMode)}
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="margin-desc">Biggest margin</option>
            </select>
          </div>
        </div>
        <TradeList
          trades={filtered}
          ownerIndex={ownerIndex}
          players={players}
          ranked={false}
          emptyMessage="No trades match the filter."
        />
      </div>

      {/* ----- Methodology / caveats ----- */}
      <div className={styles.methodology}>
        <strong>How it&apos;s measured:</strong> For each player in a trade, we
        sum points scored <em>after</em> the trade date. Two metrics shown:
        <br />
        <span className={styles.methodologyLabel}>WR</span> (While Rostered) —
        points scored only while the receiving team still had the player.
        Rewards using what you got.
        <br />
        <span className={styles.methodologyLabel}>ST</span> (Season Total) — all
        remaining season points regardless of later moves. Rewards pure talent
        acquired.
        <br />
        <br />
        <em>Caveats:</em> Draft pick trades can&apos;t be evaluated from Sleeper
        data alone — they&apos;re shown but without a winner. Injuries,
        collusion, and context aren&apos;t captured here. Don&apos;t take a
        &ldquo;bad trade&rdquo; label personally... unless you deserve to.
      </div>
    </>
  );
}

// -------------------------------------------------------------------
// TradeList — renders a sequence of TradeCards or an empty placeholder
// -------------------------------------------------------------------

interface TradeListProps {
  trades: Trade[];
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
  /** When true, prefix each card with a 1-indexed rank badge. */
  ranked: boolean;
  emptyMessage: string;
}

function TradeList({
  trades,
  ownerIndex,
  players,
  ranked,
  emptyMessage,
}: TradeListProps) {
  if (trades.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }
  return (
    <>
      {trades.map((trade, i) => (
        <TradeCard
          key={trade.txId}
          trade={trade}
          rank={ranked ? i + 1 : null}
          ownerIndex={ownerIndex}
          players={players}
        />
      ))}
    </>
  );
}
