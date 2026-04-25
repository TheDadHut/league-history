// ===================================================================
// League history walker
// ===================================================================
//
// Mirrors the legacy `loadAllSeasons()` (index.html lines 734-747):
// follow `previous_league_id` from the current league back through
// every prior season, stopping when the chain ends or after a hard
// safety cap.
//
// Returns leagues in chronological order (oldest first), matching the
// legacy `seasons.reverse()` step.

import { getLeague } from './sleeper';
import type { League } from '../types/sleeper';

/** Hard cap on history-walk hops. Matches the legacy safety limit. */
const MAX_HOPS = 20;

/**
 * Walks `previous_league_id` from `currentLeagueId` until the chain
 * terminates (null or the "0" sentinel) or `MAX_HOPS` is hit. Returns
 * the seasons chronologically — oldest first.
 *
 * @remarks
 * This awaits N **sequential** Sleeper fetches (`getLeague` per hop, ~200ms
 * each over a typical home connection), so the returned promise doesn't
 * resolve until the entire chain has been walked. For the GDL's ~5-season
 * history that's roughly a one-second wait before any data is available;
 * for longer leagues it scales linearly.
 *
 * Callers that can render incrementally should not block UI on the full
 * result. If streaming becomes important during Phase 3, an
 * `AsyncGenerator<League>` form may be added alongside this function so
 * tabs can paint each season as it arrives.
 */
export async function walkPreviousLeagues(currentLeagueId: string): Promise<League[]> {
  const seasons: League[] = [];
  let id: string | null = currentLeagueId;
  let steps = 0;

  while (id && id !== '0' && steps < MAX_HOPS) {
    const league = await getLeague(id);
    seasons.push(league);
    id = league.previous_league_id;
    steps++;
  }

  seasons.reverse();
  return seasons;
}
