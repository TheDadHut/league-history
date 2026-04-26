// ===================================================================
// Bench totals table — Points Missed by Benching
// ===================================================================
//
// Mirrors the legacy `#bench-total-body` table (index.html lines
// 2324-2332):
//
//   # · Team · Total Missed · Per Game · Games

import type { BenchTotalRow } from '../../lib/stats/funstats';
import { TeamChip, rankClass } from './shared';
import styles from './FunStats.module.css';

interface BenchTotalsTableProps {
  rows: BenchTotalRow[];
}

export default function BenchTotalsTable({ rows }: BenchTotalsTableProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Optimal Lineup vs Actual</h3>
        <span className={styles.hint}>
          How many points you'd have scored with perfect hindsight
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col" className={styles.num}>
                Total Missed
              </th>
              <th scope="col" className={styles.num}>
                Per Game
              </th>
              <th scope="col" className={styles.num}>
                Games
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  No lineup data available.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.ownerKey}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
                  </td>
                  <td className={`${styles.num} ${styles.numNegative}`}>{row.total.toFixed(2)}</td>
                  <td className={styles.num}>{row.perGame.toFixed(2)}</td>
                  <td className={styles.num}>{row.games}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
