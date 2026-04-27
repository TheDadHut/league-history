// ===================================================================
// Power Rankings — stat layer
// ===================================================================
//
// Pure selector for the Power Rankings tab. The formula is a five-
// component weighted blend chosen with reasoning across mainstream
// fantasy-football power-ranking conventions:
//
//   PowerScore = 0.25 * ScoreRecord
//              + 0.30 * ScoreAllPlay
//              + 0.25 * ScorePF
//              + 0.15 * ScoreRecent
//              + 0.05 * ScoreStreak
//
// All five components are scaled to `[0, 1]` before being weighted, so
// the final `powerScore` lands in `[0, 1]`.
//
//   ScoreRecord    — actual win rate (ties = 0.5 wins). Min-max
//                    normalized within the rated season.
//   ScoreAllPlay   — expected wins / games_played, where expected wins
//                    are summed from the per-week all-play /
//                    expected-wins-by-rank metric. Naturally in
//                    [0, 1] — NOT min-max-normalized again. Reuses
//                    `buildAllPlayWeekBuckets` from `util.ts`.
//   ScorePF        — points per game. Min-max normalized.
//   ScoreRecent    — mean of regular-season scores in the most recent
//                    three played weeks (`<= throughWeek`). Falls
//                    through to ScorePF on week 1. Min-max normalized.
//   ScoreStreak    — `streak_length * direction` where direction is
//                    `+1` (W), `-1` (L), `0` (T). Length capped at 8.
//                    Min-max normalized across owners.
//
// Min-max normalization edge case: when every owner shares the same
// raw value for a component (e.g., every team is 0-0 entering week 1),
// the normalized value is `0.5` for everyone — no information, no
// differentiation.
//
// "Current week" definition: the maximum week in the most recent
// season's matchups where at least one team scored above zero. Not
// the NFL calendar week. If no matchups have been played in the
// current season yet, falls back to the final week of the previous
// completed season.
//
// Power Rankings is intentionally a within-season metric. The
// trajectory chart on the tab is a per-week scan (`throughWeek` 1..N)
// over the same selector — it never crosses season boundaries.

import type { OwnerIndex, SeasonDetails } from '../owners';
import { latestTeamName } from '../owners';
import { buildAllMatchups, buildAllPlayWeekBuckets } from './util';

// ===================================================================
// Output shape
// ===================================================================

/** One of the five components contributing to the power score. */
export interface PowerRankingComponent {
  /** Raw, pre-normalization value (wins/game, PF/game, etc.). */
  raw: number;
  /** Normalized to [0, 1]. Min-max within-season for most components. */
  normalized: number;
  /** Component weight. Sums to 1.0 across the five components. */
  weight: number;
  /** `normalized * weight` — the contribution to the final `powerScore`. */
  contribution: number;
}

/** Sign of the active streak: W = +1, L = -1, T = 0. */
export type StreakKind = 'W' | 'L' | 'T';

/** One row in the Power Rankings table — one per owner with at least one regular-season game in the rated season. */
export interface PowerRankingRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** Final blended score in `[0, 1]`. */
  powerScore: number;
  /** 1-based rank within the rated season at `throughWeek`. */
  rank: number;
  /** `priorRank - rank` (positive = moved up). `null` at week 1 or when no prior row exists. */
  movement: number | null;
  components: {
    record: PowerRankingComponent;
    allPlay: PowerRankingComponent;
    pointsFor: PowerRankingComponent;
    recentForm: PowerRankingComponent;
    streak: PowerRankingComponent;
  };
  /** Wins (ties contribute 0.5 each). */
  wins: number;
  /** Losses (ties contribute 0.5 each). */
  losses: number;
  /** Ties played. */
  ties: number;
  /** Sum of per-week expected-wins-by-rank values within the rated season. */
  allPlayWins: number;
  /** Total points scored / games played. */
  pointsPerGame: number;
  /** Average score across the most recent three played weeks (or fewer). */
  recentAvg: number;
  /** Sign of the active streak. */
  streakType: StreakKind;
  /** Length of the active streak (uncapped — the cap only applies inside the formula). */
  streakLength: number;
  /** Total regular-season games played in the rated season at `throughWeek`. */
  gamesPlayed: number;
}

/** The full Power Rankings result for one `(season, throughWeek)` snapshot. */
export interface PowerRankingsResult {
  /** Sorted by `rank` ascending (best team first). */
  rankings: PowerRankingRow[];
  /** Inclusive ceiling on the regular-season weeks rolled into the score. */
  throughWeek: number;
  /** Year string of the rated season. */
  season: string;
  /** Number of teams in the rated season. */
  teamCount: number;
}

