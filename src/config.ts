// ===================================================================
// CONFIG — update each new season
// ===================================================================
//
// Ported verbatim from the legacy index.html (Phase 2 of the migration).
// Keep these in sync with the legacy file until Phase 5 retires it.

export const API_BASE = 'https://api.sleeper.app/v1';

export const CURRENT_LEAGUE_ID = '1226697048753983488';

// Owner color preferences. Match by substring — if a Sleeper display_name CONTAINS any
// of these keys (case-insensitive), that owner is preferred to get that color.
// Uniqueness is guaranteed by the consumer: every owner gets a different color. If two
// owners both match the same preferred color, only the first keeps it; the other falls
// through to the palette.
//
// Add or remove entries freely — the only requirement is that every color listed below
// must be defined as a CSS variable in the app's stylesheet.
export const OWNER_COLORS: Record<string, string> = {
  alex: 'var(--c-alex)',
  henny: 'var(--c-henny)',
  jason: 'var(--c-jason)',
  jose: 'var(--c-jose)',
  justin: 'var(--c-justin)',
  liam: 'var(--c-liam)',
  michael: 'var(--c-michael)',
  mike: 'var(--c-michael)', // same color if Michael's handle has "Mike" in it
  nick: 'var(--c-nick)',
};

// Palette used to fill in colors for any owners not matched above.
// Every owner is guaranteed a unique entry until this palette runs out (12 colors).
export const FALLBACK_PALETTE: readonly string[] = [
  'var(--c-p0)',
  'var(--c-p1)',
  'var(--c-p2)',
  'var(--c-p3)',
  'var(--c-p4)',
  'var(--c-p5)',
  'var(--c-p6)',
  'var(--c-p7)',
  'var(--c-p8)',
  'var(--c-p9)',
  'var(--c-p10)',
  'var(--c-p11)',
] as const;
