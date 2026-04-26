// ===================================================================
// Fun Stats tab — stat layer
// ===================================================================
//
// Pure selectors for the Fun Stats tab, factored out of the legacy
// `index.html` build/render layer:
//
//   - Biggest Blowouts        ← `renderFunStats()` lines 2111-2128
//   - Closest Games           ← `renderFunStats()` lines 2129-2137
//   - Hard Luck Losses        ← `renderFunStats()` lines 2138-2145
//   - Lucky Wins              ← `renderFunStats()` lines 2147-2155
//   - Biggest Rivalry         ← `renderRivalry()`         lines 2176-2220
//   - Consistency / Volatility← `renderConsistencyAndVolatility()`
//                               lines 2222-2254
//   - Clutch Index            ← `renderClutchAndBlowoutRecord()`
//                               lines 2256-2310 (close-game half)
//   - Blowout Record          ← `renderClutchAndBlowoutRecord()`
//                               lines 2256-2310 (blowout half)
//   - Points Missed by Bench  ← `buildBenchStats()` lines 1183-1239
//                               + `renderBenchStats()` lines 2314-2333
//   - Shoulda Started Him     ← `buildBenchStats()` + bench-mistakes
//                               render at lines 2334-2353
//
// Selectors are deterministic and work entirely off the provider
// payload (`SeasonDetails[]` + `OwnerIndex` + `PlayerIndex`); no I/O,
// no DOM, no sessionStorage.
//
// Two different matchup views are needed:
//   1. The lean `FlatMatchup` view from `./util` for the score-only
//      sections (blowouts, closest, rivalry, consistency, clutch,
//      blowout record).
//   2. A heavier "full" view with starters + roster + per-player
//      points for the bench-stats sections. That richer flattening
//      is private to this module — Records keeps its own
//      starters-only flattener for an unrelated section, and Owner
//      Stats will eventually need a similar payload. We intentionally
//      do *not* lift this into `./util` until a second tab needs it,
//      to avoid adding a public surface that we'd need to support
//      across tabs without a real second consumer.
//
// Math is ported verbatim from the legacy site. Per the migration
// plan, port-first / refactor-later — if a formula looks suspect,
// flag it on the PR rather than "improving" it here.

import type { OwnerIndex, SeasonDetails } from '../owners';
import type { PlayerIndex } from '../leagueData';
import { playerDisplay, type PlayerDisplay } from '../players';
import { buildAllMatchups, buildRosterToOwnerKey, type FlatMatchup } from './util';

// ===================================================================
// Owner-team metadata helper (shared with sibling Records selector)
// ===================================================================

interface OwnerTeamMeta {
  /** Cross-season-stable display name. */
  displayName: string;
  /** Team name in the season the row covers (owners rename year over year). */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
}

/** Per-season team-name fallback chain — same as the legacy `teamChipCompact`. */
function teamMetaInSeason(
  ownerK: string,
  season: string,
  ownerIndex: OwnerIndex,
): OwnerTeamMeta | null {
  const owner = ownerIndex[ownerK];
  if (!owner) return null;
  return {
    displayName: owner.displayName,
    teamName: owner.teamNamesBySeason[season] || owner.displayName,
    color: owner.color,
  };
}

/** Cross-season team meta, no per-season team-name override (used for league-wide tables). */
function teamMetaCrossSeason(ownerK: string, ownerIndex: OwnerIndex): OwnerTeamMeta | null {
  const owner = ownerIndex[ownerK];
  if (!owner) return null;
  // Cross-season tables show the owner's *latest* team name (mirrors
  // legacy `teamChip` at lines 1844-1853).
  const seasons = Object.keys(owner.teamNamesBySeason).sort();
  const latest = seasons[seasons.length - 1];
  const teamName = (latest ? owner.teamNamesBySeason[latest] : undefined) || owner.displayName;
  return {
    displayName: owner.displayName,
    teamName,
    color: owner.color,
  };
}

// ===================================================================
// Game-with-margin view — derived once, shared across the four
// score-margin sections (Blowouts / Closest / Hard Luck / Lucky Wins).
// ===================================================================

/** One regular-season game with its decided winner/loser identified. */
interface GameWithMargin {
  season: string;
  week: number;
  winnerKey: string;
  loserKey: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
}

