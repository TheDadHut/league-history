// ===================================================================
// AwardsRow — top-of-tab summary cards for completed seasons
// ===================================================================
//
// Renders the awards strip from the legacy Seasons tab (index.html
// lines 3083-3127). The selector layer (`selectSeasonAwards`) decides
// what gets shown; this component is presentation only.
//
// Award types:
//   - "team"   → big winner line is colored with the owner color
//                (Champion, Highest PF, Most PA, Toilet Bowl).
//   - "player" → big winner line is the player name; detail line
//                carries pts + position + owner.

import type { CSSProperties } from 'react';
import type { SeasonAward, AwardTint } from '../../lib/stats/seasons';
import styles from './Seasons.module.css';

interface AwardsRowProps {
  awards: SeasonAward[];
}

/** No-op render when the season is in progress / has no awards. */
export default function AwardsRow({ awards }: AwardsRowProps) {
  if (awards.length === 0) return null;
  return (
    <div className={styles.awards}>
      {awards.map((award, i) => (
        <AwardCard key={`${award.label}-${i}`} award={award} />
      ))}
    </div>
  );
}

function AwardCard({ award }: { award: SeasonAward }) {
  const tintCls = tintClass(award.tint);
  // Render the unicode marker (🏆 / 👑 / ⭐ / 🚽 / …) inline with the
  // label, with a single space — matches the legacy `🏆 Champion`
  // rendering at line 3086. Markers are decorative — wrap in
  // `aria-hidden` so screen readers announce only the meaningful label.

  return (
    <div className={`${styles.award} ${tintCls}`}>
      <span className={styles.awardLabel}>
        {award.marker ? (
          <>
            <span aria-hidden="true">{award.marker}</span>{' '}
          </>
        ) : null}
        {award.label}
      </span>
      {award.kind === 'team' ? (
        <TeamWinnerLine winnerLabel={award.winnerLabel} color={award.color} />
      ) : (
        <PlayerWinnerLine name={award.playerName} />
      )}
      <span className={styles.awardDetail}>
        {award.kind === 'team'
          ? award.detail
          : `${award.pts.toFixed(award.ptsPrecision)} · ${award.playerPosition} · ${award.ownerDisplayName}`}
      </span>
    </div>
  );
}

/**
 * Team-winner line. The legacy site sets the inline color directly on
 * the span; we mirror that by routing the owner color through a
 * `--owner-color` custom property so the CSS Module can pick it up.
 */
function TeamWinnerLine({ winnerLabel, color }: { winnerLabel: string; color: string }) {
  const style: CSSProperties & { '--owner-color': string } = { '--owner-color': color };
  return (
    <span className={`${styles.awardWinner} ${styles.awardWinnerColored}`} style={style}>
      {winnerLabel}
    </span>
  );
}

function PlayerWinnerLine({ name }: { name: string }) {
  return <span className={styles.awardWinner}>{name}</span>;
}

function tintClass(tint: AwardTint): string {
  switch (tint) {
    case 'gold':
      return styles.awardGold;
    case 'blue':
      return styles.awardBlue;
    case 'green':
      return styles.awardGreen;
    case 'brown':
      return styles.awardBrown;
  }
}
