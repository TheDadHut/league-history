// ===================================================================
// TradeCard — single-trade renderer (all variants)
// ===================================================================
//
// Mirrors the legacy `renderTradeCard()` (index.html lines 2410-2487).
// Three rendering modes are folded into one component:
//
//   1. Pure pick swap            — no players moved; renders the
//      season + week stamp and the slate of picks involved.
//   2. Two-party trade           — side-by-side party blocks separated
//      by a ⇄.
//   3. Three+-party trade        — same blocks stacked horizontally
//      with thin separators; flex wrapping pushes them to a vertical
//      stack on phones (handled by the module CSS).
//
// The optional `rank` prop adds a #N badge above the metadata for the
// top-10 lopsided lists; `null` (the default) hides it for the
// chronological view.

import type { OwnerIndex } from '../../lib/owners';
import type { PlayerIndex } from '../../lib/leagueData';
import type { OwnerColorStyle } from '../../lib/components/TeamChip';
import { playerDisplay } from '../../lib/players';
import type { Trade, TradeParty } from '../../lib/stats/trades';
import styles from './Trades.module.css';

interface TradeCardProps {
  trade: Trade;
  /** 1-indexed rank for the top-10 lists; `null` hides the badge. */
  rank: number | null;
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

export default function TradeCard({ trade, rank, ownerIndex, players }: TradeCardProps) {
  // Pure pick-only path — no party blocks, just the picks list.
  if (trade.hasOnlyDraftPicks) {
    return (
      <div className={`${styles.tradeCard} ${styles.tradeCardPicks}`}>
        <div className={styles.tradeMeta}>
          <span className={styles.tradeSeasonWeek}>
            {trade.season} · Week {trade.week}
          </span>
          <span className={styles.picksOnlyLabel}>DRAFT PICK TRADE</span>
        </div>
        <div className={styles.picksOnlyBody}>
          {trade.draftPicks.map((p) => `${p.season} Round ${p.round} pick`).join(' · ')}
        </div>
      </div>
    );
  }

  const dateStr =
    trade.created != null
      ? new Date(trade.created).toLocaleDateString()
      : `${trade.season} Wk ${trade.week}`;

  // For 2-party trades we want a swap arrow between the blocks. For
  // 3+-way trades the legacy uses a thin vertical separator. Either
  // way the layout sits in the same flex container.
  const isThreeWay = trade.parties.length > 2;

  return (
    <div className={styles.tradeCard}>
      <div className={styles.tradeMeta}>
        <div className={styles.tradeMetaLeft}>
          {rank != null ? <span className={styles.rankBadge}>#{rank}</span> : null}
          <span className={styles.tradeSeasonWeek}>
            {trade.season} · Week {trade.week}
          </span>
        </div>
        <span className={styles.tradeDate}>{dateStr}</span>
      </div>

      <div className={styles.partiesRow}>
        {trade.parties.map((party, i) => (
          <PartyAndSeparator
            key={`${party.rosterId}`}
            party={party}
            trade={trade}
            ownerIndex={ownerIndex}
            players={players}
            showSeparatorAfter={i < trade.parties.length - 1}
            isThreeWay={isThreeWay}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Party block + the trailing separator (⇄ on 2-way, thin line on 3+-way)
// -------------------------------------------------------------------

interface PartyAndSeparatorProps {
  party: TradeParty;
  trade: Trade;
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
  showSeparatorAfter: boolean;
  isThreeWay: boolean;
}

function PartyAndSeparator({
  party,
  trade,
  ownerIndex,
  players,
  showSeparatorAfter,
  isThreeWay,
}: PartyAndSeparatorProps) {
  return (
    <>
      <PartyBlock party={party} trade={trade} ownerIndex={ownerIndex} players={players} />
      {showSeparatorAfter ? (
        isThreeWay ? (
          <div className={styles.partySeparator} aria-hidden="true" />
        ) : (
          <div className={styles.tradeArrow} aria-hidden="true">
            ⇄
          </div>
        )
      ) : null}
    </>
  );
}

// -------------------------------------------------------------------
// Single party — owner header, received players + picks, WR/ST nets
// -------------------------------------------------------------------

interface PartyBlockProps {
  party: TradeParty;
  trade: Trade;
  ownerIndex: OwnerIndex;
  players: PlayerIndex;
}

function PartyBlock({ party, trade, ownerIndex, players }: PartyBlockProps) {
  const owner = ownerIndex[party.ownerKey];
  if (!owner) {
    // Defensive: an owner who's been removed from the league has no
    // index entry. Render a thin placeholder rather than crashing.
    return <div className={styles.party}>—</div>;
  }

  const style: OwnerColorStyle = { '--owner-color': owner.color };
  const picksReceived = trade.draftPicks.filter((p) => p.toRoster === party.rosterId);

  return (
    <div className={styles.party} style={style}>
      <div className={styles.partyHead}>
        <span className={styles.partyDot} aria-hidden="true" />
        <span className={styles.partyName}>{owner.displayName}</span>
      </div>

      <div className={styles.partyAssets}>
        {party.received.length > 0 ? (
          party.received.map((pid) => {
            const info = playerDisplay(pid, players);
            return (
              <div key={pid} className={styles.partyPlayer}>
                <span className={styles.partyPlayerName}>{info.name}</span>
                {info.position ? (
                  <span className={styles.partyPlayerPos}>{info.position}</span>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className={styles.partyEmpty}>—</div>
        )}
        {picksReceived.map((p) => (
          <div key={`${p.season}-${p.round}-${p.fromRoster}`} className={styles.partyPick}>
            ↪ {p.season} R{p.round} pick
          </div>
        ))}
      </div>

      <div className={styles.partyMetrics}>
        <Metric label="WR" value={party.wrNet} />
        <Metric label="ST" value={party.stNet} />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Tiny WR / ST metric pair (shared between both labels)
// -------------------------------------------------------------------

function Metric({ label, value }: { label: string; value: number }) {
  // Color the value green/red around 0; sub-tenth-of-a-point near-zero
  // values don't matter visually but the legacy does a strict > 0 / < 0
  // comparison so we mirror it.
  const cls =
    value > 0
      ? `${styles.metricValue} ${styles.metricPositive}`
      : value < 0
        ? `${styles.metricValue} ${styles.metricNegative}`
        : `${styles.metricValue} ${styles.metricNeutral}`;
  const sign = value > 0 ? '+' : '';
  return (
    <div>
      <span className={styles.metricLabel}>{label}</span>{' '}
      <span className={cls}>
        {sign}
        {value.toFixed(1)}
      </span>
    </div>
  );
}
