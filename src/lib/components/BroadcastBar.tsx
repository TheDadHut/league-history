// ===================================================================
// Broadcast ticker bar
// ===================================================================
//
// Mirrors the legacy red broadcast bar (index.html line 319 markup,
// lines 71-83 CSS, lines 1872-1898 `renderTicker()`). The bar is
// always rendered — even during loading and error states — so the
// red strip above the header never disappears. Content varies by
// state:
//
//   - `loading` / `core-ready`: legacy "LOADING LIVE LEAGUE DATA"
//     placeholder. We don't have champions, matchups, or standings
//     yet at these tiers (`core-ready` only carries `leagues` and
//     `ownerIndex`, no per-season details).
//   - `seasons-ready` / `ready`: real ticker items from
//     `selectTickerItems`. The same items are concatenated twice in
//     the JSX so the CSS marquee loops seamlessly without a visible
//     gap on each cycle (matches the legacy `html + html`).
//   - `error`: same loading placeholder, since the bar's job is to
//     keep the visual chrome consistent — the page-level error UI
//     surfaces inside `<main>` already.

import { Fragment, useMemo } from 'react';
import { useLeagueData } from '../leagueData';
import { selectTickerItems } from '../stats/overview';
import styles from './BroadcastBar.module.css';

const LOADING_PLACEHOLDER = 'LOADING LIVE LEAGUE DATA';

export function BroadcastBar() {
  const state = useLeagueData();

  // Compute ticker items only when we have the inputs we need —
  // `seasons-ready` is the earliest tier with both `seasons` and
  // `ownerIndex`. The hook still has to be called unconditionally,
  // so the empty-array fallback covers loading / error / core-ready.
  // Narrow to the specific fields we read so the memo doesn't re-run
  // when the provider transitions tier (e.g., `seasons-ready → ready`)
  // and produces a fresh `state` object reference with the same data.
  const seasons =
    state.status === 'seasons-ready' || state.status === 'ready' ? state.seasons : null;
  const ownerIndex =
    state.status === 'core-ready' || state.status === 'seasons-ready' || state.status === 'ready'
      ? state.ownerIndex
      : null;
  const items = useMemo<string[]>(() => {
    if (!seasons || !ownerIndex) return [];
    return selectTickerItems(seasons, ownerIndex);
  }, [seasons, ownerIndex]);

  // When real data isn't ready yet (or the items list came back
  // empty), fall back to the legacy placeholder rather than rendering
  // an empty marquee. An empty `<div class="ticker">` would still
  // animate but show nothing, which is worse than an explicit "loading"
  // line for users who notice the bar is there but blank.
  const showPlaceholder = items.length === 0;

  // The legacy renderer concatenates `html + html` to make the
  // marquee loop seamlessly — by the time the first copy scrolls
  // off-screen-left, the duplicate is occupying the same visual
  // space, so there's never a gap. Do the same here by laying out
  // the items twice. Each item is rendered as a pair of sibling
  // spans (text + dot) so `.ticker span { margin: 0 30px }` applies
  // uniformly to both, matching the legacy spacing.
  return (
    <div className={styles.broadcastBar} aria-hidden="true">
      <div className={styles.ticker}>
        {showPlaceholder ? (
          <span>{LOADING_PLACEHOLDER}</span>
        ) : (
          <>
            {items.map((text, idx) => (
              <Fragment key={`a-${idx}`}>
                <span>{text}</span>
                <span className={styles.dot}>●</span>
              </Fragment>
            ))}
            {items.map((text, idx) => (
              <Fragment key={`b-${idx}`}>
                <span>{text}</span>
                <span className={styles.dot}>●</span>
              </Fragment>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
