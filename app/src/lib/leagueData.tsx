// ===================================================================
// LeagueData provider — shared across every tab
// ===================================================================
//
// Walks the league's `previous_league_id` chain once at the app shell
// level, fetches users per season, builds the cross-season owner index,
// and exposes the result to every tab via React Context. Without this
// hoist, each tab re-walks history and re-fetches users on mount —
// O(tabs × work) over the lifetime of a session.
//
// Loading strategy: `useEffect` with the empty dep array. Considered the
// React 19 `use(promise)` + Suspense idiom but rejected for now:
//   1. The existing tabs render their own loading / error UI from a
//      discriminated union (see `LeagueDataState` below). Matching that
//      shape keeps the consumer pattern uniform.
//   2. `use(promise)` requires hoisting a stable Promise reference and
//      pairs naturally with Suspense + an ErrorBoundary; neither is
//      wired into the app shell yet. Adding both for one provider is
//      out of scope for this PR.
//   3. The status union is trivially typed; Suspense would push error
//      handling into a boundary we'd have to introduce.
//
// Strict-mode double-invoke (dev only) is handled with the same
// `cancelled` flag pattern the Founders tab used before this hoist.

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CURRENT_LEAGUE_ID } from '../config';
import { walkPreviousLeagues } from './history';
import { loadHighlights, type Highlights } from './highlights';
import { getPlayers, getUsers } from './sleeper';
import { loadSeasonDetails } from './season';
import {
  buildOwnerIndex,
  type LeagueWithUsers,
  type OwnerIndex,
  type SeasonDetails,
} from './owners';
import type { Player } from '../types/sleeper';

// Re-exported so consumers can keep importing them from `leagueData` without
// reaching into the owners module. Defined in `owners.ts` to break the
// circular import that would otherwise form (this file imports from owners).
export type { LeagueWithUsers, SeasonDetails };

/** Sleeper player DB, keyed by `player_id`. ~5MB; cached in sessionStorage. */
export type PlayerIndex = Record<string, Player>;

/**
 * Discriminated state surface every consumer renders against.
 *
 * The provider hydrates in three stages so tabs that only need lean
 * data don't wait on heavier fetches:
 *
 *   - `core-ready`     — `leagues` + `ownerIndex` are populated. Founders
 *                        can render. Per-season details are still in flight.
 *   - `seasons-ready`  — `seasons` (rosters, weekly matchups, brackets) are
 *                        also populated. Tabs that need season details but
 *                        not the player DB (Overview) render here.
 *   - `ready`          — the Sleeper player DB (~5MB) is also loaded.
 *                        Tabs that surface individual player names/positions
 *                        (Records, Seasons, Trades, …) render here.
 *
 * The states are additive — every later state is a superset of the
 * earlier one. Founders accepts any non-loading/error state; Overview
 * accepts `seasons-ready` or `ready`; Records waits for `ready`.
 */
export type LeagueDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      // Lean state: users + owner index landed; seasons still in flight.
      // Tabs that only need lean data (Founders) render at this point.
      status: 'core-ready';
      leagues: LeagueWithUsers[];
      ownerIndex: OwnerIndex;
    }
  | {
      // Per-season details landed; player DB still in flight.
      // Tabs that need season details but not player names (Overview)
      // render at this point.
      status: 'seasons-ready';
      /** Slim per-season payload — alias of `seasons` for callers that only need users. */
      leagues: LeagueWithUsers[];
      /** Full per-season payload (rosters, weekly matchups, brackets, drafts, transactions). */
      seasons: SeasonDetails[];
      ownerIndex: OwnerIndex;
      /** Manually-curated season highlights, keyed by season string. Empty on fetch failure. */
      highlights: Highlights;
    }
  | {
      // Everything loaded — including the Sleeper player DB. Tabs that
      // surface individual player names (Records, Seasons, Trades, …)
      // render at this point.
      status: 'ready';
      leagues: LeagueWithUsers[];
      seasons: SeasonDetails[];
      ownerIndex: OwnerIndex;
      players: PlayerIndex;
      /** Manually-curated season highlights, keyed by season string. Empty on fetch failure. */
      highlights: Highlights;
    };

