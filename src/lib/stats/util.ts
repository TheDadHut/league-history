// ===================================================================
// Shared stat-layer utilities
// ===================================================================
//
// Lean matchup-flattening helpers shared between the Overview, Records,
// Head-to-Head, and Seasons stat selectors. Each tab used to redeclare
// these locally (the H2H code review explicitly flagged the duplication
// once a third tab needed them); when Seasons came on as the fourth
// tab needing the same shape, the helpers were lifted here.
//
// Intentionally narrow:
//
//   - `FlatMatchup`            — the lean, score-only view that
//                                Overview, H2H, and Seasons all consume.
//   - `buildRosterToOwnerKey`  — `roster_id` → owner key for one season.
//   - `buildAllMatchups`       — flattens every season's
//                                `weeklyMatchups` into a `FlatMatchup[]`.
//
// The Records tab keeps its own `buildAllMatchupsWithStarters` (in
// `stats/records.ts`) because it needs the starter arrays attached;
// merging the two would force every consumer to drag the heavier
// payload around for no reason. Lift again only when a second tab also
// needs the starters shape.

import type { SeasonDetails } from '../owners';
import { ownerKey } from '../owners';

/**
 * One side-vs-side matchup, flattened across seasons. Mirrors the
 * legacy `state.allMatchups` shape used by the lean Overview / H2H /
 * Seasons selectors.
 */
export interface FlatMatchup {
  season: string;
  week: number;
  isPlayoff: boolean;
  ownerAKey: string;
  ownerBKey: string;
  scoreA: number;
  scoreB: number;
}

/** Lookup helper: `roster_id` → owner key for one league. */
export function buildRosterToOwnerKey(season: SeasonDetails): Map<number, string> {
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
 * 851-890):
 *
 *   - Drops weeks with no data (empty array).
 *   - Pairs entries by `matchup_id`; skips byes (`matchup_id == null`).
 *   - Skips pairs that aren't exactly two teams (commish edits).
 *   - Skips 0-0 pairs (Sleeper occasionally returns these for
 *     unplayed weeks).
 *   - Uses each league's `playoff_week_start` (defaults to 15) to
 *     mark playoff games.
 */
export function buildAllMatchups(seasons: SeasonDetails[]): FlatMatchup[] {
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
