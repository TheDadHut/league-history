// ===================================================================
// Consistency / Volatility table
// ===================================================================
//
// Mirrors the legacy `#consistent-body` and `#volatile-body` tables
// (index.html lines 2242-2253):
//
//   # · Team · Avg · Std Dev · Games
//
// The Std Dev cell is colored: green for "consistent" (low σ), red
// for "volatile" (high σ). Top three rows get the gold/silver/bronze
// rank tinting like the rest of the Fun Stats tab.

import type { ConsistencyRow } from '../../lib/stats/funstats';
import { TeamChip, rankClass } from './shared';
import styles from './FunStats.module.css';

type Variant = 'consistent' | 'volatile';

interface ConsistencyTableProps {
  rows: ConsistencyRow[];
  variant: Variant;
}

export default function ConsistencyTable({ rows, variant }: ConsistencyTableProps) {
  const stdDevClass =
    variant === 'consistent' ? styles.stdDevConsistent : styles.stdDevVolatile;

  const headlineHint =
    variant === 'consistent' ? 'No surprises, every week' : 'Boom-or-bust, feast or famine';
  const cardTitle =
    variant === 'consistent' ? 'Lowest Week-to-Week Variance' : 'Highest Week-to-Week Variance';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{cardTitle}</h3>
        <span className={styles.hint}>{headlineHint}</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col" className={styles.num}>
                Avg
              </th>
              <th scope="col" className={styles.num}>
                Std Dev
              </th>
              <th scope="col" className={styles.num}>
                Games
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.ownerKey}>
                <td className={rankClass(i)}>{i + 1}</td>
                <td>
                  <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
                </td>
                <td className={styles.num}>{row.avg.toFixed(2)}</td>
                <td className={`${styles.num} ${stdDevClass}`}>
                  {row.stdDev.toFixed(2)}
                </td>
                <td className={styles.num}>{row.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
