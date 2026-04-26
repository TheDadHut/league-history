// ===================================================================
// Seasons tab — stat layer
// ===================================================================
//
// Pure selectors for the Seasons tab, factored out of the legacy
// `index.html` build/render layer. Selectors are deterministic and
// work entirely off the provider payload (`SeasonDetails[]` +
// `OwnerIndex` + `PlayerIndex`); no I/O, no DOM, no sessionStorage.
//
// Selector inventory (in source order, mirroring legacy line ranges):
//
//   - `selectSeasonOptions`        ← `populateSeasonPicker()` (3023-3029)
//   - `selectSeasonStandings`      ← `renderSeason()` standings block
//                                    (3032-3047, 3134-3141)
//   - `selectChampion`             ← `buildChampions()` (910-934)
//   - `selectToiletBowlWinner`     ← `buildToiletBowlWinners()` (936-953)
//   - `buildPlayerSeasonStats`     ← `buildPlayerStats()` (1019-1056)
//   - `selectSeasonAwards`         ← awards row inside `renderSeason()`
//                                    (3050-3128)
//   - `selectDraftBoard`           ← draft board (3143-3168)
//   - `selectDraftValue`           ← steals/busts/waiver heroes
//                                    (3170-3336)
//   - `selectDraftGrades`          ← `buildDraftGrades()` (1431-1618)
//   - `selectWaiverProfile`        ← `buildWaiverGrades()` (1630-1841)
//
// Math is ported verbatim from the legacy site. Per the migration
// plan, port-first / refactor-later — if a formula looks suspect,
// flag it on the PR rather than "improving" it here.

import type { OwnerIndex, SeasonDetails } from '../owners';
import { ownerKey } from '../owners';
import type { PlayerIndex } from '../leagueData';
import { playerDisplay } from '../players';
import type { BracketMatch, DraftPick, Matchup, Transaction } from '../../types/sleeper';
import { buildAllMatchups, buildRosterToOwnerKey } from './util';

// ===================================================================
// Season picker
// ===================================================================

export interface SeasonOption {
  /** Year string, e.g. `"2024"` — also the picker `<option>` value. */
  season: string;
  /** Whether the league has finished its playoffs (Sleeper `status === 'complete'`). */
  isComplete: boolean;
  /**
   * Picker label as rendered in the legacy site:
   * `"2024 Season"` for completed seasons,
   * `"2024 Season (In Progress)"` for the active one.
   */
  label: string;
}

/**
 * One option per season in the league's history, **most recent first**.
 * Mirrors `populateSeasonPicker()` (index.html lines 3023-3027): the
 * legacy code reverses `state.leagues` (which is stored
 * oldest-to-newest) so the picker defaults to the latest season.
 *
 * Returned options are stable: the picker can use `season` as the
 * value attribute and as a React `key`.
 */
export function selectSeasonOptions(seasons: SeasonDetails[]): SeasonOption[] {
  // Defensive copy — never mutate the caller's array. The provider's
  // `seasons` reference is shared with every tab.
  const reversed = [...seasons].reverse();
  return reversed.map((s) => {
    const isComplete = s.status === 'complete';
    return {
      season: s.season,
      isComplete,
      label: isComplete ? `${s.season} Season` : `${s.season} Season (In Progress)`,
    };
  });
}

// ===================================================================
// Per-season standings
// ===================================================================

/** One row in the per-season standings table. */
export interface SeasonStandingsRow {
  /** Stable cross-season owner key. */
  ownerKey: string;
  /** Cross-season-stable display name. */
  displayName: string;
  /** Team name as set in the season the row covers (owners rename year over year). */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
  wins: number;
  losses: number;
  /** Points For — sum of the owner's regular-season scores in this season. */
  pf: number;
  /** Points Against — sum of opponents' regular-season scores against this owner. */
  pa: number;
}

/**
 * Returns the regular-season standings for one season, sorted by wins
 * descending, with PF as the tiebreaker (matches the legacy sort at
 * line 3047: `(b.wins - a.wins) || (b.pf - a.pf)`).
 *
 * Owners who appeared in the season's user list but never played a
 * regular-season game (Sleeper edge case — usually a manual rosters
 * wipe, almost never seen in practice) still get a row with all zeros.
 * That mirrors the legacy `seasonStats[ownerKey(u)] = {wins:0, ...}`
 * initialization at line 3037.
 *
 * Playoff games are intentionally excluded — the standings panel is
 * regular-season only (legacy filter at line 3035:
 * `m => m.season === season && !m.isPlayoff`).
 *
 * Returns an empty array if the requested season isn't in `seasons`
 * (defensive — same outcome as the legacy `if (!league) return`).
 */
export function selectSeasonStandings(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  season: string,
): SeasonStandingsRow[] {
  const league = seasons.find((s) => s.season === season);
  if (!league) return [];

  // Initialize a row for every owner that appears in this season's
  // user list — even one with zero games. Same as the legacy
  // `league.users.forEach(u => seasonStats[ownerKey(u)] = {...})` loop.
  const rows = new Map<string, SeasonStandingsRow>();
  for (const user of league.users) {
    const key = ownerKey(user);
    if (!key) continue;
    if (rows.has(key)) continue;

    const owner = ownerIndex[key];
    // Display name + color come from the cross-season index so they
    // stay stable across renames; team name comes from the user's
    // metadata for *this* season specifically.
    const displayName = owner?.displayName || user.display_name || user.username || 'Unknown';
    const teamName = owner?.teamNamesBySeason[season] || user.metadata?.team_name || displayName;
    const color = owner?.color ?? '';

    rows.set(key, {
      ownerKey: key,
      displayName,
      teamName,
      color,
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
    });
  }

  // Walk regular-season games for the requested season only. We rebuild
  // the lean flat-matchup view across every season (consistent with the
  // other selectors) and then narrow by `season` here — the cost is
  // small relative to the React render, and it keeps the helper
  // signature uniform with Overview / H2H.
  const matchups = buildAllMatchups(seasons);
  for (const m of matchups) {
    if (m.season !== season) continue;
    if (m.isPlayoff) continue;

    const a = rows.get(m.ownerAKey);
    const b = rows.get(m.ownerBKey);
    if (!a || !b) continue;

    a.pf += m.scoreA;
    a.pa += m.scoreB;
    b.pf += m.scoreB;
    b.pa += m.scoreA;

    if (m.scoreA > m.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.scoreB > m.scoreA) {
      b.wins += 1;
      a.losses += 1;
    }
    // Ties do not increment either side's wins or losses — same as
    // the legacy `else if` chain (which has no `else` for ties).
  }

  // Wins desc, then PF desc as the tiebreaker (legacy line 3047).
  const standings = [...rows.values()].sort((x, y) => y.wins - x.wins || y.pf - x.pf);
  return standings;
}

// ===================================================================
// Champion + toilet bowl winner — single-season views
// ===================================================================

/** One season's championship game outcome. */
export interface SeasonChampion {
  ownerKey: string;
  /** Cross-season-stable display name. */
  displayName: string;
  /** Team name in the season the title was won. */
  teamName: string;
  /** Owner color. */
  color: string;
  /** Roster ID of the winning team (used to look up Finals MVP starters). */
  winnerRoster: number;
  /** Week the championship game was played. */
  champWeek: number;
}

/**
 * Resolves the champion for one season's payload. Mirrors
 * `buildChampions()` (lines 910-934). Returns `null` when the league is
 * still in progress, the bracket is missing, or the final game hasn't
 * been decided yet.
 */
export function selectChampion(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
): SeasonChampion | null {
  if (league.status !== 'complete') return null;
  if (!league.winnersBracket || league.winnersBracket.length === 0) return null;

  const champMatches = league.winnersBracket.filter((m) => m.p === 1);
  if (champMatches.length === 0) return null;
  const champGame = champMatches[champMatches.length - 1];
  if (!champGame || !champGame.w) return null;

  const ownerKeyForRoster = ownerKeyByRosterId(league, champGame.w);
  if (!ownerKeyForRoster) return null;
  const owner = ownerIndex[ownerKeyForRoster];
  if (!owner) return null;

  // Compute the championship week the same way the legacy does — find
  // the highest round in the winners bracket and add the offset to the
  // playoff start week.
  const finalRound = Math.max(...league.winnersBracket.map((m) => m.r || 0));
  const playoffStart = league.settings.playoff_week_start ?? 15;
  const champWeek = playoffStart + finalRound - 1;

  return {
    ownerKey: owner.key,
    displayName: owner.displayName,
    teamName: owner.teamNamesBySeason[league.season] || owner.displayName,
    color: owner.color,
    winnerRoster: champGame.w,
    champWeek,
  };
}

