// ===================================================================
// CONFIG — update each new season
// ===================================================================
//
// Ported verbatim from the legacy index.html (Phase 2 of the migration).
// Keep these in sync with the legacy file until Phase 5 retires it.

export const API_BASE = 'https://api.sleeper.app/v1';

export const CURRENT_LEAGUE_ID = '1389752262355595264';

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

// Same-person account merges. When an owner replaces their Sleeper account
// (lost login, new handle, etc.) their new display_name produces a new owner
// in the index unless we tell the key resolver otherwise. Map the OLD
// (lower-cased) handle to the CANONICAL (lower-cased) handle you want to
// collapse it onto; `ownerKey()` applies this before returning.
//
// The canonical handle wins — its display name is what shows up site-wide,
// and all seasons the person participated in collapse into one owner row in
// All-Time Standings, H2H, Owner Stats, etc. Keep aliases pointing one hop
// deep (A → B, not A → B → C); multi-hop resolution is not supported.
//
// Add an entry when the SAME person appears under a different Sleeper account
// across seasons. Do NOT use this to merge different owners who share a slot
// (that's a roster/franchise concept, not an identity one).
export const OWNER_ALIASES: Record<string, string> = {
  // Michael lost access to BigBickBaniel after 2025 and came back as
  // FriendsMexicanDog for 2026, same roster slot (3). Same person.
  bigbickbaniel: 'friendsmexicandog',
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
