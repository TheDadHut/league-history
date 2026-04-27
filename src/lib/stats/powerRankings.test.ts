import { describe, expect, test } from 'vitest';
import type { SeasonDetails, OwnerIndex } from '../owners';
import type { Matchup } from '../../types/sleeper';
import { resolveCurrentSnapshot, selectPowerRankings, maxPlayedWeek } from './powerRankings';

// -------------------------------------------------------------------
// Test fixtures
// -------------------------------------------------------------------
//
// Construct a minimal `SeasonDetails` shape that satisfies what the
// power-rankings selector actually reads: `season`, `settings.playoff_week_start`,
// `users` (for the rosters→owner mapping), `rosters` (`owner_id` →
// `roster_id`), and `weeklyMatchups` (the per-week scores). Anything
// the selector doesn't touch is left as an empty object/array — the
// type system only sees `unknown` past the documented surface.

interface OwnerSpec {
  ownerKey: string;
  rosterId: number;
}

function makeOwners(specs: OwnerSpec[]): {
  users: SeasonDetails['users'];
  rosters: SeasonDetails['rosters'];
  ownerIndex: OwnerIndex;
} {
  const users = specs.map((s) => ({
    user_id: `user-${s.rosterId}`,
    display_name: s.ownerKey,
    username: s.ownerKey,
  })) as unknown as SeasonDetails['users'];

  const rosters = specs.map((s) => ({
    roster_id: s.rosterId,
    owner_id: `user-${s.rosterId}`,
    players: [],
    starters: [],
    settings: {},
  })) as unknown as SeasonDetails['rosters'];

  const ownerIndex: OwnerIndex = {};
  for (const s of specs) {
    ownerIndex[s.ownerKey] = {
      key: s.ownerKey,
      displayName: s.ownerKey,
      color: '#fff',
      teamNamesBySeason: { '2024': s.ownerKey },
      userIdsBySeason: { '2024': `user-${s.rosterId}` },
    };
  }

  return { users, rosters, ownerIndex };
}

interface ScoreSpec {
  rosterId: number;
  points: number;
}

function makeWeek(matchups: Array<[ScoreSpec, ScoreSpec]>): Matchup[] {
  const out: Matchup[] = [];
  matchups.forEach(([a, b], i) => {
    const matchupId = i + 1;
    out.push({
      matchup_id: matchupId,
      roster_id: a.rosterId,
      points: a.points,
      players: null,
      starters: null,
      players_points: null,
      starters_points: null,
      custom_points: null,
    });
    out.push({
      matchup_id: matchupId,
      roster_id: b.rosterId,
      points: b.points,
      players: null,
      starters: null,
      players_points: null,
      starters_points: null,
      custom_points: null,
    });
  });
  return out;
}

