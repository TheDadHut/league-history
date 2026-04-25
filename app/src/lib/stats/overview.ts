// ===================================================================
// Overview tab — stat layer
// ===================================================================
//
// Pure selectors for the Overview tab's three sections, factored out
// of the legacy `index.html` build/render layer:
//
//   - Hall of Champs        ← `buildChampions()` (lines 910-934)
//                             + `renderChampions()` (lines 1900-1914)
//   - League Pulse          ← `renderPulse()` (lines 1916-2011)
//   - All-Time Standings    ← `buildAllTimeStats()` (lines 892-908)
//                             + `renderAllTimeTable()` (lines 2013-2050)
//
// All of these share an "all matchups, flattened across seasons"
// representation that the legacy code calls `state.allMatchups`. We
// rebuild that here once per render via `buildAllMatchups`, mirroring
// `buildAllMatchups()` (lines 851-890).
//
// The legacy Pulse panel also includes player and trader tiles that
// depend on data not yet ported (the player DB; the Trades tab's
// fairness analysis). Those tiles are rendered here as visually-distinct
// placeholders (em-dash value + sub) so the grid matches the legacy
// layout; real numbers land when the Records and Trades tabs migrate.

import type { OwnerIndex, SeasonDetails } from '../owners';
import { buildAllMatchups, buildRosterToOwnerKey } from './util';

// `buildAllMatchups` + `buildRosterToOwnerKey` (and their `FlatMatchup`
// shape) live in `./util` — Overview was the first consumer of the
// lean flat-matchup view; H2H and Seasons share the same helpers from
// there now that more than one tab needs them.

// ===================================================================
// Hall of Champs
// ===================================================================

export interface ChampionEntry {
  /** Stable owner key. */
  ownerKey: string;
  /** Most recent display name for the owner. */
  displayName: string;
  /** Team name in the *winning* season — owners often rename year over year. */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
  /** Year the championship was won. */
  season: string;
}

/**
 * Returns one entry per completed season's championship, in
 * **most-recent-first** order (matches the legacy `slice().reverse()`
 * in `renderChampions`).
 *
 * Mirrors `buildChampions()` (lines 910-934): a season counts only
 * when `league.status === 'complete'` and the winners bracket
 * surfaces a final game (`p === 1`) with a winner roster id. Seasons
 * that are still in progress (every value of `status` other than
 * `'complete'`) are skipped — the legacy site shows "No champion
 * crowned yet" when the list comes up empty.
 */
export function selectChampions(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): ChampionEntry[] {
  const champions: ChampionEntry[] = [];

  for (const season of seasons) {
    if (season.status !== 'complete') continue;
    const bracket = season.winnersBracket;
    if (!bracket || bracket.length === 0) continue;

    // The championship game is the last `p === 1` entry — Sleeper
    // sometimes lists multiple placement games (1st-place, 3rd-place);
    // the championship is always tagged `p: 1`.
    const champMatches = bracket.filter((m) => m.p === 1);
    if (champMatches.length === 0) continue;
    const champGame = champMatches[champMatches.length - 1];
    if (!champGame || champGame.w == null) continue;

    // Map the winning roster id back to an owner via the season's roster set.
    const rosterToOwner = buildRosterToOwnerKey(season);
    const key = rosterToOwner.get(champGame.w);
    if (!key) continue;

    const owner = ownerIndex[key];
    if (!owner) continue;

    champions.push({
      ownerKey: owner.key,
      displayName: owner.displayName,
      teamName: owner.teamNamesBySeason[season.season] || owner.displayName,
      color: owner.color,
      season: season.season,
    });
  }

  // Most recent first (legacy: `slice().reverse()` over a chronological list).
  champions.reverse();
  return champions;
}

// ===================================================================
// All-Time Standings
// ===================================================================

export interface StandingsRow {
  /** Stable owner key — used as the React `key` and for color lookups. */
  ownerKey: string;
  /** Display name for the owner, cross-season-stable. */
  displayName: string;
  /** Team name as set in the **most recent** season the owner played in (legacy uses the latest league season). */
  teamName: string;
  /** Cross-season-stable owner color. */
  color: string;
  wins: number;
  losses: number;
  ties: number;
  /** Win percentage as a fraction in `[0, 1]`. `0` when no games have been played. */
  pct: number;
  /** Points For — sum of the owner's regular-season scores. */
  pf: number;
  /** Points Against — sum of opponents' regular-season scores against this owner. */
  pa: number;
  /** Total regular-season games (wins + losses + ties). */
  games: number;
  /** Number of championships won (matches the trophy column in the legacy table). */
  titles: number;
}

