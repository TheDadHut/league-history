// ===================================================================
// Owner Stats tab — stat layer
// ===================================================================
//
// Pure selectors for the Owner Stats tab, factored out of the legacy
// `populateOwnerPicker()` + `renderOwnerStats()` pair (index.html lines
// 2647-2954).
//
// This is a composition module — most of the heavy math (draft grades,
// waiver profile, h2h, trade roll-ups, all-play luck) already lives in
// neighboring stat modules. Owner Stats just slices those existing
// outputs by owner and adds the small playoff-resume walk that has no
// other consumer (championships, finals appearances, playoff W/L per
// owner).
//
// Reused from elsewhere:
//
//   - `selectDraftGrades`     · `seasons.ts`    — per-season DCE/RP/PWR rows.
//   - `selectWaiverProfile`   · `seasons.ts`    — per-season waiver rows + archetype.
//   - `selectH2HSeries`       · `h2h.ts`        — kept for the bilateral lookup; the
//                                                 multi-opponent table here uses a single-
//                                                 pass roll-up over `buildAllMatchups` to
//                                                 avoid re-walking every season for every
//                                                 opponent (N-1 calls).
//   - `buildAllMatchups`      · `util.ts`       — flat regular-season + playoff games.
//   - `buildTrades.statsByOwner` · `trades.ts`  — per-owner trade WR/ST + W-L-T.
//
// New surface added here:
//
//   - `selectOwnerOptions`             — alphabetical picker list.
//   - `selectOwnerPlayoffResume`       — per-owner championships, finals
//                                        appearances, playoff appearances, and
//                                        playoff W/L from the winners-bracket walk.
//   - `selectOwnerH2HRecords`          — one row per opponent the owner has
//                                        played, with reg-season + playoff
//                                        splits and a `nemesis` / `favorite`
//                                        callout.
//   - `selectOwnerSummary`             — top-level composition: regular-season
//                                        record + playoff resume + h2h breakdown
//                                        + nemesis/favorite for one owner.
//   - `selectOwnerDraftHistory`        — slices `selectDraftGrades` output by
//                                        owner and computes the all-time GPA +
//                                        composite letter.
//   - `selectOwnerWaiverHistory`       — same shape over `selectWaiverProfile`.
//
// All functions are pure — no React, no I/O, no caching. Callers
// `useMemo` against the provider state to avoid recomputing on
// unrelated re-renders.

import type { OwnerIndex, SeasonDetails } from '../owners';
import type {
  DraftGradeRow,
  GradeLetter,
  WaiverArchetype,
  WaiverProfileRow,
} from './seasons';
import { gpaToGradeLetter } from './seasons';
import type { FlatMatchup } from './util';

// ===================================================================
// Owner picker options
// ===================================================================

/** One option in the owner picker. */
export interface OwnerOption {
  /** Stable cross-season owner key. */
  key: string;
  /** Display name shown in the `<select>`. */
  displayName: string;
}

/**
 * One option per known owner, sorted alphabetically by display name.
 * Mirrors `populateOwnerPicker()` (index.html lines 2647-2651).
 */
