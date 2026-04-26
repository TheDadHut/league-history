// ===================================================================
// Sleeper API response shapes
// ===================================================================
//
// Minimal, accurate types covering the fields actually consumed by the
// data layer extracted in Phase 2. Sleeper's payloads are large and
// loosely shaped — anything not consumed yet is intentionally omitted
// rather than guessed at. Expand in Phase 3 as tabs need more fields.
//
// All extra/unknown fields are absorbed by an index signature of
// `unknown` (not `any`) so consumers must narrow before using them.

/** A Sleeper league. Returned by `/league/{league_id}`. */
export interface League {
  league_id: string;
  /** Null on the very first season in a league's history. Sleeper occasionally returns the string "0" here too. */
  previous_league_id: string | null;
  /** Year as a string, e.g. "2024". */
  season: string;
  /** "in_season" | "complete" | "pre_draft" | "drafting" — leave loose; we only compare to "complete". */
  status: string;
  name: string;
  settings: LeagueSettings;
  roster_positions: string[];
  [key: string]: unknown;
}

/** Subset of `league.settings` the legacy code actually reads. */
export interface LeagueSettings {
  /** First playoff week (legacy defaults to 15 when absent). */
  playoff_week_start?: number;
  [key: string]: unknown;
}

/** A user/owner in a league. Returned by `/league/{league_id}/users`. */
export interface User {
  user_id: string;
  display_name: string;
  username: string;
  metadata?: UserMetadata;
  [key: string]: unknown;
}

export interface UserMetadata {
  team_name?: string;
  [key: string]: unknown;
}

/** A roster in a league. Returned by `/league/{league_id}/rosters`. */
export interface Roster {
  roster_id: number;
  /** Null when the roster is unowned (rare; happens between commish actions). */
  owner_id: string | null;
  /** All player IDs currently rostered (starters + bench + IR). */
  players: string[] | null;
  /** Starter slot order; "0" sentinel for empty slots. */
  starters: string[] | null;
  settings: RosterSettings;
  [key: string]: unknown;
}

/** Sleeper splits roster scores into integer + decimal parts. Combine with `fpts + fpts_decimal/100`. */
export interface RosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  [key: string]: unknown;
}

/**
 * One side of a weekly matchup. Returned as an array by
 * `/league/{league_id}/matchups/{week}`. Two entries share a `matchup_id`
 * (one per team); a `null` matchup_id means the team had a bye.
 */
export interface Matchup {
  matchup_id: number | null;
  roster_id: number;
  points: number;
  /** All player IDs on the roster that week (starters + bench). */
  players: string[] | null;
  /** Starter slot order; "0" sentinel for empty slots. */
  starters: string[] | null;
  /**
   * Per-player point totals. Three-state shape:
   *   - `Record<string, number>` keyed by player_id when Sleeper has scoring data,
   *   - an empty array `[]` for very old/incomplete payloads (the array case is
   *     never populated — legacy code guards with `!Array.isArray()` and
   *     substitutes `{}`), or
   *   - `null` when the field is absent entirely.
   * Narrow before using.
   */
  players_points: Record<string, number> | [] | null;
  /** Points for each starter, indexed positionally to match `starters`. */
  starters_points: number[] | null;
  /** Commissioner-set point overrides; typically null. */
  custom_points: number | null;
  [key: string]: unknown;
}

/**
 * Single bracket node. Sleeper returns an array from
 * `/league/{league_id}/winners_bracket` and `/losers_bracket`. The legacy
 * code only reads `r` (round), `t1`, `t2`, `w` (winner roster id), and `p`
 * (placement in losers bracket / consolation games).
 */
export interface BracketMatch {
  /** Round number, 1-indexed. */
  r: number;
  /** Match number within the round. */
  m: number;
  /** Roster ID for team 1; may reference a previous match for advancement. */
  t1: number | { w: number } | { l: number } | null;
  /** Roster ID for team 2. */
  t2: number | { w: number } | { l: number } | null;
  /** Winning roster ID once the match is complete. */
  w: number | null;
  /** Losing roster ID once the match is complete. */
  l: number | null;
  /** Placement game: e.g. 1 for the championship, 3 for the third-place game. */
  p?: number;
  [key: string]: unknown;
}

/** A draft entry. Returned by `/league/{league_id}/drafts` (array) and `/draft/{draft_id}` (single). */
export interface Draft {
  draft_id: string;
  league_id: string;
  season: string;
  /** "snake" | "auction" | "linear" — keep loose. */
  type: string;
  status: string;
  [key: string]: unknown;
}

/** A single draft pick. Returned by `/draft/{draft_id}/picks`. */
export interface DraftPick {
  /** Overall pick number, 1-indexed. */
  pick_no: number;
  /** Round number, 1-indexed. */
  round: number;
  /** Slot within the round, 1-indexed. */
  draft_slot: number;
  /** Sleeper user_id that made the pick. */
  picked_by: string;
  /** Roster that received the player. */
  roster_id: number;
  /** Drafted player's ID; null/undefined for skipped picks. */
  player_id: string | null;
  /**
   * Sleeper attaches the drafted player's name to the pick at draft
   * time. The legacy site reads `first_name` + `last_name` directly off
   * the pick (rather than the player DB) so the draft board shows the
   * name a player was drafted under. Only those two fields are read in
   * this codebase — keep the type minimal.
   */
  metadata?: {
    first_name?: string;
    last_name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * A traded draft pick referenced inside a `Transaction`. Note this is
 * different from `DraftPick` (the actual draft event) — this is the
 * pre-draft swap bookkeeping.
 */
export interface TransactionDraftPick {
  season: string;
  round: number;
  /** Roster the pick currently belongs to (post-trade). */
  owner_id: number;
  /** Roster the pick previously belonged to (pre-trade). */
  previous_owner_id: number;
  /** Original owner before any trades. */
  roster_id?: number;
  [key: string]: unknown;
}

/**
 * A league transaction: trade, waiver claim, free-agent add/drop, commish move.
 * Returned by `/league/{league_id}/transactions/{week}`.
 *
 * Sleeper's transaction shape is large and varies by `type`; only the
 * fields the legacy data layer actually reads are typed. The rest are
 * absorbed by the index signature so callers can narrow if needed.
 */
export interface Transaction {
  transaction_id: string;
  /** "trade" | "waiver" | "free_agent" | "commissioner". Legacy filters on this. */
  type: string;
  /** "complete" | "failed" — legacy only counts complete transactions. */
  status: string;
  /** Unix ms when created. Null on rare incomplete payloads — legacy guards with `(tx.created || 0)`. */
  created: number | null;
  /** Status update timestamp; null on pending. */
  status_updated: number | null;
  /**
   * Sleeper calls this "leg" but it's the league week the transaction
   * landed in. Defaults to 1 when absent.
   */
  leg: number;
  /** All rosters involved (both sides of a trade, or just the claimant for waivers). */
  roster_ids: number[];
  /** player_id → roster_id that received them. Null for transactions with no adds. */
  adds: Record<string, number> | null;
  /** player_id → roster_id that gave them up. Null for transactions with no drops. */
  drops: Record<string, number> | null;
  /** Pre-draft pick swaps, present on trades that include picks. Null when no picks are involved — legacy guards with `(tx.draft_picks || [])`. */
  draft_picks: TransactionDraftPick[] | null;
  [key: string]: unknown;
}

/**
 * One entry from the Sleeper player DB (`/players/nfl`). The full payload
 * is ~5MB across thousands of players; only the fields the legacy player
 * lookup uses are typed here.
 */
export interface Player {
  player_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
  [key: string]: unknown;
}
