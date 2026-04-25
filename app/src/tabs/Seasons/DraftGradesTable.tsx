// ===================================================================
// DraftGradesTable — DCE / RP / PWR letter grades by owner
// ===================================================================
//
// Mirrors the draft grades section in `renderSeason()` (index.html
// lines 3338-3383). Three metrics — Draft Capital Efficiency, Raw
// Points, Points While Rostered — graded on a curve within each
// season, with an Overall composite. The footer block carries the
// in-app definitions verbatim.

import type { DraftGradeRow } from '../../lib/stats/seasons';
import { GradeCell, GradePill, TeamChip, rankClass } from './shared';
import styles from './Seasons.module.css';

interface DraftGradesTableProps {
  rows: DraftGradeRow[];
}

export default function DraftGradesTable({ rows }: DraftGradesTableProps) {
  if (rows.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="seasons-draft-grades-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarGold}`} aria-hidden="true" />
        <h2 id="seasons-draft-grades-heading" className={styles.sectionTitle}>
          📋 Draft Grades
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardHeaderTitle}>Draft Performance Report Card</h3>
          <span className={styles.hint}>Graded on a curve within this season</span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Owner</th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Overall grade combining all three metrics"
                >
                  Overall
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Draft Capital Efficiency: sum of steal/bust values across all picks"
                >
                  DCE
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Raw Points: total points scored by everyone you drafted"
                >
                  RP
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Points While Rostered: points scored while still on your team"
                >
                  PWR
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
                  <td className={styles.num}>
                    <GradePill grade={row.overallGrade} large />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.dceGrade}
                      value={`${row.dce > 0 ? '+' : ''}${row.dce.toFixed(0)}`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.rpGrade} value={row.rp.toFixed(0)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.pwrGrade} value={row.pwr.toFixed(0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooter}>
          <strong>DCE</strong> — Draft Capital Efficiency: sum of how much earlier/later each pick
          was taken vs the typical cost of that positional finish. Measures efficiency per pick.
          <br />
          <strong>RP</strong> — Raw Points: total points scored by all drafted players across the
          season regardless of later trades/drops. Measures raw talent identification.
          <br />
          <strong>PWR</strong> — Points While Rostered: points scored only while the player was
          still on your team. Rewards good draft + roster management combined.
        </div>
      </div>
    </section>
  );
}
