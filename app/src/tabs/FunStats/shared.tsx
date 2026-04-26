// ===================================================================
// Shared components / helpers — Fun Stats tab
// ===================================================================
//
// Lightweight bits used by more than one Fun Stats sub-component
// (TeamChip, TeamChipCompact, the typed `--owner-color` style alias,
// and the gold/silver/bronze rank tinting). Kept out of `FunStats.tsx`
// so the top-level composition reads cleanly.

import type { CSSProperties } from 'react';
import styles from './FunStats.module.css';

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

/** Full team chip — color dot + team name in owner color + dim owner sub-name. */
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

/** Compact team chip — color dot + team name only (no owner sub). */
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
// eslint-disable-next-line react-refresh/only-export-components -- helper colocated with the chip components above; splitting into its own file would scatter the directory for a one-line utility.
export function rankClass(idx: number): string {
  if (idx === 0) return `${styles.rank} ${styles.rank1}`;
  if (idx === 1) return `${styles.rank} ${styles.rank2}`;
  if (idx === 2) return `${styles.rank} ${styles.rank3}`;
  return styles.rank;
}