// ===================================================================
// Constants
// ===================================================================

const WEIGHT_RECORD = 0.25;
const WEIGHT_ALL_PLAY = 0.3;
const WEIGHT_PF = 0.25;
const WEIGHT_RECENT = 0.15;
const WEIGHT_STREAK = 0.05;

/** Cap on the raw streak length before min-max normalization. */
const STREAK_LENGTH_CAP = 8;

/** Number of recent weeks summed into ScoreRecent. */
const RECENT_WINDOW = 3;

// ===================================================================
// Public selector
// ===================================================================

/**
 * Computes a Power Rankings snapshot for a single season at a given
 * regular-season `throughWeek`. The selector is pure and stateless —
 * the trajectory chart computes one snapshot per week by calling this
 * function `N` times (memoized at the page level).
 *
 * `throughWeek` defaults to the most recent week of the most recent
 * season with any played games (see `resolveCurrentSnapshot` for the
 * full fall-through). Pass an explicit value to compute historical
 * snapshots.
 */
export function selectPowerRankings(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  throughWeek?: number,
): PowerRankingsResult {
  const snapshot = resolveCurrentSnapshot(seasons);
  const targetSeason = snapshot.season;
  const week = throughWeek ?? snapshot.throughWeek;

  if (!targetSeason || week < 1) {
    return { rankings: [], throughWeek: 0, season: '', teamCount: 0 };
  }

  return rankSeason(seasons, ownerIndex, targetSeason, week);
}

/**
 * Resolves the most-recent rate-able season and the latest played
 * regular-season week within it. Used both as the default for
 * `selectPowerRankings` and as the upper bound for the trajectory
 * chart's per-week scan.
 *
 * Returns the most-recent season that has any non-zero matchup. If
 * the current season hasn't started yet (no games played), falls
 * through to the previous completed season's final regular-season
 * week, matching the spec.
 */
export function resolveCurrentSnapshot(seasons: SeasonDetails[]): {
  season: string;
  throughWeek: number;
} {
  if (seasons.length === 0) return { season: '', throughWeek: 0 };

  // Sort newest first; we don't depend on the input ordering since
  // the provider sometimes hands us oldest-first via `walkPreviousLeagues`.
  const ordered = seasons.slice().sort((a, b) => b.season.localeCompare(a.season));

  for (const season of ordered) {
    const playoffStart = season.settings.playoff_week_start ?? 15;
    let latestPlayed = 0;
    season.weeklyMatchups.forEach((week, idx) => {
      const wk = idx + 1;
      if (wk >= playoffStart) return; // Power Rankings ignores playoff weeks entirely.
      if (!week || week.length === 0) return;
      const anyScored = week.some((m) => (m.points || 0) > 0);
      if (anyScored && wk > latestPlayed) latestPlayed = wk;
    });
    if (latestPlayed > 0) {
      return { season: season.season, throughWeek: latestPlayed };
    }
  }

  return { season: '', throughWeek: 0 };
}

/**
 * Returns the maximum regular-season week (1-based) with any played
 * matchups for the given season. Useful for sizing the trajectory
 * chart's X-axis without re-running the snapshot resolver.
 */
export function maxPlayedWeek(season: SeasonDetails): number {
  const playoffStart = season.settings.playoff_week_start ?? 15;
  let latest = 0;
  season.weeklyMatchups.forEach((week, idx) => {
    const wk = idx + 1;
    if (wk >= playoffStart) return;
    if (!week || week.length === 0) return;
    const anyScored = week.some((m) => (m.points || 0) > 0);
    if (anyScored && wk > latest) latest = wk;
  });
  return latest;
}

// ===================================================================
// Internals
// ===================================================================

interface RawStats {
  ownerKey: string;
  /** Regular-season scores in week order. Already capped at `throughWeek`. */
  scores: number[];
  /** Regular-season per-game results in week order, for the streak walk. */
  results: StreakKind[];
  /** Sum of points scored. */
  totalPF: number;
  /** Wins (ties contribute 0.5). */
  wins: number;
  /** Losses (ties contribute 0.5). */
  losses: number;
  /** Ties played. */
  ties: number;
  /** Total regular-season games played. */
  games: number;
  /** Sum of per-week expected-wins (all-play metric). */
  allPlayWins: number;
}

/**
 * Builds the Power Rankings result for one (season, throughWeek)
 * tuple. Two-pass: first accumulate raw stats per owner, then
 * min-max-normalize the four normalized components, blend, and rank.
 */