/**
 * Walks the lean flattened matchups and emits one entry per
 * regular-season game *with a decided winner* (legacy filter at line
 * 2112: `!m.isPlayoff && m.winnerKey`). Ties drop out — they have no
 * winner, and the legacy `withMargin` map only fires on the
 * `winnerKey` branch.
 */
function gamesWithMargin(matchups: FlatMatchup[]): GameWithMargin[] {
  const games: GameWithMargin[] = [];
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    if (m.scoreA === m.scoreB) continue; // tie → no winnerKey
    const aWon = m.scoreA > m.scoreB;
    games.push({
      season: m.season,
      week: m.week,
      winnerKey: aWon ? m.ownerAKey : m.ownerBKey,
      loserKey: aWon ? m.ownerBKey : m.ownerAKey,
      winnerScore: aWon ? m.scoreA : m.scoreB,
      loserScore: aWon ? m.scoreB : m.scoreA,
      margin: Math.abs(m.scoreA - m.scoreB),
    });
  }
  return games;
}

// ===================================================================
// Margin-driven leaderboards (Blowouts / Closest / Hard Luck / Lucky Wins)
// ===================================================================

/** One row in the Blowouts / Closest leaderboards. */
export interface MarginGameRow {
  season: string;
  week: number;
  /** Winning owner's metadata (display name, season team name, color). */
  winnerOwnerKey: string;
  winnerDisplayName: string;
  winnerTeamName: string;
  winnerColor: string;
  /** Losing owner's metadata. */
  loserOwnerKey: string;
  loserDisplayName: string;
  loserTeamName: string;
  loserColor: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
}

function decorateMarginGame(g: GameWithMargin, ownerIndex: OwnerIndex): MarginGameRow | null {
  const w = teamMetaInSeason(g.winnerKey, g.season, ownerIndex);
  const l = teamMetaInSeason(g.loserKey, g.season, ownerIndex);
  if (!w || !l) return null;
  return {
    season: g.season,
    week: g.week,
    winnerOwnerKey: g.winnerKey,
    winnerDisplayName: w.displayName,
    winnerTeamName: w.teamName,
    winnerColor: w.color,
    loserOwnerKey: g.loserKey,
    loserDisplayName: l.displayName,
    loserTeamName: l.teamName,
    loserColor: l.color,
    winnerScore: g.winnerScore,
    loserScore: g.loserScore,
    margin: g.margin,
  };
}

