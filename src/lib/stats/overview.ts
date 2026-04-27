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
import type { PlayerIndex } from '../leagueData';
import { selectCurrentStreaks } from './luck';
import { selectPlayerSeasonHighs, selectPlayerSingleWeekHighs } from './records';
import { selectToiletBowlWinner } from './seasons';
import type { TradeStatsByOwner } from './trades';
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
export function selectChampions(seasons: SeasonDetails[], ownerIndex: OwnerIndex): ChampionEntry[] {
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
    const teamName = (latestSeason && owner.teamNamesBySeason[latestSeason]) || owner.displayName;
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
 * Mirrors `renderPulse()` (lines 1916-2011) one-for-one — every tile
 * is now populated from real data:
 *
 *   1. All-Time Wins Leader              (standings)
 *   2. League High Single Game           (matchup walk)
 *   3. Most Points For (Season)          (matchup walk)
 *   4. Unluckiest (Most PA)              (matchup walk)
 *   5. Total Regular Season Games        (matchup count)
 *   6. Active Owners                     (owner index size)
 *   7. Top Player · Single Week          (player DB; needs `'ready'` tier)
 *   8. Top Player · Full Season          (player DB; needs `'ready'` tier)
 *   9. Best Trader                       (trade stats; dropped if no qualifying trader)
 *  10. Worst Trader                      (trade stats; dropped if no qualifying trader)
 *
 * `tradeStats` is required (the Trades tab also derives it from the same
 * `seasons` payload, so passing it in keeps both consumers on one
 * `useMemo`). The Best/Worst Trader tiles mirror the legacy guards:
 * `tradeCount >= 2`, and `netWR > 0` for Best / `netWR < 0` for Worst —
 * when no owner qualifies the tile is **dropped from the grid**, not
 * rendered as a placeholder. This matches `renderPulse()` lines
 * 1980 / 1992, which only `tiles.push(...)` when the guards pass.
 */
export function selectPulseTiles(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
  players: PlayerIndex,
  tradeStats: TradeStatsByOwner,
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

  // 7. Top Player · Single Week — highest single-week starter score
  //    across all regular-season games and seasons. Reuses the Records
  //    selector with `limit = 1`; the underlying matchup walk is the
  //    same one Records uses, so the tab-level `useMemo` keeps it cheap
  //    and we don't repeat the player-display formatting here.
  //    Mirrors `renderPulse()` lines 1957-1962.
  const [topPlayerWeek] = selectPlayerSingleWeekHighs(seasons, ownerIndex, players, 1);
  if (topPlayerWeek) {
    tiles.push({
      label: 'Top Player · Single Week',
      value: topPlayerWeek.player.name.toUpperCase(),
      sub: `${topPlayerWeek.points.toFixed(2)} · ${topPlayerWeek.season} W${topPlayerWeek.week}`,
    });
  }

  // 8. Top Player · Full Season — highest single-season starter total
  //    across all (season, owner, player) triples. Same selector reuse
  //    as above. Note the legacy site formats this with **one** decimal
  //    (line 1968 `topSeason.pts.toFixed(1)`), unlike the two-decimal
  //    single-week tile.
  const [topPlayerSeason] = selectPlayerSeasonHighs(seasons, ownerIndex, players, 1);
  if (topPlayerSeason) {
    tiles.push({
      label: 'Top Player · Full Season',
      value: topPlayerSeason.player.name.toUpperCase(),
      sub: `${topPlayerSeason.points.toFixed(1)} · ${topPlayerSeason.season}`,
    });
  }

  // 9 & 10. Best / Worst Trader — derived from `tradeStats`. Legacy
  //    guards: `tradeCount >= 2` (only owners who participated in at
  //    least two trades qualify) and `netWR > 0` for Best / `netWR < 0`
  //    for Worst. When the guard fails the tile is **dropped**, not
  //    placeholder-rendered. The two tiles draw from a single
  //    netWR-sorted ranking and skip the worst tile when its owner is
  //    the same as the best (only one qualifying trader).
  const tradeRanked = Object.entries(tradeStats)
    .filter(([, s]) => s.tradeCount >= 2)
    .sort((a, b) => b[1].netWR - a[1].netWR);

  if (tradeRanked.length > 0) {
    const [bestKey, bestStats] = tradeRanked[0];
    const bestOwner = ownerIndex[bestKey];
    if (bestOwner && bestStats.netWR > 0) {
      tiles.push({
        label: 'Best Trader',
        value: bestOwner.displayName.toUpperCase(),
        sub: traderSubLine(bestStats, /* signed */ true),
      });
    }

    const [worstKey, worstStats] = tradeRanked[tradeRanked.length - 1];
    const worstOwner = ownerIndex[worstKey];
    if (worstOwner && worstStats.netWR < 0 && worstKey !== bestKey) {
      tiles.push({
        label: 'Worst Trader',
        value: worstOwner.displayName.toUpperCase(),
        sub: traderSubLine(worstStats, /* signed */ false),
      });
    }
  }

  return tiles;
}

/**
 * Sub-line for the Best / Worst Trader tiles. Mirrors `renderPulse()`
 * lines 1981-1988 / 1993-1999:
 *
 *   - Optional `wins-losses[-ties]` prefix when any of the W/L/T
 *     counters is non-zero (legacy gates the prefix on
 *     `wins || losses || ties`).
 *   - `+N WR` for the best tile (explicit plus sign — the legacy
 *     prepends `+` because positive numbers don't carry one); raw
 *     `-N WR` for the worst tile (the negative number already shows
 *     its own minus, so no prefix).
 *   - `· N trade(s)` suffix with naive pluralization.
 */
function traderSubLine(
  stats: { wins: number; losses: number; ties: number; netWR: number; tradeCount: number },
  signed: boolean,
): string {
  const recordStr =
    stats.wins || stats.losses || stats.ties
      ? `${stats.wins}-${stats.losses}${stats.ties ? `-${stats.ties}` : ''} · `
      : '';
  const wr = `${signed ? '+' : ''}${stats.netWR.toFixed(0)} WR`;
  const tradeWord = stats.tradeCount === 1 ? 'trade' : 'trades';
  return `${recordStr}${wr} · ${stats.tradeCount} ${tradeWord}`;
}

// ===================================================================
// Broadcast ticker
// ===================================================================

/**
 * Returns the text items the red broadcast ticker scrolls across the
 * top of the page, in display order. The first three mirror legacy
 * `renderTicker()` (`index.html` lines 1872-1898); the latter three
 * extend the bar with a "trophy → record → live" cadence so adjacent
 * items don't repeat the same shape.
 *
 *   1. `🏆 <SEASON> CHAMPION: <TEAM> (<DISPLAY>)` — most recent
 *      completed season's champion. Skipped when no season has
 *      finished yet (legacy guarded on `if (latest)`).
 *   2. `HIGH SCORE: <DISPLAY> <PTS> · <SEASON> W<WEEK>` — single
 *      highest team-week regular-season score across history. Both
 *      sides of every regular-season pair are considered.
 *   3. `ALL-TIME WINS LEADER: <DISPLAY> — <WINS>` — owner with the
 *      most all-time regular-season wins.
 *   4. `🚽 <SEASON> SACKO: <DISPLAY>` — most recent completed season's
 *      toilet-bowl (consolation-bracket) winner. Walks `seasons`
 *      backwards via `selectToiletBowlWinner` since that selector is
 *      single-season; skipped when no completed season has surfaced
 *      a losers-bracket champion.
 *   5. `MOST RINGS: <DISPLAY> — <N>x` — owner with the most career
 *      championships, derived from `selectChampions`. Ties resolve
 *      alphabetically by display name (deterministic). Skipped when
 *      no championships have been crowned yet.
 *   6. `ON A HEATER: <DISPLAY> — <N>-GAME W STREAK` /
 *      `STUCK IN THE MUD: <DISPLAY> — <N>-GAME L STREAK` — longest
 *      active W or L streak (≥ 2 games). Tie-break prefers W over L,
 *      then alphabetical by display name. Tie streaks and 1-game
 *      streaks aren't interesting and are dropped.
 *
 * Items whose data is unavailable are dropped instead of being
 * emitted with placeholder text — the consumer concatenates this
 * array twice for a seamless scroll loop, and an empty string would
 * create a visible gap.
 */
export function selectTickerItems(seasons: SeasonDetails[], ownerIndex: OwnerIndex): string[] {
  const items: string[] = [];

  // 1. Latest champion. `selectChampions` returns most-recent-first,
  //    so the latest is index 0 — not the last element like in the
  //    legacy `state.champions` chronological array.
  const champions = selectChampions(seasons, ownerIndex);
  const latest = champions[0];
  if (latest) {
    items.push(
      `🏆 ${latest.season} CHAMPION: ${latest.teamName.toUpperCase()} (${latest.displayName.toUpperCase()})`,
    );
  }

  // 2. Single-team high score across regular-season games.
  interface TopSide {
    key: string;
    pts: number;
    season: string;
    week: number;
  }
  let top: TopSide | null = null;
  for (const m of buildAllMatchups(seasons)) {
    if (m.isPlayoff) continue;
    if (!top || m.scoreA > top.pts) {
      top = { key: m.ownerAKey, pts: m.scoreA, season: m.season, week: m.week };
    }
    if (!top || m.scoreB > top.pts) {
      top = { key: m.ownerBKey, pts: m.scoreB, season: m.season, week: m.week };
    }
  }
  if (top) {
    const owner = ownerIndex[top.key];
    if (owner) {
      items.push(
        `HIGH SCORE: ${owner.displayName.toUpperCase()} ${top.pts.toFixed(2)} · ${top.season} W${top.week}`,
      );
    }
  }

  // 3. All-time wins leader. Reuses `selectAllTimeStandings` so the
  //    "what counts as a win" rule lives in exactly one place.
  const winsLeader = [...selectAllTimeStandings(seasons, ownerIndex)].sort(
    (a, b) => b.wins - a.wins,
  )[0];
  if (winsLeader && winsLeader.wins > 0) {
    items.push(
      `ALL-TIME WINS LEADER: ${winsLeader.displayName.toUpperCase()} — ${winsLeader.wins}`,
    );
  }

  // 4. Most-recent toilet-bowl (sacko) winner. `selectToiletBowlWinner`
  //    is single-season, so walk `seasons` from newest backwards
  //    until one resolves — `seasons` is chronological (oldest first)
  //    per `walkPreviousLeagues`. Skipped if no completed season has
  //    a losers-bracket champion (rare; would mean missing bracket
  //    data).
  for (let i = seasons.length - 1; i >= 0; i--) {
    const season = seasons[i];
    if (!season) continue;
    const sacko = selectToiletBowlWinner(season, ownerIndex);
    if (sacko) {
      items.push(`🚽 ${season.season} SACKO: ${sacko.displayName.toUpperCase()}`);
      break;
    }
  }

  // 5. Most rings (career championship count). Group `selectChampions`
  //    by `ownerKey`, take the max count. Ties resolve alphabetically
  //    by display name so the bar is deterministic even when two
  //    owners are tied at the top.
  if (champions.length > 0) {
    const ringsByOwner = new Map<string, { displayName: string; count: number }>();
    for (const c of champions) {
      const existing = ringsByOwner.get(c.ownerKey);
      if (existing) {
        existing.count += 1;
      } else {
        ringsByOwner.set(c.ownerKey, { displayName: c.displayName, count: 1 });
      }
    }
    const ringLeader = [...ringsByOwner.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.displayName.localeCompare(b.displayName);
    })[0];
    if (ringLeader && ringLeader.count > 0) {
      items.push(`MOST RINGS: ${ringLeader.displayName.toUpperCase()} — ${ringLeader.count}x`);
    }
  }

  // 6. Active streak leader. `selectCurrentStreaks` returns one row per
  //    owner with their current run; we pick the longest W or L (≥ 2)
  //    with W preferred over L on ties, then alphabetical by display
  //    name. Tie-result streaks (`'T'`) aren't surfaced — they don't
  //    fit either headline phrasing.
  const streaks = selectCurrentStreaks(seasons, ownerIndex).filter(
    (s) => (s.streakType === 'W' || s.streakType === 'L') && s.streak >= 2,
  );
  if (streaks.length > 0) {
    const sorted = [...streaks].sort((a, b) => {
      if (b.streak !== a.streak) return b.streak - a.streak;
      // W preferred over L on equal length.
      if (a.streakType !== b.streakType) return a.streakType === 'W' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
    const top = sorted[0];
    if (top) {
      if (top.streakType === 'W') {
        items.push(`ON A HEATER: ${top.displayName.toUpperCase()} — ${top.streak}-GAME W STREAK`);
      } else {
        items.push(
          `STUCK IN THE MUD: ${top.displayName.toUpperCase()} — ${top.streak}-GAME L STREAK`,
        );
      }
    }
  }

  return items;
}