export function selectOwnerOptions(ownerIndex: OwnerIndex): OwnerOption[] {
  return Object.values(ownerIndex)
    .map((o) => ({ key: o.key, displayName: o.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ===================================================================
// Playoff resume — championships, finals, appearances, W/L
// ===================================================================

/** Per-owner playoff resume across the full league history. */
export interface OwnerPlayoffResume {
  /** Distinct seasons the owner appeared in any winners-bracket game. */
  appearances: number;
  /** Distinct seasons the owner played in the final (`p === 1` placement game). */
  finalsAppearances: number;
  /** Championships won (final game won). */
  championships: number;
  /** Wins across every winners-bracket game (every round). */
  wins: number;
  /** Losses across every winners-bracket game (every round). */
  losses: number;
}

/**
 * Walks every league's `winnersBracket` once and counts each owner's
 * appearances + wins/losses + finals + championships. Mirrors the
 * per-season loop in legacy `renderOwnerStats()` (lines 2698-2724) but
 * computes the result for every owner in a single pass — the legacy
 * renderer pays O(seasons × owners) on every picker change; we do
 * O(seasons × roster) once and then index by owner.
 *
 * Returns a `Record<ownerKey, OwnerPlayoffResume>` populated for every
 * key in `ownerIndex`. Owners with no postseason appearances get an
 * all-zero entry rather than being absent — the consumer never has to
 * guard against undefined.
 */
export function selectAllPlayoffResumes(
  seasons: SeasonDetails[],
  ownerIndex: OwnerIndex,
): Record<string, OwnerPlayoffResume> {
  const out: Record<string, OwnerPlayoffResume> = {};
  for (const key of Object.keys(ownerIndex)) {
    out[key] = {
      appearances: 0,
      finalsAppearances: 0,
      championships: 0,
      wins: 0,
      losses: 0,
    };
  }

  for (const league of seasons) {
    if (!league.winnersBracket || league.winnersBracket.length === 0) continue;

    // Roster_id → owner key for this season. Mirrors the legacy
    // `users.find(...)` + `rosters.find(...)` walk inline; we do it once
    // per season instead of once per owner.
    const rosterToOwner = new Map<number, string>();
    for (const roster of league.rosters) {
      if (roster.owner_id == null) continue;
      const user = league.users.find((u) => u.user_id === roster.owner_id);
      if (!user) continue;
      const key = (user.display_name || user.username || '').toLowerCase().trim();
      if (!key) continue;
      rosterToOwner.set(roster.roster_id, key);
    }

    // The legacy code calls a season "appearance" when the owner has at
    // least one bracket entry where they're t1 or t2 *with a numeric
    // roster id* — Sleeper sometimes encodes t1/t2 as `{w:matchId}` /
    // `{l:matchId}` for advancement, which doesn't count as an
    // appearance. We replicate that filter.
    const seasonAppearances = new Set<number>();
    for (const game of league.winnersBracket) {
      const rosters: number[] = [];
      if (typeof game.t1 === 'number') rosters.push(game.t1);
      if (typeof game.t2 === 'number') rosters.push(game.t2);
      for (const rid of rosters) seasonAppearances.add(rid);

      // Per-game W/L attribution. Legacy gates on
      // `g.t1 === rid || g.t2 === rid` *before* checking `g.w === rid` /
      // `g.l === rid` (index.html:2712-2716), so games where this owner
      // is reached only via a `{w: matchId}` bracket reference (the
      // standard semifinal→final advancement) don't double-count.
      // Without that filter, a finalist gets credited for a "win" /
      // "loss" on the championship game once for the bracket entry and
      // again for the advancement reference. Per port-first, we mirror
      // legacy here even though legacy is technically undercounting.
      if (rosters.length === 0) continue;
      if (game.w != null && rosters.includes(game.w)) {
        const winnerKey = rosterToOwner.get(game.w);
        if (winnerKey && out[winnerKey]) out[winnerKey].wins++;
      }
      if (game.l != null && rosters.includes(game.l)) {
        const loserKey = rosterToOwner.get(game.l);
        if (loserKey && out[loserKey]) out[loserKey].losses++;
      }
    }

    for (const rid of seasonAppearances) {
      const key = rosterToOwner.get(rid);
      if (!key || !out[key]) continue;
      out[key].appearances++;
    }

    // Finals = the *last* `p === 1` match in the bracket. The legacy
    // code uses `.pop()` after `.filter(p === 1)` (line 2719), which
    // is the same as taking the last entry; we do the same so a third-
    // place game and a championship game both correctly attribute.
    const finalsMatches = league.winnersBracket.filter((g) => g.p === 1);
    const finals = finalsMatches[finalsMatches.length - 1];
    if (!finals) continue;

    const finalsRosters = new Set<number>();
    if (typeof finals.t1 === 'number') finalsRosters.add(finals.t1);
    if (typeof finals.t2 === 'number') finalsRosters.add(finals.t2);
    for (const rid of finalsRosters) {
      const key = rosterToOwner.get(rid);
      if (!key || !out[key]) continue;
      out[key].finalsAppearances++;
      if (finals.w === rid) out[key].championships++;
    }
  }

  return out;
}

// ===================================================================
// Per-owner H2H roll-up across every opponent
// ===================================================================

/** One row in the per-owner head-to-head table — one entry per opponent. */
export interface OwnerH2HRow {
  /** Stable cross-season owner key for the opponent. */
  opponentKey: string;
  /** Regular-season wins (this owner's perspective). */
  regW: number;
  /** Regular-season losses. */
  regL: number;
  /** Playoff wins. */
  poW: number;
  /** Playoff losses. */
  poL: number;
  /** Combined wins. */
  wins: number;
  /** Combined losses. */
  losses: number;
  /**
   * Total games played, including ties. Mirrors the legacy
   * `h2h[opp].games++` increment that fires on every matchup regardless
   * of outcome (index.html:2670).
   */
  games: number;
  /**
   * `wins / (wins + losses)`. Ties are excluded from the denominator so
   * a 1W-1T owner reads as 1.000 rather than .500 — same convention as
   * the legacy renderer (totalGames in lines 2683-2688 only sums W+L).
   */
  pct: number;
  /** True when at least one playoff game has happened. */
  hasPlayoff: boolean;
}

/**
 * One-pass roll-up of every opponent this owner has faced. Mirrors the
 * legacy `h2h` accumulator (lines 2664-2691) but takes the precomputed
 * `FlatMatchup[]` so multiple selectors can share a single
 * `buildAllMatchups()` pass.
 *
 * Returned in display order (sorted by combined PCT desc, ties broken
 * by total games desc — same as the legacy `[...allH2hRows].sort(...)`
 * at line 2932).
 */
export function selectOwnerH2HRecords(
  ownerKey: string,
  matchups: FlatMatchup[],
): OwnerH2HRow[] {
  const accum = new Map<string, OwnerH2HRow>();

  for (const m of matchups) {
    if (m.ownerAKey !== ownerKey && m.ownerBKey !== ownerKey) continue;

    const oppKey = m.ownerAKey === ownerKey ? m.ownerBKey : m.ownerAKey;
    const myScore = m.ownerAKey === ownerKey ? m.scoreA : m.scoreB;
    const oppScore = m.ownerAKey === ownerKey ? m.scoreB : m.scoreA;

    let row = accum.get(oppKey);
    if (!row) {
      row = {
        opponentKey: oppKey,
        regW: 0,
        regL: 0,
        poW: 0,
        poL: 0,
        wins: 0,
        losses: 0,
        games: 0,
        pct: 0,
        hasPlayoff: false,
      };
      accum.set(oppKey, row);
    }

    // Legacy increments `h2h[opp].games++` unconditionally (index.html:2670)
    // — every matchup counts as a game, including ties. The W/L
    // attribution below is what gates on `myScore > oppScore`.
    row.games++;

    if (m.isPlayoff) {
      row.hasPlayoff = true;
      if (myScore > oppScore) row.poW++;
      else if (myScore < oppScore) row.poL++;
    } else {
      if (myScore > oppScore) row.regW++;
      else if (myScore < oppScore) row.regL++;
    }
  }

  // Finalize derived fields and sort.
  const rows = [...accum.values()];
  for (const r of rows) {
    r.wins = r.regW + r.poW;
    r.losses = r.regL + r.poL;
    // PCT is computed against W+L (ties excluded from the denominator)
    // so a 1W-1T row reads as 1.000 — same convention as the legacy
    // renderer (lines 2683-2688). `games` itself includes ties.
    const decided = r.wins + r.losses;
    r.pct = decided > 0 ? r.wins / decided : 0;
  }
  // Legacy sorts by PCT desc only (line 2932) — no secondary tiebreak.
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

// ===================================================================
// Owner-level summary (the big stat tiles)
// ===================================================================

/**
 * Top-level composition for the owner stat tiles. Mirrors the
 * regular-season totals (lines 2727-2735) plus the nemesis/favorite
 * derivation (lines 2693-2696) plus the playoff resume slice (lines
 * 2698-2724).
 *
 * `nemesis` and `favorite` require at least 2 games to qualify — the
 * same threshold the legacy code uses to filter single-game noise. They
 * may be the same row when an owner has only one opponent with ≥ 2
 * games; the consumer dedupes (legacy: `favoriteMatchup.key !== nemesis.key`
 * at line 2776).
 *
 * `regWins`, `regLosses`, and `regGames` are *strictly regular-season*.
 * The playoff totals (`poWins`, `poLosses`) live on the playoff resume.
 * The legacy renderer surfaces both the regular-season PCT and the
 * playoff PCT side by side; we expose them as separate fields here so
 * the React component doesn't have to redo the math.
 */
export interface OwnerSummary {
  ownerKey: string;
  /** Total regular-season games played by this owner. */
  regGames: number;
  regWins: number;
  regLosses: number;
  /** `regWins / regGames`, or 0 when no games. */
  regPct: number;
  /** Total seasons the owner has appeared in. */
  totalSeasons: number;
  playoffResume: OwnerPlayoffResume;
  /** `playoffWins / (playoffWins + playoffLosses)`, or 0 when no playoff games. */
  playoffPct: number;
  /** Sorted h2h table — one row per opponent, by PCT desc. */
  h2hRows: OwnerH2HRow[];
  /** Worst-PCT opponent with at least 2 games, or null. */
  nemesis: OwnerH2HRow | null;
  /** Best-PCT opponent with at least 2 games, or null. */
  favorite: OwnerH2HRow | null;
}

export function selectOwnerSummary(
  ownerKey: string,
  seasons: SeasonDetails[],
  matchups: FlatMatchup[],
  playoffResumes: Record<string, OwnerPlayoffResume>,
): OwnerSummary {
  // Regular-season totals — same filter as the legacy `regGames`
  // accumulator (line 2659).
  let regGames = 0;
  let regWins = 0;
  for (const m of matchups) {
    if (m.isPlayoff) continue;
    const isMine = m.ownerAKey === ownerKey || m.ownerBKey === ownerKey;
    if (!isMine) continue;
    regGames++;
    const myScore = m.ownerAKey === ownerKey ? m.scoreA : m.scoreB;
    const oppScore = m.ownerAKey === ownerKey ? m.scoreB : m.scoreA;
    if (myScore > oppScore) regWins++;
  }
  const regLosses = regGames - regWins;
  const regPct = regGames > 0 ? regWins / regGames : 0;

  const h2hRows = selectOwnerH2HRecords(ownerKey, matchups);

  // Nemesis / favorite — qualifying threshold is ≥ 2 games, mirrors
  // the legacy filter at line 2694.
  const qualifying = h2hRows.filter((r) => r.games >= 2);
  const sortedByPct = [...qualifying].sort((a, b) => a.pct - b.pct);
  const nemesis = sortedByPct.length > 0 ? (sortedByPct[0] ?? null) : null;
  const favorite =
    sortedByPct.length > 0 ? (sortedByPct[sortedByPct.length - 1] ?? null) : null;

  const resume = playoffResumes[ownerKey] ?? {
    appearances: 0,
    finalsAppearances: 0,
    championships: 0,
    wins: 0,
    losses: 0,
  };
  const playoffGames = resume.wins + resume.losses;
  const playoffPct = playoffGames > 0 ? resume.wins / playoffGames : 0;

  return {
    ownerKey,
    regGames,
    regWins,
    regLosses,
    regPct,
    totalSeasons: seasons.length,
    playoffResume: resume,
    playoffPct,
    h2hRows,
    nemesis,
    favorite,
  };
}

// ===================================================================
// Per-owner draft history
// ===================================================================

/** One per-season row in the owner's draft history. */
export interface OwnerDraftSeason {
  season: string;
  /** Numeric GPA driving the all-time avg. */
  gpa: number;
  overallGrade: GradeLetter;
  dceGrade: GradeLetter;
  rpGrade: GradeLetter;
  pwrGrade: GradeLetter;
  dce: number;
  rp: number;
  pwr: number;
}

/** Owner's full draft history: per-season rows + all-time GPA + composite letter. */
export interface OwnerDraftHistory {
  rows: OwnerDraftSeason[];
  /** Average GPA across all seasons with a draft grade. 0 when `rows.length === 0`. */
  avgGpa: number;
  /** All-time letter grade derived from `avgGpa` via the same curve as per-season grades. */
  avgLetter: GradeLetter | null;
}

/**
 * Slices `selectDraftGrades` output by owner. `gradesBySeason` is a
 * `Record<season, DraftGradeRow[]>` — every season's draft grades
 * keyed by the season year. The legacy renderer iterates
 * `Object.keys(state.draftGrades).sort()` (line 2806) and we mirror
 * that order, but the consumer reverses to "newest first" before
 * rendering the table (line 2837); we keep ascending here so the
 * caller can `.slice().reverse()` without mutating state.
 *
 * Returns an empty `OwnerDraftHistory` when the owner has no draft
 * grades on record (legacy guards `if (ownerGradesBySeason.length > 0)`
 * before rendering the section, line 2811).
 */
export function selectOwnerDraftHistory(
  ownerKey: string,
  gradesBySeason: Record<string, DraftGradeRow[]>,
): OwnerDraftHistory {
  const rows: OwnerDraftSeason[] = [];

  // Legacy walks `Object.keys(state.draftGrades).sort()` (asc by year).
  const seasonsAsc = Object.keys(gradesBySeason).sort();
  for (const season of seasonsAsc) {
    const grades = gradesBySeason[season];
    if (!grades) continue;
    const row = grades.find((r) => r.ownerKey === ownerKey);
    // Legacy guards on `g.overallGrade` before pushing (line 2808); a
    // grade row without an overall letter is incomplete.
    if (!row || !row.overallGrade) continue;
    rows.push({
      season,
      gpa: row.gpa,
      overallGrade: row.overallGrade,
      dceGrade: row.dceGrade,
      rpGrade: row.rpGrade,
      pwrGrade: row.pwrGrade,
      dce: row.dce,
      rp: row.rp,
      pwr: row.pwr,
    });
  }

  if (rows.length === 0) {
    return { rows, avgGpa: 0, avgLetter: null };
  }

  const avgGpa = rows.reduce((sum, r) => sum + r.gpa, 0) / rows.length;
  return {
    rows,
    avgGpa,
    avgLetter: gpaToGradeLetter(avgGpa),
  };
}

// ===================================================================
// Per-owner waiver history
// ===================================================================

/** One per-season row in the owner's waiver history. */
export interface OwnerWaiverSeason {
  season: string;
  /** Headline letter (Impact). Null if the owner had no pickups that season. */
  impactGrade: GradeLetter | null;
  archetype: WaiverArchetype | null;
  volumeGrade: GradeLetter;
  selectionGrade: GradeLetter;
  timingGrade: GradeLetter;
  integrationGrade: GradeLetter;
  persistenceGrade: GradeLetter;
  volume: number;
  selection: number;
  vob: number;
  timing: number;
  integration: number;
  persistence: number;
}

/** Owner's full waiver history: per-season rows + headline composite + dominant archetype. */
export interface OwnerWaiverHistory {
  rows: OwnerWaiverSeason[];
  /** Average impact GPA across all seasons that had an Impact grade. 0 when none. */
  avgImpactGpa: number;
  /** Composite Impact letter from `avgImpactGpa`. Null when no impact-graded seasons. */
  avgImpactLetter: GradeLetter | null;
  /** Most-frequent archetype across all seasons. Null when no archetype on record. */
  dominantArchetype: WaiverArchetype | null;
}

const GRADE_TO_GPA: Record<GradeLetter, number> = {
  'A+': 4.3,
  A: 4.0,
  B: 3.0,
  C: 2.0,
  D: 1.0,
  F: 0.0,
};

/**
 * Slices `selectWaiverProfile` output by owner. `profilesBySeason` is a
 * `Record<season, WaiverProfileRow[]>`. Mirrors the legacy walk at
 * lines 2854-2878.
 *
 * The dominant archetype is the *most-frequent* archetype across the
 * owner's seasons, ties broken by first appearance (legacy uses
 * `Object.entries(...).sort((a, b) => b[1] - a[1])[0]` at line 2868;
 * Object.entries order is insertion order, so first-seen wins).
 */
export function selectOwnerWaiverHistory(
  ownerKey: string,
  profilesBySeason: Record<string, WaiverProfileRow[]>,
): OwnerWaiverHistory {
  const rows: OwnerWaiverSeason[] = [];

  const seasonsAsc = Object.keys(profilesBySeason).sort();
  for (const season of seasonsAsc) {
    const profiles = profilesBySeason[season];
    if (!profiles) continue;
    const row = profiles.find((r) => r.ownerKey === ownerKey);
    // Legacy guards on `g.archetype` (line 2856). An owner with zero
    // pickups gets `archetype: null` from selectWaiverProfile, so the
    // legacy filter doubles as "owner had at least one pickup".
    if (!row || !row.archetype) continue;
    rows.push({
      season,
      impactGrade: row.impactGrade,
      archetype: row.archetype,
      volumeGrade: row.volumeGrade,
      selectionGrade: row.selectionGrade,
      timingGrade: row.timingGrade,
      integrationGrade: row.integrationGrade,
      persistenceGrade: row.persistenceGrade,
      volume: row.volume,
      selection: row.selection,
      vob: row.vob,
      timing: row.timing,
      integration: row.integration,
      persistence: row.persistence,
    });
  }

  // Dominant archetype — count by archetype name.
  const archetypeCounts = new Map<string, { count: number; archetype: WaiverArchetype }>();
  for (const r of rows) {
    if (!r.archetype) continue;
    const existing = archetypeCounts.get(r.archetype.name);
    if (existing) {
      existing.count++;
    } else {
      archetypeCounts.set(r.archetype.name, { count: 1, archetype: r.archetype });
    }
  }
  const dominantEntry = [...archetypeCounts.values()].sort((a, b) => b.count - a.count)[0];
  const dominantArchetype = dominantEntry?.archetype ?? null;

  // Composite Impact GPA — only seasons with an Impact letter contribute.
  const impactSeasons = rows.filter((r): r is OwnerWaiverSeason & { impactGrade: GradeLetter } => r.impactGrade !== null);
  const avgImpactGpa =
    impactSeasons.length > 0
      ? impactSeasons.reduce((sum, r) => sum + GRADE_TO_GPA[r.impactGrade], 0) /
        impactSeasons.length
      : 0;
  const avgImpactLetter = impactSeasons.length > 0 ? gpaToGradeLetter(avgImpactGpa) : null;

  return {
    rows,
    avgImpactGpa,
    avgImpactLetter,
    dominantArchetype,
  };
}