function takeTopN<T>(
  rows: T[],
  pickRow: (row: T) => MarginGameRow | null,
  limit: number,
): MarginGameRow[] {
  const out: MarginGameRow[] = [];
  for (const r of rows) {
    const decorated = pickRow(r);
    if (decorated) out.push(decorated);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Top-N games by absolute score margin, descending. Mirrors the
 * legacy `blowouts` slice (lines 2120-2128).
 */
export function selectBiggestBlowouts(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 5,
): MarginGameRow[] {
  const games = gamesWithMargin(buildAllMatchups(seasons));
  games.sort((a, b) => b.margin - a.margin);
  return takeTopN(games, (g) => decorateMarginGame(g, ownerIndex), limit);
}

/**
 * Top-N closest decided games (smallest non-zero margin), ascending.
 * Mirrors the legacy `closest` slice (lines 2129-2137). Ties are
 * already excluded by `gamesWithMargin`, but the legacy code adds a
 * defensive `g.margin > 0` filter — we mirror it here.
 */
export function selectClosestGames(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 5,
): MarginGameRow[] {
  const games = gamesWithMargin(buildAllMatchups(seasons)).filter((g) => g.margin > 0);
  games.sort((a, b) => a.margin - b.margin);
  return takeTopN(games, (g) => decorateMarginGame(g, ownerIndex), limit);
}

/**
 * Top-N highest-scoring losses (sorted by losing score, desc).
 * Mirrors the legacy `hardluck` slice (lines 2138-2145).
 */
export function selectHardLuckLosses(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 5,
): MarginGameRow[] {
  const games = gamesWithMargin(buildAllMatchups(seasons));
  games.sort((a, b) => b.loserScore - a.loserScore);
  return takeTopN(games, (g) => decorateMarginGame(g, ownerIndex), limit);
}

/**
 * Top-N lowest-scoring wins (sorted by winning score, asc). Mirrors
 * the legacy `luckywins` slice (lines 2147-2155).
 */
export function selectLuckyWins(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 5,
): MarginGameRow[] {
  const games = gamesWithMargin(buildAllMatchups(seasons));
  games.sort((a, b) => a.winnerScore - b.winnerScore);
  return takeTopN(games, (g) => decorateMarginGame(g, ownerIndex), limit);
}

// ===================================================================
// Biggest Rivalry
// ===================================================================

/** Result of the rivalry calculation. */
export interface RivalryResult {
  /** Owner A's metadata (alphabetical-key order). */
  ownerAKey: string;
  ownerADisplayName: string;
  ownerAColor: string;
  ownerAWins: number;
  /** Owner B's metadata. */
  ownerBKey: string;
  ownerBDisplayName: string;
  ownerBColor: string;
  ownerBWins: number;
  /** Total head-to-head games played (regular season only). */
  games: number;
}

interface RivalryAccumulator {
  keyA: string;
  keyB: string;
  games: number;
  aWins: number;
  bWins: number;
}

/**
 * Picks the most-contested rivalry across the league's full history.
 * Mirrors `renderRivalry()` (lines 2176-2220). Rivalry score is
 * `games × (0.5 + closeness × 0.5)` where closeness is `1 - |Δ|/games`
 * — more games and a closer all-time series both matter.
 *
 * Returns `null` when no regular-season games have been played.
 */
export function selectBiggestRivalry(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): RivalryResult | null {
  const matchups = buildAllMatchups(seasons);
  // sortedKey → accumulator. Sorting the two owner keys before joining
  // collapses the (A vs B) and (B vs A) directions into one bucket.
  const pairs = new Map<string, RivalryAccumulator>();

  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const [keyA, keyB] = [m.ownerAKey, m.ownerBKey].sort();
    if (!keyA || !keyB) continue;
    const pk = `${keyA}|${keyB}`;
    const acc = pairs.get(pk) ?? { keyA, keyB, games: 0, aWins: 0, bWins: 0 };
    acc.games += 1;
    // The matchup's `ownerAKey` may not match the sorted `keyA`; map
    // the score sides onto the sorted-pair frame before counting wins.
    const aIsOwnerA = m.ownerAKey === keyA;
    const aScore = aIsOwnerA ? m.scoreA : m.scoreB;
    const bScore = aIsOwnerA ? m.scoreB : m.scoreA;
    if (aScore > bScore) acc.aWins += 1;
    else if (bScore > aScore) acc.bWins += 1;
    pairs.set(pk, acc);
  }

  let bestKey: string | null = null;
  let bestScore = -Infinity;
  for (const [pk, p] of pairs) {
    if (p.games === 0) continue;
    const diff = Math.abs(p.aWins - p.bWins);
    const closeness = 1 - diff / p.games;
    const score = p.games * (0.5 + closeness * 0.5);
    if (score > bestScore) {
      bestScore = score;
      bestKey = pk;
    }
  }

  if (!bestKey) return null;
  const top = pairs.get(bestKey);
  if (!top) return null;

  const a = ownerIndex[top.keyA];
  const b = ownerIndex[top.keyB];
  if (!a || !b) return null;

  return {
    ownerAKey: a.key,
    ownerADisplayName: a.displayName,
    ownerAColor: a.color,
    ownerAWins: top.aWins,
    ownerBKey: b.key,
    ownerBDisplayName: b.displayName,
    ownerBColor: b.color,
    ownerBWins: top.bWins,
    games: top.games,
  };
}

// ===================================================================
// Consistency / Volatility
// ===================================================================

/** One row in the consistency / volatility leaderboards. */
export interface ConsistencyRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** Mean weekly regular-season score. */
  avg: number;
  /** Population standard deviation of weekly scores (legacy uses /N, not /N-1). */
  stdDev: number;
  /** Number of games included. */
  games: number;
}

/**
 * Computes per-owner mean + population standard deviation across all
 * regular-season weekly scores, then returns the top-N most consistent
 * (lowest σ) and top-N most volatile (highest σ). Mirrors
 * `renderConsistencyAndVolatility()` (lines 2222-2254).
 *
 * Owners with fewer than 5 games are excluded (legacy filter at line
 * 2232) so a short-tenured owner can't game the leaderboard.
 */
