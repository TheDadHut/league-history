// ===================================================================
// Sleeper API wrappers
// ===================================================================
//
// Typed thin wrappers around the public Sleeper endpoints the GDL site
// consumes. Mirrors the legacy `fetchJSON` / endpoint patterns from
// `index.html` lines ~691-783 and ~955-1005.
//
// Conventions (per CLAUDE.md):
//   - No auth required, no enforced rate limit, but be polite.
//   - Cache the player DB aggressively in sessionStorage (~5MB payload).
//   - Browser is the only client; use the platform `fetch`.

import { API_BASE } from '../config';
import type {
  BracketMatch,
  Draft,
  DraftPick,
  League,
  Matchup,
  Player,
  Roster,
  Transaction,
  User,
} from '../types/sleeper';

/** Throws on non-OK; returns parsed JSON typed as `T`. */
async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function getLeague(leagueId: string): Promise<League> {
  return fetchJSON<League>(`${API_BASE}/league/${leagueId}`);
}

export function getRosters(leagueId: string): Promise<Roster[]> {
  return fetchJSON<Roster[]>(`${API_BASE}/league/${leagueId}/rosters`);
}

export function getUsers(leagueId: string): Promise<User[]> {
  return fetchJSON<User[]>(`${API_BASE}/league/${leagueId}/users`);
}

export function getMatchups(leagueId: string, week: number): Promise<Matchup[]> {
  return fetchJSON<Matchup[]>(`${API_BASE}/league/${leagueId}/matchups/${week}`);
}

export function getWinnersBracket(leagueId: string): Promise<BracketMatch[]> {
  return fetchJSON<BracketMatch[]>(`${API_BASE}/league/${leagueId}/winners_bracket`);
}

export function getLosersBracket(leagueId: string): Promise<BracketMatch[]> {
  return fetchJSON<BracketMatch[]>(`${API_BASE}/league/${leagueId}/losers_bracket`);
}

export function getDrafts(leagueId: string): Promise<Draft[]> {
  return fetchJSON<Draft[]>(`${API_BASE}/league/${leagueId}/drafts`);
}

export function getDraft(draftId: string): Promise<Draft> {
  return fetchJSON<Draft>(`${API_BASE}/draft/${draftId}`);
}

export function getDraftPicks(draftId: string): Promise<DraftPick[]> {
  return fetchJSON<DraftPick[]>(`${API_BASE}/draft/${draftId}/picks`);
}

export function getTransactions(leagueId: string, week: number): Promise<Transaction[]> {
  return fetchJSON<Transaction[]>(`${API_BASE}/league/${leagueId}/transactions/${week}`);
}

// -------------------------------------------------------------------
// Player DB — cached aggressively because the payload is ~5MB.
// Bump the version key whenever the cached shape would change so old
// caches are auto-invalidated (legacy used `_v1` → `_v2` for this).
// -------------------------------------------------------------------

const PLAYERS_CACHE_KEY = 'sleeper_players_v2';
const PLAYERS_CACHE_TIME_KEY = 'sleeper_players_v2_time';
const PLAYERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Fetches the full Sleeper NFL player database, keyed by player_id. Cached
 * in sessionStorage for one day; on cache hit, parses and returns without
 * a network call.
 *
 * Returns the raw Sleeper payload (typed as `Record<string, Player>`).
 * Trimming and display-name derivation are deliberately not done here so
 * future consumers can read whatever fields they need; Phase 3 tabs may
 * layer their own thinned projection on top if cache size becomes a
 * problem in practice.
 */
export async function getPlayers(): Promise<Record<string, Player>> {
  try {
    const cached = sessionStorage.getItem(PLAYERS_CACHE_KEY);
    const cachedTime = sessionStorage.getItem(PLAYERS_CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - parseInt(cachedTime, 10) < PLAYERS_CACHE_TTL_MS) {
      return JSON.parse(cached) as Record<string, Player>;
    }
  } catch {
    // sessionStorage might be unavailable (e.g. private mode quota); fall through to fetch.
  }

  const players = await fetchJSON<Record<string, Player>>(`${API_BASE}/players/nfl`);

  try {
    sessionStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(players));
    sessionStorage.setItem(PLAYERS_CACHE_TIME_KEY, Date.now().toString());
  } catch {
    // Cache full or unavailable — non-fatal; we already have the data in memory.
  }

  return players;
}
