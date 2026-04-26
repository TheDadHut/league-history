// ===================================================================
// Trades — pure stat selectors
// ===================================================================
//
// Mirrors the legacy `buildTrades()` (index.html lines 1256-1429) and
// the supporting parts of `renderTrades()` / `renderTradeCard()` (lines
// 2357-2487). The full chronological trade history, per-trade WR/ST
// scoring, and per-owner roll-ups live here as pure functions; the
// Trades tab consumes them.
//
// Two metrics are computed per party of a trade:
//
//   - `wrNet` (While Rostered) — points scored by received players
//     ONLY while the receiving team still owned them, minus the same
//     measurement on the players given up (calculated from the
//     RECEIVER'S roster). Rewards using what you got.
//
//   - `stNet` (Season Total) — all points scored by received players
//     after the trade week, regardless of later moves, minus the same
//     for the players given up. Rewards pure talent acquired.
//
// "After the trade" means strictly after `trade.week` — same-week
// scoring is excluded. Per-player ownership is reconstructed from the
// per-week matchup payload (a player appearing in roster `R` for week
// `W` is treated as owned by `R` that week).
//
// Pure pick-only trades (no players move) are kept in the output for
// rendering but flagged with `hasOnlyDraftPicks: true`. They're
// excluded from the per-owner roll-ups and from the lopsided rankings
// because Sleeper data alone can't score them.

import type { OwnerIndex } from '../owners';
import type { SeasonDetails } from '../owners';
import type { Transaction, TransactionDraftPick } from '../../types/sleeper';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface TradeParty {
  rosterId: number;
  /** `OwnerIndex` key. May not have a corresponding entry if the owner
   * has been deleted from the league — callers should default-render
   * gracefully if `ownerIndex[ownerKey]` is missing. */
  ownerKey: string;
  /** Player IDs this party received in the trade. */
  received: string[];
  /** Player IDs this party gave up in the trade. */
  gaveUp: string[];
  /** While-Rostered points gained from received players (post-trade only). */
  wrGained: number;
  /** Season-Total points gained from received players (post-trade only). */
  stGained: number;
  /** While-Rostered points lost to the new owner from given-up players. */
  wrLost: number;
  /** Season-Total points lost to the new owner from given-up players. */
  stLost: number;
  /** `wrGained - wrLost`. Positive when this party "won" by WR. */
  wrNet: number;
  /** `stGained - stLost`. Positive when this party "won" by ST. */
  stNet: number;
}

/** A draft pick attached to a trade, normalized for display. */
export interface TradeDraftPick {
  /** Year the pick is for, e.g. "2025". */
  season: string;
  /** 1-indexed round. */
  round: number;
  /** Roster that gave up the pick. */
  fromRoster: number;
  /** Roster that received the pick. */
  toRoster: number;
}

export interface Trade {
  /** Sleeper transaction id; stable per-trade and unique across leagues. */
  txId: string;
  /** League season ("2024", "2023", …) the trade landed in. */
  season: string;
  /** League week the trade landed in (the Sleeper "leg" field). */
  week: number;
  /** Unix ms timestamp from `transaction.created`; null when Sleeper omits it. */
  created: number | null;
  parties: TradeParty[];
  draftPicks: TradeDraftPick[];
  /** WR winner — top wrNet party. Null only when there are < 2 parties. */
  wrWinner: TradeParty | null;
  /** WR loser — bottom wrNet party. Null only when there are < 2 parties. */
  wrLoser: TradeParty | null;
  /** ST winner — top stNet party. */
  stWinner: TradeParty | null;
  /** ST loser — bottom stNet party. */
  stLoser: TradeParty | null;
  /** WR margin (winner.wrNet - loser.wrNet). Always ≥ 0. */
  wrMargin: number;
  /** ST margin (winner.stNet - loser.stNet). Always ≥ 0. */
  stMargin: number;
  /**
   * Legacy alias kept for the all-trades sort dropdown ("Biggest margin"),
   * which maps to the WR margin. Mirrors the legacy code that exposed
   * `trade.margin` separately from `wrMargin`.
   */
  margin: number;
  /** True for pure pick swaps (no players moved). Excluded from rankings + roll-ups. */
  hasOnlyDraftPicks: boolean;
  /** Number of distinct teams involved. 2 = side-by-side, 3+ = three-way. */
  partyCount: number;
}