/**
 * Returns one standings row per owner in the league's history. Order
 * is **stable but unsorted** — sorting is the consumer's responsibility
 * (the legacy table is sortable on every column). Owners with zero
 * games still appear (`pct: 0`) so an inaugural-but-inactive owner
 * doesn't silently disappear.
 *
 * Mirrors `buildAllTimeStats()` (lines 892-908) + the row-shape from
 * `renderAllTimeTable()` (lines 2013-2020). Playoff games are
 * excluded; titles are counted from `selectChampions`'s output.
 */
export function selectAllTimeStandings(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): StandingsRow[] {
  // Initialize one row per known owner (some may have zero games).
  const rows = new Map<string, StandingsRow>();
  // The legacy `state.leagues[state.leagues.length - 1].season` is the
  // *latest* season available; team names default to that one for
  // display.
  const latestSeason = seasons.length > 0 ? seasons[seasons.length - 1]?.season : undefined;

  for (const owner of Object.values(ownerIndex)) {
    const teamName =
      (latestSeason && owner.teamNamesBySeason[latestSeason]) || owner.displayName;
    rows.set(owner.key, {
      ownerKey: owner.key,
      displayName: owner.displayName,
      teamName,
      color: owner.color,
      wins: 0,
      losses: 0,
      ties: 0,
      pct: 0,
      pf: 0,
      pa: 0,
      games: 0,
      titles: 0,
    });
  }

  // Accumulate regular-season stats from the flattened matchups.
  const matchups = buildAllMatchups(seasons);
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const a = rows.get(m.ownerAKey);
    const b = rows.get(m.ownerBKey);
    if (!a || !b) continue;

    a.pf += m.scoreA;
    a.pa += m.scoreB;
    a.games += 1;

    b.pf += m.scoreB;
    b.pa += m.scoreA;
    b.games += 1;

    if (m.scoreA > m.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.scoreB > m.scoreA) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.ties += 1;
      b.ties += 1;
    }
  }

  // Title counts piggyback on the champion selector so we don't repeat
  // the "what counts as a championship" rule in two places.
  const champions = selectChampions(seasons, ownerIndex);
  for (const champ of champions) {
    const row = rows.get(champ.ownerKey);
    if (row) row.titles += 1;
  }

  // Final pct fill-in.
  for (const row of rows.values()) {
    row.pct = row.games > 0 ? row.wins / row.games : 0;
  }

  return [...rows.values()];
}

// ===================================================================
// League Pulse
// ===================================================================

export interface PulseTile {
  /** Tile heading (e.g. "All-Time Wins Leader"). */
  label: string;
  /** Headline value (e.g. an owner's display name, a score). */
  value: string;
  /** Sub-line context (e.g. "12-4" or "Wk 7 · 2024"). */
  sub: string;
}

/**
 * Returns the legacy Pulse-grid tiles in display order.
 *
 * Mirrors `renderPulse()` (lines 1916-2011). Tiles whose data lives in
 * the loaded provider state get real values; tiles that depend on the
 * player DB or trade-fairness analysis (which arrive with the Records
 * and Trades tab migrations) render with em-dash placeholders so the
 * grid matches the legacy layout exactly.
 *
 *   1. All-Time Wins Leader              (real)
 *   2. League High Single Game           (real)
 *   3. Most Points For (Season)          (real)
 *   4. Unluckiest (Most PA)              (real)
 *   5. Total Regular Season Games        (real)
 *   6. Active Owners                     (real)
 *   7. Top Player · Single Week          (placeholder — fills in with Records / player DB)
 *   8. Top Player · Full Season          (placeholder — fills in with Records / player DB)
 *   9. Best Trader                       (placeholder — fills in with Trades migration)
 *  10. Worst Trader                      (placeholder — fills in with Trades migration)
 */