function makeSeason(
  season: string,
  users: SeasonDetails['users'],
  rosters: SeasonDetails['rosters'],
  weeklyMatchups: Matchup[][],
  playoffWeekStart = 15,
): SeasonDetails {
  return {
    league_id: `league-${season}`,
    previous_league_id: null,
    season,
    status: 'complete',
    name: 'Test League',
    settings: { playoff_week_start: playoffWeekStart },
    roster_positions: [],
    users,
    rosters,
    weeklyMatchups,
    winnersBracket: [],
    losersBracket: [],
    draftPicks: [],
    transactions: [],
  } as unknown as SeasonDetails;
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('selectPowerRankings', () => {
  test('returns empty result when no seasons have been played', () => {
    const { users, rosters, ownerIndex } = makeOwners([]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [])];
    const result = selectPowerRankings(seasons, ownerIndex);
    expect(result.rankings).toHaveLength(0);
  });

  test('two-team mini-season, undefeated owner ranks above winless', () => {
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    // 3 weeks: alpha 100, bravo 80 each week. Alpha is 3-0, bravo 0-3.
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 80 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 110 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w3 = makeWeek([
      [
        { rosterId: 1, points: 105 },
        { rosterId: 2, points: 85 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [w1, w2, w3])];
    const result = selectPowerRankings(seasons, ownerIndex);

    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0]?.ownerKey).toBe('alpha');
    expect(result.rankings[0]?.rank).toBe(1);
    expect(result.rankings[0]?.wins).toBe(3);
    expect(result.rankings[0]?.losses).toBe(0);
    expect(result.rankings[1]?.ownerKey).toBe('bravo');
    expect(result.rankings[1]?.rank).toBe(2);
  });

  test('powerScore is in [0, 1] and components sum to powerScore', () => {
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
      { ownerKey: 'charlie', rosterId: 3 },
      { ownerKey: 'delta', rosterId: 4 },
    ]);
    // 4 owners, 2 weeks of varied scores
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 120 },
        { rosterId: 2, points: 100 },
      ],
      [
        { rosterId: 3, points: 90 },
        { rosterId: 4, points: 110 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 95 },
        { rosterId: 4, points: 130 },
      ],
      [
        { rosterId: 2, points: 105 },
        { rosterId: 3, points: 100 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [w1, w2])];
    const result = selectPowerRankings(seasons, ownerIndex);

    for (const row of result.rankings) {
      expect(row.powerScore).toBeGreaterThanOrEqual(0);
      expect(row.powerScore).toBeLessThanOrEqual(1);

      const sum =
        row.components.record.contribution +
        row.components.allPlay.contribution +
        row.components.pointsFor.contribution +
        row.components.recentForm.contribution +
        row.components.streak.contribution;
      expect(sum).toBeCloseTo(row.powerScore, 9);

      // Component weights sum to 1.0
      const weightSum =
        row.components.record.weight +
        row.components.allPlay.weight +
        row.components.pointsFor.weight +
        row.components.recentForm.weight +
        row.components.streak.weight;
      expect(weightSum).toBeCloseTo(1.0, 9);
    }
  });

  test('all-tied raw values normalize to 0.5 (no information case)', () => {
    // Three owners, each scores identical points all season — every
    // component except all-play (which is naturally [0,1]) has zero
    // variance, so min-max should produce 0.5 for everyone.
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
      { ownerKey: 'charlie', rosterId: 3 },
    ]);
    // Week 1: alpha vs bravo 100-100, charlie has no game (so 2 played teams).
    // Better: do round-robin so every owner plays once and scores identically.
    // Using 4 owners → 2 matchups. Use 4 owners.
    const {
      users: u4,
      rosters: r4,
      ownerIndex: oi4,
    } = makeOwners([
      { ownerKey: 'a', rosterId: 1 },
      { ownerKey: 'b', rosterId: 2 },
      { ownerKey: 'c', rosterId: 3 },
      { ownerKey: 'd', rosterId: 4 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 100 },
      ],
      [
        { rosterId: 3, points: 100 },
        { rosterId: 4, points: 100 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', u4, r4, [w1])];
    const result = selectPowerRankings(seasons, oi4);

    for (const row of result.rankings) {
      // Record = 0.5 (all ties → 0.5 wins each), normalized = 0.5
      expect(row.components.record.normalized).toBeCloseTo(0.5, 9);
      // PF, recent, streak all identical raw → 0.5
      expect(row.components.pointsFor.normalized).toBeCloseTo(0.5, 9);
      expect(row.components.recentForm.normalized).toBeCloseTo(0.5, 9);
      expect(row.components.streak.normalized).toBeCloseTo(0.5, 9);
    }

    // Suppress unused-fixture lint noise.
    expect(ownerIndex).toBeDefined();
    expect(users).toBeDefined();
    expect(rosters).toBeDefined();
  });

  test('movement field reports rank delta vs prior week', () => {
    // Two-week season, two owners. Alpha wins week 1 (rank 1 by all
    // components after w1), bravo wins week 2 by a huge margin → bravo
    // should overtake. Movement at week 2: bravo +1, alpha -1.
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 120 },
        { rosterId: 2, points: 80 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 70 },
        { rosterId: 2, points: 200 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [w1, w2])];

    const w2Result = selectPowerRankings(seasons, ownerIndex, 2);
    const bravoRow = w2Result.rankings.find((r) => r.ownerKey === 'bravo');
    const alphaRow = w2Result.rankings.find((r) => r.ownerKey === 'alpha');
    expect(bravoRow?.movement).toBe(1); // moved up
    expect(alphaRow?.movement).toBe(-1); // moved down
  });

  test('throughWeek=1 has null movement', () => {
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [w1])];
    const result = selectPowerRankings(seasons, ownerIndex, 1);
    for (const row of result.rankings) {
      expect(row.movement).toBeNull();
    }
  });

  test('playoff weeks excluded from the formula', () => {
    const { users, rosters, ownerIndex } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    // playoff_week_start = 2 → week 1 is regular, week 2+ is playoffs.
    // In playoffs alpha gets blown out; should NOT count toward power
    // ranking at week 2 (well, the matchup is past the cap so it
    // doesn't contribute). Verify alpha's record stays 1-0 even when
    // throughWeek=2.
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 130 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 50 },
        { rosterId: 2, points: 200 },
      ],
    ]);
    const seasons: SeasonDetails[] = [
      makeSeason('2024', users, rosters, [w1, w2], /*playoffWeekStart=*/ 2),
    ];
    const result = selectPowerRankings(seasons, ownerIndex, 2);
    const alpha = result.rankings.find((r) => r.ownerKey === 'alpha');
    expect(alpha?.wins).toBe(1);
    expect(alpha?.losses).toBe(0);
  });
});

