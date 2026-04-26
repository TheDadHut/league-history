// ===================================================================
// Owner index + color assignment
// ===================================================================
//
// Mirrors the legacy `buildOwnerIndex()` (index.html lines 785-841) and the
// `ownerKey` / `explicitColorFor` helpers (lines 719-732). One owner per
// person across all seasons, keyed by their lower-cased display_name; team
// names are tracked per-season because owners rename their teams year over
// year.
//
// Color assignment is a two-pass pipeline that guarantees every owner gets
// a unique color, and that an owner's color stays stable across tabs:
//   1. Sort owners by key for determinism.
//   2. First pass: hand out explicit colors from `OWNER_COLORS` to anyone
//      whose key contains a substring match — first match wins, no two
//      owners may share an explicit color.
//   3. Second pass: walk the remaining owners in the same order and assign
//      from `FALLBACK_PALETTE`, skipping colors already used.
//
// Once the palette runs dry the legacy code wraps around and reuses
// fallbacks; this implementation matches that behavior verbatim.

import { FALLBACK_PALETTE, OWNER_COLORS } from '../config';
import type {
  BracketMatch,
  DraftPick,
  League,
  Matchup,
  Roster,
  Transaction,
  User,
} from '../types/sleeper';

export interface Owner {
  /** Lower-cased display_name (or username if display_name is empty). The stable cross-season key. */
  key: string;
  /** The most recent display_name we've seen for this owner. */
  displayName: string;
  /** CSS color value (a `var(--…)` reference, per `config.ts`). */
  color: string;
  /** Team name as set in each season's metadata, falling back to display_name. */
  teamNamesBySeason: Record<string, string>;
  /** Sleeper user_id for this owner in each season they participated. */
  userIdsBySeason: Record<string, string>;
}

/** Stable index of every owner across the league's full history, keyed by `Owner.key`. */
export type OwnerIndex = Record<string, Owner>;

/** Lower-cased display_name (or username), trimmed. Empty string if the user has neither. */
export function ownerKey(user: Pick<User, 'display_name' | 'username'>): string {
  return (user.display_name || user.username || '').toLowerCase().trim();
}

/** Team name for a user in a given season — Sleeper metadata first, display_name as fallback. */
export function teamNameFor(user: User): string {
  return user.metadata?.team_name || user.display_name || 'Unknown';
}

/**
 * The most recent team name we know for an owner. Mirrors the legacy
 * `teamChip(key)` (no `season` argument) which falls back to
 * `teamNames[latestSeason]` then `displayName`. Season keys are
 * year-strings, so a lexicographic max is also a chronological max.
 *
 * Lifted here once the third tab to consume it (Owner Stats) landed —
 * the previous private copies in `stats/luck.ts` and inline lookups
 * elsewhere are being migrated to call this directly.
 */
export function latestTeamName(owner: Owner): string {
  const seasons = Object.keys(owner.teamNamesBySeason);
  if (seasons.length === 0) return owner.displayName;
  let latest = seasons[0] as string;
  for (const s of seasons) {
    if (s > latest) latest = s;
  }
  return owner.teamNamesBySeason[latest] || owner.displayName;
}

/** Substring match against `OWNER_COLORS`; returns the first matching color or `null`. */
export function explicitColorFor(key: string): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();
  for (const [matchKey, color] of Object.entries(OWNER_COLORS)) {
    if (lower.includes(matchKey)) return color;
  }
  return null;
}

/** A season payload that has had `users` attached. Mirrors the shape used by the stat selectors. */
export type LeagueWithUsers = League & { users: User[] };

/**
 * A season's full per-league payload — adds rosters, all 18 weeks of
 * matchups, both playoff brackets, draft picks, and weekly transactions
 * on top of `LeagueWithUsers`.
 *
 * Mirrors the legacy `loadSeasonDetails()` shape (index.html lines
 * 749-783); the heavy fetches happen once at the provider layer so
 * downstream tabs can read this directly without re-fetching.
 *
 * `weeklyMatchups[i]` holds week `i + 1`'s matchups; missing weeks are
 * empty arrays (legacy code coerces fetch errors to `[]` in the same
 * spot). `transactions[i]` follows the same convention — week `i + 1`'s
 * transactions, empty-array on fetch failure.
 *
 * `draftPicks` is empty when the league hasn't drafted yet, when the
 * draft endpoint failed, or when no drafts exist for the league
 * (mirroring the legacy `try/catch` swallow at lines 763-769).
 */
export type SeasonDetails = LeagueWithUsers & {
  rosters: Roster[];
  weeklyMatchups: Matchup[][];
  winnersBracket: BracketMatch[];
  losersBracket: BracketMatch[];
  draftPicks: DraftPick[];
  transactions: Transaction[][];
};

/**
 * Builds the cross-season owner index with stable color assignments. Every
 * unique owner across `leagues` ends up with one entry; colors are unique
 * up to the size of the explicit + fallback palettes (12 + named entries).
 *
 * Pure: no side effects, no I/O, no caching. Caller is responsible for
 * fetching `users` for each league before calling.
 */
export function buildOwnerIndex(leagues: LeagueWithUsers[]): OwnerIndex {
  const index: OwnerIndex = {};

  // Pass 1: register every owner that has appeared in any season.
  for (const league of leagues) {
    for (const user of league.users) {
      const key = ownerKey(user);
      if (!key) continue;
      const existing = index[key];
      if (existing) {
        existing.displayName = user.display_name || user.username || existing.displayName;
        existing.teamNamesBySeason[league.season] = teamNameFor(user);
        existing.userIdsBySeason[league.season] = user.user_id;
      } else {
        index[key] = {
          key,
          displayName: user.display_name || user.username || 'Unknown',
          color: '', // filled in below
          teamNamesBySeason: { [league.season]: teamNameFor(user) },
          userIdsBySeason: { [league.season]: user.user_id },
        };
      }
    }
  }

  // Color assignment — sort once for deterministic output across runs.
  const ownersSorted = Object.values(index).sort((a, b) => a.key.localeCompare(b.key));
  const usedColors = new Set<string>();

  // Pass 2a: explicit color preferences, first-come-first-served.
  for (const owner of ownersSorted) {
    const explicit = explicitColorFor(owner.key);
    if (explicit && !usedColors.has(explicit)) {
      owner.color = explicit;
      usedColors.add(explicit);
    }
  }

  // Pass 2b: fill the rest from the rotating fallback palette, skipping
  // any color already taken. If everything's taken (more owners than
  // palette slots) we wrap and reuse, matching the legacy behavior.
  let paletteIdx = 0;
  for (const owner of ownersSorted) {
    if (owner.color) continue;
    let chosen: string | null = null;
    for (let i = 0; i < FALLBACK_PALETTE.length; i++) {
      const candidate = FALLBACK_PALETTE[(paletteIdx + i) % FALLBACK_PALETTE.length];
      if (candidate && !usedColors.has(candidate)) {
        chosen = candidate;
        paletteIdx = (paletteIdx + i + 1) % FALLBACK_PALETTE.length;
        break;
      }
    }
    if (!chosen) {
      const fallback = FALLBACK_PALETTE[paletteIdx % FALLBACK_PALETTE.length];
      // Palette is non-empty by construction (config exports 12 entries),
      // but TS can't see that — fall back to an empty string if it ever is.
      chosen = fallback ?? '';
      paletteIdx = (paletteIdx + 1) % FALLBACK_PALETTE.length;
    }
    owner.color = chosen;
    usedColors.add(chosen);
  }

  return index;
}
