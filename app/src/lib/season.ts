// ===================================================================
// Per-season details fetcher
// ===================================================================
//
// Mirrors the legacy `loadSeasonDetails()` (index.html lines 749-783)
// minus the bits no React tab consumes yet (drafts, transactions —
// those land in their own helpers when Trades / Owner Stats are
// migrated).
//
// Concurrency: every per-season network call is fired in parallel
// (rosters + 18 weeks of matchups + winners/losers brackets =
// ~21 requests per season). Sleeper has no enforced rate limit but
// asks consumers to be polite. The legacy site does the same fan-out
// inside `loadSeasonDetails` and has been hammering this in production
// for two seasons without trouble — match the pattern verbatim rather
// than artificially serialize.
//
// All optional / dropped fetches (`winners_bracket` etc. for an
// in-progress season, weeks beyond the schedule) coerce fetch failures
// to empty arrays, mirroring the legacy `.catch(() => [])` idiom.

import {
  getLosersBracket,
  getMatchups,
  getRosters,
  getWinnersBracket,
} from './sleeper';
import type { LeagueWithUsers, SeasonDetails } from './owners';

/** Maximum week number Sleeper schedules are sized for (weeks 1..18). */
const MAX_WEEK = 18;

/**
 * Loads a single season's rosters + every weekly matchup + both
 * playoff brackets in parallel, then returns them attached to the
 * already-fetched `LeagueWithUsers` payload.
 *
 * Fetch errors on bracket / matchup endpoints (common when a season is
 * still in progress and the bracket hasn't been generated, or a week
 * hasn't been played yet) are swallowed and replaced with empty
 * arrays. Hard fetch errors on `getRosters` *do* propagate — every
 * season we care about has a roster set, so a failure there is a real
 * problem worth surfacing.
 */
export async function loadSeasonDetails(
  league: LeagueWithUsers,
): Promise<SeasonDetails> {
  const rostersPromise = getRosters(league.league_id);
  const weeklyPromises = Array.from({ length: MAX_WEEK }, (_, i) =>
    getMatchups(league.league_id, i + 1).catch(() => []),
  );
  const winnersPromise = getWinnersBracket(league.league_id).catch(() => []);
  const losersPromise = getLosersBracket(league.league_id).catch(() => []);

  const [rosters, weeklyMatchups, winnersBracket, losersBracket] =
    await Promise.all([
      rostersPromise,
      Promise.all(weeklyPromises),
      winnersPromise,
      losersPromise,
    ]);

  return {
    ...league,
    rosters,
    weeklyMatchups,
    winnersBracket,
    losersBracket,
  };
}

