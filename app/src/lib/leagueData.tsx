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
//      discriminated union (`{ status: 'loading' | 'error' | 'ready' }`).
//      Matching that shape keeps the consumer pattern uniform.
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
import { getUsers } from './sleeper';
import { loadSeasonDetails } from './season';
import {
  buildOwnerIndex,
  type LeagueWithUsers,
  type OwnerIndex,
  type SeasonDetails,
} from './owners';

// Re-exported so consumers can keep importing them from `leagueData` without
// reaching into the owners module. Defined in `owners.ts` to break the
// circular import that would otherwise form (this file imports from owners).
export type { LeagueWithUsers, SeasonDetails };

/**
 * Discriminated state surface every consumer renders against.
 *
 * The provider hydrates in two stages so tabs that only need lean data
 * (Founders) don't wait on the heavy per-season fetches that Overview,
 * Records, etc. require:
 *
 *   - `core-ready`  — `leagues` + `ownerIndex` are populated. Founders
 *                     can render. Per-season details are still in flight.
 *   - `ready`       — `seasons` (rosters, weekly matchups, brackets) are
 *                     also populated. Tabs that need season details
 *                     render here.
 *
 * Both states share the same `leagues` / `ownerIndex` shape so Founders
 * is indifferent to which one is current. Overview waits for `ready`.
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
      // Full state: per-season details (rosters, matchups, brackets) also in.
      // Tabs that need season details (Overview, Records, etc.) render here.
      status: 'ready';
      /** Slim per-season payload — alias of `seasons` for callers that only need users. */
      leagues: LeagueWithUsers[];
      /** Full per-season payload (rosters, weekly matchups, brackets). */
      seasons: SeasonDetails[];
      ownerIndex: OwnerIndex;
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

        // Hydrate every season with rosters, weekly matchups, and brackets.
        // Per-season fetches happen in parallel; within each season the
        // helper fans out further (see `loadSeasonDetails`).
        const seasons: SeasonDetails[] = await Promise.all(
          enriched.map((league) => loadSeasonDetails(league)),
        );
        if (cancelled) return;

        // Stage 2: full payload. Overview, Records, etc. unblock here.
        setState({
          status: 'ready',
          leagues: enriched,
          seasons,
          ownerIndex,
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
