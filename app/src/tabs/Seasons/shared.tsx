// ===================================================================
// Shared components / helpers — Seasons tab
// ===================================================================
//
// Lightweight bits used by more than one Seasons sub-component
// (TeamChip, GradePill, the typed `--owner-color` style alias). Kept
// out of `Seasons.tsx` to avoid forcing every reader to scroll past
// them on the way to the top-level composition.

import type { CSSProperties, ReactNode } from 'react';
import type { GradeLetter } from '../../lib/stats/seasons';
import styles from './Seasons.module.css';

/**
 * CSS custom property used to inject a per-row owner color into team
 * chips and similar elements. Strict TypeScript requires the `--*`
 * form to be declared explicitly; we attach it via a typed alias.
 */
export type OwnerColorStyle = CSSProperties & { '--owner-color': string };

interface TeamChipProps {
  name: string;
  /** Owner display name shown in the dim sub-line. Omit for the compact variant. */
  owner?: string;
  color: string;
}

/** Full team chip — color dot + team name + dim owner sub-name. */
export function TeamChip({ name, owner, color }: TeamChipProps) {
  const style: OwnerColorStyle = { '--owner-color': color };
  return (
    <span className={styles.teamChip} style={style}>
      <span className={styles.teamDot} aria-hidden="true" />
      <span className={styles.teamName}>{name}</span>
      {owner ? <span className={styles.teamOwner}>{owner}</span> : null}
    </span>
  );
}

/** Compact team chip — color dot + team name only. */
export function TeamChipCompact({ name, color }: { name: string; color: string }) {
  const style: OwnerColorStyle = { '--owner-color': color };
  return (
    <span className={styles.teamChip} style={style}>
      <span className={styles.teamDot} aria-hidden="true" />
      <span className={styles.teamName}>{name}</span>
    </span>
  );
}

/** Gold/silver/bronze tinting for the top three rows; default for the rest. */
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