/** One season's toilet bowl winner (consolation bracket champion). */
export interface ToiletBowlWinner {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
}

/**
 * Resolves the toilet bowl winner for one season. Mirrors
 * `buildToiletBowlWinners()` (lines 936-953). The "winner" here is the
 * losers-bracket champion — the team that won the consolation bracket
 * against the rest of the league's worst records.
 */
export function selectToiletBowlWinner(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
): ToiletBowlWinner | null {
  if (league.status !== 'complete') return null;
  if (!league.losersBracket || league.losersBracket.length === 0) return null;

  // The legacy code prefers a `p === 1` match and falls back to the
  // last match in the bracket if none of them carry the placement
  // flag — ports verbatim.
  const finalMatches = league.losersBracket.filter((m) => m.p === 1);
  const finalGame: BracketMatch | undefined =
    finalMatches[finalMatches.length - 1] ?? league.losersBracket[league.losersBracket.length - 1];
  if (!finalGame || !finalGame.w) return null;

  const ownerKeyForRoster = ownerKeyByRosterId(league, finalGame.w);
  if (!ownerKeyForRoster) return null;
  const owner = ownerIndex[ownerKeyForRoster];
  if (!owner) return null;

  return {
    ownerKey: owner.key,
    displayName: owner.displayName,
    teamName: owner.teamNamesBySeason[league.season] || owner.displayName,
    color: owner.color,
  };
}

/** Local helper — `roster_id` → owner key, with both lookup steps inlined. */
function ownerKeyByRosterId(league: SeasonDetails, rosterId: number): string | null {
  const roster = league.rosters.find((r) => r.roster_id === rosterId);
  if (!roster || roster.owner_id == null) return null;
  const user = league.users.find((u) => u.user_id === roster.owner_id);
  if (!user) return null;
  return ownerKey(user) || null;
}

// ===================================================================
// Player season stats (per-season totals + per-week roster contributions)
// ===================================================================

/** One row in `playerSeasonTotals` — a player's total points on one roster in one season. */
export interface PlayerSeasonTotal {
  playerId: string;
  /** Stable cross-season owner key. */
  ownerKey: string;
  /** Total points scored as a starter in regular-season weeks while owned by `ownerKey`. */
  pts: number;
}

/** One starter's contribution in one (season, week, roster) cell. */
export interface RosterWeekContribution {
  playerId: string;
  pts: number;
}

/** Lookup table: `${season}|${playerId}|${ownerKey}` → totals for that combo. */
export type PlayerSeasonTotals = Record<string, PlayerSeasonTotal>;

/** Lookup table: `${season}|W${week}|R${rosterId}` → starters list for that cell. */
export type RosterWeekContributions = Record<string, RosterWeekContribution[]>;

/** Lookup table: `${season}|R${rosterId}` → playerId → regular-season total points. */
export type RosterSeasonContributions = Record<string, Record<string, number>>;

export interface PlayerSeasonStats {
  playerSeasonTotals: PlayerSeasonTotals;
  rosterWeekContributions: RosterWeekContributions;
  rosterSeasonContributions: RosterSeasonContributions;
}

/**
 * Builds the three derived player-stat structures for one league.
 * Mirrors `buildPlayerStats()` (lines 1019-1056), narrowed to one
 * season's matchups so each tab can re-derive cheaply via `useMemo`.
 *
 *   - `playerSeasonTotals` is keyed by `${season}|${playerId}|${ownerKey}`
 *     so a player traded mid-season produces two rows (one per owner).
 *     Used by Season MVP, draft grades, and steals/busts.
 *   - `rosterWeekContributions` is keyed by `${season}|W${week}|R${roster}`
 *     and includes playoff weeks. Used to find Finals MVP.
 *   - `rosterSeasonContributions` is regular-season only and keyed by
 *     `${season}|R${roster}`. Used to find the Champion's Best Player.
 *
 * The legacy code populates these *across all seasons* into the global
 * `state.*` maps; here we restrict to one season to keep the React-side
 * recomputation cheap. Memoize against `(league, season)` in the
 * component layer.
 */
export function buildPlayerSeasonStats(league: SeasonDetails): PlayerSeasonStats {
  const playerSeasonTotals: PlayerSeasonTotals = {};
  const rosterWeekContributions: RosterWeekContributions = {};
  const rosterSeasonContributions: RosterSeasonContributions = {};

  const rosterToOwner = buildRosterToOwnerKey(league);
  const playoffStart = league.settings.playoff_week_start ?? 15;

  league.weeklyMatchups.forEach((week, idx) => {
    const weekNum = idx + 1;
    if (!week || week.length === 0) return;
    const isPlayoff = weekNum >= playoffStart;

    // Skip 0-0 matchup pairs the same way `buildAllMatchups` does in
    // `stats/util.ts`: pair rows by `matchup_id`, drop the pair when
    // both sides scored zero (Sleeper occasionally returns these for
    // unplayed weeks; for in-progress seasons future weeks have rows
    // pre-fetched but not yet played). Matches the legacy `buildPlayerStats`
    // behavior, which walked `state.allMatchups` after this same filter
    // had already been applied at line 866 of `index.html`.
    const matchupGroups = new Map<number, Matchup[]>();
    const ungrouped: Matchup[] = [];
    for (const m of week) {
      if (m.matchup_id == null) {
        ungrouped.push(m);
        continue;
      }
      const list = matchupGroups.get(m.matchup_id) ?? [];
      list.push(m);
      matchupGroups.set(m.matchup_id, list);
    }
    const liveRows: Matchup[] = [...ungrouped];
    for (const pair of matchupGroups.values()) {
      if (pair.length === 2) {
        const [a, b] = pair;
        if ((a.points || 0) === 0 && (b.points || 0) === 0) continue;
      }
      liveRows.push(...pair);
    }

    for (const m of liveRows) {
      const oKey = rosterToOwner.get(m.roster_id);
      if (!oKey) continue;

      const starters = m.starters ?? [];
      const starterPoints = m.starters_points ?? [];
      if (!Array.isArray(starters) || !Array.isArray(starterPoints)) continue;

      starters.forEach((pid, i) => {
        if (!pid || pid === '0') return;
        const pts = starterPoints[i] ?? 0;

        if (!isPlayoff) {
          // playerSeasonTotals — keyed by season|player|owner.
          const key = `${league.season}|${pid}|${oKey}`;
          const existing = playerSeasonTotals[key];
          if (existing) {
            existing.pts += pts;
          } else {
            playerSeasonTotals[key] = { playerId: pid, ownerKey: oKey, pts };
          }

          // rosterSeasonContributions — keyed by season|R{roster}.
          const rsKey = `${league.season}|R${m.roster_id}`;
          const seasonMap = rosterSeasonContributions[rsKey] ?? {};
          seasonMap[pid] = (seasonMap[pid] ?? 0) + pts;
          rosterSeasonContributions[rsKey] = seasonMap;
        }

        // rosterWeekContributions — keyed by season|W{week}|R{roster};
        // includes playoff weeks because Finals MVP lives there.
        const rwKey = `${league.season}|W${weekNum}|R${m.roster_id}`;
        const list = rosterWeekContributions[rwKey] ?? [];
        list.push({ playerId: pid, pts });
        rosterWeekContributions[rwKey] = list;
      });
    }
  });

  return { playerSeasonTotals, rosterWeekContributions, rosterSeasonContributions };
}

// ===================================================================
// Internal: legacy-compatible per-week "live rows" iterator
// ===================================================================
//
// Several stat layers (waiver math, PWR) need to walk every roster's
// per-week matchup row, but only for matchups that count under the
// legacy `state.allMatchups` filtering rules. That means: pair rows
// by `matchup_id`, drop rows with `matchup_id == null`, drop pairs
// that aren't exactly two teams, drop pairs where both sides scored 0.
//
// `buildAllMatchups` in `stats/util.ts` produces a flat side-vs-side
// view, but the consumers here need the underlying `Matchup` rows so
// they can read `players` / `players_points` / `starters` /
// `starters_points`. This helper preserves the same filter semantics
// while yielding the raw rows.

