// ===================================================================
// Records tab — stat layer
// ===================================================================
//
// Pure selectors for the Records tab's four sections, factored out of
// the legacy `index.html` build/render layer:
//
//   - Team weekly highs       ← `renderRecords()` lines 2063-2075
//   - Team weekly lows        ← `renderRecords()` lines 2071-2079
//   - Player single-week tops ← `buildPlayerStats()` lines 1019-1058
//                               + `renderRecords()` lines 2081-2093
//   - Player season tops      ← `buildPlayerStats()` lines 1019-1058
//                               + `renderRecords()` lines 2095-2108
//
// Selectors are deterministic and work entirely off the provider
// payload (`SeasonDetails[]` + `OwnerIndex` + `PlayerIndex`); no I/O,
// no DOM, no sessionStorage. The tab component memoizes the results
// so unrelated re-renders don't re-walk the full matchup history.
//
// `buildAllMatchupsWithStarters` mirrors the legacy `buildAllMatchups`
// (lines 851-890) — same skip rules, same matchup pairing logic — but
// preserves the per-side starters and starters_points so the player
// selectors can index into them. The lean version (no starters) lives
// in `stats/util.ts` and is shared by Overview, H2H, and Seasons; the
// two will be unified in a follow-up once a second tab also needs the
// starters payload.

import type { OwnerIndex, SeasonDetails } from '../owners';
import type { PlayerIndex } from '../leagueData';
import { playerDisplay, type PlayerDisplay } from '../players';
import { buildRosterToOwnerKey } from './util';

// ===================================================================
// Internal: flattened matchup view (with starters)
// ===================================================================

interface FlatMatchupSide {
  ownerKey: string;
  /** Starter player_ids in slot order; "0" is Sleeper's empty-slot sentinel. */
  starters: string[];
  /** Per-starter point totals, positionally aligned with `starters`. */
  starterPoints: number[];
}

interface FlatMatchupWithStarters {
  season: string;
  week: number;
  isPlayoff: boolean;
  /** Side A's owner + starter payload. */
  a: FlatMatchupSide;
  /** Side B's owner + starter payload. */
  b: FlatMatchupSide;
  /** Final scores for the two sides, in the same order as `a` / `b`. */
  scoreA: number;
  scoreB: number;
}

/**
 * Walks every season's `weeklyMatchups` and produces a flat list of
 * matchups with their starter payloads attached. Same skip rules as
 * the legacy `buildAllMatchups` (lines 851-890):
 *
 *   - Drops weeks with no data (empty array).
 *   - Pairs entries by `matchup_id`; skips byes (`matchup_id == null`).
 *   - Skips pairs that aren't exactly two teams (commish edits).
 *   - Skips 0-0 pairs (Sleeper occasionally returns these for unplayed weeks).
 *   - Uses each league's `playoff_week_start` (defaults to 15) to mark
 *     playoff games — Records' team-score selectors filter these out;
 *     player selectors walk only regular-season matchups (legacy
 *     comment at line 1035: "regular season only for cleanliness").
 */
function buildAllMatchupsWithStarters(seasons: SeasonDetails[]): FlatMatchupWithStarters[] {
  const all: FlatMatchupWithStarters[] = [];
  for (const season of seasons) {
    const playoffStart = season.settings.playoff_week_start ?? 15;
    const rosterToOwner = buildRosterToOwnerKey(season);

    season.weeklyMatchups.forEach((week, idx) => {
      const weekNum = idx + 1;
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

        all.push({
          season: season.season,
          week: weekNum,
          isPlayoff: weekNum >= playoffStart,
          scoreA,
          scoreB,
          a: {
            ownerKey: oa,
            starters: a.starters ?? [],
            starterPoints: a.starters_points ?? [],
          },
          b: {
            ownerKey: ob,
            starters: b.starters ?? [],
            starterPoints: b.starters_points ?? [],
          },
        });
      }
    });
  }
  return all;
}

// ===================================================================
// Team scores — weekly highs / lows
// ===================================================================

/** One team-score record entry (top-N or bottom-N). */
export interface TeamScoreRecord {
  /** Stable owner key — used to look up colors / display names in `OwnerIndex`. */
  ownerKey: string;
  /** Cross-season-stable display name. */
  displayName: string;
  /** Team name in the season the game was played in (owners rename year over year). */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
  /** Score the owner posted in that game. */
  points: number;
  /** Year the game was played (string, e.g. "2024"). */
  season: string;
  /** Week number, 1-indexed. */
  week: number;
}

