// ===================================================================
// Founders tab — stat layer
// ===================================================================
//
// Mirrors `renderFounders()` from index.html lines 2956-2967, factored
// out so it's a pure function the React component can consume.
//
// Source: the very first league in chronological order (`leagues[0]`
// after `walkPreviousLeagues` has reversed the chain). Every user in
// that inaugural roster is a founder, regardless of whether they're
// still in the league today.
//
// Each founder's *color* comes from the cross-season `OwnerIndex` (not
// from the inaugural league alone) so the same person uses the same
// color on every tab.

import type { OwnerIndex } from '../owners';
import { ownerKey, teamNameFor } from '../owners';
import type { League, User } from '../../types/sleeper';

export interface FounderEntry {
  /** Stable owner key — useful for React `key` props and de-dup. */
  key: string;
  /** Display name as it appeared in the inaugural season. */
  displayName: string;
  /** Team name as it was set in the inaugural season. */
  teamName: string;
  /** Cross-season-stable owner color (a CSS `var(--…)` value). */
  color: string;
}

/** A league season payload that has had its users attached. */
type LeagueWithUsers = League & { users: User[] };

/**
 * Returns the inaugural-season roster as `FounderEntry[]`, in Sleeper's
 * native user order (matches the legacy site's render order). Returns
 * `null` when the inaugural league hasn't been loaded yet.
 *
 * Pure — no fetching, no caching, no side effects.
 */
export function selectFounders(
  leagues: LeagueWithUsers[],
  ownerIndex: OwnerIndex,
): FounderEntry[] | null {
  const inaugural = leagues[0];
  if (!inaugural) return null;

  const founders: FounderEntry[] = [];
  for (const user of inaugural.users) {
    const key = ownerKey(user);
    const owner = ownerIndex[key];
    // If the owner index hasn't been populated for this user (shouldn't
    // happen in practice — the index is built from the same leagues
    // array — defensively skip rather than render a half-blank card).
    if (!owner) continue;
    founders.push({
      key: owner.key,
      displayName: owner.displayName,
      teamName: teamNameFor(user),
      color: owner.color,
    });
  }
  return founders;
}
