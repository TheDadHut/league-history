import { describe, expect, test } from 'vitest';
import {
  buildOwnerStats,
  selectFilteredTrades,
  selectMostLopsidedByST,
  selectMostLopsidedByWR,
  selectTradeSeasons,
  type Trade,
  type TradeParty,
} from './trades';
import type { Owner, OwnerIndex } from '../owners';

// -------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------

function party(ownerKey: string, rosterId: number, wrNet: number, stNet: number): TradeParty {
  return {
    rosterId,
    ownerKey,
    received: ['1'],
    gaveUp: ['2'],
    wrGained: wrNet > 0 ? wrNet : 0,
    stGained: stNet > 0 ? stNet : 0,
    wrLost: wrNet < 0 ? -wrNet : 0,
    stLost: stNet < 0 ? -stNet : 0,
    wrNet,
    stNet,
  };
}

/**
 * Build a synthetic Trade with the winners/losers/margins already
 * resolved as `buildSingleTrade` would have. Tests only care about
 * the W/L/tie / netWR / netST roll-up, not how the parties got
 * scored — that's covered by the per-trade unit further down the
 * road if/when we mock weeklyMatchups.
 */
function trade(
  parties: TradeParty[],
  options: { hasOnlyDraftPicks?: boolean; season?: string; created?: number; week?: number } = {},
): Trade {
  const byWR = [...parties].sort((a, b) => b.wrNet - a.wrNet);
  const byST = [...parties].sort((a, b) => b.stNet - a.stNet);
  const wrWinner = byWR[0] ?? null;
  const wrLoser = byWR.length >= 2 ? (byWR[byWR.length - 1] ?? null) : null;
  const stWinner = byST[0] ?? null;
  const stLoser = byST.length >= 2 ? (byST[byST.length - 1] ?? null) : null;
  const wrMargin = wrWinner && wrLoser ? wrWinner.wrNet - wrLoser.wrNet : 0;
  const stMargin = stWinner && stLoser ? stWinner.stNet - stLoser.stNet : 0;

  return {
    txId: `tx-${Math.random().toString(36).slice(2)}`,
    season: options.season ?? '2024',
    week: options.week ?? 1,
    created: options.created ?? 0,
    parties,
    draftPicks: [],
    wrWinner,
    wrLoser,
    stWinner,
    stLoser,
    wrMargin,
    stMargin,
    margin: wrMargin,
    hasOnlyDraftPicks: options.hasOnlyDraftPicks ?? false,
    partyCount: parties.length,
  };
}

function owner(key: string): Owner {
  return {
    key,
    displayName: key,
    color: '',
    teamNamesBySeason: {},
    userIdsBySeason: {},
  };
}

function ownerIndex(...keys: string[]): OwnerIndex {
  const idx: OwnerIndex = {};
  for (const k of keys) idx[k] = owner(k);
  return idx;
}

// -------------------------------------------------------------------
// buildOwnerStats — trade fairness roll-up
// -------------------------------------------------------------------

describe('buildOwnerStats', () => {
  test('clean 2-party trade: winner gets a W, loser gets an L', () => {
    const t = trade([party('alex', 1, 30, 40), party('bob', 2, -30, -40)]);
    const stats = buildOwnerStats([t], ownerIndex('alex', 'bob'));

    expect(stats.alex).toEqual({
      tradeCount: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      netWR: 30,
      netST: 40,
    });
    expect(stats.bob).toEqual({
      tradeCount: 1,
      wins: 0,
      losses: 1,
      ties: 0,
      netWR: -30,
      netST: -40,
    });
  });

  test('|wrMargin| < 2 collapses both parties to a tie', () => {
    // wrNet 0.5 vs -0.5 → margin 1 → tie.
    const t = trade([party('alex', 1, 0.5, 5), party('bob', 2, -0.5, -5)]);
    const stats = buildOwnerStats([t], ownerIndex('alex', 'bob'));

    expect(stats.alex.wins).toBe(0);
    expect(stats.alex.losses).toBe(0);
    expect(stats.alex.ties).toBe(1);
    expect(stats.bob.wins).toBe(0);
    expect(stats.bob.losses).toBe(0);
    expect(stats.bob.ties).toBe(1);
  });

  test('exactly margin = 2 still counts as a clean win/loss (boundary)', () => {
    // wrNet 1 vs -1 → margin 2 → not a tie.
    const t = trade([party('alex', 1, 1, 5), party('bob', 2, -1, -5)]);
    const stats = buildOwnerStats([t], ownerIndex('alex', 'bob'));

    expect(stats.alex.wins).toBe(1);
    expect(stats.alex.ties).toBe(0);
    expect(stats.bob.losses).toBe(1);
    expect(stats.bob.ties).toBe(0);
  });

  test('3-party trades contribute to net but not to W/L', () => {
    const t = trade([
      party('alex', 1, 30, 40),
      party('bob', 2, 5, 5),
      party('charlie', 3, -35, -45),
    ]);
    const stats = buildOwnerStats([t], ownerIndex('alex', 'bob', 'charlie'));

    // Net WR/ST are still tallied for everyone.
    expect(stats.alex.netWR).toBe(30);
    expect(stats.bob.netWR).toBe(5);
    expect(stats.charlie.netWR).toBe(-35);

    // Win/loss attribution is intentionally narrow — 3-party trades skip it.
    expect(stats.alex.wins).toBe(0);
    expect(stats.charlie.losses).toBe(0);
    expect(stats.alex.ties).toBe(0);
    expect(stats.bob.ties).toBe(0);
  });

  test('pure pick swaps are excluded entirely', () => {
    const t = trade([party('alex', 1, 0, 0), party('bob', 2, 0, 0)], {
      hasOnlyDraftPicks: true,
    });
    const stats = buildOwnerStats([t], ownerIndex('alex', 'bob'));

    expect(stats.alex.tradeCount).toBe(0);
    expect(stats.alex.wins).toBe(0);
    expect(stats.alex.losses).toBe(0);
    expect(stats.alex.ties).toBe(0);
    expect(stats.alex.netWR).toBe(0);
    expect(stats.alex.netST).toBe(0);
  });

  test('every owner in the index gets a zero baseline entry', () => {
    const stats = buildOwnerStats([], ownerIndex('alex', 'bob'));
    expect(stats.alex).toEqual({
      tradeCount: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      netWR: 0,
      netST: 0,
    });
    expect(stats.bob).toEqual({
      tradeCount: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      netWR: 0,
      netST: 0,
    });
  });

  test('netWR/netST accumulate across multiple trades', () => {
    const t1 = trade([party('alex', 1, 30, 40), party('bob', 2, -30, -40)]);
    const t2 = trade([party('alex', 1, -10, 5), party('charlie', 3, 10, -5)]);
    const stats = buildOwnerStats([t1, t2], ownerIndex('alex', 'bob', 'charlie'));

    expect(stats.alex.tradeCount).toBe(2);
    expect(stats.alex.netWR).toBe(20);
    expect(stats.alex.netST).toBe(45);
    expect(stats.alex.wins).toBe(1); // win in t1.
    expect(stats.alex.losses).toBe(1); // loss in t2 (margin 20 > 2).
  });
});