export function selectConsistencyTables(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 5,
): { consistent: ConsistencyRow[]; volatile: ConsistencyRow[] } {
  const matchups = buildAllMatchups(seasons);
  const scoresByOwner = new Map<string, number[]>();

  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const a = scoresByOwner.get(m.ownerAKey) ?? [];
    a.push(m.scoreA);
    scoresByOwner.set(m.ownerAKey, a);
    const b = scoresByOwner.get(m.ownerBKey) ?? [];
    b.push(m.scoreB);
    scoresByOwner.set(m.ownerBKey, b);
  }

  const rows: ConsistencyRow[] = [];
  for (const [key, scores] of scoresByOwner) {
    if (scores.length < 5) continue;
    const sum = scores.reduce((acc, s) => acc + s, 0);
    const avg = sum / scores.length;
    const variance = scores.reduce((acc, s) => acc + (s - avg) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const meta = teamMetaCrossSeason(key, ownerIndex);
    if (!meta) continue;
    rows.push({
      ownerKey: key,
      displayName: meta.displayName,
      teamName: meta.teamName,
      color: meta.color,
      avg,
      stdDev,
      games: scores.length,
    });
  }

  const consistent = [...rows].sort((a, b) => a.stdDev - b.stdDev).slice(0, limit);
  const volatile = [...rows].sort((a, b) => b.stdDev - a.stdDev).slice(0, limit);
  return { consistent, volatile };
}

// ===================================================================
// Clutch Index / Blowout Record
// ===================================================================

const CLOSE_THRESHOLD = 10;
const BLOWOUT_THRESHOLD = 30;

/** One row in the Clutch Index / Blowout Record tables. */
export interface CloseGameRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  wins: number;
  losses: number;
  /** Wins / (wins + losses). */
  pct: number;
  /** Total games in this category (close or blowout). */
  games: number;
}

interface CloseGameAccumulator {
  wins: number;
  losses: number;
}

/**
 * Computes win/loss records in close games (margin < 10) and in
 * blowouts (margin >= 30) per owner across the full history. Mirrors
 * `renderClutchAndBlowoutRecord()` (lines 2256-2310).
 *
 * Both leaderboards sort by win-percentage descending (legacy passes
 * `sortKey === 'pct'` for both halves). Owners with zero games in a
 * given category are dropped.
 */
export function selectCloseGameTables(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): { clutch: CloseGameRow[]; blowout: CloseGameRow[] } {
  const matchups = buildAllMatchups(seasons);
  const clutch = new Map<string, CloseGameAccumulator>();
  const blowout = new Map<string, CloseGameAccumulator>();

  // Initialize an entry for every owner so the legacy `Object.keys`
  // shape carries over — empty buckets get filtered out below.
  for (const k of Object.keys(ownerIndex)) {
    clutch.set(k, { wins: 0, losses: 0 });
    blowout.set(k, { wins: 0, losses: 0 });
  }

  for (const m of matchups) {
    if (m.isPlayoff) continue;
    if (m.scoreA === m.scoreB) continue; // ties → no winner
    const margin = Math.abs(m.scoreA - m.scoreB);
    const winnerKey = m.scoreA > m.scoreB ? m.ownerAKey : m.ownerBKey;
    const loserKey = m.scoreA > m.scoreB ? m.ownerBKey : m.ownerAKey;

    if (margin < CLOSE_THRESHOLD) {
      const w = clutch.get(winnerKey);
      if (w) w.wins += 1;
      const l = clutch.get(loserKey);
      if (l) l.losses += 1;
    } else if (margin >= BLOWOUT_THRESHOLD) {
      const w = blowout.get(winnerKey);
      if (w) w.wins += 1;
      const l = blowout.get(loserKey);
      if (l) l.losses += 1;
    }
  }

  const decorate = (data: Map<string, CloseGameAccumulator>): CloseGameRow[] => {
    const rows: CloseGameRow[] = [];
    for (const [key, r] of data) {
      const games = r.wins + r.losses;
      if (games === 0) continue;
      const meta = teamMetaCrossSeason(key, ownerIndex);
      if (!meta) continue;
      rows.push({
        ownerKey: key,
        displayName: meta.displayName,
        teamName: meta.teamName,
        color: meta.color,
        wins: r.wins,
        losses: r.losses,
        pct: r.wins / games,
        games,
      });
    }
    rows.sort((a, b) => b.pct - a.pct);
    return rows;
  };

  return { clutch: decorate(clutch), blowout: decorate(blowout) };
}

