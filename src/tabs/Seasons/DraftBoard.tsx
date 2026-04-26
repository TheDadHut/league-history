// ===================================================================
// DraftBoard — first N rounds of the season's draft
// ===================================================================
//
// Mirrors the draft board branch of the legacy `renderSeason()`
// (index.html lines 3143-3168). The legacy site shows the first two
// rounds inline and links the rest out to the Sleeper app:
//
//   "Rounds 3-N available in Sleeper app"
//
// Each pick is a small card with a colored left border (drafter's
// owner color) showing pick number, player name, and team name.

import type { CSSProperties } from 'react';
import type { DraftBoardData } from '../../lib/stats/seasons';
import styles from './Seasons.module.css';

interface DraftBoardProps {
  data: DraftBoardData | null;
}

export default function DraftBoard({ data }: DraftBoardProps) {
  if (!data || data.rounds.length === 0) return null;
  const { rounds, totalRounds } = data;

  return (
    <section className={styles.section} aria-labelledby="seasons-draft-board-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="seasons-draft-board-heading" className={styles.sectionTitle}>
          Draft Board
        </h2>
        <span className={styles.countPill}>{totalRounds} ROUNDS</span>
      </header>

      {rounds.map((round, i) => (
        <div key={round.round}>
          <div
            className={`${styles.draftRoundHeader} ${i === 0 ? styles.draftRoundHeaderFirst : ''}`}
          >
            Round {round.round}
          </div>
          <div className={styles.draftGrid}>
            {round.picks.map((pick) => {
              const style: CSSProperties & { '--owner-color': string } = {
                '--owner-color': pick.color,
              };
              return (
                <div
                  key={`${round.round}-${pick.pickNo}`}
                  className={styles.draftPick}
                  style={style}
                >
                  <div className={styles.pickNum}>{pick.pickNo}</div>
                  <div className={styles.pickInfo}>
                    <div className={styles.playerName}>{pick.playerName}</div>
                    <div className={styles.teamSmall}>{pick.teamName}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {totalRounds > rounds.length ? (
        <div className={styles.draftFooter}>
          Rounds {rounds.length + 1}-{totalRounds} available in Sleeper app
        </div>
      ) : null}
    </section>
  );
}
