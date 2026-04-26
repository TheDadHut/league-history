// ===================================================================
// Close-game table — Clutch Index / Blowout Record
// ===================================================================
//
// Mirrors the legacy `#clutch-body` and `#blowout-record-body` tables
// (index.html lines 2292-2309):
//
//   # · Team · W · L · PCT · Close/Blowout Games
//
// Both halves use the same shape; the only differences are the
// header copy and the empty-state message.

import type { CloseGameRow } from '../../lib/stats/funstats';
import { TeamChip, rankClass } from './shared';
import styles from './FunStats.module.css';

type Variant = 'clutch' | 'blowout';

interface CloseGameTableProps {
  rows: CloseGameRow[];
  variant: Variant;
}

export default function CloseGameTable({ rows, variant }: CloseGameTableProps) {
  const cardTitle =
    variant === 'clutch' ? 'Record in Close Games' : 'Record in Blowouts';
  const hint =
    variant === 'clutch' ? 'Games decided by under 10 points' : 'Games decided by 30+ points';
  const gamesHeader = variant === 'clutch' ? 'Close Games' : 'Blowouts';
  const emptyMessage = variant === 'clutch' ? 'No close games yet.' : 'No blowouts yet.';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{cardTitle}</h3>
        <span className={styles.hint}>{hint}</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col" className={styles.num}>
                W
              </th>
              <th scope="col" className={styles.num}>
                L
              </th>
              <th scope="col" className={styles.num}>
                PCT
              </th>
              <th scope="col" className={styles.num}>
                {gamesHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.ownerKey}>
                  <td className={rankClass(i)}>{i + 1}</td>
                  <td>
                    <TeamChip name={row.teamName} owner={row.displayName} color={row.color} />
                  </td>
                  <td className={styles.num}>
                    <span className={styles.wins}>{row.wins}</span>
                  </td>
                  <td className={styles.num}>
                    <span className={styles.losses}>{row.losses}</span>
                  </td>
                  <td className={`${styles.num} ${styles.pct}`}>
                    {/* Drop the leading 0 to match the legacy `.replace(/^0/, '')`
                        — `.385` reads tighter in a narrow column than `0.385`. */}
                    {row.pct.toFixed(3).replace(/^0/, '')}
                  </td>
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
