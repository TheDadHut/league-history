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