// ===================================================================
// Bench stats — points missed + Shoulda Started Him
// ===================================================================
//
// Position eligibility for Sleeper roster slots. Matches Sleeper's
// internal codes. Mirrors the legacy `SLOT_ELIGIBILITY` table (index.html
// lines 1071-1087) verbatim.
//
// `BN` / `IR` / `TAXI` are intentionally absent — they mark non-starting
// slots, and the optimal-lineup calc filters them out before reading
// this map.

const SLOT_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  DL: ['DL', 'DE', 'DT'],
  LB: ['LB'],
  DB: ['DB', 'CB', 'S'],
};

/** A side of a single matchup with the fields the bench-math walker needs. */
interface BenchMatchupSide {
  ownerKey: string;
  /** All player IDs on the roster that week (starters + bench). */
  players: string[];
  /** Starter slot order; "0" sentinel for empty slots. */
  starters: string[];
  /** player_id → points scored that week; never null after the build step. */
  pointsByPlayer: Record<string, number>;
}

/** A regular-season matchup paired with both sides' bench-math payloads. */
interface BenchMatchup {
  season: string;
  week: number;
  /** League's roster slot order ("QB", "RB", "FLEX", "BN", …). */
  slots: readonly string[];
  a: BenchMatchupSide;
  b: BenchMatchupSide;
}

/**
 * Walks every regular-season matchup once and emits the bench-math
 * payload (starters + full roster + per-player points + slots).
 * Mirrors the data harvested by `buildBenchStats()` (lines 1183-1239)
 * before the optimal-lineup pass kicks in.
 *
 * The `players_points` field is normalized: Sleeper occasionally
 * returns an empty array `[]` instead of an object on very old/incomplete
 * payloads. Legacy guards with `Array.isArray(side.pts) ? {} : side.pts`;
 * we do the same.
 */
function buildBenchMatchups(seasons: SeasonDetails[]): BenchMatchup[] {
  const out: BenchMatchup[] = [];

  for (const season of seasons) {
    const slots = season.roster_positions ?? [];
    if (slots.length === 0) continue; // no slot info → can't compute optimal
    const playoffStart = season.settings.playoff_week_start ?? 15;
    const rosterToOwner = buildRosterToOwnerKey(season);

    season.weeklyMatchups.forEach((week, idx) => {
      const weekNum = idx + 1;
      if (weekNum >= playoffStart) return; // regular-season only
      if (!week || week.length === 0) return;

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
        const scoreA = a.points || 0;
        const scoreB = b.points || 0;
        if (scoreA === 0 && scoreB === 0) continue;

        const oa = rosterToOwner.get(a.roster_id);
        const ob = rosterToOwner.get(b.roster_id);
        if (!oa || !ob) continue;

        const sideOf = (m: typeof a, ownerK: string): BenchMatchupSide => ({
          ownerKey: ownerK,
          players: m.players ?? [],
          starters: m.starters ?? [],
          pointsByPlayer:
            m.players_points && !Array.isArray(m.players_points) ? m.players_points : {},
        });

        out.push({
          season: season.season,
          week: weekNum,
          slots,
          a: sideOf(a, oa),
          b: sideOf(b, ob),
        });
      }
    });
  }

  return out;
}

interface OptimalLineupResult {
  optimalTotal: number;
  optimalStarterIds: Set<string>;
}

/**
 * Compute the best possible starting lineup for one roster for one
 * week, given the league's roster slots and per-player points. Mirrors
 * the legacy `computeOptimalLineup()` (lines 1091-1135) verbatim.
 *
 * Slots are filled most-restrictive first (e.g. QB before SUPER_FLEX)
 * so a multi-eligible position never burns a specialist starter on a
 * flex slot.
 *
 * Players whose position is missing from the player DB resolve to an
 * empty position string, which won't match any `SLOT_ELIGIBILITY` entry
 * — the legacy code has the same blind spot, and we preserve it
 * (port-first / refactor-later).
 */