interface LiveMatchupWeek {
  weekNum: number;
  rows: Matchup[];
}

/**
 * Yields per-week "live" matchup rows for a season, matching legacy
 * `buildAllMatchups()` (index.html lines 851-890) filter semantics:
 *
 *   - Drops weeks with no data (empty array).
 *   - Drops rows with `matchup_id == null` (byes / no-pair rows).
 *   - Drops pairs that aren't exactly two teams (commish edits).
 *   - Drops pairs where both sides scored 0 (Sleeper occasionally
 *     returns these for unplayed weeks; in-progress seasons pre-fetch
 *     future-week rows with `points: 0`).
 *
 * Both rows of a surviving pair are included in `rows`. The week index
 * is 1-based (matching legacy `weekNum = idx + 1`).
 *
 * Used by `selectDraftGrades` (PWR walk) and `selectWaiverProfile`
 * (per-week player index). Keeping it private to `seasons.ts` until a
 * third consumer needs it; promote to `stats/util.ts` then.
 */
function liveMatchupWeeks(league: SeasonDetails): LiveMatchupWeek[] {
  const out: LiveMatchupWeek[] = [];

  league.weeklyMatchups.forEach((week, idx) => {
    const weekNum = idx + 1;
    if (!week || week.length === 0) return;

    const byMatchup = new Map<number, Matchup[]>();
    for (const m of week) {
      if (m.matchup_id == null) continue;
      const list = byMatchup.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchup.set(m.matchup_id, list);
    }

    const rows: Matchup[] = [];
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (!a || !b) continue;
      if ((a.points || 0) === 0 && (b.points || 0) === 0) continue;
      rows.push(a, b);
    }

    if (rows.length > 0) out.push({ weekNum, rows });
  });

  return out;
}

// ===================================================================
// Awards row
// ===================================================================

/** A player-style award (Finals MVP, Season MVP, Champion's Best). */
export interface PlayerAward {
  /** "Finals MVP" / "Season MVP" / "Champion's Best Player". */
  label: string;
  /** Unicode marker rendered before the label (e.g. "👑", "⭐"). */
  marker: string;
  /** Color tint for the award card border. */
  tint: AwardTint;
  /** Sleeper player_id of the winning player. */
  playerId: string;
  /** Display-ready player metadata. */
  playerName: string;
  /** Position string (e.g., "WR"). */
  playerPosition: string;
  /** Points the player put up. */
  pts: number;
  /** Owner whose roster the player was on (for the detail line). */
  ownerDisplayName: string;
  /**
   * `pts` formatting precision — Finals MVP and Champion's Best use
   * one decimal in the legacy site, Season MVP uses one decimal too,
   * and the Finals MVP cell uses two. We surface the exact precision
   * here so the component can render verbatim without re-deriving the
   * award type.
   */
  ptsPrecision: 1 | 2;
}

/** A team-style award (Champion, Highest PF, Most PA, Toilet Bowl). */
export interface TeamAward {
  label: string;
  marker: string;
  tint: AwardTint;
  /** Owner whose team won this award. */
  ownerKey: string;
  /** What to render in the big "winner" line — team name for Champion / Toilet Bowl, display name for PF/PA. */
  winnerLabel: string;
  /** Owner display name (or the team name for the toilet bowl detail). */
  detail: string;
  /** Owner color (used for the inline color on the winner line). */
  color: string;
}

export type SeasonAward = (PlayerAward & { kind: 'player' }) | (TeamAward & { kind: 'team' });

export type AwardTint = 'gold' | 'blue' | 'green' | 'brown';

/**
 * Builds the awards row for a completed season. Mirrors the awards
 * block inside `renderSeason()` (lines 3050-3128) verbatim. Returns
 * `[]` if the league isn't complete or the champion can't be resolved
 * (the legacy code only renders awards when `champ` exists — note the
 * `if (champ) { html += '<div class="awards">...' }` wrap at 3083).
 *
 * Award order is fixed: Champion → Finals MVP → Season MVP → Champion's
 * Best Player (only if distinct from Finals MVP) → Highest PF → Most PA
 * → Toilet Bowl. The component renders straight off this array.
 */
export function selectSeasonAwards(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  champion: SeasonChampion | null,
  toiletBowl: ToiletBowlWinner | null,
  playerStats: PlayerSeasonStats,
  standings: SeasonStandingsRow[],
): SeasonAward[] {
  if (league.status !== 'complete') return [];
  if (!champion) return [];

  const awards: SeasonAward[] = [];
  const season = league.season;

  // ----- Champion (gold) -----
  awards.push({
    kind: 'team',
    label: 'Champion',
    marker: '🏆',
    tint: 'gold',
    ownerKey: champion.ownerKey,
    winnerLabel: champion.teamName,
    detail: champion.displayName,
    color: champion.color,
  });

  // ----- Finals MVP (gold) -----
  // Highest-scoring starter on the champion's roster in the
  // championship week. Reads from rosterWeekContributions.
  const rwKey = `${season}|W${champion.champWeek}|R${champion.winnerRoster}`;
  const finalsStarters = playerStats.rosterWeekContributions[rwKey] ?? [];
  let finalsMVP: RosterWeekContribution | null = null;
  for (const s of finalsStarters) {
    if (!finalsMVP || s.pts > finalsMVP.pts) finalsMVP = s;
  }
  if (finalsMVP) {
    const display = playerDisplay(finalsMVP.playerId, players);
    awards.push({
      kind: 'player',
      label: 'Finals MVP',
      marker: '👑',
      tint: 'gold',
      playerId: finalsMVP.playerId,
      playerName: display.name,
      playerPosition: display.position,
      pts: finalsMVP.pts,
      ownerDisplayName: champion.displayName,
      ptsPrecision: 2,
    });
  }

  // ----- Season MVP (blue) -----
  // Highest-scoring player across all rosters during the regular season.
  let seasonMVP: PlayerSeasonTotal | null = null;
  for (const t of Object.values(playerStats.playerSeasonTotals)) {
    if (!seasonMVP || t.pts > seasonMVP.pts) seasonMVP = t;
  }
  if (seasonMVP) {
    const display = playerDisplay(seasonMVP.playerId, players);
    const mvpOwner = ownerIndex[seasonMVP.ownerKey];
    awards.push({
      kind: 'player',
      label: 'Season MVP',
      marker: '⭐',
      tint: 'blue',
      playerId: seasonMVP.playerId,
      playerName: display.name,
      playerPosition: display.position,
      pts: seasonMVP.pts,
      ownerDisplayName: mvpOwner?.displayName ?? '—',
      ptsPrecision: 1,
    });
  }

  // ----- Champion's Best Player (gold, only if distinct from Finals MVP) -----
  // Highest-scoring player on the champion's roster across the regular
  // season. Reads from rosterSeasonContributions.
  const rsKey = `${season}|R${champion.winnerRoster}`;
  const champContribs = playerStats.rosterSeasonContributions[rsKey] ?? {};
  let champBestPid: string | null = null;
  let champBestPts = -Infinity;
  for (const [pid, pts] of Object.entries(champContribs)) {
    if (pts > champBestPts) {
      champBestPts = pts;
      champBestPid = pid;
    }
  }
  if (champBestPid && (!finalsMVP || champBestPid !== finalsMVP.playerId)) {
    const display = playerDisplay(champBestPid, players);
    awards.push({
      kind: 'player',
      label: "Champion's Best Player",
      marker: '',
      tint: 'gold',
      playerId: champBestPid,
      playerName: display.name,
      playerPosition: display.position,
      pts: champBestPts,
      ownerDisplayName: champion.displayName,
      ptsPrecision: 1,
    });
  }

  // ----- Highest Points For (blue) -----
  // Same `standings` array the table renders from; sort by PF.
  const topPF = [...standings].sort((a, b) => b.pf - a.pf)[0];
  if (topPF) {
    awards.push({
      kind: 'team',
      label: 'Highest Points For',
      marker: '',
      tint: 'blue',
      ownerKey: topPF.ownerKey,
      winnerLabel: topPF.displayName,
      detail: topPF.pf.toFixed(2),
      color: topPF.color,
    });
  }

  // ----- Most Points Against (brown) -----
  const topPA = [...standings].sort((a, b) => b.pa - a.pa)[0];
  if (topPA) {
    awards.push({
      kind: 'team',
      label: 'Most Points Against',
      marker: '',
      tint: 'brown',
      ownerKey: topPA.ownerKey,
      winnerLabel: topPA.displayName,
      detail: `${topPA.pa.toFixed(2)} allowed`,
      color: topPA.color,
    });
  }

  // ----- Toilet Bowl Winner (green) -----
  if (toiletBowl) {
    awards.push({
      kind: 'team',
      label: 'Toilet Bowl Winner',
      marker: '🚽',
      tint: 'green',
      ownerKey: toiletBowl.ownerKey,
      winnerLabel: toiletBowl.displayName,
      detail: toiletBowl.teamName,
      color: toiletBowl.color,
    });
  }

  return awards;
}

