import { describe, expect, test } from 'vitest';
import { selectOwnerH2HRecords, selectOwnerSummary } from './owners';
import type { FlatMatchup } from './util';
import type { OwnerPlayoffResume } from './owners';

function fm(
  ownerAKey: string,
  ownerBKey: string,
  scoreA: number,
  scoreB: number,
  isPlayoff = false,
  season = '2024',
  week = 1,
): FlatMatchup {
  return { season, week, isPlayoff, ownerAKey, ownerBKey, scoreA, scoreB };
}

describe('selectOwnerH2HRecords', () => {
  test('regular-season W/L attribution mirrors legacy h2h accumulator', () => {
    const matchups: FlatMatchup[] = [
      fm('alex', 'bob', 100, 90), // alex wins
      fm('alex', 'bob', 80, 95), // alex loses
      fm('alex', 'bob', 110, 70), // alex wins
    ];
    const rows = selectOwnerH2HRecords('alex', matchups);

    expect(rows).toHaveLength(1);
    const bob = rows[0]!;
    expect(bob.opponentKey).toBe('bob');
    expect(bob.regW).toBe(2);
    expect(bob.regL).toBe(1);
    expect(bob.poW).toBe(0);
    expect(bob.poL).toBe(0);
    expect(bob.wins).toBe(2);
    expect(bob.losses).toBe(1);
    expect(bob.games).toBe(3);
    expect(bob.pct).toBeCloseTo(2 / 3, 5);
    expect(bob.hasPlayoff).toBe(false);
  });

  test('playoff games split into poW/poL and flip hasPlayoff', () => {
    const matchups: FlatMatchup[] = [
      fm('alex', 'bob', 100, 90), // reg-season win
      fm('alex', 'bob', 110, 105, true, '2024', 15), // playoff win
      fm('alex', 'bob', 90, 110, true, '2024', 16), // playoff loss
    ];
    const rows = selectOwnerH2HRecords('alex', matchups);
    const bob = rows.find((r) => r.opponentKey === 'bob')!;

    expect(bob.regW).toBe(1);
    expect(bob.regL).toBe(0);
    expect(bob.poW).toBe(1);
    expect(bob.poL).toBe(1);
    expect(bob.wins).toBe(2);
    expect(bob.losses).toBe(1);
    expect(bob.games).toBe(3);
    expect(bob.hasPlayoff).toBe(true);
  });

  test('ties bump games but not wins/losses; pct uses W/(W+L) only', () => {
    const matchups: FlatMatchup[] = [
      fm('alex', 'bob', 100, 90), // win
      fm('alex', 'bob', 95, 95), // tie
    ];
    const bob = selectOwnerH2HRecords('alex', matchups).find((r) => r.opponentKey === 'bob')!;

    expect(bob.wins).toBe(1);
    expect(bob.losses).toBe(0);
    expect(bob.games).toBe(2);
    // Legacy convention: ties drop out of the PCT denominator, so 1W-1T
    // reads as 1.000 rather than .500 (lines 2683-2688 in legacy).
    expect(bob.pct).toBe(1);
  });

  test('matchup is read from either side (ownerA or ownerB)', () => {
    // Alex shows up on the B side of the matchup; selector must still attribute correctly.
    const matchups: FlatMatchup[] = [fm('bob', 'alex', 100, 110)]; // alex wins as side B
    const bob = selectOwnerH2HRecords('alex', matchups).find((r) => r.opponentKey === 'bob')!;
    expect(bob.regW).toBe(1);
    expect(bob.regL).toBe(0);
  });

  test('rows are sorted by combined PCT descending', () => {
    const matchups: FlatMatchup[] = [
      // alex vs bob: 1W (1.000)
      fm('alex', 'bob', 100, 90),
      // alex vs charlie: 1W-1L (.500)
      fm('alex', 'charlie', 100, 90),
      fm('alex', 'charlie', 80, 100),
      // alex vs dave: 0W-2L (.000)
      fm('alex', 'dave', 80, 100),
      fm('alex', 'dave', 70, 100),
    ];
    const rows = selectOwnerH2HRecords('alex', matchups);
    expect(rows.map((r) => r.opponentKey)).toEqual(['bob', 'charlie', 'dave']);
  });

  test('matchups not involving the owner are ignored', () => {
    const matchups: FlatMatchup[] = [fm('bob', 'charlie', 100, 90), fm('alex', 'bob', 110, 95)];
    const rows = selectOwnerH2HRecords('alex', matchups);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.opponentKey).toBe('bob');
  });
});

describe('selectOwnerSummary', () => {
  const emptyResume: OwnerPlayoffResume = {
    appearances: 0,
    finalsAppearances: 0,
    championships: 0,
    wins: 0,
    losses: 0,
  };

  test('regular-season totals only count non-playoff games', () => {
    const matchups: FlatMatchup[] = [
      fm('alex', 'bob', 100, 90), // reg-season win
      fm('alex', 'charlie', 80, 100), // reg-season loss
      fm('alex', 'dave', 110, 105, true, '2024', 15), // playoff — excluded from regW/regGames
    ];
    const summary = selectOwnerSummary('alex', [], matchups, { alex: emptyResume });

    expect(summary.regGames).toBe(2);
    expect(summary.regWins).toBe(1);
    expect(summary.regLosses).toBe(1);
    expect(summary.regPct).toBe(0.5);
  });

  test('playoff PCT comes from the resume, not the matchup list', () => {
    const resume: OwnerPlayoffResume = {
      appearances: 3,
      finalsAppearances: 2,
      championships: 1,
      wins: 4,
      losses: 1,
    };
    const summary = selectOwnerSummary('alex', [], [], { alex: resume });

    expect(summary.playoffResume).toEqual(resume);
    expect(summary.playoffPct).toBe(0.8);
  });

  test('nemesis is the worst-PCT opponent with at least 2 games', () => {
    const matchups: FlatMatchup[] = [
      // alex vs bob: 2W-0L (1.000) — favorite.
      fm('alex', 'bob', 100, 90),
      fm('alex', 'bob', 105, 80),
      // alex vs charlie: 0W-2L (.000) — nemesis.
      fm('alex', 'charlie', 80, 100),
      fm('alex', 'charlie', 70, 100),
      // alex vs dave: 1W-0L — only 1 game, doesn't qualify (legacy ≥ 2 threshold).
      fm('alex', 'dave', 100, 90),
    ];
    const summary = selectOwnerSummary('alex', [], matchups, { alex: emptyResume });

    expect(summary.nemesis?.opponentKey).toBe('charlie');
    expect(summary.favorite?.opponentKey).toBe('bob');
  });

  test('owners with no qualifying H2H opponents have null nemesis/favorite', () => {
    const matchups: FlatMatchup[] = [fm('alex', 'bob', 100, 90)]; // single game, doesn't qualify.
    const summary = selectOwnerSummary('alex', [], matchups, { alex: emptyResume });
    expect(summary.nemesis).toBeNull();
    expect(summary.favorite).toBeNull();
  });

  test('missing playoff resume falls back to all-zeros instead of throwing', () => {
    const summary = selectOwnerSummary('alex', [], [], {});
    expect(summary.playoffResume).toEqual(emptyResume);
    expect(summary.playoffPct).toBe(0);
  });
});
