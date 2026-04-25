// ===================================================================
// Seasons tab — stat layer
// ===================================================================
//
// Pure selectors for the Seasons tab, factored out of the legacy
// `index.html` build/render layer:
//
//   - `selectSeasonOptions`     ← season-picker entries (newest first
//                                 with an "(In Progress)" tag for any
//                                 league whose status isn't yet
//                                 `'complete'`). Mirrors
//                                 `populateSeasonPicker()` (lines
//                                 3023-3029).
//   - `selectSeasonStandings`   ← per-owner regular-season standings
//                                 (W-L-PF-PA) for one season, sorted by
//                                 wins then PF as the legacy tiebreaker
//                                 dictates. Mirrors `renderSeason()`
//                                 lines 3032-3047 plus the row shape
//                                 from lines 3134-3141.
//
// Selectors are deterministic and work entirely off the provider
// payload (`SeasonDetails[]` + `OwnerIndex`); no I/O, no DOM, no
// sessionStorage.
//
// Scope note: The legacy `renderSeason()` also draws awards (champion,
// finals MVP, season MVP, toilet bowl, etc.), a draft board, draft
// steals/busts, and waiver wire heroes. Every one of those depends on
// data that hasn't migrated yet (the player DB, the toilet-bowl
// computation, `playerSeasonTotals`, draft picks). They land alongside
// the tabs that own that data — port first, expand later (per the
// migration plan).

import type { OwnerIndex, SeasonDetails } from '../owners';
import { ownerKey } from '../owners';
import { buildAllMatchups } from './util';

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
    const teamName =
      owner?.teamNamesBySeason[season] || user.metadata?.team_name || displayName;
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
  const standings = [...rows.values()].sort(
    (x, y) => y.wins - x.wins || y.pf - x.pf,
  );
  return standings;
}