// ===================================================================
// Draft board — first-N rounds
// ===================================================================

/** One pick in the draft board grid. */
export interface DraftBoardPick {
  pickNo: number;
  /** Player display name (legacy uses the pick's `metadata.first_name + last_name`, falls back to "Unknown"). */
  playerName: string;
  /** Owner color used to tint the pick card's left border. */
  color: string;
  /** Team name in this season (or display name if no team name set). */
  teamName: string;
}

export interface DraftBoardRound {
  round: number;
  picks: DraftBoardPick[];
}

export interface DraftBoardData {
  /** The first `roundsToShow` rounds, in pick order within each. */
  rounds: DraftBoardRound[];
  /** Total number of rounds across the full draft (so the footer can say "Rounds 3-N available in Sleeper app"). */
  totalRounds: number;
}

/**
 * Slices the league's draft picks into the first `roundsToShow`
 * rounds, sorted by pick number. Mirrors the draft-board branch in
 * `renderSeason()` (lines 3143-3168). Returns `null` if the league has
 * no drafted picks (e.g., season hasn't drafted yet).
 *
 * Player names come from the pick's own `metadata.first_name +
 * last_name` (which Sleeper attaches to draft picks at draft time)
 * rather than the player DB — keeping the legacy preference. This
 * avoids a player-DB lookup for every pick on the board and ensures
 * the name a player was drafted under shows even if they were later
 * renamed in Sleeper's player DB.
 */
export function selectDraftBoard(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
  roundsToShow = 2,
): DraftBoardData | null {
  if (!league.draftPicks || league.draftPicks.length === 0) return null;

  // Group picks by round; sort each round's picks by overall pick #.
  const byRound = new Map<number, DraftPick[]>();
  for (const p of league.draftPicks) {
    const list = byRound.get(p.round) ?? [];
    list.push(p);
    byRound.set(p.round, list);
  }
  const sortedRoundNumbers = [...byRound.keys()].sort((a, b) => a - b);

  const totalRounds = sortedRoundNumbers.length;
  const showRounds = sortedRoundNumbers.slice(0, roundsToShow);

  const rounds: DraftBoardRound[] = showRounds.map((roundNum) => {
    const list = (byRound.get(roundNum) ?? []).slice().sort((a, b) => a.pick_no - b.pick_no);
    const picks: DraftBoardPick[] = list.map((p) => {
      const user = league.users.find((u) => u.user_id === p.picked_by);
      const owner = user ? ownerIndex[ownerKey(user)] : null;
      const color = owner?.color || 'var(--c-default)';
      const teamName = owner
        ? owner.teamNamesBySeason[league.season] || owner.displayName
        : 'Unknown';
      // Legacy: `p.metadata?.first_name ? `${p.metadata.first_name} ${p.metadata.last_name}` : 'Unknown'`.
      const playerName = p.metadata?.first_name
        ? `${p.metadata.first_name} ${p.metadata.last_name ?? ''}`.trim()
        : 'Unknown';
      return { pickNo: p.pick_no, playerName, color, teamName };
    });
    return { round: roundNum, picks };
  });

  return { rounds, totalRounds };
}

// ===================================================================
// Draft value — steals / busts / waiver heroes
// ===================================================================

/** One row in the steals / busts / waiver-heroes tables. */
export interface DraftValueRow {
  playerId: string;
  /** Display-ready player name. */
  playerName: string;
  /** Position string. */
  position: string;
  /** Owner who finished the season with the best slice of this player. */
  ownerKey: string;
  /** Owner's display name (for the chip subtext). */
  ownerDisplayName: string;
  /** Owner's team name in this season. */
  ownerTeamName: string;
  /** Owner color. */
  ownerColor: string;
  /** Pick number — null for waiver heroes. */
  pickNo: number | null;
  /** "WR4", "RB12", … — positional finish rank. */
  posFinish: string;
  /** Steal/bust value (signed integer; pickNo - expected). null for waiver heroes. */
  value: number | null;
  /** Total points the player put up. */
  pts: number;
}

export interface DraftValueData {
  steals: DraftValueRow[];
  busts: DraftValueRow[];
  waiverHeroes: DraftValueRow[];
}

/**
 * Returns the steals / busts / waiver-heroes triple for one season.
 * Mirrors the in-component derivation at lines 3170-3336. The math is
 * preserved verbatim (positional finish vs. expected pick cost; +ve =
 * steal, -ve = bust). Returns `null` if the season has no draft picks
 * (the legacy site only renders these tables inside the
 * `if (league.draftPicks && league.draftPicks.length > 0)` branch).
 *
 * Filtering matches legacy:
 *   - Players scoring ≤ 20 pts are dropped before positional ranking
 *     (line 3190 — "filter noise").
 *   - Waiver heroes have per-position caps:
 *     QB ≤ 15, RB ≤ 30, WR ≤ 30, TE ≤ 10, K ≤ 8, DEF ≤ 10.
 */
