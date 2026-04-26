// ===================================================================
// Luck & Streaks tab — stat layer
// ===================================================================
//
// Pure selectors for the Luck & Streaks tab, factored out of the
// legacy `index.html` build/render layer:
//
//   - `selectLuckRatings`     ← `renderLuckRating()` (lines 2492-2545)
//   - `selectCurrentStreaks`  ← `renderCurrentStreaks()` (lines 2549-2590)
//   - `selectAllTimeStreaks`  ← `renderAllTimeStreaks()` (lines 2593-2644)
//
// All three derive from the same flattened-matchups view that the
// Overview / Records / Head-to-Head / Seasons tabs already consume, so
// the regular-season vs. playoff split stays consistent across the app.
// Only regular-season games count toward luck and streaks, mirroring
// the legacy filter (`if (m.isPlayoff) return;`).
//
// Math notes — ported verbatim, intentionally not "improved":
//
//   Luck Rating · the legacy comment says "median" but the actual
//   implementation is the all-play (a.k.a. expected-wins-by-rank)
//   metric: each week, every team is scored against every other team
//   that played that week. A team that outscored 9 of 11 other entries
//   earns 9/11 of an expected win for that week. Sum over the season,
//   compare to actual wins; positive = lucky, negative = unlucky. Ties
//   count for half. The denominator `n - 1` uses the count of
//   team-rows in the week bucket (= 2× matchup count, since the
//   bucket holds both sides of every matchup).
//
//   Streaks · we walk every owner's regular-season games in
//   chronological order (`season.localeCompare` then `week ascending`)
//   and group consecutive identical results. Ties break a streak the
//   same way the legacy renderer does — a `T` row gets recorded as a
//   1-game tie streak, but ties are filtered out of both the current
//   and all-time streak lists by virtue of the W/L sort/filter.
//
// All functions are pure — no React, no I/O, no caching. Callers
// `useMemo` against the provider state to avoid recomputing on
// unrelated re-renders.

import type { OwnerIndex, SeasonDetails } from '../owners';
import { latestTeamName } from '../owners';
import { buildAllMatchups } from './util';

// ===================================================================
// Luck Rating
// ===================================================================

/** One row in the Luck Rating table — one entry per owner that has played any regular-season game. */
export interface LuckRating {
  /** Stable cross-season owner key. */
  ownerKey: string;
  /** Cross-season-stable display name. */
  displayName: string;
  /** Latest team name we know for this owner (most recent season). */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
  /** Total regular-season wins. */
  actualWins: number;
  /** Sum of per-week expected-wins-by-rank (all-play metric). */
  expectedWins: number;
  /** Total regular-season games played (used to derive expected losses). */
  games: number;
  /** `actualWins - expectedWins`. Positive = lucky, negative = unlucky. */
  luck: number;
}

/**
 * Returns one Luck Rating row per owner who has played at least one
 * regular-season game, sorted by `luck` descending (luckiest first).
 *
 * Math is the all-play / expected-wins-by-rank metric — see the file
 * header for the formula note. Mirrors `renderLuckRating()`
 * (index.html lines 2492-2545).
 */
