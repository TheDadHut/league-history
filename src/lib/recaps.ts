// ===================================================================
// Weekly recap loader
// ===================================================================
//
// The Python workflow in `.github/workflows/weekly_recap.yml` writes a
// markdown file per completed week to `recaps/<season>/week-<NN>.md`
// (opened as a PR; see `tools/weekly_recap.py`). This module picks up
// whatever has been committed by that workflow and surfaces it to the
// Recaps tab.
//
// We use Vite's `import.meta.glob` with `?raw` so each recap's full
// markdown content is inlined into the JS bundle at build time. No
// runtime fetch and no manifest file to maintain — committing a new
// recap on main (via the workflow's PR → merge) and redeploying is all
// it takes to make it visible. The volume is small enough (~5 KB per
// recap × ~17 weeks × a handful of seasons) that bundling it is cheaper
// than extra network round-trips.

/**
 * Map of (season, week) → raw markdown. Keys are strings `"${season}-w${week}"`
 * so callers can look up with `.get()`. Weeks are canonicalized to 1-based
 * integers; the on-disk filename `week-05.md` resolves to week `5`.
 */
export type RecapIndex = ReadonlyMap<string, string>;

/** Key format used inside `RecapIndex`. */
export function recapKey(season: string, week: number): string {
  return `${season}-w${week}`;
}

// Bundled at build time. The pattern matches `recaps/<season>/week-<NN>.md`
// anywhere under the repo root (relative to this file). Vite rewrites this to
// a static object of `{ path: content }` at build time; dev mode behaves the
// same via HMR.
const RAW_RECAPS = import.meta.glob('../../recaps/**/week-*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Build the index once at module load. Paths look like
// `../../recaps/2026/week-05.md`; we parse the directory as the season and
// the numeric suffix as the week.
const RECAP_PATH_RE = /\/recaps\/([^/]+)\/week-0*(\d+)\.md$/;

function buildIndex(): RecapIndex {
  const out = new Map<string, string>();
  for (const [path, content] of Object.entries(RAW_RECAPS)) {
    const m = RECAP_PATH_RE.exec(path);
    if (!m) continue;
    const season = m[1];
    const week = Number.parseInt(m[2] ?? '', 10);
    if (!season || !Number.isFinite(week)) continue;
    out.set(recapKey(season, week), content);
  }
  return out;
}

const RECAPS = buildIndex();

/** Returns the recap markdown for a given (season, week), or `null` if none exists. */
export function getRecap(season: string, week: number): string | null {
  return RECAPS.get(recapKey(season, week)) ?? null;
}

/** All recap keys currently committed. Primarily for debugging / tests. */
export function listRecaps(): string[] {
  return [...RECAPS.keys()].sort();
}
