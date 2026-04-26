// ===================================================================
// WaiverProfile — six-metric waiver wire grades + archetype
// ===================================================================
//
// Mirrors the waiver grades section in `renderSeason()` (index.html
// lines 3386-3446). Six per-owner metrics:
//   VOL · Volume        — pickup count
//   SEL · Selection     — avg pts/week per pickup while rostered
//   IMP · Impact (VOB)  — sum of points above 3-pt/wk baseline (also the headline grade)
//   TIM · Timing        — % pickups whose post-pickup avg beat pre-pickup avg
//   INT · Integration   — % of pickup roster-weeks where the player was started
//   PER · Persistence   — avg weeks held when a pickup proved productive
//
// Archetype is a Volume × Selection axis label (Maven, Sniper, …)
// derived from per-third splits within the league. The headline grade
// is Impact (per the explicit decision in the legacy footer block).

import type { WaiverProfileRow } from '../../lib/stats/seasons';
import { GradeCell, GradePill, TeamChip, rankClass } from './shared';
import styles from './Seasons.module.css';

interface WaiverProfileProps {
  rows: WaiverProfileRow[];
}

export default function WaiverProfile({ rows }: WaiverProfileProps) {
  if (rows.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="seasons-waiver-profile-heading">
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${styles.sectionBarWaiver}`} aria-hidden="true" />
        <h2 id="seasons-waiver-profile-heading" className={styles.sectionTitle}>
          <span aria-hidden="true">📻</span> Waiver Wire Profile
        </h2>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardHeaderTitle}>Multi-Dimensional Waiver Performance</h3>
          <span className={styles.hint}>
            Impact = headline · all six metrics graded on a curve
          </span>
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
                  title="Headline grade — based on Impact (Value Over Baseline). The single-number summary of how much real value your waiver work added."
                >
                  Headline
                </th>
                <th scope="col">Archetype</th>
                <th scope="col" className={styles.num} title="Volume: number of pickups made">
                  VOL
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Selection: avg points/week per pickup while rostered"
                >
                  SEL
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Impact: Value Over Baseline (sum of pts above 3/wk floor)"
                >
                  IMP
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Timing: % of pickups whose post-pickup avg beat their pre-pickup avg"
                >
                  TIM
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Integration: % of pickup roster-weeks where the player was started"
                >
                  INT
                </th>
                <th
                  scope="col"
                  className={styles.num}
                  title="Persistence: avg weeks held when a pickup proved productive"
                >
                  PER
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
                    <GradePill grade={row.impactGrade} large />
                  </td>
                  <td>
                    <div className={styles.archetypeName}>{row.archetype?.name ?? '—'}</div>
                    <div className={styles.archetypeDesc}>
                      {row.archetype?.description ?? ''}
                    </div>
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.volumeGrade} value={row.volume} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.selectionGrade} value={row.selection.toFixed(2)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell grade={row.impactGrade} value={row.vob.toFixed(0)} />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.timingGrade}
                      value={`${(row.timing * 100).toFixed(0)}%`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.integrationGrade}
                      value={`${(row.integration * 100).toFixed(0)}%`}
                    />
                  </td>
                  <td className={styles.num}>
                    <GradeCell
                      grade={row.persistenceGrade}
                      value={`${row.persistence.toFixed(1)}wk`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooter}>
          <strong>Headline</strong> — Same letter as Impact. The cleanest single-number summary of
          how much real value your waiver work added. We chose Impact over a composite because
          averaging six grades hides too much.
          <br />
          <strong>VOL · Volume</strong> — Total pickup count.
          <br />
          <strong>SEL · Selection</strong> — Avg points/week per pickup while rostered. Quality per
          pick.
          <br />
          <strong>IMP · Impact</strong> — Sum of points above a 3-pt/week baseline. Rewards big
          weeks proportionally. <em>Same as Headline.</em>
          <br />
          <strong>TIM · Timing</strong> — % of pickups whose post-pickup avg beat their pre-pickup
          avg. Catching breakouts vs chasing them.
          <br />
          <strong>INT · Integration</strong> — % of weeks rostered where the pickup was started.
          Did you actually use them?
          <br />
          <strong>PER · Persistence</strong> — Avg weeks held when a pickup ended up productive
          (5+ pts/wk avg). Patience with hits.
          <br />
          <em>Archetype is derived from Volume × Selection — describes your style, not your overall quality.</em>
        </div>
      </div>
    </section>
  );
}