export interface TradeOwnerStats {
  /** Trades the owner participated in (excludes pure pick-only trades). */
  tradeCount: number;
  /** WR wins — only counted in 2-party trades, only when the WR margin ≥ 2. */
  wins: number;
  /** WR losses — only counted in 2-party trades, only when the WR margin ≥ 2. */
  losses: number;
  /** Effective ties — 2-party trades where |wrMargin| < 2. */
  ties: number;
  /** Sum of `wrNet` across every trade this owner participated in. */
  netWR: number;
  /** Sum of `stNet` across every trade this owner participated in. */
  netST: number;
}

export type TradeStatsByOwner = Record<string, TradeOwnerStats>;

export interface TradesResult {
  trades: Trade[];
  statsByOwner: TradeStatsByOwner;
}

// -------------------------------------------------------------------
// Builders
// -------------------------------------------------------------------

/**
 * Walks every season's transactions, scoring each trade and rolling up
 * per-owner totals. Pure: no I/O, no side effects, deterministic order
 * (chronological by `created`, ties broken by season then week).
 */
export function buildTrades(seasons: SeasonDetails[], ownerIndex: OwnerIndex): TradesResult {
  const trades: Trade[] = [];

  for (const season of seasons) {
    const yearTrades = buildSeasonTrades(season);
    trades.push(...yearTrades);
  }

  // Final order: oldest-first across all seasons. Sleeper's `created` is
  // ms since epoch; we fall back to season+week so two trades with
  // missing timestamps still order stably.
  trades.sort((a, b) => {
    const ca = a.created ?? 0;
    const cb = b.created ?? 0;
    if (ca !== cb) return ca - cb;
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    return a.week - b.week;
  });

  const statsByOwner = buildOwnerStats(trades, ownerIndex);
  return { trades, statsByOwner };
}

// -------------------------------------------------------------------
// Per-season trade extraction
// -------------------------------------------------------------------

/** Map roster_id → owner key for one season. */
function buildRosterToOwnerKey(season: SeasonDetails): Map<number, string> {
  const map = new Map<number, string>();
  for (const roster of season.rosters) {
    if (!roster.owner_id) continue;
    const user = season.users.find((u) => u.user_id === roster.owner_id);
    if (!user) continue;
    const key = (user.display_name || user.username || '').toLowerCase().trim();
    if (key) map.set(roster.roster_id, key);
  }
  return map;
}

interface PerSeasonPlayerWeek {
  /** player_id → week → points scored that week. */
  pointsByWeek: Map<string, Map<number, number>>;
  /** player_id → week → roster_id that owned the player that week. */
  ownerByWeek: Map<string, Map<number, number>>;
}

/**
 * Build the per-week per-player points and ownership maps for one
 * season. Mirrors the inline pass at the top of legacy `buildTrades`
 * (lines 1271-1289), which iterates all matchups for the season and
 * writes `playerWeeklyPoints` + `playerWeeklyOwner`.
 *
 * The legacy code reads from `state.allMatchups`, which has already
 * filtered out matchups with `matchup_id == null` and matchups where
 * both teams scored 0 (incomplete/future weeks). We replicate that
 * filter so the WR/ST math matches the legacy output for old trades.
 */
