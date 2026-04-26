// ===================================================================
// Shared components / helpers — Seasons tab
// ===================================================================
//
// Tab-local helpers: GradePill / GradeCell (Seasons-specific letter
// grades) and rankClass (gold/silver/bronze tinting for the top three
// rows). The TeamChip + TeamChipCompact + OwnerColorStyle exports were
// lifted to `src/lib/components/TeamChip` once the third tab to
// consume them landed; we re-export from this module so the existing
// import sites in the Seasons tab keep working without churn.

import type { ReactNode } from 'react';
import { TeamChip, TeamChipCompact, type OwnerColorStyle } from '../../lib/components/TeamChip';
import type { GradeLetter } from '../../lib/stats/seasons';
import styles from './Seasons.module.css';

// Re-export so existing `from './shared'` imports keep working without
// touching every consumer. New code should reach the shared module
// directly.
export { TeamChip, TeamChipCompact };
export type { OwnerColorStyle };

/** Gold/silver/bronze tinting for the top three rows; default for the rest. */
// eslint-disable-next-line react-refresh/only-export-components -- helper colocated with the grade-pill components below; splitting into its own file would scatter the directory for a one-line utility.
export function rankClass(idx: number): string {
  if (idx === 0) return `${styles.rank} ${styles.rank1}`;
  if (idx === 1) return `${styles.rank} ${styles.rank2}`;
  if (idx === 2) return `${styles.rank} ${styles.rank3}`;
  return styles.rank;
}

interface GradePillProps {
  grade: GradeLetter | null | undefined;
  /** Renders as a larger pill (used for the headline column). */
  large?: boolean;
}

/**
 * Letter-grade chip. Renders an em-dash when the grade is missing so
 * the cell aligns with neighboring rows that *do* have a grade.
 */
export function GradePill({ grade, large = false }: GradePillProps) {
  if (!grade) return <>{'—'}</>;
  const cls = `${styles.gradePill} ${large ? styles.gradePillLarge : ''} ${gradeClass(grade)}`;
  return <span className={cls.trim()}>{grade}</span>;
}

function gradeClass(grade: GradeLetter): string {
  switch (grade) {
    case 'A+':
      return styles.gradeAPlus;
    case 'A':
      return styles.gradeA;
    case 'B':
      return styles.gradeB;
    case 'C':
      return styles.gradeC;
    case 'D':
      return styles.gradeD;
    case 'F':
      return styles.gradeF;
  }
}

/**
 * A single grade cell with a numeric value below the pill (e.g., the
 * `+12 DCE` under an A on the draft-grades table). The numeric is
 * dim/monospaced so the pill stays the focal point of the cell.
 */
export function GradeCell({
  grade,
  value,
}: {
  grade: GradeLetter | null | undefined;
  value: ReactNode;
}) {
  return (
    <>
      <div>
        <GradePill grade={grade} />
      </div>
      <div className={styles.gradeUnder}>{value}</div>
    </>
  );
}
