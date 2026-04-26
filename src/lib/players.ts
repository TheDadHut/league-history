// ===================================================================
// Player display helpers
// ===================================================================
//
// Mirrors the legacy `playerInfo()` (index.html lines 1007-1015) plus
// the display-name derivation that lives inside `loadPlayerDB()` (lines
// 985-998) — split apart here because Phase 2 left the raw Sleeper
// `Player` payload in the cache (no trimming) so callers can read
// whatever fields they need without re-fetching.
//
// The legacy site cached a trimmed `{ name, position, team }` projection
// to save sessionStorage bytes; the new app caches the raw payload and
// derives the display projection on demand. The two caches have
// different shapes and different keys (`_v2` vs `_v3`) — see the note
// in `sleeper.ts` about why they must not collide.

import type { Player } from '../types/sleeper';
import type { PlayerIndex } from './leagueData';

/** Display-ready player info, matching the legacy `playerInfo` return shape. */
export interface PlayerDisplay {
  /** Best-effort human-readable name; falls back to "Unknown <Position>" / "Unknown Player". */
  name: string;
  /** Position string ("QB", "WR", "DEF", …); empty when Sleeper omits it. */
  position: string;
  /** NFL team abbreviation; empty when Sleeper omits it. */
  team: string;
}

/**
 * Builds a display name from a raw Sleeper `Player`. Mirrors the legacy
 * cascade in `loadPlayerDB` (lines 985-993):
 *
 *   1. `full_name` if present (defenses come pre-formatted: "Los Angeles Rams").
 *   2. `first_name + last_name` joined.
 *   3. `last_name` alone, then `first_name` alone.
 *   4. `Unknown <Position>` if the position is known.
 *   5. Final fallback: `Unknown Player`.
 *
 * Internal helper — exported only for testing.
 */
export function derivePlayerName(player: Player): string {
  const position = player.position ?? '';
  if (player.full_name && player.full_name.trim()) return player.full_name;

  const first = player.first_name ?? '';
  const last = player.last_name ?? '';
  const joined = `${first} ${last}`.trim();
  if (joined) return joined;
  if (last) return last;
  if (first) return first;
  return position ? `Unknown ${position}` : 'Unknown Player';
}

/**
 * Resolves a player_id to a `PlayerDisplay`. Matches the legacy
 * `playerInfo()` semantics:
 *
 *   - Empty index → echo the raw id (or "Unknown" if no id).
 *   - Hit on the index → derive name + position + team from the
 *     Sleeper payload.
 *   - Miss but the id matches a 2-3 letter team abbreviation → treat
 *     it as a defense (Sleeper sometimes returns defenses keyed by
 *     `KC` / `LAR` rather than the canonical defense id).
 *   - Otherwise → `{ name: 'Unknown', position: '', team: '' }`.
 */
export function playerDisplay(
  id: string | null | undefined,
  players: PlayerIndex | null | undefined,
): PlayerDisplay {
  if (!players) return { name: id ?? 'Unknown', position: '', team: '' };

  if (id) {
    const hit = players[id];
    if (hit) {
      return {
        name: derivePlayerName(hit),
        position: hit.position ?? '',
        team: hit.team ?? '',
      };
    }
    if (/^[A-Z]{2,3}$/.test(id)) {
      return { name: id, position: 'DEF', team: id };
    }
  }

  return { name: 'Unknown', position: '', team: '' };
}
