// ===================================================================
// BestPickups — top 10 individual waiver pickups by points-while-rostered
// ===================================================================
//
// Mirrors the Best Pickups section in `renderSeason()` (index.html
// lines 3449-3478). Player-name and position cells use the same
// typography as the Records tab. The points cell carries the
// gold/accent treatment the legacy site applies inline.

import type { BestPickupRow } from '../../lib/stats/seasons';
import { TeamChipCompact, rankClass } from './shared';
import styles from './Seasons.module.css';

interface BestPickupsProps {
  rows: BestPickupRow[];
}

export default function BestPickups({ rows }: BestPickupsProps) {
  if (rows.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="seasons-best-pickups-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarWaiver}`} aria-hidden="true" />
        <h2 id="seasons-best-pickups-heading" className={styles.sectionTitle}>
          <span aria-hidden="true">🎯</span> Best Pickups
        </h2>
        <span className={styles.countPill}>TOP 10</span>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardHeaderTitle}>Highest-Producing Waiver Claims</h3>
          <span className={styles.hint}>Points scored while on the claiming roster</span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                <th scope="col">Claimed By</th>
                <th scope="col" className={styles.num}>
                  Week
                </th>
                <th scope="col" className={styles.num}>
                  Pts While Rostered
                </th>
                <th scope="col" className={styles.num}>
                  Weeks
                </th>
                <th scope="col" className={styles.num}>
                  Per Week
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.playerId}-${row.ownerKey}-${row.claimedWeek}`}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td className={styles.dvPlayerName}>{row.playerName}</td>
                  <td className={styles.dvPosition}>{row.position}</td>
                  <td>
                    <TeamChipCompact name={row.ownerTeamName} color={row.ownerColor} />
                  </td>
                  <td className={`${styles.num} ${styles.bpWeek}`}>W{row.claimedWeek}</td>
                  <td className={`${styles.num} ${styles.bpPoints}`}>
                    {row.pointsWhileRostered.toFixed(2)}
                  </td>
                  <td className={styles.num}>{row.weeksRostered}</td>
                  <td className={styles.num}>{row.avgPerWeek.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
