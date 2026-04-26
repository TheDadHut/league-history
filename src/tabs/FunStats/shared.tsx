// ===================================================================
// Shared helpers — Fun Stats tab
// ===================================================================
//
// Tab-local helper: rankClass (gold/silver/bronze tinting for the top
// three rows). The TeamChip + TeamChipCompact + OwnerColorStyle
// exports were lifted to `src/lib/components/TeamChip` once the
// third tab to consume them landed; we re-export from this module so
// the existing import sites in the Fun Stats tab keep working without
// churn.

import { TeamChip, TeamChipCompact, type OwnerColorStyle } from '../../lib/components/TeamChip';
import styles from './FunStats.module.css';

// Re-export so existing `from './shared'` imports keep working without
// touching every consumer. New code should reach the shared module
// directly.
export { TeamChip, TeamChipCompact };
export type { OwnerColorStyle };

/** Gold/silver/bronze tinting for the top three rows; default for the rest. */
// eslint-disable-next-line react-refresh/only-export-components -- helper colocated with the chip re-exports above; splitting into its own file would scatter the directory for a one-line utility.
export function rankClass(idx: number): string {
  if (idx === 0) return `${styles.rank} ${styles.rank1}`;
  if (idx === 1) return `${styles.rank} ${styles.rank2}`;
  if (idx === 2) return `${styles.rank} ${styles.rank3}`;
  return styles.rank;
}