/** Placeholder used for any pulse tile whose data hasn't been loaded yet. Em-dash, U+2014. */
const PULSE_PLACEHOLDER = '—';
export function selectPulseTiles(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): PulseTile[] {
  const tiles: PulseTile[] = [];
  const matchups = buildAllMatchups(seasons);
  const standings = selectAllTimeStandings(seasons, ownerIndex);

  // 1. All-Time Wins Leader — by pure win count, descending.
  const winsLeader = [...standings].sort((a, b) => b.wins - a.wins)[0];
  if (winsLeader) {
    tiles.push({
      label: 'All-Time Wins Leader',
      value: winsLeader.displayName.toUpperCase(),
      sub: `${winsLeader.wins}-${winsLeader.losses}`,
    });
  }

  // 2. League High Single Game — highest single-team score in any
  //    regular-season game across history.
  interface TopGame {
    pts: number;
    key: string;
    season: string;
    week: number;
  }
  let topGame: TopGame | null = null;
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const sides: TopGame[] = [
      { pts: m.scoreA, key: m.ownerAKey, season: m.season, week: m.week },
      { pts: m.scoreB, key: m.ownerBKey, season: m.season, week: m.week },
    ];
    for (const side of sides) {
      if (!topGame || side.pts > topGame.pts) topGame = side;
    }
  }
  if (topGame) {
    const owner = ownerIndex[topGame.key];
    if (owner) {
      tiles.push({
        label: 'League High Single Game',
        value: topGame.pts.toFixed(2),
        sub: `${owner.displayName} · ${topGame.season} Wk ${topGame.week}`,
      });
    }
  }

  // 3 & 4. Top single-season PF and PA totals, per owner-season.
  const pfBySeason = new Map<string, number>(); // `${season}|${ownerKey}` → pts
  const paBySeason = new Map<string, number>();
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const kA = `${m.season}|${m.ownerAKey}`;
    const kB = `${m.season}|${m.ownerBKey}`;
    pfBySeason.set(kA, (pfBySeason.get(kA) ?? 0) + m.scoreA);
    pfBySeason.set(kB, (pfBySeason.get(kB) ?? 0) + m.scoreB);
    paBySeason.set(kA, (paBySeason.get(kA) ?? 0) + m.scoreB);
    paBySeason.set(kB, (paBySeason.get(kB) ?? 0) + m.scoreA);
  }
  const topPF = [...pfBySeason.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPA = [...paBySeason.entries()].sort((a, b) => b[1] - a[1])[0];

  if (topPF) {
    const [composite, pts] = topPF;
    const [season, key] = composite.split('|');
    if (season && key) {
      const owner = ownerIndex[key];
      if (owner) {
        tiles.push({
          label: 'Most Points For (Season)',
          value: owner.displayName.toUpperCase(),
          sub: `${pts.toFixed(2)} · ${season}`,
        });
      }
    }
  }
  if (topPA) {
    const [composite, pts] = topPA;
    const [season, key] = composite.split('|');
    if (season && key) {
      const owner = ownerIndex[key];
      if (owner) {
        tiles.push({
          label: 'Unluckiest (Most PA)',
          value: owner.displayName.toUpperCase(),
          sub: `${pts.toFixed(2)} allowed · ${season}`,
        });
      }
    }
  }

  // 5. Total regular-season games & 6. active owners — both literals.
  const regularGames = matchups.filter((m) => !m.isPlayoff).length;
  const seasonsCount = seasons.length;
  tiles.push({
    label: 'Total Regular Season Games',
    value: regularGames.toString(),
    sub: `Across ${seasonsCount} season${seasonsCount === 1 ? '' : 's'}`,
  });
  tiles.push({
    label: 'Active Owners',
    value: Object.keys(ownerIndex).length.toString(),
    sub: 'All-time',
  });

  // 7-10. Placeholder tiles. Their data lives in tabs that haven't
  // migrated yet — the player DB (Records) and the trade-fairness
  // analysis (Trades). Em-dash placeholders preserve grid parity with
  // the legacy layout without fabricating numbers.
  // 'Top Player · Single/Full Season' fill in when Records lands the
  // player-DB integration. 'Best/Worst Trader' fill in when Trades
  // migrates and trade-fairness analysis runs.
  tiles.push({
    label: 'Top Player · Single Week',
    value: PULSE_PLACEHOLDER,
    sub: PULSE_PLACEHOLDER,
  });
  tiles.push({
    label: 'Top Player · Full Season',
    value: PULSE_PLACEHOLDER,
    sub: PULSE_PLACEHOLDER,
  });
  tiles.push({
    label: 'Best Trader',
    value: PULSE_PLACEHOLDER,
    sub: PULSE_PLACEHOLDER,
  });
  tiles.push({
    label: 'Worst Trader',
    value: PULSE_PLACEHOLDER,
    sub: PULSE_PLACEHOLDER,
  });

  return tiles;
}
