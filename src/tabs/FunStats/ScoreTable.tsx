// ===================================================================
// Score table — Hard Luck Losses / Lucky Wins
// ===================================================================
//
// Mirrors the legacy `#hardluck-body` and `#luckywin-body` tables
// (index.html lines 2138-2155):
//
//   # · Team · Points · Opponent · Opp · When
//
// Hard Luck shows the loser as the focal team (highest losing scores —
// "scored a ton and still lost"); Lucky Wins shows the winner as the
// focal team (lowest winning scores — "won without showing up").
//
// The headline points cell is colored:
//   - accent (gold) for Hard Luck — the team's score is the headline.
//   - gold for Lucky Wins — same accent, the winner's score is the headline.

import type { MarginGameRow } from '../../lib/stats/funstats';
import { TeamChipCompact, rankClass } from './shared';
import styles from './FunStats.module.css';

type Variant = 'hardluck' | 'lucky';

interface ScoreTableProps {
  rows: MarginGameRow[];
  variant: Variant;
}

export default function ScoreTable({ rows, variant }: ScoreTableProps) {
  // Hard Luck → focus is the LOSER's perspective (their score is the headline).
  // Lucky Wins → focus is the WINNER's perspective.
  const focal = (row: MarginGameRow) =>
    variant === 'hardluck'
      ? {
          teamName: row.loserTeamName,
          color: row.loserColor,
          points: row.loserScore,
          oppTeamName: row.winnerTeamName,
          oppColor: row.winnerColor,
          oppPoints: row.winnerScore,
        }
      : {
          teamName: row.winnerTeamName,
          color: row.winnerColor,
          points: row.winnerScore,
          oppTeamName: row.loserTeamName,
          oppColor: row.loserColor,
          oppPoints: row.loserScore,
        };

  // Both variants use the accent (gold) color for the headline points
  // column — matches the legacy inline `style="color: var(--accent)"`
  // on lines 2142 and 2152, and `var(--gold)` on the lucky-win
  // headline (the two tokens resolve to nearly the same hue in the
  // current palette).
  const headlineClass = variant === 'lucky' ? styles.scoreLuckyWin : styles.scoreHardLuck;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          {variant === 'hardluck' ? 'Highest Losing Scores' : 'Lowest Points in a Win'}
        </h3>
        <span className={styles.hint}>
          {variant === 'hardluck' ? 'Scored a ton and still lost' : 'Won without showing up'}
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col" className={styles.num}>
                Points
              </th>
              <th scope="col">Opponent</th>
              <th scope="col" className={styles.num}>
                Opp
              </th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const f = focal(row);
              return (
                <tr key={`${row.season}-${row.week}-${row.winnerOwnerKey}-${row.loserOwnerKey}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChipCompact name={f.teamName} color={f.color} />
                  </td>
                  <td className={`${styles.num} ${headlineClass}`}>{f.points.toFixed(2)}</td>
                  <td>
                    <TeamChipCompact name={f.oppTeamName} color={f.oppColor} />
                  </td>
                  <td className={styles.num}>{f.oppPoints.toFixed(2)}</td>
                  <td>
                    {row.season} W{row.week}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