// -------------------------------------------------------------------
// Top-level trade selectors
// -------------------------------------------------------------------

describe('selectMostLopsidedByWR', () => {
  test('sorts by wrMargin descending and respects the `n` cap', () => {
    const t1 = trade([party('a', 1, 20, 0), party('b', 2, -20, 0)]); // margin 40
    const t2 = trade([party('a', 1, 5, 0), party('b', 2, -5, 0)]); // margin 10
    const t3 = trade([party('a', 1, 50, 0), party('b', 2, -50, 0)]); // margin 100
    const top = selectMostLopsidedByWR([t1, t2, t3], 2);
    expect(top.map((t) => t.wrMargin)).toEqual([100, 40]);
  });

  test('excludes pure pick swaps and < 2 party trades', () => {
    const pickSwap = trade([party('a', 1, 0, 0), party('b', 2, 0, 0)], {
      hasOnlyDraftPicks: true,
    });
    const oneParty = trade([party('a', 1, 99, 0)]);
    const real = trade([party('a', 1, 10, 0), party('b', 2, -10, 0)]);
    const out = selectMostLopsidedByWR([pickSwap, oneParty, real]);
    expect(out).toHaveLength(1);
    expect(out[0]!.wrMargin).toBe(20);
  });
});

describe('selectMostLopsidedByST', () => {
  test('sorts by stMargin descending', () => {
    // Trades with diverging WR and ST winners — ensures the ST selector
    // sorts on ST, not WR.
    const t1 = trade([party('a', 1, 50, 5), party('b', 2, -50, -5)]); // wr 100, st 10
    const t2 = trade([party('a', 1, 5, 50), party('b', 2, -5, -50)]); // wr 10, st 100
    const top = selectMostLopsidedByST([t1, t2], 2);
    expect(top[0]!.stMargin).toBe(100);
    expect(top[1]!.stMargin).toBe(10);
  });
});

describe('selectTradeSeasons', () => {
  test('returns distinct seasons sorted ascending', () => {
    const t1 = trade([party('a', 1, 0, 0), party('b', 2, 0, 0)], { season: '2024' });
    const t2 = trade([party('a', 1, 0, 0), party('b', 2, 0, 0)], { season: '2022' });
    const t3 = trade([party('a', 1, 0, 0), party('b', 2, 0, 0)], { season: '2024' });
    expect(selectTradeSeasons([t1, t2, t3])).toEqual(['2022', '2024']);
  });

  test('empty input returns empty array', () => {
    expect(selectTradeSeasons([])).toEqual([]);
  });
});

describe('selectFilteredTrades', () => {
  const t1 = trade([party('a', 1, 30, 0), party('b', 2, -30, 0)], {
    season: '2024',
    created: 100,
  });
  const t2 = trade([party('a', 1, 5, 0), party('b', 2, -5, 0)], {
    season: '2023',
    created: 50,
  });
  const t3 = trade([party('a', 1, 50, 0), party('b', 2, -50, 0)], {
    season: '2024',
    created: 200,
  });

  test('date-desc default is most recent first', () => {
    const sorted = selectFilteredTrades([t1, t2, t3], { sort: 'date-desc' });
    expect(sorted.map((t) => t.created)).toEqual([200, 100, 50]);
  });

  test('date-asc reverses order', () => {
    const sorted = selectFilteredTrades([t1, t2, t3], { sort: 'date-asc' });
    expect(sorted.map((t) => t.created)).toEqual([50, 100, 200]);
  });

  test('margin-desc sorts by WR margin', () => {
    const sorted = selectFilteredTrades([t1, t2, t3], { sort: 'margin-desc' });
    expect(sorted.map((t) => t.margin)).toEqual([100, 60, 10]);
  });

  test('season filter narrows to that year', () => {
    const sorted = selectFilteredTrades([t1, t2, t3], { season: '2024', sort: 'date-asc' });
    expect(sorted).toHaveLength(2);
    expect(sorted.every((t) => t.season === '2024')).toBe(true);
  });
});
