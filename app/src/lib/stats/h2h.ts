// ===================================================================
// Head-to-Head tab — stat layer
// ===================================================================
//
// Pure selectors for the Head-to-Head tab, factored out of the legacy
// `index.html` build/render layer:
//
//   - `selectH2HOwners`    ← owner picker options, sorted by display
//                            name (mirrors `populateH2HSelects()`,
//                            lines 2969-2975).
//   - `selectH2HSeries`    ← every game between two owners + the
//                            reg/playoff W-L tally (mirrors
//                            `renderH2H()`, lines 2977-3021, plus the
//                            per-owner h2h tally shape used elsewhere
//                            at lines 2662-2691 — keeping the data
//                            model identical so Owner Stats can reuse
//                            it later without reshaping).
//
// Both selectors derive from the same flattened-matchups view that
// `selectAllTimeStandings` / `selectPulseTiles` use. The legacy
// `state.allMatchups` is reconstructed here so the H2H numbers always
// align with the Overview tab's totals.
//
// Reg-season vs. playoff distinction is preserved on every entry. The
// legacy renderer only surfaces the combined wins in the big VS card
// and tags each game with a 🏆 emoji when `isPlayoff` is true; we
// preserve both so the Owner Stats tab can pull `regW/regL/poW/poL`
// off the same series object when it migrates.
//
// All functions are pure: no React, no I/O, no caching. Callers (the
// Head-to-Head component) `useMemo` against the provider state to
// avoid recomputing on every render.

import type { OwnerIndex, SeasonDetails } from '../owners';
import { ownerKey } from '../owners';

// ===================================================================
// Internal: flattened matchup view
// ===================================================================
//
// Identical shape to the one used in `stats/overview.ts`. Kept private
// to each stat module rather than hoisted to a shared `stats/util.ts`
// because (a) the modules have already settled on this shape
// independently, and (b) lifting it pulls Overview's selectors into
// any module that imports from a shared util file. Revisit if a third
// tab also needs it.

interface FlatMatchup {
  season: string;
  week: number;
  isPlayoff: boolean;
  ownerAKey: string;
  ownerBKey: string;
  scoreA: number;
  scoreB: number;
}

/** Lookup helper: `roster_id` → owner key for one league. */
function buildRosterToOwnerKey(season: SeasonDetails): Map<number, string> {
  const map = new Map<number, string>();
  for (const roster of season.rosters) {
    if (roster.owner_id == null) continue;
    const user = season.users.find((u) => u.user_id === roster.owner_id);
    if (!user) continue;
    const key = ownerKey(user);
    if (!key) continue;
    map.set(roster.roster_id, key);
  }
  return map;
}

/**
 * Walks every season's `weeklyMatchups` and produces a flat
 * `FlatMatchup[]`. Mirrors `buildAllMatchups()` (index.html lines
 * 851-890) — see `stats/overview.ts` for the full filter rationale.
 */
function buildAllMatchups(seasons: SeasonDetails[]): FlatMatchup[] {
  const all: FlatMatchup[] = [];
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
          ownerAKey: oa,
          ownerBKey: ob,
          scoreA,
          scoreB,
        });
      }
    });
  }
  return all;
}

// ===================================================================
// Owner picker options
// ===================================================================

export interface H2HOwnerOption {
  /** Stable cross-season owner key. */
  key: string;
  /** Display name shown in the `<select>`. */
  displayName: string;
}

/**
 * One option per known owner, sorted alphabetically by display name.
 * Mirrors `populateH2HSelects()` (index.html lines 2969-2974).
 */