interface RawTeamScore {
  ownerKey: string;
  points: number;
  season: string;
  week: number;
}

/** Both sides of every regular-season matchup as flat (owner, points, season, week) rows. */
function regularSeasonScores(matchups: FlatMatchupWithStarters[]): RawTeamScore[] {
  const rows: RawTeamScore[] = [];
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    rows.push({ ownerKey: m.a.ownerKey, points: m.scoreA, season: m.season, week: m.week });
    rows.push({ ownerKey: m.b.ownerKey, points: m.scoreB, season: m.season, week: m.week });
  }
  return rows;
}

/** Per-season team-name fallback chain — same as the legacy `teamChipCompact`. */
function teamNameInSeason(
  ownerKey: string,
  season: string,
  ownerIndex: OwnerIndex,
): { teamName: string; displayName: string; color: string } | null {
  const owner = ownerIndex[ownerKey];
  if (!owner) return null;
  return {
    teamName: owner.teamNamesBySeason[season] || owner.displayName,
    displayName: owner.displayName,
    color: owner.color,
  };
}

function decorateTeamScore(raw: RawTeamScore, ownerIndex: OwnerIndex): TeamScoreRecord | null {
  const meta = teamNameInSeason(raw.ownerKey, raw.season, ownerIndex);
  if (!meta) return null;
  return {
    ownerKey: raw.ownerKey,
    displayName: meta.displayName,
    teamName: meta.teamName,
    color: meta.color,
    points: raw.points,
    season: raw.season,
    week: raw.week,
  };
}

/**
 * Top-N single-team weekly scores in regular-season play, descending.
 * Mirrors the `highs` slice in `renderRecords` (lines 2070, 2072-2075).
 *
 * Owners that are no longer in the index (extreme edge case — would
 * require a manual roster wipe) are skipped rather than rendered as
 * placeholders, matching the legacy `if (!o) return '<span>—</span>'`
 * behavior.
 */