export function selectLuckRatings(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): LuckRating[] {
  // Group every owner's score for each (season, week) bucket. The
  // legacy code keeps both sides of every matchup in the same bucket,
  // which is exactly the all-play denominator we need below.
  const matchups = buildAllMatchups(seasons);
  const buckets = new Map<string, Array<{ ownerKey: string; pts: number; actualWin: boolean }>>();
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const wk = `${m.season}|${m.week}`;
    let entries = buckets.get(wk);
    if (!entries) {
      entries = [];
      buckets.set(wk, entries);
    }
    entries.push({ ownerKey: m.ownerAKey, pts: m.scoreA, actualWin: m.scoreA > m.scoreB });
    entries.push({ ownerKey: m.ownerBKey, pts: m.scoreB, actualWin: m.scoreB > m.scoreA });
  }

  // Initialize stats for every owner so an owner with zero games still
  // shows up — the post-filter below drops them, but it keeps the loop
  // body simple.
  const stats = new Map<string, { actualWins: number; expectedWins: number; games: number }>();
  for (const key of Object.keys(ownerIndex)) {
    stats.set(key, { actualWins: 0, expectedWins: 0, games: 0 });
  }

  for (const teams of buckets.values()) {
    const n = teams.length;
    if (n < 2) continue; // Singleton week (commish edit) — skip, denominator would be 0.
    for (const t of teams) {
      let beats = 0;
      let ties = 0;
      for (const other of teams) {
        if (other === t) continue;
        if (t.pts > other.pts) beats++;
        else if (t.pts === other.pts) ties++;
      }
      const expected = (beats + ties * 0.5) / (n - 1);
      const s = stats.get(t.ownerKey);
      if (!s) continue; // Owner not in the index — defensive, shouldn't happen.
      s.expectedWins += expected;
      if (t.actualWin) s.actualWins += 1;
      s.games += 1;
    }
  }

  const rows: LuckRating[] = [];
  for (const [key, s] of stats) {
    if (s.games === 0) continue;
    const owner = ownerIndex[key];
    if (!owner) continue;
    rows.push({
      ownerKey: key,
      displayName: owner.displayName,
      teamName: latestTeamName(owner),
      color: owner.color,
      actualWins: s.actualWins,
      expectedWins: s.expectedWins,
      games: s.games,
      luck: s.actualWins - s.expectedWins,
    });
  }

  rows.sort((a, b) => b.luck - a.luck);
  return rows;
}

// ===================================================================
// Current Streaks
// ===================================================================

/** Result of one regular-season game from one owner's perspective. */
type GameResult = 'W' | 'L' | 'T';

interface OwnerGame {
  season: string;
  week: number;
  result: GameResult;
}

/** One row in the Current Streaks table — the most recent run of identical W/L results. */
export interface CurrentStreak {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** `'W'` / `'L'` / `'T'` — the type of the streak that's still active. */
  streakType: GameResult;
  /** Length of the current streak (always ≥ 1 if the owner has played any reg-season game). */
  streak: number;
  /** Season the streak started in. */
  startSeason: string;
  /** Week within `startSeason` the streak started in. */
  startWeek: number;
}

/**
 * One row per owner who has played at least one regular-season game.
 * The streak is the most recent run of identical-result games walking
 * back from the latest game.
 *
 * Sort order matches the legacy renderer: W streaks first (longest
 * first), then L streaks (longest first), then ties at the bottom.
 * Mirrors `renderCurrentStreaks()` (index.html lines 2549-2590).
 */
export function selectCurrentStreaks(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): CurrentStreak[] {
  const gamesByOwner = groupOwnerGames(seasons);

  const rows: CurrentStreak[] = [];
  for (const [key, games] of gamesByOwner) {
    if (games.length === 0) continue;
    const latest = games[games.length - 1];
    if (!latest) continue;
    const streakType = latest.result;
    let streak = 0;
    let startGame = latest;
    for (let i = games.length - 1; i >= 0; i--) {
      const g = games[i];
      if (!g) break;
      if (g.result !== streakType) break;
      streak++;
      startGame = g;
    }
    const owner = ownerIndex[key];
    if (!owner) continue;
    rows.push({
      ownerKey: key,
      displayName: owner.displayName,
      teamName: latestTeamName(owner),
      color: owner.color,
      streakType,
      streak,
      startSeason: startGame.season,
      startWeek: startGame.week,
    });
  }

  // Wins first (longest first), then losses (longest first); ties drop
  // to the bottom by virtue of the W/L precedence check.
  rows.sort((a, b) => {
    if (a.streakType === 'W' && b.streakType !== 'W') return -1;
    if (b.streakType === 'W' && a.streakType !== 'W') return 1;
    return b.streak - a.streak;
  });
  return rows;
}