describe('resolveCurrentSnapshot', () => {
  test('returns the most recent played week of the most recent season', () => {
    const { users, rosters } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    // Play weeks 1, 2, 4. Skip week 3.
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 95 },
        { rosterId: 2, points: 110 },
      ],
    ]);
    const w3: Matchup[] = []; // no data
    const w4 = makeWeek([
      [
        { rosterId: 1, points: 80 },
        { rosterId: 2, points: 70 },
      ],
    ]);
    const seasons: SeasonDetails[] = [makeSeason('2024', users, rosters, [w1, w2, w3, w4])];
    const snap = resolveCurrentSnapshot(seasons);
    expect(snap.season).toBe('2024');
    expect(snap.throughWeek).toBe(4);
  });

  test('falls back to the prior completed season when current has no games', () => {
    const { users, rosters } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 95 },
        { rosterId: 2, points: 110 },
      ],
    ]);
    const seasonOld = makeSeason('2024', users, rosters, [w1, w2]);
    // 2025 has no played weeks (empty arrays).
    const seasonNew = makeSeason('2025', users, rosters, [[], []]);
    const snap = resolveCurrentSnapshot([seasonNew, seasonOld]);
    expect(snap.season).toBe('2024');
    expect(snap.throughWeek).toBe(2);
  });
});

describe('maxPlayedWeek', () => {
  test('returns the latest regular-season week with any non-zero score', () => {
    const { users, rosters } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 0 },
        { rosterId: 2, points: 0 },
      ],
    ]); // no scores
    const w3 = makeWeek([
      [
        { rosterId: 1, points: 110 },
        { rosterId: 2, points: 95 },
      ],
    ]);
    const season = makeSeason('2024', users, rosters, [w1, w2, w3]);
    expect(maxPlayedWeek(season)).toBe(3);
  });

  test('ignores playoff weeks even if scored', () => {
    const { users, rosters } = makeOwners([
      { ownerKey: 'alpha', rosterId: 1 },
      { ownerKey: 'bravo', rosterId: 2 },
    ]);
    const w1 = makeWeek([
      [
        { rosterId: 1, points: 100 },
        { rosterId: 2, points: 90 },
      ],
    ]);
    const w2 = makeWeek([
      [
        { rosterId: 1, points: 110 },
        { rosterId: 2, points: 95 },
      ],
    ]);
    // playoffs start at week 2 — w2 should be excluded
    const season = makeSeason('2024', users, rosters, [w1, w2], 2);
    expect(maxPlayedWeek(season)).toBe(1);
  });
});