function buildSeasonPlayerWeekIndex(
  season: SeasonDetails,
  rosterToOwner: Map<number, string>,
): PerSeasonPlayerWeek {
  const pointsByWeek = new Map<string, Map<number, number>>();
  const ownerByWeek = new Map<string, Map<number, number>>();

  season.weeklyMatchups.forEach((week, idx) => {
    const weekNum = idx + 1;
    if (!week || week.length === 0) return;

    // Group by matchup_id and only keep paired matchups with at least
    // one team scoring (legacy `allMatchups` filter).
    const byMatchup = new Map<number, typeof week>();
    for (const m of week) {
      if (m.matchup_id == null) continue;
      const list = byMatchup.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchup.set(m.matchup_id, list);
    }

    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (!a || !b) continue;
      // Legacy `buildAllMatchups` (index.html line 869) drops matchup
      // pairs where either roster lacks a known owner — commissioner
      // /deleted accounts shouldn't contribute to per-player ownership
      // attribution. Mirror it here so WR points stay aligned with the
      // legacy output.
      if (!rosterToOwner.get(a.roster_id) || !rosterToOwner.get(b.roster_id)) {
        continue;
      }
      const scoreA = a.points || 0;
      const scoreB = b.points || 0;
      if (scoreA === 0 && scoreB === 0) continue;

      for (const m of pair) {
        const pts = m.players_points && !Array.isArray(m.players_points) ? m.players_points : {};
        for (const pid of m.players ?? []) {
          if (!pid || pid === '0') continue;
          let weekPts = pointsByWeek.get(pid);
          if (!weekPts) {
            weekPts = new Map();
            pointsByWeek.set(pid, weekPts);
          }
          weekPts.set(weekNum, pts[pid] ?? 0);

          let weekOwn = ownerByWeek.get(pid);
          if (!weekOwn) {
            weekOwn = new Map();
            ownerByWeek.set(pid, weekOwn);
          }
          weekOwn.set(weekNum, m.roster_id);
        }
      }
    }
  });

  return { pointsByWeek, ownerByWeek };
}

/** Sum points scored after `tradeWeek` for one player; split into WR (only while owned by `receivingRoster`) and ST (any roster). */
function calcPlayerValue(
  playerId: string,
  tradeWeek: number,
  receivingRoster: number,
  index: PerSeasonPlayerWeek,
): { wr: number; st: number } {
  const weekPts = index.pointsByWeek.get(playerId);
  const weekOwn = index.ownerByWeek.get(playerId);
  if (!weekPts) return { wr: 0, st: 0 };
  let st = 0;
  let wr = 0;
  for (const [wk, pts] of weekPts) {
    if (wk <= tradeWeek) continue;
    st += pts;
    if (weekOwn?.get(wk) === receivingRoster) wr += pts;
  }
  return { wr, st };
}

/**
 * Extract the trade list for a single season, applying WR/ST scoring.
 * Mirrors the per-season body of legacy `buildTrades` (lines 1259-1387).
 */
function buildSeasonTrades(season: SeasonDetails): Trade[] {
  if (!season.transactions || season.transactions.length === 0) return [];

  const rosterToOwner = buildRosterToOwnerKey(season);
  const playerWeek = buildSeasonPlayerWeekIndex(season, rosterToOwner);

  // Flatten weekly transactions into one list, filter to completed trades,
  // and order chronologically so per-trade indexing stays stable.
  const allTx: Transaction[] = season.transactions
    .flat()
    .filter((t) => t.type === 'trade' && t.status === 'complete');
  allTx.sort((a, b) => (a.created ?? 0) - (b.created ?? 0));

  const out: Trade[] = [];
  for (const tx of allTx) {
    out.push(buildSingleTrade(tx, season.season, rosterToOwner, playerWeek));
  }
  return out;
}