// ===================================================================
// All-Time Longest Streaks
// ===================================================================

/** One row in the all-time longest-streak tables. */
export interface AllTimeStreak {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** Streak type — only `'W'` and `'L'` rows are returned; ties are dropped. */
  type: 'W' | 'L';
  length: number;
  fromSeason: string;
  fromWeek: number;
  toSeason: string;
  toWeek: number;
}

export interface AllTimeStreaks {
  /** Top 5 longest win streaks across all owners (sorted by length desc). */
  winStreaks: AllTimeStreak[];
  /** Top 5 longest losing streaks across all owners (sorted by length desc). */
  lossStreaks: AllTimeStreak[];
}

/**
 * Top 5 longest win streaks and top 5 longest losing streaks across
 * the entire league history. A streak ends when the owner's next game
 * has a different result type (a tie also ends a W or L streak).
 *
 * Mirrors `renderAllTimeStreaks()` (index.html lines 2593-2644).
 */
export function selectAllTimeStreaks(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): AllTimeStreaks {
  const gamesByOwner = groupOwnerGames(seasons);

  const all: AllTimeStreak[] = [];
  for (const [key, games] of gamesByOwner) {
    const owner = ownerIndex[key];
    if (!owner) continue;
    const teamName = latestTeamName(owner);

    let curType: GameResult | null = null;
    let curLen = 0;
    let curFrom: OwnerGame | null = null;

    /** Push the running streak (if any) to `all`, dropping tie streaks. */
    const closeStreak = (lastGame: OwnerGame): void => {
      if (curType === null || curLen === 0 || !curFrom) return;
      if (curType !== 'W' && curType !== 'L') return; // Ties never make the leaderboard.
      all.push({
        ownerKey: key,
        displayName: owner.displayName,
        teamName,
        color: owner.color,
        type: curType,
        length: curLen,
        fromSeason: curFrom.season,
        fromWeek: curFrom.week,
        toSeason: lastGame.season,
        toWeek: lastGame.week,
      });
    };

    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g) continue;
      if (g.result === curType) {
        curLen++;
      } else {
        const prev = games[i - 1];
        if (prev) closeStreak(prev);
        curType = g.result;
        curLen = 1;
        curFrom = g;
      }
    }

    // Close the final streak after the loop ends.
    if (games.length > 0) {
      const last = games[games.length - 1];
      if (last) closeStreak(last);
    }
  }

  const winStreaks = all
    .filter((s) => s.type === 'W')
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
  const lossStreaks = all
    .filter((s) => s.type === 'L')
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);

  return { winStreaks, lossStreaks };
}

// ===================================================================
// Internals
// ===================================================================

/**
 * Builds the chronological per-owner game list used by both streak
 * selectors. Regular-season games only; ordered oldest first by
 * (`season.localeCompare`, then `week` ascending) — same sort the
 * legacy renderer uses.
 */
function groupOwnerGames(seasons: SeasonDetails[]): Map<string, OwnerGame[]> {
  const matchups = buildAllMatchups(seasons);
  const games = new Map<string, OwnerGame[]>();
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const aRes: GameResult =
      m.scoreA > m.scoreB ? 'W' : m.scoreA < m.scoreB ? 'L' : 'T';
    const bRes: GameResult =
      m.scoreB > m.scoreA ? 'W' : m.scoreB < m.scoreA ? 'L' : 'T';
    appendGame(games, m.ownerAKey, { season: m.season, week: m.week, result: aRes });
    appendGame(games, m.ownerBKey, { season: m.season, week: m.week, result: bRes });
  }
  for (const list of games.values()) {
    list.sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week);
  }
  return games;
}

function appendGame(map: Map<string, OwnerGame[]>, key: string, game: OwnerGame): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(game);
}