function computeOptimalLineup(
  rosterPositions: readonly string[],
  allPlayers: readonly string[],
  pointsByPlayer: Record<string, number>,
  players: PlayerIndex,
): OptimalLineupResult {
  const startingSlots = rosterPositions.filter((s) => s !== 'BN' && s !== 'IR' && s !== 'TAXI');
  if (startingSlots.length === 0) {
    return { optimalTotal: 0, optimalStarterIds: new Set() };
  }

  // Resolve each player_id once up-front (`playerDisplay` already
  // includes the defense-id heuristic, so we don't have to special-case
  // 2-3 letter team abbreviations here).
  const candidates = allPlayers
    .filter((pid): pid is string => Boolean(pid) && pid !== '0')
    .map((pid) => ({
      playerId: pid,
      pts: pointsByPlayer[pid] ?? 0,
      position: playerDisplay(pid, players).position,
    }));

  // Sort slots by specificity (fewest eligible positions first). Index
  // tracking matches the legacy code shape.
  const slotSpecificity = (slot: string): number => (SLOT_ELIGIBILITY[slot] ?? []).length;
  const slotsInOrder = startingSlots
    .map((slot, idx) => ({ slot, idx }))
    .sort((x, y) => slotSpecificity(x.slot) - slotSpecificity(y.slot));

  const used = new Set<string>();
  const assigned = new Set<string>();
  let optimalTotal = 0;

  for (const { slot } of slotsInOrder) {
    const eligible = SLOT_ELIGIBILITY[slot];
    if (!eligible) continue;
    let best: { playerId: string; pts: number } | null = null;
    for (const c of candidates) {
      if (used.has(c.playerId)) continue;
      if (!eligible.includes(c.position)) continue;
      if (!best || c.pts > best.pts) best = c;
    }
    if (best) {
      used.add(best.playerId);
      assigned.add(best.playerId);
      optimalTotal += best.pts;
    }
  }

  return { optimalTotal, optimalStarterIds: assigned };
}

interface ShouldaStartedSwap {
  benchPlayerId: string;
  benchPts: number;
  replacedStarterId: string;
  replacedPts: number;
  /** `benchPts - replacedPts` — only positive swaps are kept downstream. */
  gained: number;
}

/**
 * For each bench player who would have been in the optimal lineup,
 * pair them with the weakest actual starter at an eligible slot.
 * Mirrors `computeShouldaStarted()` (lines 1140-1181). Only positive
 * gains are surfaced by the caller — a benched player who tied the
 * worst actual starter at his slot doesn't show up.
 */
function computeShouldaStarted(
  actualStarters: readonly string[],
  optimalStarters: ReadonlySet<string>,
  rosterPositions: readonly string[],
  pointsByPlayer: Record<string, number>,
  players: PlayerIndex,
): ShouldaStartedSwap[] {
  const actualSet = new Set(actualStarters);
  const swaps: ShouldaStartedSwap[] = [];

  for (const pid of optimalStarters) {
    if (actualSet.has(pid)) continue; // they were started, not a mistake

    const benchInfo = playerDisplay(pid, players);
    const benchPts = pointsByPlayer[pid] ?? 0;

    // Plain `for` loop here — using `forEach` with a `let` accumulator
    // confuses strict-mode control-flow analysis after the closure
    // returns (TS narrows the outer reference to `never`). A loop with
    // an indexed iteration keeps the narrowing intact.
    let worstId: string | null = null;
    let worstPts = 0;
    for (let slotIdx = 0; slotIdx < actualStarters.length; slotIdx++) {
      const starterId = actualStarters[slotIdx];
      if (!starterId || starterId === '0') continue;
      if (optimalStarters.has(starterId)) continue; // already in optimal
      const slot = rosterPositions[slotIdx];
      if (!slot || slot === 'BN' || slot === 'IR' || slot === 'TAXI') continue;
      const eligible = SLOT_ELIGIBILITY[slot];
      if (!eligible || !eligible.includes(benchInfo.position)) continue;
      const sPts = pointsByPlayer[starterId] ?? 0;
      if (worstId === null || sPts < worstPts) {
        worstId = starterId;
        worstPts = sPts;
      }
    }

    if (worstId !== null) {
      swaps.push({
        benchPlayerId: pid,
        benchPts,
        replacedStarterId: worstId,
        replacedPts: worstPts,
        gained: benchPts - worstPts,
      });
    }
  }

  return swaps;
}