export function selectDraftValue(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  playerStats: PlayerSeasonStats,
): DraftValueData | null {
  if (!league.draftPicks || league.draftPicks.length === 0) return null;

  const season = league.season;

  // For each player, sum their per-owner totals and pick the owner who
  // contributed the most points (legacy tiebreaker — the "primary"
  // owner is the one who held them longest / scored most). Mirrors
  // lines 3174-3185.
  interface PlayerSeason {
    pts: number;
    ownerKey: string;
    ownerPts: number;
  }
  const playerSeasonByPlayer = new Map<string, PlayerSeason>();
  for (const t of Object.values(playerStats.playerSeasonTotals)) {
    const existing = playerSeasonByPlayer.get(t.playerId);
    if (existing) {
      existing.pts += t.pts;
      if (t.pts > existing.ownerPts) {
        existing.ownerKey = t.ownerKey;
        existing.ownerPts = t.pts;
      }
    } else {
      playerSeasonByPlayer.set(t.playerId, {
        pts: t.pts,
        ownerKey: t.ownerKey,
        ownerPts: t.pts,
      });
    }
  }

  // Bucket players ≥ 20 pts by position; rank within position.
  interface PosCandidate {
    playerId: string;
    pts: number;
    ownerKey: string;
    position: string;
  }
  const byPosition = new Map<string, PosCandidate[]>();
  for (const [pid, data] of playerSeasonByPlayer) {
    if (data.pts <= 20) continue;
    const pos = playerDisplay(pid, players).position || 'UNK';
    const list = byPosition.get(pos) ?? [];
    list.push({ playerId: pid, pts: data.pts, ownerKey: data.ownerKey, position: pos });
    byPosition.set(pos, list);
  }

  // Per-player positional finish rank.
  const posFinishRank = new Map<string, { pos: string; rank: number }>();
  for (const [pos, list] of byPosition) {
    list.sort((a, b) => b.pts - a.pts);
    list.forEach((p, i) => {
      posFinishRank.set(p.playerId, { pos, rank: i + 1 });
    });
  }

  // Draft info — what pick a player went at, and which owner drafted them.
  const draftedPlayerIds = new Set<string>();
  const draftInfo = new Map<string, { pickNo: number; ownerKey: string | null }>();
  for (const p of league.draftPicks) {
    if (!p.player_id) continue;
    draftedPlayerIds.add(p.player_id);
    const user = league.users.find((u) => u.user_id === p.picked_by);
    const oKey = user ? ownerKey(user) : null;
    draftInfo.set(p.player_id, { pickNo: p.pick_no, ownerKey: oKey || null });
  }

  // Expected pick by positional rank — using this season's own draft
  // behavior. Per-position counters incremented in pick order.
  const expectedPickByPosRank = new Map<string, number>();
  const posDraftCounts = new Map<string, number>();
  for (const p of [...league.draftPicks]
    .filter((p) => p.player_id)
    .sort((a, b) => a.pick_no - b.pick_no)) {
    if (!p.player_id) continue;
    const pos = playerDisplay(p.player_id, players).position;
    if (!pos || pos === 'UNK') continue;
    const next = (posDraftCounts.get(pos) ?? 0) + 1;
    posDraftCounts.set(pos, next);
    expectedPickByPosRank.set(`${pos}${next}`, p.pick_no);
  }
  const totalPicks = league.draftPicks.length;

  // Build the steals/busts candidate list.
  interface DraftedRecord {
    playerId: string;
    pts: number;
    ownerKey: string | null;
    pickNo: number;
    posFinish: string;
    value: number;
  }
  const drafted: DraftedRecord[] = [];
  for (const pid of draftedPlayerIds) {
    const finish = posFinishRank.get(pid);
    if (!finish) continue; // < 20 pts; skipped above.
    const info = draftInfo.get(pid);
    if (!info) continue;
    const expected = expectedPickByPosRank.get(`${finish.pos}${finish.rank}`) ?? totalPicks + 1;
    const data = playerSeasonByPlayer.get(pid);
    if (!data) continue;
    drafted.push({
      playerId: pid,
      pts: data.pts,
      ownerKey: info.ownerKey,
      pickNo: info.pickNo,
      posFinish: `${finish.pos}${finish.rank}`,
      value: info.pickNo - expected,
    });
  }

  const decorate = (
    pid: string,
    ownerKeyForRow: string | null,
    pts: number,
    pickNo: number | null,
    posFinish: string,
    value: number | null,
  ): DraftValueRow => {
    const display = playerDisplay(pid, players);
    const owner = ownerKeyForRow ? ownerIndex[ownerKeyForRow] : null;
    return {
      playerId: pid,
      playerName: display.name,
      position: display.position,
      ownerKey: ownerKeyForRow ?? '',
      ownerDisplayName: owner?.displayName ?? '',
      ownerTeamName: owner ? owner.teamNamesBySeason[season] || owner.displayName : '',
      ownerColor: owner?.color ?? '',
      pickNo,
      posFinish,
      value,
      pts,
    };
  };

  const steals: DraftValueRow[] = [...drafted]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((r) => decorate(r.playerId, r.ownerKey, r.pts, r.pickNo, r.posFinish, r.value));
  const busts: DraftValueRow[] = [...drafted]
    .sort((a, b) => a.value - b.value)
    .slice(0, 5)
    .map((r) => decorate(r.playerId, r.ownerKey, r.pts, r.pickNo, r.posFinish, r.value));

  // Waiver heroes — undrafted, ≥ 20 pts, with strong positional finish.
  // Per-position cap mirrors the legacy `positionCapForHeroes` map.
  const positionCapForHeroes: Record<string, number> = {
    QB: 15,
    RB: 30,
    WR: 30,
    TE: 10,
    K: 8,
    DEF: 10,
  };
  const waiverHeroesRaw: { playerId: string; pts: number; ownerKey: string; posFinish: string }[] =
    [];
  for (const [pid, data] of playerSeasonByPlayer) {
    if (draftedPlayerIds.has(pid)) continue;
    if (data.pts <= 20) continue;
    const finish = posFinishRank.get(pid);
    if (!finish) continue;
    const cap = positionCapForHeroes[finish.pos] ?? 999;
    if (finish.rank > cap) continue;
    waiverHeroesRaw.push({
      playerId: pid,
      pts: data.pts,
      ownerKey: data.ownerKey,
      posFinish: `${finish.pos}${finish.rank}`,
    });
  }
  const waiverHeroes: DraftValueRow[] = waiverHeroesRaw
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
    .map((r) => decorate(r.playerId, r.ownerKey, r.pts, null, r.posFinish, null));

  return { steals, busts, waiverHeroes };
}

// ===================================================================
// Draft grades — DCE / RP / PWR with per-season letter grades
// ===================================================================

export type GradeLetter = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Map a numeric GPA to a letter grade using the same fixed thresholds
 * the legacy renderer used inline (`numToGrade`, index.html lines 2814
 * and 2873). This is the "stable" reverse mapping — no curve — used to
 * collapse a per-season GPA average back to a single composite letter.
 *
 * Used by `selectDraftGrades` (overallGrade per season) and by the
 * Owner Stats tab's all-time draft / waiver composites.
 */
export function gpaToGradeLetter(gpa: number): GradeLetter {
  if (gpa >= 4.15) return 'A+';
  if (gpa >= 3.5) return 'A';
  if (gpa >= 2.5) return 'B';
  if (gpa >= 1.5) return 'C';
  if (gpa >= 0.5) return 'D';
  return 'F';
}

/** One row in the per-season draft grades table. */
export interface DraftGradeRow {
  ownerKey: string;
  /** Display name + color come from `ownerIndex`; team name is per-season. */
  displayName: string;
  teamName: string;
  color: string;
  pickCount: number;
  /** Sum of per-pick steal/bust values. */
  dce: number;
  /** Total points scored by all drafted players over the regular season. */
  rp: number;
  /** Points scored while still on the drafter's roster. */
  pwr: number;
  dceGrade: GradeLetter;
  rpGrade: GradeLetter;
  pwrGrade: GradeLetter;
  /** Average GPA across the three letter grades, then mapped back to a letter. */
  overallGrade: GradeLetter;
  /** Numeric GPA used to sort the table. */
  gpa: number;
}

/**
 * Builds the per-season draft grades — DCE (efficiency), RP (raw
 * points), PWR (points while rostered) — and assigns letter grades on
 * a curve within the season. Mirrors `buildDraftGrades()` (lines
 * 1431-1618) verbatim.
 *
 * Returns an empty array when the season has no draft picks (the
 * legacy code's `state.draftGrades[season]` is unset for empty seasons,
 * which the renderer guards against). Only owners with `pickCount > 0`
 * are included in the curve; passing a payload where every owner has
 * zero picks yields an empty array.
 *
 * Output order is sorted by GPA descending (matches the legacy render
 * sort at line 3343: `(b[1].gpa || 0) - (a[1].gpa || 0)`).
 */
