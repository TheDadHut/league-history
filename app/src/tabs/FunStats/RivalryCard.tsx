// ===================================================================
// Rivalry card — Biggest Rivalry
// ===================================================================
//
// Mirrors the legacy `#rivalry-body` block (index.html lines 2205-2219).
// Two owners side-by-side with a "VS" between them, each owner's
// head-to-head wins as the focal number, plus the matchup count and a
// "dead even" / "most contested rivalry" subtitle below.
//
// Owner names + win counts are colored:
//   - green when this owner has more wins
//   - red  when this owner has fewer wins
//   - dim  when the series is tied

import type { RivalryResult } from '../../lib/stats/funstats';
import styles from './FunStats.module.css';

interface RivalryCardProps {
  result: RivalryResult | null;
}

export default function RivalryCard({ result }: RivalryCardProps) {
  if (!result) {
    return (
      <div className={styles.card}>
        <div className={styles.cardBody}>
          <p className={styles.empty}>Not enough games played yet.</p>
        </div>
      </div>
    );
  }

  const aColor =
    result.ownerAWins > result.ownerBWins
      ? styles.winsBig
      : result.ownerAWins < result.ownerBWins
        ? styles.lossesBig
        : styles.tiedBig;
  const bColor =
    result.ownerBWins > result.ownerAWins
      ? styles.winsBig
      : result.ownerBWins < result.ownerAWins
        ? styles.lossesBig
        : styles.tiedBig;

  return (
    <div className={styles.card}>
      <div className={styles.cardBody}>
        <div className={styles.rivalryGrid}>
          <div className={styles.rivalrySide}>
            <div
              className={styles.rivalryName}
              style={{ color: result.ownerAColor }}
            >
              {result.ownerADisplayName}
            </div>
            <div className={`${styles.rivalryWins} ${aColor}`}>
              {result.ownerAWins}
            </div>
          </div>
          <div className={styles.rivalryVs}>VS</div>
          <div className={styles.rivalrySide}>
            <div
              className={styles.rivalryName}
              style={{ color: result.ownerBColor }}
            >
              {result.ownerBDisplayName}
            </div>
            <div className={`${styles.rivalryWins} ${bColor}`}>
              {result.ownerBWins}
            </div>
          </div>
        </div>
        <div className={styles.rivalryFooter}>
          {result.games} matchups ·{' '}
          {result.ownerAWins === result.ownerBWins ? 'dead even' : 'most contested rivalry'}
        </div>
      </div>
    </div>
  );
}