/** One row in the "Points Missed by Benching" leaderboard. */
export interface BenchTotalRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** Total optimal-vs-actual gap across every regular-season game. */
  total: number;
  /** Mean per-game gap. */
  perGame: number;
  /** Number of games included. */
  games: number;
}

/** One row in the "Shoulda Started Him" leaderboard. */
export interface ShouldaStartedRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  season: string;
  week: number;
  benchPlayerId: string;
  benchPlayer: PlayerDisplay;
  benchPoints: number;
  replacedPlayerId: string;
  replacedPlayer: PlayerDisplay;
  replacedPoints: number;
  /** `benchPts - replacedPts`; always > 0 (legacy filter at line 2225). */
  gained: number;
}

/**
 * Aggregated bench stats — one walk over every regular-season matchup
 * yields both the per-owner missed-points totals and the top
 * single-mistake list. Mirrors `buildBenchStats()` (lines 1183-1239)
 * + `renderBenchStats()` (lines 2314-2353).
 *
 * Returned shape:
 *   - `totals`        — sorted by total gap descending; only owners
 *                       with at least one game.
 *   - `shoulda`       — top-N single mistakes by points-gained,
 *                       descending.
 */
export function selectBenchStats(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  shouldaLimit = 10,
): { totals: BenchTotalRow[]; shoulda: ShouldaStartedRow[] } {
  const matchups = buildBenchMatchups(seasons);

  const totalsByOwner = new Map<string, number>();
  const gamesByOwner = new Map<string, number>();
  for (const k of Object.keys(ownerIndex)) {
    totalsByOwner.set(k, 0);
    gamesByOwner.set(k, 0);
  }

  const mistakes: ShouldaStartedRow[] = [];

  for (const m of matchups) {
    for (const side of [m.a, m.b]) {
      // Side payloads can be missing if Sleeper returned a partial week
      // (legacy guards with `Array.isArray` here too).
      if (!Array.isArray(side.players) || !Array.isArray(side.starters)) continue;

      const actualTotal = side.starters.reduce(
        (sum, pid) => sum + (side.pointsByPlayer[pid] ?? 0),
        0,
      );
      const { optimalTotal, optimalStarterIds } = computeOptimalLineup(
        m.slots,
        side.players,
        side.pointsByPlayer,
        players,
      );

      const missed = Math.max(0, optimalTotal - actualTotal);
      totalsByOwner.set(side.ownerKey, (totalsByOwner.get(side.ownerKey) ?? 0) + missed);
      gamesByOwner.set(side.ownerKey, (gamesByOwner.get(side.ownerKey) ?? 0) + 1);

      const swaps = computeShouldaStarted(
        side.starters,
        optimalStarterIds,
        m.slots,
        side.pointsByPlayer,
        players,
      );
      const meta = teamMetaInSeason(side.ownerKey, m.season, ownerIndex);
      if (!meta) continue;

      for (const swap of swaps) {
        if (swap.gained <= 0) continue;
        mistakes.push({
          ownerKey: side.ownerKey,
          displayName: meta.displayName,
          teamName: meta.teamName,
          color: meta.color,
          season: m.season,
          week: m.week,
          benchPlayerId: swap.benchPlayerId,
          benchPlayer: playerDisplay(swap.benchPlayerId, players),
          benchPoints: swap.benchPts,
          replacedPlayerId: swap.replacedStarterId,
          replacedPlayer: playerDisplay(swap.replacedStarterId, players),
          replacedPoints: swap.replacedPts,
          gained: swap.gained,
        });
      }
    }
  }

  const totals: BenchTotalRow[] = [];
  for (const [key, total] of totalsByOwner) {
    const games = gamesByOwner.get(key) ?? 0;
    if (games <= 0) continue;
    const meta = teamMetaCrossSeason(key, ownerIndex);
    if (!meta) continue;
    totals.push({
      ownerKey: key,
      displayName: meta.displayName,
      teamName: meta.teamName,
      color: meta.color,
      total,
      perGame: total / games,
      games,
    });
  }
  totals.sort((a, b) => b.total - a.total);

  mistakes.sort((a, b) => b.gained - a.gained);
  const shoulda = mistakes.slice(0, shouldaLimit);

  return { totals, shoulda };
}