export function selectDraftGrades(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  playerStats: PlayerSeasonStats,
): DraftGradeRow[] {
  if (!league.draftPicks || league.draftPicks.length === 0) return [];

  // Per-player season points (combined across rosters, like the steals
  // path). Used both for RP and to derive positional finish ranks.
  const seasonPlayerPoints = new Map<string, number>();
  for (const t of Object.values(playerStats.playerSeasonTotals)) {
    seasonPlayerPoints.set(t.playerId, (seasonPlayerPoints.get(t.playerId) ?? 0) + t.pts);
  }

  // Positional finish ranks (same algorithm as `selectDraftValue`,
  // duplicated here because the legacy `buildDraftGrades` derives its
  // own copy. Keeping the math local mirrors the legacy intent — a
  // future refactor can deduplicate once both selectors are stable).
  const byPosition = new Map<string, { playerId: string; pts: number }[]>();
  for (const [pid, pts] of seasonPlayerPoints) {
    const pos = playerDisplay(pid, players).position || 'UNK';
    const list = byPosition.get(pos) ?? [];
    list.push({ playerId: pid, pts });
    byPosition.set(pos, list);
  }
  const posFinishRank = new Map<string, { pos: string; rank: number }>();
  for (const [pos, list] of byPosition) {
    list.sort((a, b) => b.pts - a.pts);
    list.forEach((p, i) => posFinishRank.set(p.playerId, { pos, rank: i + 1 }));
  }

  // Expected pick by positional rank (same construction as steals/busts).
  const expectedPickByPosRank = new Map<string, number>();
  const posDraftCounts = new Map<string, number>();
  for (const p of [...league.draftPicks]
    .filter((p) => p.player_id)
    .sort((a, b) => a.pick_no - b.pick_no)) {
    if (!p.player_id) continue;
    const pos = playerDisplay(p.player_id, players).position;
    if (!pos || pos === 'UNK') continue;
    const next = (posDraftCounts.get(pos) ?? 0) + 1;
    posDraftCounts.set(pos, next);
    expectedPickByPosRank.set(`${pos}${next}`, p.pick_no);
  }
  const totalPicks = league.draftPicks.length;

  // Roster ownership timeline — start with each draft pick assigning a
  // player to their drafted roster for weeks 1..18, then walk
  // transactions in week order, opening / closing ownership windows.
  type Window = { rosterId: number; fromWeek: number; toWeek: number };
  const ownership = new Map<string, Window[]>();

  const rosterIdByUser = new Map<string, number>();
  for (const u of league.users) {
    const r = league.rosters.find((r) => r.owner_id === u.user_id);
    if (r) rosterIdByUser.set(u.user_id, r.roster_id);
  }

  for (const p of league.draftPicks) {
    if (!p.player_id) continue;
    const rosterId = rosterIdByUser.get(p.picked_by) ?? p.roster_id;
    if (!rosterId) continue;
    ownership.set(p.player_id, [{ rosterId, fromWeek: 1, toWeek: 18 }]);
  }

  // Walk transactions chronologically (by `leg`, which is the week).
  const allTxs: Transaction[] = (league.transactions ?? [])
    .flat()
    .filter((t) => t.status === 'complete');
  allTxs.sort((a, b) => (a.leg || 0) - (b.leg || 0));

  for (const tx of allTxs) {
    const week = tx.leg || 1;
    const drops = tx.drops ?? {};
    const adds = tx.adds ?? {};

    // Close out windows for dropped players.
    for (const pid of Object.keys(drops)) {
      const windows = ownership.get(pid);
      if (!windows || windows.length === 0) continue;
      const current = windows[windows.length - 1];
      if (current && current.toWeek > week - 1) {
        current.toWeek = week - 1;
      }
    }

    // Open windows for added players.
    for (const [pid, rosterId] of Object.entries(adds)) {
      const windows = ownership.get(pid) ?? [];
      windows.push({ rosterId, fromWeek: week, toWeek: 18 });
      ownership.set(pid, windows);
    }
  }

  const wasOwned = (pid: string, rosterId: number, week: number): boolean => {
    const windows = ownership.get(pid);
    if (!windows) return false;
    return windows.some((w) => w.rosterId === rosterId && week >= w.fromWeek && week <= w.toWeek);
  };

  // drafterOfPlayer — `playerId` → drafter's owner key + roster id.
  const drafterOfPlayer = new Map<string, { ownerKey: string; rosterId: number }>();
  for (const p of league.draftPicks) {
    if (!p.player_id) continue;
    const rosterId = rosterIdByUser.get(p.picked_by) ?? p.roster_id;
    const u = league.users.find((u) => u.user_id === p.picked_by);
    if (!u || !rosterId) continue;
    const key = ownerKey(u);
    if (!key) continue;
    drafterOfPlayer.set(p.player_id, { ownerKey: key, rosterId });
  }

  // Per-owner accumulators.
  interface PerOwner {
    dce: number;
    rp: number;
    pwr: number;
    pickCount: number;
  }
  const byOwner = new Map<string, PerOwner>();
  for (const u of league.users) {
    const key = ownerKey(u);
    if (!key) continue;
    byOwner.set(key, { dce: 0, rp: 0, pwr: 0, pickCount: 0 });
  }

  for (const p of league.draftPicks) {
    if (!p.player_id) continue;
    const u = league.users.find((u) => u.user_id === p.picked_by);
    if (!u) continue;
    const drafterKey = ownerKey(u);
    const o = byOwner.get(drafterKey);
    if (!o) continue;
    o.pickCount += 1;
    o.rp += seasonPlayerPoints.get(p.player_id) ?? 0;

    const finish = posFinishRank.get(p.player_id);
    if (finish) {
      const expected = expectedPickByPosRank.get(`${finish.pos}${finish.rank}`) ?? totalPicks + 1;
      o.dce += p.pick_no - expected;
    } else {
      // Negligible scorer — treat as worst-case bust.
      o.dce += p.pick_no - (totalPicks + 1);
    }
  }

  // PWR — walk every "live" matchup row (regular-season + playoff)
  // and attribute each starter's points back to their original drafter
  // if the drafter still rostered them that week.
  //
  // Walking via `liveMatchupWeeks` (rather than `league.weeklyMatchups`
  // directly) mirrors the legacy `buildDraftGrades` PWR loop, which
  // iterates `state.allMatchups` — i.e., a view that has already been
  // filtered by `matchup_id` pairing + 0-0 pair filtering. Without the
  // filter, in-progress seasons over-credit drafters: future weeks pre-
  // fetched with `points: 0` and `null` `matchup_id`, plus playoff weeks
  // with non-paired commissioner-edited rows, would slip in.
  for (const { weekNum, rows } of liveMatchupWeeks(league)) {
    for (const m of rows) {
      const starters = m.starters ?? [];
      const starterPoints = m.starters_points ?? [];
      if (!Array.isArray(starters) || !Array.isArray(starterPoints)) continue;
      starters.forEach((pid, i) => {
        if (!pid || pid === '0') return;
        const drafter = drafterOfPlayer.get(pid);
        if (!drafter) return;
        if (!wasOwned(pid, drafter.rosterId, weekNum)) return;
        const o = byOwner.get(drafter.ownerKey);
        if (!o) return;
        o.pwr += starterPoints[i] ?? 0;
      });
    }
  }

  // Letter grades on a curve — same boundaries as legacy.
  const assignGrades = (metric: 'dce' | 'rp' | 'pwr'): Map<string, GradeLetter> => {
    const result = new Map<string, GradeLetter>();
    const sorted = [...byOwner.entries()]
      .filter(([, v]) => v.pickCount > 0)
      .sort((a, b) => b[1][metric] - a[1][metric]);
    const n = sorted.length;
    if (n === 0) return result;
    sorted.forEach(([key], i) => {
      const pct = n === 1 ? 0 : i / (n - 1);
      let grade: GradeLetter;
      if (pct <= 0.1) grade = 'A+';
      else if (pct <= 0.25) grade = 'A';
      else if (pct <= 0.5) grade = 'B';
      else if (pct <= 0.75) grade = 'C';
      else if (pct <= 0.9) grade = 'D';
      else grade = 'F';
      result.set(key, grade);
    });
    return result;
  };

  const dceGrades = assignGrades('dce');
  const rpGrades = assignGrades('rp');
  const pwrGrades = assignGrades('pwr');

  const gradeToNum: Record<GradeLetter, number> = {
    'A+': 4.3,
    A: 4.0,
    B: 3.0,
    C: 2.0,
    D: 1.0,
    F: 0.0,
  };

  const rows: DraftGradeRow[] = [];
  for (const [key, v] of byOwner) {
    if (v.pickCount === 0) continue;
    const dceG = dceGrades.get(key);
    const rpG = rpGrades.get(key);
    const pwrG = pwrGrades.get(key);
    if (!dceG || !rpG || !pwrG) continue;
    const gpa = (gradeToNum[dceG] + gradeToNum[rpG] + gradeToNum[pwrG]) / 3;
    const owner = ownerIndex[key];
    rows.push({
      ownerKey: key,
      displayName: owner?.displayName ?? key,
      teamName: owner?.teamNamesBySeason[league.season] || owner?.displayName || key,
      color: owner?.color ?? '',
      pickCount: v.pickCount,
      dce: v.dce,
      rp: v.rp,
      pwr: v.pwr,
      dceGrade: dceG,
      rpGrade: rpG,
      pwrGrade: pwrG,
      overallGrade: gpaToGradeLetter(gpa),
      gpa,
    });
  }
  rows.sort((a, b) => b.gpa - a.gpa);
  return rows;
}

// ===================================================================
// Waiver profile — six metrics + archetype + best pickups
// ===================================================================

/** Archetype label for a waiver profile (e.g., "The Maven"). */
export interface WaiverArchetype {
  name: string;
  description: string;
}

/** One row in the waiver profile table. */
export interface WaiverProfileRow {
  ownerKey: string;
  displayName: string;
  teamName: string;
  color: string;
  /** Total pickups (raw count). */
  volume: number;
  /** Avg pts/week per pickup while rostered. */
  selection: number;
  /** Sum of points over a 3-pt/wk baseline (Value Over Baseline). */
  vob: number;
  /** Fraction (0..1) of pickups whose post-pickup avg beat their pre-pickup avg. */
  timing: number;
  /** Fraction (0..1) of pickup roster-weeks where the player started. */
  integration: number;
  /** Avg weeks held when a pickup proved productive (≥ 5 pts/wk). */
  persistence: number;
  volumeGrade: GradeLetter;
  selectionGrade: GradeLetter;
  /** Impact = VOB; the headline grade. */
  impactGrade: GradeLetter;
  timingGrade: GradeLetter;
  integrationGrade: GradeLetter;
  persistenceGrade: GradeLetter;
  /** Archetype name + descriptor; null if the owner had no pickups. */
  archetype: WaiverArchetype | null;
}

