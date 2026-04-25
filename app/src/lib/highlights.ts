// ===================================================================
// Manually curated season highlights — fetcher + normalizer
// ===================================================================
//
// Mirrors the legacy `loadHighlights()` + `normalizeHighlight()`
// (index.html lines 651-688). The on-disk JSON supports three
// per-entry shapes (string, `{ text, sub }`, `{ text, children[] }`)
// that all normalize to a single recursive `{ text, children }` form.
//
// Voice + content rules live in `docs/glossary.md`; this file only
// handles fetching + shape coercion.
//
// File location: `app/public/highlights.json`. Vite serves the
// `public/` tree verbatim at the app root, so the runtime fetch path
// resolves to `/<base>/highlights.json`. The cache-busting query
// string is preserved from the legacy site — the file is hand-edited
// frequently and a stale CDN response would silently hide new entries.

/**
 * Recursive normalized shape. Every highlight — top-level or nested —
 * looks the same to renderers, which lets the React component use one
 * recursive component without branching on shape.
 */
export interface NormalizedHighlight {
  text: string;
  children: NormalizedHighlight[];
}

/**
 * Map of season → ordered list of highlights for that season. Same key
 * shape as the legacy `HIGHLIGHTS` object: the season string ("2024",
 * "2025", …). Seasons without entries are simply absent from the map.
 */
export type Highlights = Record<string, NormalizedHighlight[]>;

/**
 * Recursively normalize one raw highlight entry into the `{ text,
 * children }` shape. Mirrors the legacy `normalizeHighlight()` (lines
 * 663-675):
 *
 *   - A bare string becomes `{ text, children: [] }`.
 *   - `{ text, sub: string }` becomes one child wrapping the sub.
 *   - `{ text, sub: array }` becomes one child per sub item.
 *   - `{ text, children: [...] }` is the canonical form going forward.
 *   - `{ text, children, sub }` mixes both — children land first, then
 *     subs, mirroring the legacy ordering.
 *
 * Anything that isn't a string or object falls through to
 * `{ text: String(item), children: [] }` so a malformed entry shows up
 * visibly in the UI rather than silently disappearing.
 */
export function normalizeHighlight(item: unknown): NormalizedHighlight {
  if (typeof item === 'string') return { text: item, children: [] };
  if (!item || typeof item !== 'object') {
    return { text: String(item), children: [] };
  }

  // Narrow `item` to an indexable record so we can read its fields
  // without leaking `any` into the rest of the function.
  const obj = item as Record<string, unknown>;
  const children: NormalizedHighlight[] = [];

  if (Array.isArray(obj.children)) {
    for (const c of obj.children) children.push(normalizeHighlight(c));
  }

  if (obj.sub != null) {
    if (Array.isArray(obj.sub)) {
      for (const s of obj.sub) children.push(normalizeHighlight(s));
    } else {
      children.push(normalizeHighlight(obj.sub));
    }
  }

  const text = typeof obj.text === 'string' ? obj.text : '';
  return { text, children };
}

/**
 * Fetch + normalize the manually-curated highlights file.
 *
 * The legacy site silently swallows fetch / parse errors and continues
 * (the highlights panel is optional: a missing file just means the
 * panel doesn't render). We mirror that by returning an empty
 * `Highlights` map on any failure rather than throwing — a transient
 * network blip on a non-critical endpoint shouldn't surface a
 * page-level error overlay.
 *
 * Cache-busting via `?t=${Date.now()}` matches the legacy behavior
 * (line 679); the file is hand-edited and stale CDN responses are
 * routinely the source of "where's my new highlight" reports.
 *
 * Underscore-prefixed keys (e.g. the existing `_comment` key in
 * `highlights.json`) are skipped — those exist as authoring notes for
 * humans, not data for the renderer.
 */
export async function loadHighlights(): Promise<Highlights> {
  try {
    // The file lives at `<base>/highlights.json`. Vite resolves
    // relative URLs against the document base by default, so a
    // bare `highlights.json` path works under both `/` (dev) and
    // `/league-history/` (prod) without conditional logic here.
    const url = `${import.meta.env.BASE_URL}highlights.json?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const raw = (await res.json()) as Record<string, unknown>;
    const out: Highlights = {};
    for (const [season, entries] of Object.entries(raw)) {
      if (season.startsWith('_')) continue;
      if (!Array.isArray(entries)) continue;
      out[season] = entries.map(normalizeHighlight);
    }
    return out;
  } catch (err) {
    // Don't surface to the user — the panel is optional.
    console.warn('Failed to load highlights.json — skipping highlights panel.', err);
    return {};
  }
}