// `null` means "no provider above us" — the hook below treats that as a
// developer error, which is more useful than a silent default value.
const LeagueDataContext = createContext<LeagueDataState | null>(null);

interface LeagueDataProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app shell. On mount, walks history, fetches users per
 * season, and builds the owner index, then exposes the result to every
 * descendant via context. Fetches exactly once per mount.
 */
export function LeagueDataProvider({ children }: LeagueDataProviderProps) {
  const [state, setState] = useState<LeagueDataState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const leagues = await walkPreviousLeagues(CURRENT_LEAGUE_ID);
        if (cancelled) return;

        // Pair each league with its users in a single zip so we never
        // align two parallel arrays by index after the await.
        const enriched: LeagueWithUsers[] = await Promise.all(
          leagues.map(async (league) => {
            const users = await getUsers(league.league_id);
            return { ...league, users };
          }),
        );
        if (cancelled) return;

        // Build the owner index from the lean `LeagueWithUsers` payload —
        // it only reads `users`, so there's no need to wait for the heavy
        // per-season fetches before assembling it.
        const ownerIndex = buildOwnerIndex(enriched);

        // Stage 1: surface the lean payload now so Founders (and any
        // future owner-only tabs) can paint while season details fetch.
        setState({
          status: 'core-ready',
          leagues: enriched,
          ownerIndex,
        });

        // Hydrate every season with rosters, weekly matchups, brackets,
        // drafts, and transactions. Per-season fetches happen in
        // parallel; within each season the helper fans out further (see
        // `loadSeasonDetails`).
        //
        // Kick off the player-DB fetch and the highlights JSON fetch
        // alongside the per-season fetches:
        //   - The player DB is served from sessionStorage on cache hits,
        //     so this is a no-cost parallel start in the common case.
        //     Even on a cold session, fetching it concurrently with the
        //     seasons beats serializing them.
        //   - The highlights JSON is small and tucked into `app/public/`,
        //     so it's a single sub-1KB fetch. We surface it on the
        //     `seasons-ready` tier so Seasons doesn't have to wait for
        //     the heavy player DB just to render highlights — that
        //     mirrors the legacy site, which only checks `HIGHLIGHTS`
        //     existence at render time without gating on the player DB.
        const playersPromise = getPlayers();
        const highlightsPromise = loadHighlights();

        const seasons: SeasonDetails[] = await Promise.all(
          enriched.map((league) => loadSeasonDetails(league)),
        );
        if (cancelled) return;

        // Highlights almost always finish well before the per-season
        // fan-out (it's one small static file vs ~21+18 API calls per
        // season), but await here so we can surface them on the same
        // `seasons-ready` tick. If the file is genuinely slow we'd
        // rather pause this tier than briefly render Seasons without
        // its highlights panel and then have it pop in.
        const highlights = await highlightsPromise;
        if (cancelled) return;

        // Stage 2: per-season details + highlights landed. Surface this
        // tier so Overview can paint its lean tiles before the heavier
        // player-DB payload finishes parsing.
        setState({
          status: 'seasons-ready',
          leagues: enriched,
          seasons,
          ownerIndex,
          highlights,
        });

        const players = await playersPromise;
        if (cancelled) return;

        // Stage 3: full payload. Records and any future tab that needs
        // individual player metadata (Seasons, Trades, Owner Stats)
        // unblocks here.
        setState({
          status: 'ready',
          leagues: enriched,
          seasons,
          ownerIndex,
          players,
          highlights,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error loading league data.';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <LeagueDataContext.Provider value={state}>{children}</LeagueDataContext.Provider>;
}

/**
 * Returns the current `LeagueDataState`. Throws if called outside a
 * `LeagueDataProvider` so the misuse surfaces immediately in dev.
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook and provider are intentionally colocated; splitting serves no purpose.
export function useLeagueData(): LeagueDataState {
  const value = useContext(LeagueDataContext);
  if (value === null) {
    throw new Error('useLeagueData must be used inside a <LeagueDataProvider>.');
  }
  return value;
}
