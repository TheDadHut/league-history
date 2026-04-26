// ===================================================================
// Shoulda Started Him — top single-mistake bench decisions
// ===================================================================
//
// Mirrors the legacy `#bench-shoulda-body` table (index.html lines
// 2336-2353):
//
//   # · Benched · Pos · Owner · Pts · Started Instead · Missed · When

import type { ShouldaStartedRow } from '../../lib/stats/funstats';
import { TeamChipCompact, rankClass } from './shared';
import styles from './FunStats.module.css';

interface ShouldaStartedTableProps {
  rows: ShouldaStartedRow[];
}

export default function ShouldaStartedTable({ rows }: ShouldaStartedTableProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Worst Specific Benching Decisions</h3>
        <span className={styles.hint}>
          Bench player outscored the starter they could've replaced
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Benched</th>
              <th scope="col">Pos</th>
              <th scope="col">Owner</th>
              <th scope="col" className={styles.num}>
                Pts
              </th>
              <th scope="col">Started Instead</th>
              <th scope="col" className={styles.num}>
                Missed
              </th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>
                  No lineup mistakes detected.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.season}-${row.week}-${row.ownerKey}-${row.benchPlayerId}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td className={styles.playerName}>{row.benchPlayer.name}</td>
                  <td className={styles.position}>{row.benchPlayer.position}</td>
                  <td>
                    <TeamChipCompact name={row.teamName} color={row.color} />
                  </td>
                  <td className={`${styles.num} ${styles.numAccent}`}>
                    {row.benchPoints.toFixed(2)}
                  </td>
                  <td className={styles.shouldaStarter}>
                    started{' '}
                    <span className={styles.shouldaStarterName}>{row.replacedPlayer.name}</span>{' '}
                    <span className={styles.shouldaStarterPts}>
                      {row.replacedPoints.toFixed(2)}
                    </span>
                  </td>
                  <td className={`${styles.num} ${styles.numNegative}`}>
                    -{row.gained.toFixed(2)}
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
