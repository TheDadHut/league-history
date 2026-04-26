// ===================================================================
// Debug overlay — Ctrl+Shift+D
// ===================================================================
//
// Mirrors the legacy debug overlay (index.html lines 233-273 for CSS,
// 608-618 for markup, 3510-3543 for the keydown handler). The overlay
// lists every owner with the actual resolved hex value of their color
// so we can verify the substring rules in OWNER_COLORS and the
// fallback-palette assignments visually.
//
// Why mount at the provider edge: the listener is global (Ctrl+Shift+D
// from anywhere in the app) and the data it needs (the owner index)
// lives in `LeagueDataProvider`. Mounting one instance of this
// component as a sibling-of-tabs inside the provider keeps both
// concerns colocated without leaking debug state into individual tabs.
//
// Hex resolution trick: CSS variables (`var(--c-alex)` etc.) hold the
// owner colors; we can't read the resolved hex off the variable
// directly. We render a hidden `<span>` per row with `style.color` set
// to the variable, then read `getComputedStyle(...).color` once the
// overlay opens — same approach the legacy code used (lines 3519-3524).
// Without it the "Hex" column would just echo `var(--c-alex)` for
// every row, which is exactly what we don't want when the whole point
// of the panel is to confirm the variable resolved to a unique value.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLeagueData } from '../leagueData';
import { explicitColorFor, type Owner } from '../owners';
import styles from './DebugOverlay.module.css';

// Module-scope guard so the console announcement fires exactly once per
// page load. A per-instance `useRef` would re-init when StrictMode
// unmounts/remounts the component on first mount, double-firing the log.
// Hoisting the flag up here ties it to the module's lifetime instead of
// the component's, matching the legacy code's "log once when the owner
// index resolves" semantics. (HMR re-evaluates the module and resets
// this in dev, which is fine — a fresh module is conceptually a fresh
// page load.)
let consoleAnnounced = false;

interface OwnerDebugRow {
  key: string;
  displayName: string;
  /** CSS color value (a `var(--…)` reference). */
  color: string;
  /** First matching color from OWNER_COLORS by substring, or '(none)'. */
  explicitMatch: string;
}

/**
 * Pull owner debug rows out of context state. Returns `null` until the
 * provider has surfaced an owner index — the overlay simply won't open
 * before that.
 */
function useDebugOwners(): OwnerDebugRow[] | null {
  const data = useLeagueData();
  if (data.status === 'loading' || data.status === 'error') return null;
  const owners: Owner[] = Object.values(data.ownerIndex).sort((a, b) => a.key.localeCompare(b.key));
  return owners.map((o) => ({
    key: o.key,
    displayName: o.displayName,
    color: o.color,
    explicitMatch: explicitColorFor(o.key) ?? '(none)',
  }));
}

interface OverlayBodyProps {
  rows: OwnerDebugRow[];
  onClose: () => void;
}

/**
 * Renders the actual panel and resolves each owner color's `var(--…)`
 * reference to its computed hex. The hidden `<span>`s used for
 * resolution are rendered into the DOM, then read in a layout effect,
 * so the hex strings are populated before the user sees the panel.
 */
function OverlayBody({ rows, onClose }: OverlayBodyProps) {
  const probeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [hexes, setHexes] = useState<string[]>(() => rows.map(() => ''));

  useLayoutEffect(() => {
    setHexes(
      rows.map((_, i) => {
        const probe = probeRefs.current[i];
        if (!probe) return '';
        return getComputedStyle(probe).color;
      }),
    );
    // Re-run if the owner list itself changes (e.g. provider re-hydrates
    // mid-session). The rows array reference is stable across opens
    // unless the underlying owner index changed, so this is cheap.
    return () => {
      // Drop ref entries on cleanup so a shorter rows list doesn't leave
      // stale pointers to detached probe nodes hanging around in the
      // ref array. The ref callbacks below repopulate this on the next
      // render.
      probeRefs.current = [];
    };
  }, [rows]);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Owner color debug">
      <button type="button" className={styles.close} onClick={onClose}>
        Close
      </button>
      <div className={styles.inner}>
        <h3 className={styles.title}>Color Debug · Owner Assignments</h3>
        <div>
          <div className={`${styles.row} ${styles.header}`}>
            <div>Color</div>
            <div>Key</div>
            <div>Display Name</div>
            <div>Match Rule</div>
            <div>Hex</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className={styles.row}>
              <div className={styles.swatch} style={{ background: r.color }} />
              <div>{r.key}</div>
              <div>{r.displayName}</div>
              <div className={styles.match}>{r.explicitMatch}</div>
              <div className={styles.hex}>{hexes[i] ?? ''}</div>
              {/* Hidden probe — its computed color resolves the CSS var
               * to a hex/rgb string the layout effect above reads. */}
              <span
                ref={(el) => {
                  probeRefs.current[i] = el;
                }}
                style={{ color: r.color, display: 'none' }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
        <div className={styles.note}>
          Keys are lowercased Sleeper display_names. &ldquo;Match Rule&rdquo; shows which
          OWNER_COLORS rule (if any) matched by substring. If you see a color here that looks too
          similar to another, the CSS variable is correct — check the actual hex value shown. Press
          Ctrl+Shift+D to close.
        </div>
      </div>
    </div>
  );
}

/**
 * Top-level overlay. Owns the visibility state and the global keydown
 * listener; renders nothing while closed. Mounted once inside the
 * `LeagueDataProvider` so it can read the owner index without each
 * consumer caring about it.
 */
export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const rows = useDebugOwners();

  // Console announcement, fired once per page load when the owner
  // index lands. Mirrors the legacy log line at index.html line 839 so
  // devs landing in the new app discover the shortcut the same way
  // they did before. Guard lives at module scope (see top of file) so
  // StrictMode's double-mount in dev doesn't fire the log twice.
  useEffect(() => {
    if (consoleAnnounced) return;
    if (!rows) return;
    consoleAnnounced = true;
    // Intentional dev-discovery line; no-console isn't enabled in this project.
    console.log(
      '%c[GDL] Owner colors assigned. Press Ctrl+Shift+D to inspect.',
      'color:#ffcc00;font-weight:bold',
    );
    // Mirrors the legacy console.table for parity.
    console.table(rows);
  }, [rows]);

  // Global keyboard shortcut — Ctrl+Shift+D toggles the panel. Attached
  // at document level so it fires regardless of which tab has focus.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
    };
  }, []);

  if (!open || !rows) return null;
  return <OverlayBody rows={rows} onClose={() => setOpen(false)} />;
}
