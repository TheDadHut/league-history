// ===================================================================
// DraftValueTables — Steals / Busts / Waiver Wire Heroes
// ===================================================================
//
// Three tables that share a row schema (rank · player · pos · owner ·
// drafted · finished · value? · points). Mirrors
// `renderSeason()` lines 3170-3336.
//
//   - Steals          → drafted players with the largest positive
//                        value (drafted later than positional finish
//                        warrants). Green section bar.
//   - Busts           → drafted players with the largest negative
//                        value (drafted higher than they returned).
//                        Red section bar.
//   - Waiver Heroes   → undrafted players with strong positional
//                        finish. Blue section bar. No "drafted" / "value"
//                        cells — the cell is rendered as a dim italic
//                        "UNDRAFTED" placeholder.
//
// The selector layer returns `null` when the season has no draft
// picks (matches the legacy guard `if (league.draftPicks && ...)`); we
// no-op in that case.

import type { DraftValueData, DraftValueRow } from '../../lib/stats/seasons';
import { TeamChipCompact, rankClass } from './shared';
import styles from './Seasons.module.css';

interface DraftValueTablesProps {
  data: DraftValueData | null;
}

export default function DraftValueTables({ data }: DraftValueTablesProps) {
  if (!data) return null;
  const { steals, busts, waiverHeroes } = data;

  return (
    <>
      {steals.length > 0 ? (
        <DraftValueTable
          headingId="seasons-steals-heading"
          headingPrefix="💎"
          heading="Biggest Draft Steals"
          countLabel="TOP 5"
          barClass={styles.sectionBarSteals}
          subtitle="Late-Round Production"
          hint="Value = picks later than expected for this positional finish"
          rows={steals}
          mode="drafted"
        />
      ) : null}

      {busts.length > 0 ? (
        <DraftValueTable
          headingId="seasons-busts-heading"
          headingPrefix="💩"
          heading="Biggest Draft Busts"
          countLabel="TOP 5"
          barClass={styles.sectionBarBusts}
          subtitle="Early Picks That Didn't Pan Out"
          hint="Picked too high for what they gave back"
          rows={busts}
          mode="drafted"
        />
      ) : null}

      {waiverHeroes.length > 0 ? (
        <DraftValueTable
          headingId="seasons-waiver-heroes-heading"
          headingPrefix="🔥"
          heading="Waiver Wire Heroes"
          countLabel="TOP 5"
          barClass={styles.sectionBarWaiver}
          subtitle="Undrafted Gold"
          hint="Best positional finishes among undrafted players"
          rows={waiverHeroes}
          mode="undrafted"
        />
      ) : null}
    </>
  );
}

interface DraftValueTableProps {
  headingId: string;
  headingPrefix: string;
  heading: string;
  countLabel: string;
  barClass: string;
  subtitle: string;
  hint: string;
  rows: DraftValueRow[];
  /**
   * "drafted" → renders the pick number cell + signed value cell
   * "undrafted" → renders an italic "UNDRAFTED" placeholder; no value cell.
   */
  mode: 'drafted' | 'undrafted';
}

function DraftValueTable({
  headingId,
  headingPrefix,
  heading,
  countLabel,
  barClass,
  subtitle,
  hint,
  rows,
  mode,
}: DraftValueTableProps) {
  const showValue = mode === 'drafted';

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.sectionHeader}>
        <span className={`${styles.sectionBar} ${barClass}`} aria-hidden="true" />
        <h2 id={headingId} className={styles.sectionTitle}>
          {headingPrefix} {heading}
        </h2>
        <span className={styles.countPill}>{countLabel}</span>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardHeaderTitle}>{subtitle}</h3>
          <span className={styles.hint}>{hint}</span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                <th scope="col">Owner</th>
                <th scope="col" className={styles.num}>
                  Drafted
                </th>
                <th scope="col" className={styles.num}>
                  Finished
                </th>
                {showValue ? (
                  <th scope="col" className={styles.num}>
                    Value
                  </th>
                ) : null}
                <th scope="col" className={styles.num}>
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <DraftValueRowView
                  key={`${row.playerId}-${row.ownerKey}-${i}`}
                  row={row}
                  index={i}
                  showValue={showValue}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DraftValueRowView({
  row,
  index,
  showValue,
}: {
  row: DraftValueRow;
  index: number;
  showValue: boolean;
}) {
  return (
    <tr>
      <td className={rankClass(index)}>{index + 1}</td>
      <td className={styles.dvPlayerName}>{row.playerName}</td>
      <td className={styles.dvPosition}>{row.position}</td>
      <td>
        {row.ownerKey ? (
          <TeamChipCompact name={row.ownerTeamName} color={row.ownerColor} />
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className={`${styles.num} ${row.pickNo == null ? styles.dvUndrafted : styles.dvPick}`}>
        {row.pickNo == null ? 'UNDRAFTED' : `#${row.pickNo}`}
      </td>
      <td className={`${styles.num} ${styles.dvFinish}`}>{row.posFinish}</td>
      {showValue ? (
        <td
          className={`${styles.num} ${
            (row.value ?? 0) > 0 ? styles.dvValuePositive : styles.dvValueNegative
          }`}
        >
          {row.value == null
            ? ''
            : `${row.value > 0 ? '+' : ''}${row.value}`}
        </td>
      ) : null}
      <td className={`${styles.num} ${styles.dvPoints}`}>{row.pts.toFixed(1)}</td>
    </tr>
  );
}
