// ===================================================================
// Shared TeamChip component
// ===================================================================
//
// Color dot + team name + (optional) dim owner sub-line. Used by every
// tab that surfaces an owner row: Records, Seasons, Fun Stats, Trades,
// and (future) Owner Stats / Luck & Streaks.
//
// Lifted from the per-tab `shared.tsx` files (and the inline copy that
// lived inside `Records.tsx`) once the third tab to consume it —
// Trades — went in. The visual contract is identical across every
// caller: each tab now imports this module instead of redefining the
// same component three different ways.
//
// `--owner-color` is a CSS custom property; strict TS requires the
// `--*` form to be declared explicitly, so we attach it through the
// typed `OwnerColorStyle` alias below.

import type { CSSProperties } from 'react';
import styles from './TeamChip.module.css';

/**
 * CSS custom property used to inject a per-row owner color. Strict
 * TypeScript rejects raw `--*` keys on `CSSProperties`, so callers
 * spread through this alias instead of casting.
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

interface TeamChipCompactProps {
  name: string;
  color: string;
}

/** Compact team chip — color dot + team name only (no owner sub). */
export function TeamChipCompact({ name, color }: TeamChipCompactProps) {
  const style: OwnerColorStyle = { '--owner-color': color };
  return (
    <span className={styles.teamChip} style={style}>
      <span className={styles.teamDot} aria-hidden="true" />
      <span className={styles.teamName}>{name}</span>
    </span>
  );
}
