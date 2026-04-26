// ===================================================================
// SeasonHighlights — manually-curated season recap entries
// ===================================================================
//
// Mirrors the Season Highlights branch of the legacy `renderSeason()`
// (index.html lines 3482-3494). The data shape is recursive:
//
//   { text, children: [{ text, children: [...] }, ...] }
//
// Every level after the top renders inside `.highlight-children` →
// `.highlight-sub`, with three CSS tiers for nested depth (border
// color + size + italic). The CSS handles the nesting cascade; React
// only needs to recurse on `children`.

import type { NormalizedHighlight } from '../../lib/highlights';
import styles from './Seasons.module.css';

interface SeasonHighlightsProps {
  highlights: NormalizedHighlight[];
}

export default function SeasonHighlights({ highlights }: SeasonHighlightsProps) {
  if (highlights.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="seasons-highlights-heading">
      <header className={styles.sectionHeader}>
        <span className={styles.sectionBar} aria-hidden="true" />
        <h2 id="seasons-highlights-heading" className={styles.sectionTitle}>
          Season Highlights
        </h2>
      </header>

      <div className={styles.highlights}>
        {highlights.map((h, i) => (
          // Top-level entries get the numbered `.highlight-item` class;
          // children are rendered separately by `HighlightChildren` so
          // they pick up the indented `.highlight-sub` cascade.
          <div key={i} className={styles.highlightItem}>
            {h.text}
            <HighlightChildren items={h.children} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HighlightChildren({ items }: { items: NormalizedHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.highlightChildren}>
      {items.map((c, i) => (
        <div key={i} className={styles.highlightSub}>
          {c.text}
          <HighlightChildren items={c.children} />
        </div>
      ))}
    </div>
  );
}