export function selectWeeklyHighs(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 10,
): TeamScoreRecord[] {
  const matchups = buildAllMatchupsWithStarters(seasons);
  const scores = regularSeasonScores(matchups);
  scores.sort((a, b) => b.points - a.points);

  const rows: TeamScoreRecord[] = [];
  for (const raw of scores) {
    const decorated = decorateTeamScore(raw, ownerIndex);
    if (decorated) rows.push(decorated);
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Bottom-N single-team weekly scores, ascending. Filters out 0-point
 * games (Sleeper sometimes returns 0/0 for an unplayed week even after
 * the matchup-pair guard) so the list reflects games that were actually
 * played and went badly. Mirrors `lows` in `renderRecords` (line 2071).
 */
export function selectWeeklyLows(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  limit = 10,
): TeamScoreRecord[] {
  const matchups = buildAllMatchupsWithStarters(seasons);
  const scores = regularSeasonScores(matchups).filter((s) => s.points > 0);
  scores.sort((a, b) => a.points - b.points);

  const rows: TeamScoreRecord[] = [];
  for (const raw of scores) {
    const decorated = decorateTeamScore(raw, ownerIndex);
    if (decorated) rows.push(decorated);
    if (rows.length >= limit) break;
  }
  return rows;
}

// ===================================================================
// Player records — single week and full season
// ===================================================================

/** One player single-week record entry. */
export interface PlayerWeekRecord {
  /** Sleeper player_id; the React `key`. */
  playerId: string;
  /** Display-ready player metadata (name, position, NFL team). */
  player: PlayerDisplay;
  /** Owner who started the player that week. */
  ownerKey: string;
  /** That owner's display name. */
  displayName: string;
  /** Owner's team name in the season the performance happened in. */
  teamName: string;
  /** Owner color. */
  color: string;
  /** Points the player scored that week. */
  points: number;
  /** Season the performance happened in. */
  season: string;
  /** Week number, 1-indexed. */
  week: number;
}

/** One player season-total record entry. */
export interface PlayerSeasonRecord {
  /** Sleeper player_id. */
  playerId: string;
  /** Display-ready player metadata. */
  player: PlayerDisplay;
  /** Owner whose roster the player was on for the (regular-season) games totaled here. */
  ownerKey: string;
  /** That owner's display name. */
  displayName: string;
  /** Owner's team name in `season`. */
  teamName: string;
  /** Owner color. */
  color: string;
  /** Total regular-season points the player put up while on `ownerKey`'s roster. */
  points: number;
  /** Season the totals were accumulated in. */
  season: string;
}

/**
 * Walks every regular-season matchup's starters and emits one row per
 * (player, week) appearance. Mirrors the legacy `buildPlayerStats`
 * loop (lines 1019-1058) for `playerWeekPerformances`. Empty / zero-id
 * starter slots ("0") and missing-id slots are dropped.
 */
function collectPlayerWeekPerformances(
  matchups: FlatMatchupWithStarters[],
): { playerId: string; ownerKey: string; season: string; week: number; pts: number }[] {
  const rows: { playerId: string; ownerKey: string; season: string; week: number; pts: number }[] =
    [];

  for (const m of matchups) {
    if (m.isPlayoff) continue;

    for (const side of [m.a, m.b]) {
      const starters = side.starters;
      const points = side.starterPoints;
      // Sleeper's two arrays line up positionally; tolerate either side
      // being missing (legacy: `if (!Array.isArray(side.starters) || ...) return`).
      if (!Array.isArray(starters) || !Array.isArray(points)) continue;

      starters.forEach((pid, i) => {
        if (!pid || pid === '0') return;
        const pts = points[i] || 0;
        rows.push({
          playerId: pid,
          ownerKey: side.ownerKey,
          season: m.season,
          week: m.week,
          pts,
        });
      });
    }
  }
  return rows;
}

/**
 * Top-N individual single-week performances, descending. Mirrors
 * `topWeeks` in `renderRecords` (lines 2082-2093). Players whose owner
 * is missing from the index are skipped (same as the team-score
 * selectors).
 */
export function selectPlayerSingleWeekHighs(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  limit = 10,
): PlayerWeekRecord[] {
  const matchups = buildAllMatchupsWithStarters(seasons);
  const performances = collectPlayerWeekPerformances(matchups);
  performances.sort((a, b) => b.pts - a.pts);

  const rows: PlayerWeekRecord[] = [];
  for (const perf of performances) {
    const meta = teamNameInSeason(perf.ownerKey, perf.season, ownerIndex);
    if (!meta) continue;
    rows.push({
      playerId: perf.playerId,
      player: playerDisplay(perf.playerId, players),
      ownerKey: perf.ownerKey,
      displayName: meta.displayName,
      teamName: meta.teamName,
      color: meta.color,
      points: perf.pts,
      season: perf.season,
      week: perf.week,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Top-N individual full-season totals, descending. Mirrors
 * `seasonTotals` in `renderRecords` (lines 2095-2108).
 *
 * The legacy code keys season totals by `${season}|${playerId}|${ownerKey}`
 * so a player traded mid-season produces *two* rows (one per owner), each
 * counting only the points they scored under that owner. We replicate
 * that semantics verbatim — port first, refactor later (per the
 * migration plan).
 */
export function selectPlayerSeasonHighs(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  limit = 10,
): PlayerSeasonRecord[] {
  const matchups = buildAllMatchupsWithStarters(seasons);
  const performances = collectPlayerWeekPerformances(matchups);

  // Aggregate by `season|playerId|ownerKey` — same key shape as legacy.
  const totals = new Map<
    string,
    { playerId: string; ownerKey: string; season: string; pts: number }
  >();
  for (const perf of performances) {
    const key = `${perf.season}|${perf.playerId}|${perf.ownerKey}`;
    const existing = totals.get(key);
    if (existing) {
      existing.pts += perf.pts;
    } else {
      totals.set(key, {
        playerId: perf.playerId,
        ownerKey: perf.ownerKey,
        season: perf.season,
        pts: perf.pts,
      });
    }
  }

  const sorted = [...totals.values()].sort((a, b) => b.pts - a.pts);

  const rows: PlayerSeasonRecord[] = [];
  for (const t of sorted) {
    const meta = teamNameInSeason(t.ownerKey, t.season, ownerIndex);
    if (!meta) continue;
    rows.push({
      playerId: t.playerId,
      player: playerDisplay(t.playerId, players),
      ownerKey: t.ownerKey,
      displayName: meta.displayName,
      teamName: meta.teamName,
      color: meta.color,
      points: t.pts,
      season: t.season,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