/** Construct one Trade from a single Sleeper transaction. */
function buildSingleTrade(
  tx: Transaction,
  seasonYear: string,
  rosterToOwner: Map<number, string>,
  playerWeek: PerSeasonPlayerWeek,
): Trade {
  const tradeWeek = tx.leg || 1;
  const adds = tx.adds ?? {};
  const drops = tx.drops ?? {};
  const draftPicksRaw: TransactionDraftPick[] = tx.draft_picks ?? [];

  // Build the participating-roster set from every channel Sleeper might
  // place a roster id in: the transaction's roster_ids, the targets of
  // adds, and the sources of drops. Mirrors the legacy union (line
  // 1303). Pure pick swaps may have empty adds/drops but still surface
  // through `roster_ids`.
  const rosterSet = new Set<number>(tx.roster_ids ?? []);
  for (const target of Object.values(adds)) rosterSet.add(target);
  for (const source of Object.values(drops)) rosterSet.add(source);

  const parties: TradeParty[] = [];
  for (const rid of rosterSet) {
    const ownerKey = rosterToOwner.get(rid);
    if (!ownerKey) continue;
    const received: string[] = [];
    const gaveUp: string[] = [];
    for (const [pid, targetRid] of Object.entries(adds)) {
      if (targetRid === rid) received.push(pid);
    }
    for (const [pid, sourceRid] of Object.entries(drops)) {
      if (sourceRid === rid) gaveUp.push(pid);
    }
    parties.push({
      rosterId: rid,
      ownerKey,
      received,
      gaveUp,
      wrGained: 0,
      stGained: 0,
      wrLost: 0,
      stLost: 0,
      wrNet: 0,
      stNet: 0,
    });
  }

  // Per-party valuation: gained = sum over received players of their
  // post-trade-week points (split WR/ST). Lost = same for given-up
  // players, but measured on the RECEIVER'S roster (so a player who
  // got dropped after the trade stops counting toward the original
  // receiver's WR loss).
  for (const party of parties) {
    for (const pid of party.received) {
      const v = calcPlayerValue(pid, tradeWeek, party.rosterId, playerWeek);
      party.wrGained += v.wr;
      party.stGained += v.st;
    }
  }

  for (const party of parties) {
    for (const pid of party.gaveUp) {
      const receiver = parties.find((p) => p.received.includes(pid));
      if (!receiver) continue;
      const v = calcPlayerValue(pid, tradeWeek, receiver.rosterId, playerWeek);
      party.wrLost += v.wr;
      party.stLost += v.st;
    }
  }

  for (const p of parties) {
    p.wrNet = p.wrGained - p.wrLost;
    p.stNet = p.stGained - p.stLost;
  }

  // Winners/losers are evaluated independently per metric — the WR
  // winner can disagree with the ST winner. Margins are ≥ 0 by
  // construction once parties are sorted.
  const byWR = [...parties].sort((a, b) => b.wrNet - a.wrNet);
  const byST = [...parties].sort((a, b) => b.stNet - a.stNet);
  const wrWinner = byWR[0] ?? null;
  const wrLoser = byWR.length >= 2 ? (byWR[byWR.length - 1] ?? null) : null;
  const stWinner = byST[0] ?? null;
  const stLoser = byST.length >= 2 ? (byST[byST.length - 1] ?? null) : null;
  const wrMargin = wrWinner && wrLoser && parties.length >= 2 ? wrWinner.wrNet - wrLoser.wrNet : 0;
  const stMargin = stWinner && stLoser && parties.length >= 2 ? stWinner.stNet - stLoser.stNet : 0;

  const draftPicks: TradeDraftPick[] = draftPicksRaw.map((p) => ({
    season: p.season,
    round: p.round,
    fromRoster: p.previous_owner_id,
    toRoster: p.owner_id,
  }));

  // "Pure pick swap" detection mirrors the legacy condition (line 1384):
  // every party moved zero players AND at least one pick changed hands.
  // We also flag the case where there are NO parties (lone-roster
  // commissioner moves) so consumers don't have to guard against it
  // separately — those trades render under the pick-only path.
  const hasOnlyDraftPicks =
    parties.every((p) => p.received.length === 0 && p.gaveUp.length === 0) && draftPicks.length > 0;

  return {
    txId: tx.transaction_id,
    season: seasonYear,
    week: tradeWeek,
    created: tx.created,
    parties,
    draftPicks,
    wrWinner,
    wrLoser,
    stWinner,
    stLoser,
    wrMargin,
    stMargin,
    margin: wrMargin,
    hasOnlyDraftPicks,
    partyCount: parties.length,
  };
}

// -------------------------------------------------------------------
// Per-owner roll-ups
// -------------------------------------------------------------------