export function selectH2HOwners(ownerIndex: OwnerIndex): H2HOwnerOption[] {
  return Object.values(ownerIndex)
    .map((o) => ({ key: o.key, displayName: o.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ===================================================================
// Series between two owners
// ===================================================================

/**
 * One game in an A-vs-B series, normalized so `scoreA` always belongs
 * to the requesting `ownerAKey` (regardless of whose roster was on
 * which side of the underlying Sleeper matchup).
 */
export interface H2HGame {
  season: string;
  week: number;
  isPlayoff: boolean;
  scoreA: number;
  scoreB: number;
  /** "A" if A outscored B, "B" if B outscored A, "tie" otherwise. */
  winner: 'A' | 'B' | 'tie';
}

/**
 * Win/loss split between two owners, separating regular season and
 * playoff games. Matches the legacy per-owner tally shape (index.html
 * lines 2664, 2669) so Owner Stats can read the same record off of
 * `selectH2HSeries(...)` once that tab migrates.
 *
 * All `*A` fields are owner A's perspective; `*B` fields are owner B's.
 * The legacy `regW`/`regL`/`poW`/`poL` are aliases of the A-perspective
 * fields, kept for the existing render path.
 */
export interface H2HRecord {
  /** Regular-season wins for owner A. */
  regW: number;
  /** Regular-season losses for owner A. */
  regL: number;
  /** Playoff wins for owner A. */
  poW: number;
  /** Playoff losses for owner A. */
  poL: number;
  /** Regular-season wins for owner A (alias of `regW`). */
  regWA: number;
  /** Regular-season losses for owner A (alias of `regL`). */
  regLA: number;
  /** Regular-season wins for owner B. */
  regWB: number;
  /** Regular-season losses for owner B. */
  regLB: number;
  /** Playoff wins for owner A (alias of `poW`). */
  poWA: number;
  /** Playoff losses for owner A (alias of `poL`). */
  poLA: number;
  /** Playoff wins for owner B. */
  poWB: number;
  /** Playoff losses for owner B. */
  poLB: number;
  /** Total games (including ties). */
  games: number;
  /** Combined wins for owner A across reg + playoffs. */
  totalWinsA: number;
  /** Combined wins for owner B across reg + playoffs. */
  totalWinsB: number;
}

/**
 * Full output of a head-to-head lookup.
 *
 * Returned for every (A, B) pair, even when no games exist — the
 * `games` array will simply be empty. Consumers render the empty-state
 * UI when `games.length === 0`. The legacy site also short-circuits to
 * an empty card when `a === b`, but that's a UI concern; this selector
 * happily returns an all-zero record for a self-matchup so the caller
 * doesn't need to special-case it.
 */
export interface H2HSeries {
  ownerAKey: string;
  ownerBKey: string;
  record: H2HRecord;
  /**
   * Every game between A and B, oldest first. Matches the legacy sort
   * (`season.localeCompare` then `week ascending`) so the on-screen
   * timeline reads chronologically.
   */
  games: H2HGame[];
}

/**
 * Returns every game between owners A and B, plus the regular/playoff
 * split. Pure: no I/O, no React.
 *
 * Mirrors `renderH2H()` (index.html lines 2977-3020) merged with the
 * per-owner h2h tally at lines 2662-2691 — same rules, same totals;
 * only the rendering layer differs.
 */
export function selectH2HSeries(
  seasons: SeasonDetails[],
  ownerAKey: string,
  ownerBKey: string,
): H2HSeries {
  const matchups = buildAllMatchups(seasons);

  const games: H2HGame[] = [];
  let regW = 0;
  let regL = 0;
  let poW = 0;
  let poL = 0;

  for (const m of matchups) {
    const isAB = m.ownerAKey === ownerAKey && m.ownerBKey === ownerBKey;
    const isBA = m.ownerAKey === ownerBKey && m.ownerBKey === ownerAKey;
    if (!isAB && !isBA) continue;

    // Normalize scores so A is always the requesting `ownerAKey`.
    const scoreA = isAB ? m.scoreA : m.scoreB;
    const scoreB = isAB ? m.scoreB : m.scoreA;
    const winner: H2HGame['winner'] =
      scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie';

    if (m.isPlayoff) {
      if (winner === 'A') poW++;
      else if (winner === 'B') poL++;
    } else {
      if (winner === 'A') regW++;
      else if (winner === 'B') regL++;
    }

    games.push({
      season: m.season,
      week: m.week,
      isPlayoff: m.isPlayoff,
      scoreA,
      scoreB,
      winner,
    });
  }

  // Chronological order — matches the legacy sort exactly.
  games.sort(
    (x, y) => x.season.localeCompare(y.season) || x.week - y.week,
  );

  const totalWinsA = regW + poW;
  const totalWinsB = regL + poL;

  return {
    ownerAKey,
    ownerBKey,
    record: {
      regW,
      regL,
      poW,
      poL,
      regWA: regW,
      regLA: regL,
      regWB: regL,
      regLB: regW,
      poWA: poW,
      poLA: poL,
      poWB: poL,
      poLB: poW,
      games: games.length,
      totalWinsA,
      totalWinsB,
    },
    games,
  };
}
