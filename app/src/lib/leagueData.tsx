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
//
// Provider value is memoized so consumer components don't re-render on
// every parent render — only when the underlying state actually changes.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CURRENT_LEAGUE_ID } from '../config';
import { walkPreviousLeagues } from './history';
import { getUsers } from './sleeper';
import { buildOwnerIndex, type OwnerIndex } from './owners';
import type { League, User } from '../types/sleeper';

/** A season payload that has had its users attached. Mirrors the shape used by the stat selectors. */
export type LeagueWithUsers = League & { users: User[] };

/** Discriminated state surface every consumer renders against. */
export type LeagueDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; leagues: LeagueWithUsers[]; ownerIndex: OwnerIndex };

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

        const ownerIndex = buildOwnerIndex(enriched);
        setState({ status: 'ready', leagues: enriched, ownerIndex });
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

  // Memoize the context value so consumers only re-render when state
  // actually changes — not on every parent render.
  const value = useMemo(() => state, [state]);

  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}

/**
 * Returns the current `LeagueDataState`. Throws if called outside a
 * `LeagueDataProvider` so the misuse surfaces immediately in dev.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useLeagueData(): LeagueDataState {
  const value = useContext(LeagueDataContext);
  if (value === null) {
    throw new Error('useLeagueData must be used inside a <LeagueDataProvider>.');
  }
  return value;
}
