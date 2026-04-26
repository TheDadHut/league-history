// ===================================================================
// Margin table — Biggest Blowouts / Closest Games
// ===================================================================
//
// Mirrors the legacy `#blowouts-body` and `#closest-body` tables
// (index.html lines 2120-2137):
//
//   # · Winner · Score · Loser · Score · Margin · When
//
// Difference between the two is the sort + the margin sign in the
// final column. Blowouts prefix the margin with `+`; Closest renders
// the raw value. Both use the gold/silver/bronze rank pill on the top
// three rows.

import type { MarginGameRow } from '../../lib/stats/funstats';
import { TeamChipCompact, rankClass } from './shared';
import styles from './FunStats.module.css';

interface MarginTableProps {
  rows: MarginGameRow[];
  /** Whether to prefix the margin column with `+` (true for Blowouts, false for Closest). */
  showPlusSign: boolean;
}

export default function MarginTable({ rows, showPlusSign }: MarginTableProps) {
  return (
    <div className={styles.card}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Winner</th>
              <th scope="col" className={styles.num}>
                Score
              </th>
              <th scope="col">Loser</th>
              <th scope="col" className={styles.num}>
                Score
              </th>
              <th scope="col" className={styles.num}>
                Margin
              </th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  No completed games yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={`${row.season}-${row.week}-${row.winnerOwnerKey}-${row.loserOwnerKey}`}
                >
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChipCompact name={row.winnerTeamName} color={row.winnerColor} />
                  </td>
                  <td className={`${styles.num} ${styles.scoreWin}`}>
                    {row.winnerScore.toFixed(2)}
                  </td>
                  <td>
                    <TeamChipCompact name={row.loserTeamName} color={row.loserColor} />
                  </td>
                  <td className={`${styles.num} ${styles.scoreLose}`}>
                    {row.loserScore.toFixed(2)}
                  </td>
                  <td className={`${styles.num} ${styles.numAccent}`}>
                    {showPlusSign ? '+' : ''}
                    {row.margin.toFixed(2)}
                  </td>
                  <td>
                    {row.season} W{row.week}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
