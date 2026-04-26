// ===================================================================
// Per-season details fetcher
// ===================================================================
//
// Mirrors the legacy `loadSeasonDetails()` (index.html lines 749-783)
// — fans out rosters, 18 weeks of matchups, both playoff brackets,
// draft picks, and 18 weeks of transactions. Every per-season network
// call is fired in parallel (~21 + 18 + draft = ~40 requests per
// season). Sleeper has no enforced rate limit but asks consumers to be
// polite. The legacy site does the same fan-out and has been hammering
// this in production for two seasons without trouble — match the
// pattern verbatim rather than artificially serialize.
//
// All optional / dropped fetches (`winners_bracket` etc. for an
// in-progress season, weeks beyond the schedule, missing drafts)
// coerce fetch failures to empty arrays, mirroring the legacy
// `.catch(() => [])` idiom and the `try/catch` swallow around the
// draft fetch (lines 763-769).

import {
  getDraftPicks,
  getDrafts,
  getLosersBracket,
  getMatchups,
  getRosters,
  getTransactions,
  getWinnersBracket,
} from './sleeper';
import type { LeagueWithUsers, SeasonDetails } from './owners';
import type { DraftPick } from '../types/sleeper';

/** Maximum week number Sleeper schedules are sized for (weeks 1..18). */
const MAX_WEEK = 18;

/**
 * Loads a single season's full payload — rosters, every weekly matchup,
 * both playoff brackets, the season's draft picks, and every week of
 * transactions — in parallel, then returns them attached to the
 * already-fetched `LeagueWithUsers` payload.
 *
 * Fetch errors on bracket / matchup / transaction endpoints (common when
 * a season is still in progress and the bracket hasn't been generated,
 * or a week hasn't been played yet) are swallowed and replaced with
 * empty arrays. Hard fetch errors on `getRosters` *do* propagate —
 * every season we care about has a roster set, so a failure there is a
 * real problem worth surfacing.
 *
 * The draft fetch is wrapped in its own try/catch (mirroring the legacy
 * idiom): the `getDrafts` request can succeed with an empty array on
 * a brand-new league, and the `getDraftPicks` request can 404 if the
 * draft hasn't started yet. Either way we end up with an empty
 * `draftPicks` array rather than a hard failure.
 */
export async function loadSeasonDetails(league: LeagueWithUsers): Promise<SeasonDetails> {
  const rostersPromise = getRosters(league.league_id);
  const weeklyPromises = Array.from({ length: MAX_WEEK }, (_, i) =>
    getMatchups(league.league_id, i + 1).catch(() => []),
  );
  const winnersPromise = getWinnersBracket(league.league_id).catch(() => []);
  const losersPromise = getLosersBracket(league.league_id).catch(() => []);
  const transactionPromises = Array.from({ length: MAX_WEEK }, (_, i) =>
    getTransactions(league.league_id, i + 1).catch(() => []),
  );
  const draftPicksPromise: Promise<DraftPick[]> = (async () => {
    try {
      const drafts = await getDrafts(league.league_id);
      const first = drafts[0];
      if (!first) return [];
      return await getDraftPicks(first.draft_id);
    } catch {
      return [];
    }
  })();

  const [rosters, weeklyMatchups, winnersBracket, losersBracket, draftPicks, transactions] =
    await Promise.all([
      rostersPromise,
      Promise.all(weeklyPromises),
      winnersPromise,
      losersPromise,
      draftPicksPromise,
      Promise.all(transactionPromises),
    ]);

  return {
    ...league,
    rosters,
    weeklyMatchups,
    winnersBracket,
    losersBracket,
    draftPicks,
    transactions,
  };
}