function rankSeason(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  targetSeason: string,
  throughWeek: number,
): PowerRankingsResult {
  const seasonRow = seasons.find((s) => s.season === targetSeason);
  if (!seasonRow) {
    return { rankings: [], throughWeek, season: targetSeason, teamCount: 0 };
  }

  // Single-season view; passing only `[seasonRow]` keeps the matchup
  // walk scoped without forcing a downstream filter step.
  const singleSeason = [seasonRow];
  const matchups = buildAllMatchups(singleSeason).filter(
    (m) => !m.isPlayoff && m.week <= throughWeek,
  );

  const stats = new Map<string, RawStats>();
  const ensure = (ownerKey: string): RawStats => {
    let s = stats.get(ownerKey);
    if (!s) {
      s = {
        ownerKey,
        scores: [],
        results: [],
        totalPF: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
        allPlayWins: 0,
      };
      stats.set(ownerKey, s);
    }
    return s;
  };

  // Per-owner result lists need to be in week order so `recentAvg`
  // and the streak walk both operate on chronological data. Sort
  // before pushing.
  const orderedMatchups = matchups.slice().sort((a, b) => a.week - b.week);

  for (const m of orderedMatchups) {
    const a = ensure(m.ownerAKey);
    const b = ensure(m.ownerBKey);
    a.totalPF += m.scoreA;
    b.totalPF += m.scoreB;
    a.scores.push(m.scoreA);
    b.scores.push(m.scoreB);
    a.games += 1;
    b.games += 1;

    if (m.scoreA > m.scoreB) {
      a.wins += 1;
      b.losses += 1;
      a.results.push('W');
      b.results.push('L');
    } else if (m.scoreA < m.scoreB) {
      a.losses += 1;
      b.wins += 1;
      a.results.push('L');
      b.results.push('W');
    } else {
      a.ties += 1;
      b.ties += 1;
      a.wins += 0.5;
      a.losses += 0.5;
      b.wins += 0.5;
      b.losses += 0.5;
      a.results.push('T');
      b.results.push('T');
    }
  }

  // Roll the all-play / expected-wins-by-rank metric onto the same
  // owner stats. We fan out to the season-wide bucketer and then
  // filter by `throughWeek` ourselves so the existing utility stays
  // call-site-agnostic about the regular-season ceiling.
  const buckets = buildAllPlayWeekBuckets(singleSeason, { throughWeek });
  for (const bucket of buckets) {
    const teams = bucket.entries;
    const n = teams.length;
    if (n < 2) continue; // Singleton week — denominator would be 0.
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
      if (!s) continue;
      s.allPlayWins += expected;
    }
  }

  // Drop owners with zero games played (e.g., owner index has them
  // from another season but they didn't play this season). The
  // remaining entries are exactly the rated teams.
  const rated = Array.from(stats.values()).filter((s) => s.games > 0);
  if (rated.length === 0) {
    return { rankings: [], throughWeek, season: targetSeason, teamCount: 0 };
  }

  // Per-owner raw component values — the inputs to min-max.
  interface RawComponents {
    record: number; // wins / games
    allPlay: number; // expected wins / games (already in [0, 1])
    pf: number; // PF / games
    recent: number; // mean of last <=3 played weeks
    streak: number; // capped streak length * direction
    /** Cached streak walk — surfaced into the row so callers can render an arrow. */
    streakLength: number;
    streakType: StreakKind;
  }

  const raws = new Map<string, RawComponents>();
  for (const s of rated) {
    const record = s.wins / s.games;
    const allPlay = s.allPlayWins / s.games; // already in [0, 1]
    const pf = s.totalPF / s.games;

    const recentSlice = s.scores.slice(-RECENT_WINDOW);
    const recent =
      recentSlice.length === 0 ? 0 : recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;

    const { length: streakLength, type: streakType } = walkActiveStreak(s.results);
    const cappedLen = Math.min(streakLength, STREAK_LENGTH_CAP);
    const direction = streakType === 'W' ? 1 : streakType === 'L' ? -1 : 0;
    const streak = cappedLen * direction;

    raws.set(s.ownerKey, { record, allPlay, pf, recent, streak, streakLength, streakType });
  }

  // Two-pass min-max normalization. ScoreAllPlay is naturally in
  // [0, 1] and is NOT re-normalized — passing it through min-max
  // would inflate small differences and over-weight outliers.
  const recordVals = Array.from(raws.values()).map((r) => r.record);
  const pfVals = Array.from(raws.values()).map((r) => r.pf);
  const recentVals = Array.from(raws.values()).map((r) => r.recent);
  const streakVals = Array.from(raws.values()).map((r) => r.streak);

  const normRecord = minMaxFn(recordVals);
  const normPf = minMaxFn(pfVals);
  const normRecent = minMaxFn(recentVals);
  const normStreak = minMaxFn(streakVals);

  const rows: PowerRankingRow[] = [];
  for (const s of rated) {
    const r = raws.get(s.ownerKey);
    if (!r) continue;
    const owner = ownerIndex[s.ownerKey];
    if (!owner) continue;

    const recordComp: PowerRankingComponent = {
      raw: r.record,
      normalized: normRecord(r.record),
      weight: WEIGHT_RECORD,
      contribution: normRecord(r.record) * WEIGHT_RECORD,
    };
    const allPlayComp: PowerRankingComponent = {
      raw: r.allPlay,
      normalized: r.allPlay, // naturally [0,1]
      weight: WEIGHT_ALL_PLAY,
      contribution: r.allPlay * WEIGHT_ALL_PLAY,
    };
    const pfComp: PowerRankingComponent = {
      raw: r.pf,
      normalized: normPf(r.pf),
      weight: WEIGHT_PF,
      contribution: normPf(r.pf) * WEIGHT_PF,
    };
    const recentComp: PowerRankingComponent = {
      raw: r.recent,
      normalized: normRecent(r.recent),
      weight: WEIGHT_RECENT,
      contribution: normRecent(r.recent) * WEIGHT_RECENT,
    };
    const streakComp: PowerRankingComponent = {
      raw: r.streak,
      normalized: normStreak(r.streak),
      weight: WEIGHT_STREAK,
      contribution: normStreak(r.streak) * WEIGHT_STREAK,
    };

    const powerScore =
      recordComp.contribution +
      allPlayComp.contribution +
      pfComp.contribution +
      recentComp.contribution +
      streakComp.contribution;

    rows.push({
      ownerKey: s.ownerKey,
      displayName: owner.displayName,
      teamName: latestTeamName(owner),
      color: owner.color,
      powerScore,
      rank: 0, // assigned after sort
      movement: null, // filled in below if a prior week is available
      components: {
        record: recordComp,
        allPlay: allPlayComp,
        pointsFor: pfComp,
        recentForm: recentComp,
        streak: streakComp,
      },
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      allPlayWins: s.allPlayWins,
      pointsPerGame: r.pf,
      recentAvg: r.recent,
      streakType: r.streakType,
      streakLength: r.streakLength,
      gamesPlayed: s.games,
    });
  }

  rows.sort((a, b) => b.powerScore - a.powerScore);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Movement vs. the prior week's snapshot — only computed when a
  // prior week exists. The selector calls itself recursively for
  // `throughWeek - 1` and looks each owner up in the prior table; if
  // the owner wasn't ranked the prior week (e.g., didn't play yet),
  // movement stays null. This recursion is cheap because the
  // trajectory chart memoizes per-week results at the page level.
  if (throughWeek > 1) {
    const prior = rankSeason(seasons, ownerIndex, targetSeason, throughWeek - 1);
    const priorByKey = new Map(prior.rankings.map((r) => [r.ownerKey, r.rank] as const));
    for (const row of rows) {
      const priorRank = priorByKey.get(row.ownerKey);
      if (priorRank == null) continue;
      row.movement = priorRank - row.rank;
    }
  }

  return {
    rankings: rows,
    throughWeek,
    season: targetSeason,
    teamCount: rows.length,
  };
}

/**
 * Walks the per-week result list back from the most recent game to
 * find the active streak. A tie ends a W or L streak the same way
 * the legacy renderer does; the active streak's type matches the
 * latest game's result.
 *
 * Mirrors the in-season subset of the logic in
 * `selectCurrentStreaks` from `luck.ts` — the difference is that this
 * walks only the slice we built for the current `(season, throughWeek)`
 * instead of every season the owner has played.
 */
function walkActiveStreak(results: StreakKind[]): { length: number; type: StreakKind } {
  if (results.length === 0) return { length: 0, type: 'T' };
  const latest = results[results.length - 1] as StreakKind;
  let length = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] !== latest) break;
    length++;
  }
  return { length, type: latest };
}

/**
 * Builds a `value -> [0,1]` lookup for one component using min-max
 * normalization. When all values are identical, returns a function
 * that always emits `0.5` (no information, no differentiation), per
 * the spec.
 */
function minMaxFn(values: number[]): (v: number) => number {
  if (values.length === 0) return () => 0.5;
  let min = values[0] as number;
  let max = values[0] as number;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return () => 0.5;
  return (v: number) => (v - min) / range;
}