/**
 * Build the per-owner trade summary from the chronological trade list.
 * Mirrors the legacy roll-up (lines 1390-1428). Pure pick-only trades
 * are skipped — no scorable value, so they shouldn't tip an owner's
 * netWR/netST one way or the other.
 *
 * Win/loss attribution is intentionally narrow:
 *   - Only 2-party trades count (3+-way trades are too noisy to call
 *     a clean winner/loser).
 *   - A trade with |wrMargin| < 2 counts as a tie for both parties
 *     rather than a clean win/loss — preserves the "wash" intuition.
 */
function buildOwnerStats(trades: Trade[], ownerIndex: OwnerIndex): TradeStatsByOwner {
  const stats: TradeStatsByOwner = {};
  for (const key of Object.keys(ownerIndex)) {
    stats[key] = {
      tradeCount: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      netWR: 0,
      netST: 0,
    };
  }

  for (const t of trades) {
    if (t.hasOnlyDraftPicks) continue;

    for (const party of t.parties) {
      const s = stats[party.ownerKey];
      if (!s) continue;
      s.tradeCount++;
      s.netWR += party.wrNet;
      s.netST += party.stNet;
    }

    if (t.partyCount === 2 && t.wrWinner && t.wrLoser) {
      const winnerStats = stats[t.wrWinner.ownerKey];
      const loserStats = stats[t.wrLoser.ownerKey];
      if (Math.abs(t.wrMargin) < 2) {
        if (winnerStats) winnerStats.ties++;
        if (loserStats) loserStats.ties++;
      } else {
        if (winnerStats) winnerStats.wins++;
        if (loserStats) loserStats.losses++;
      }
    }
  }

  return stats;
}

// -------------------------------------------------------------------
// Top-level selectors used by the Trades tab
// -------------------------------------------------------------------

/**
 * Top 10 most-lopsided trades by WR margin. Excludes pure pick swaps
 * (unscorable) and any trade with fewer than 2 scoring parties.
 * Mirrors the legacy `mostLopsidedWR` slice (line 2373).
 */
export function selectMostLopsidedByWR(trades: Trade[], n = 10): Trade[] {
  return trades
    .filter((t) => !t.hasOnlyDraftPicks && t.partyCount >= 2)
    .sort((a, b) => b.wrMargin - a.wrMargin)
    .slice(0, n);
}

/**
 * Top 10 most-lopsided trades by ST margin. Same filters as the WR
 * variant. Mirrors the legacy `mostLopsidedST` slice (line 2374).
 */
export function selectMostLopsidedByST(trades: Trade[], n = 10): Trade[] {
  return trades
    .filter((t) => !t.hasOnlyDraftPicks && t.partyCount >= 2)
    .sort((a, b) => b.stMargin - a.stMargin)
    .slice(0, n);
}

/** Distinct seasons (ascending) that have at least one trade — used for the season filter dropdown. */
export function selectTradeSeasons(trades: Trade[]): string[] {
  const seasons = new Set<string>();
  for (const t of trades) seasons.add(t.season);
  return [...seasons].sort();
}

/** Sort modes mirrored from the legacy `#trade-sort` dropdown (lines 567-570). */
export type TradeSortMode = 'date-desc' | 'date-asc' | 'margin-desc';

interface FilterAndSortOptions {
  /** Empty / undefined = "All seasons". */
  season?: string;
  sort: TradeSortMode;
}

/**
 * Apply the chronological list's season filter + sort selection.
 * Mirrors the legacy `refreshAllTrades()` body (lines 2390-2401).
 */
export function selectFilteredTrades(
  trades: Trade[],
  { season, sort }: FilterAndSortOptions,
): Trade[] {
  let list = trades;
  if (season) list = list.filter((t) => t.season === season);
  const sorted = [...list];
  if (sort === 'date-asc') {
    sorted.sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  } else if (sort === 'margin-desc') {
    sorted.sort((a, b) => b.margin - a.margin);
  } else {
    // 'date-desc' (default) — most recent first.
    sorted.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }
  return sorted;
}