/** One row in the per-season "best pickups" leaderboard. */
export interface BestPickupRow {
  playerId: string;
  playerName: string;
  position: string;
  ownerKey: string;
  ownerDisplayName: string;
  ownerTeamName: string;
  ownerColor: string;
  /** Week the pickup landed. */
  claimedWeek: number;
  pointsWhileRostered: number;
  weeksRostered: number;
  avgPerWeek: number;
}

export interface WaiverProfileData {
  /** Per-owner rows, sorted by VOB desc (impact-as-headline default sort). */
  rows: WaiverProfileRow[];
  /** Top 10 individual pickups by points-while-rostered. */
  bestPickups: BestPickupRow[];
}

/**
 * Builds the per-season waiver wire profile and best-pickups
 * leaderboard. Mirrors `buildWaiverGrades()` (lines 1630-1841)
 * verbatim.
 *
 * The legacy code stores `state.bestPickups` as a side output; we
 * return both the per-owner profile and the best-pickups list together
 * so the React layer can pass slices to two children without invoking
 * the same heavy walk twice.
 *
 * Returns an empty profile (`rows: [], bestPickups: []`) for seasons
 * with no transactions.
 */
export function selectWaiverProfile(
  league: SeasonDetails,
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
): WaiverProfileData {
  // `league.transactions` is `Transaction[][]` (one array per week);
  // its `.length` is always the number of weeks fetched, never zero in
  // practice. Guard on whether *any* week has transactions.
  if (!league.transactions || league.transactions.every((w) => w.length === 0)) {
    return { rows: [], bestPickups: [] };
  }

  const season = league.season;

  // Roster → owner key.
  const rosterToOwner = buildRosterToOwnerKey(league);

  // Per-week per-player lookups (points / owner / started flag).
  //
  // Walk via `liveMatchupWeeks` to mirror the legacy `buildWaiverGrades`
  // loop, which iterates `state.allMatchups` — a view that has already
  // been filtered by `matchup_id` pairing + 0-0 pair filtering. Walking
  // `league.weeklyMatchups` directly lets in pre-fetched rows for
  // unplayed future weeks (in-progress seasons): the legacy filter drops
  // them as 0-0 pairs, and the new code without the filter was
  // over-counting `weeksRostered` (with `pts == 0`), which dragged
  // Selection down, dragged Persistence up (productive pickups appeared
  // held longer), dragged Integration down (extra unstarted weeks), and
  // — for paired-but-orphan/null `matchup_id` rows that did have
  // points — also lifted Impact. Best Pickups inherited the same drift
  // (extra weeks rostered → extra points + extra weeks).
  //
  // Plus: only set `playerWeeklyPoints` from the same surviving rows
  // (legacy unconditionally wrote `pts[pid] || 0`; we keep the
  // `ptsMap.has(pid)` guard from PR #15 because a bye-week player is in
  // `m.players` but missing from `m.players_points`, and writing 0 there
  // would overwrite a real prior value if the same player appeared on
  // two rows for the same week — practically impossible since a player
  // is on one roster per week, but the guard is harmless and matches
  // the prior intent).
  const playerWeeklyPoints = new Map<string, Map<number, number>>();
  const playerWeeklyOwner = new Map<string, Map<number, number>>();
  const playerWeeklyStarted = new Map<string, Map<number, boolean>>();

  for (const { weekNum, rows } of liveMatchupWeeks(league)) {
    // The legacy site caps the per-pickup walk at week 18 (see below);
    // skip indexing weeks beyond that here so the lookup tables stay
    // bounded to the same range.
    if (weekNum > 18) continue;
    for (const m of rows) {
      const starterSet = new Set(m.starters ?? []);
      const ptsMap = matchupPlayerPoints(m);
      for (const pid of m.players ?? []) {
        if (!pid || pid === '0') continue;
        if (ptsMap.has(pid)) {
          let weekPts = playerWeeklyPoints.get(pid);
          if (!weekPts) {
            weekPts = new Map();
            playerWeeklyPoints.set(pid, weekPts);
          }
          weekPts.set(weekNum, ptsMap.get(pid)!);
        }

        let weekOwner = playerWeeklyOwner.get(pid);
        if (!weekOwner) {
          weekOwner = new Map();
          playerWeeklyOwner.set(pid, weekOwner);
        }
        weekOwner.set(weekNum, m.roster_id);

        let weekStarted = playerWeeklyStarted.get(pid);
        if (!weekStarted) {
          weekStarted = new Map();
          playerWeeklyStarted.set(pid, weekStarted);
        }
        weekStarted.set(weekNum, starterSet.has(pid));
      }
    }
  }

  // Collect non-trade adds in chronological order.
  interface Pickup {
    playerId: string;
    rosterId: number;
    ownerKey: string;
    week: number;
  }
  const allTx: Transaction[] = (league.transactions ?? [])
    .flat()
    .filter((t) => t.status === 'complete' && t.type !== 'trade');
  allTx.sort((a, b) => (a.created || 0) - (b.created || 0));

  const pickups: Pickup[] = [];
  for (const tx of allTx) {
    const week = tx.leg || 1;
    const adds = tx.adds ?? {};
    for (const [pid, rosterId] of Object.entries(adds)) {
      const oKey = rosterToOwner.get(rosterId);
      if (!oKey) continue;
      pickups.push({ playerId: pid, rosterId, ownerKey: oKey, week });
    }
  }

  // Per-owner accumulators.
  interface PerOwner {
    volume: number;
    rpa: number;
    totalWeeksRostered: number;
    vob: number;
    timingHits: number;
    timingEligible: number;
    startedRosterWeeks: number;
    totalPickupRosterWeeks: number;
    productivePickupTenures: number[];
  }
  const byOwner = new Map<string, PerOwner>();
  for (const u of league.users) {
    const key = ownerKey(u);
    if (!key) continue;
    byOwner.set(key, {
      volume: 0,
      rpa: 0,
      totalWeeksRostered: 0,
      vob: 0,
      timingHits: 0,
      timingEligible: 0,
      startedRosterWeeks: 0,
      totalPickupRosterWeeks: 0,
      productivePickupTenures: [],
    });
  }

  const BASELINE = 3;
  const bestPickupsRaw: {
    playerId: string;
    ownerKey: string;
    claimedWeek: number;
    pointsWhileRostered: number;
    weeksRostered: number;
    avgPerWeek: number;
  }[] = [];

  for (const p of pickups) {
    const o = byOwner.get(p.ownerKey);
    if (!o) continue;
    o.volume += 1;

    let totalPts = 0;
    let weeksRostered = 0;
    let weeksStarted = 0;

    for (let w = p.week; w <= 18; w++) {
      const owner = playerWeeklyOwner.get(p.playerId)?.get(w);
      if (owner !== p.rosterId) {
        if (w > p.week) break;
        continue;
      }
      const pts = playerWeeklyPoints.get(p.playerId)?.get(w) ?? 0;
      totalPts += pts;
      weeksRostered += 1;
      if (playerWeeklyStarted.get(p.playerId)?.get(w)) weeksStarted += 1;
      o.vob += Math.max(0, pts - BASELINE);
    }

    o.rpa += totalPts;
    o.totalWeeksRostered += weeksRostered;
    o.startedRosterWeeks += weeksStarted;
    o.totalPickupRosterWeeks += weeksRostered;

    // Timing: pre vs post avg. Pre weeks are any prior data on this
    // player; post weeks are p.week onward, capped at p.week +
    // weeksRostered (or at least one week so we always check).
    const allWeeks = [...(playerWeeklyPoints.get(p.playerId)?.keys() ?? [])].sort((a, b) => a - b);
    const preWeeks = allWeeks.filter((w) => w < p.week);
    const postCap = p.week + Math.max(1, weeksRostered);
    const postWeeks = allWeeks.filter((w) => w >= p.week && w < postCap);
    if (preWeeks.length >= 1 && postWeeks.length >= 1) {
      const preAvg =
        preWeeks.reduce((s, w) => s + (playerWeeklyPoints.get(p.playerId)?.get(w) ?? 0), 0) /
        preWeeks.length;
      const postAvg =
        postWeeks.reduce((s, w) => s + (playerWeeklyPoints.get(p.playerId)?.get(w) ?? 0), 0) /
        postWeeks.length;
      o.timingEligible += 1;
      if (postAvg > preAvg) o.timingHits += 1;
    }

    // Persistence: only counts pickups that ended up productive.
    if (weeksRostered > 0 && totalPts / weeksRostered >= 5) {
      o.productivePickupTenures.push(weeksRostered);
    }

    // Best-pickups leaderboard input.
    if (weeksRostered > 0) {
      bestPickupsRaw.push({
        playerId: p.playerId,
        ownerKey: p.ownerKey,
        claimedWeek: p.week,
        pointsWhileRostered: totalPts,
        weeksRostered,
        avgPerWeek: totalPts / weeksRostered,
      });
    }
  }

  // Derive ratio metrics.
  const derived = new Map<
    string,
    {
      volume: number;
      selection: number;
      vob: number;
      timing: number;
      integration: number;
      persistence: number;
    }
  >();
  for (const [key, o] of byOwner) {
    derived.set(key, {
      volume: o.volume,
      selection: o.totalWeeksRostered > 0 ? o.rpa / o.totalWeeksRostered : 0,
      vob: o.vob,
      timing: o.timingEligible > 0 ? o.timingHits / o.timingEligible : 0,
      integration:
        o.totalPickupRosterWeeks > 0 ? o.startedRosterWeeks / o.totalPickupRosterWeeks : 0,
      persistence:
        o.productivePickupTenures.length > 0
          ? o.productivePickupTenures.reduce((s, w) => s + w, 0) / o.productivePickupTenures.length
          : 0,
    });
  }

  // Letter grades on a curve. Six metrics; same percentile bands as draft grades.
  type Metric = 'volume' | 'selection' | 'vob' | 'timing' | 'integration' | 'persistence';
  const assign = (metric: Metric): Map<string, GradeLetter> => {
    const result = new Map<string, GradeLetter>();
    const sorted = [...derived.entries()]
      .filter(([, v]) => v.volume > 0)
      .sort((a, b) => b[1][metric] - a[1][metric]);
    const n = sorted.length;
    if (n === 0) return result;
    sorted.forEach(([key], i) => {
      const pct = n === 1 ? 0 : i / (n - 1);
      let grade: GradeLetter;
      if (pct <= 0.1) grade = 'A+';
      else if (pct <= 0.25) grade = 'A';
      else if (pct <= 0.5) grade = 'B';
      else if (pct <= 0.75) grade = 'C';
      else if (pct <= 0.9) grade = 'D';
      else grade = 'F';
      result.set(key, grade);
    });
    return result;
  };
  const volumeGrades = assign('volume');
  const selectionGrades = assign('selection');
  const impactGrades = assign('vob'); // legacy maps "impact" → vob.
  const timingGrades = assign('timing');
  const integrationGrades = assign('integration');
  const persistenceGrades = assign('persistence');

  // Archetype — Volume × Selection percentiles split into thirds.
  const sortedByVolume = [...derived.entries()]
    .filter(([, v]) => v.volume > 0)
    .sort((a, b) => b[1].volume - a[1].volume);
  const sortedBySelection = [...derived.entries()]
    .filter(([, v]) => v.volume > 0)
    .sort((a, b) => b[1].selection - a[1].selection);
  const n = sortedByVolume.length;
  const archetypes = new Map<string, WaiverArchetype>();
  if (n > 0) {
    const volumeRank = new Map<string, number>();
    const selectionRank = new Map<string, number>();
    sortedByVolume.forEach(([key], i) => volumeRank.set(key, i / Math.max(1, n - 1)));
    sortedBySelection.forEach(([key], i) => selectionRank.set(key, i / Math.max(1, n - 1)));

    const band = (pct: number): 'high' | 'mid' | 'low' =>
      pct <= 0.33 ? 'high' : pct <= 0.66 ? 'mid' : 'low';

    for (const [key, v] of derived) {
      if (v.volume === 0) continue;
      const vp = volumeRank.get(key) ?? 0;
      const sp = selectionRank.get(key) ?? 0;
      const vBand = band(vp);
      const sBand = band(sp);

      let arche: WaiverArchetype;
      if (vBand === 'high' && sBand === 'high') {
        arche = { name: 'The Maven', description: 'High activity, high accuracy' };
      } else if (vBand === 'low' && sBand === 'high') {
        arche = { name: 'The Sniper', description: 'Rare strikes, all hit' };
      } else if (vBand === 'high' && sBand === 'mid') {
        arche = { name: 'The Grinder', description: 'Always working, decent results' };
      } else if (vBand === 'high' && sBand === 'low') {
        arche = { name: 'The Churner', description: 'Constant motion, little value' };
      } else if (vBand === 'low' && sBand === 'low') {
        arche = { name: 'The Camper', description: "Doesn't bother with the wire" };
      } else if (vBand === 'low' && sBand === 'mid') {
        arche = { name: 'The Conservative', description: 'Picks rarely, gets okay returns' };
      } else if (vBand === 'mid' && sBand === 'high') {
        arche = { name: 'The Curator', description: 'Selective and sharp' };
      } else if (vBand === 'mid' && sBand === 'low') {
        arche = { name: 'The Fumbler', description: 'Tries enough to miss often' };
      } else {
        arche = { name: 'The Tinkerer', description: 'Steady, no extremes' };
      }
      archetypes.set(key, arche);
    }
  }

  // Compose rows. Sort by VOB desc (impact = headline default).
  const rows: WaiverProfileRow[] = [];
  for (const [key, v] of derived) {
    if (v.volume === 0) continue;
    const owner = ownerIndex[key];
    const volumeG = volumeGrades.get(key);
    const selectionG = selectionGrades.get(key);
    const impactG = impactGrades.get(key);
    const timingG = timingGrades.get(key);
    const integrationG = integrationGrades.get(key);
    const persistenceG = persistenceGrades.get(key);
    if (!volumeG || !selectionG || !impactG || !timingG || !integrationG || !persistenceG) continue;
    rows.push({
      ownerKey: key,
      displayName: owner?.displayName ?? key,
      teamName: owner?.teamNamesBySeason[season] || owner?.displayName || key,
      color: owner?.color ?? '',
      volume: v.volume,
      selection: v.selection,
      vob: v.vob,
      timing: v.timing,
      integration: v.integration,
      persistence: v.persistence,
      volumeGrade: volumeG,
      selectionGrade: selectionG,
      impactGrade: impactG,
      timingGrade: timingG,
      integrationGrade: integrationG,
      persistenceGrade: persistenceG,
      archetype: archetypes.get(key) ?? null,
    });
  }
  rows.sort((a, b) => b.vob - a.vob);

  // Best pickups — top 10 by points-while-rostered.
  const bestPickups: BestPickupRow[] = [...bestPickupsRaw]
    .sort((a, b) => b.pointsWhileRostered - a.pointsWhileRostered)
    .slice(0, 10)
    .map((p) => {
      const display = playerDisplay(p.playerId, players);
      const owner = ownerIndex[p.ownerKey];
      return {
        playerId: p.playerId,
        playerName: display.name,
        position: display.position,
        ownerKey: p.ownerKey,
        ownerDisplayName: owner?.displayName ?? '',
        ownerTeamName: owner ? owner.teamNamesBySeason[season] || owner.displayName : '',
        ownerColor: owner?.color ?? '',
        claimedWeek: p.claimedWeek,
        pointsWhileRostered: p.pointsWhileRostered,
        weeksRostered: p.weeksRostered,
        avgPerWeek: p.avgPerWeek,
      };
    });

  return { rows, bestPickups };
}

/**
 * Sleeper's `players_points` field is one of three shapes
 * (`Record<string, number>`, `[]`, `null`). Narrow defensively before
 * indexing — same idiom as legacy:
 *   `(side.pts && typeof side.pts === 'object' && !Array.isArray(side.pts)) ? side.pts : {}`.
 */
function matchupPlayerPoints(m: Matchup): Map<string, number> {
  const out = new Map<string, number>();
  const raw = m.players_points;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return out;
  for (const [pid, pts] of Object.entries(raw)) {
    if (typeof pts === 'number') out.set(pid, pts);
  }
  return out;
}
