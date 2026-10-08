// ===================================================================
// Recap markdown renderer
// ===================================================================
//
// Wraps `react-markdown` with custom components so the Python-emitted
// recap markdown reads as a styled report rather than raw markdown.
// What's special here:
//
//   1. `<h3>` sections (Standings, Biggest blowout, All games, Trades,
//      …) render with the app's accent-bar pattern so they look like
//      every other section header on the site.
//   2. The standings fenced code block (` # Team W-L-T PF PA`) is
//      parsed and rendered as an HTML table with each row's left
//      border tinted in that team's owner color.
//   3. Lines that match a `**Team A** <score> — <score> **Team B**`
//      shape are rendered as compact matchup rows with team-color
//      chips. Works for both `<p>` (biggest blowout / closest game)
//      and `<li>` (All games bullets).
//   4. Lines like `**Team** — <score>` (highest / lowest scorer)
//      become stat callouts.
//
// Non-matching content falls through to react-markdown's defaults,
// so adding new sections to the Python script doesn't require code
// changes here.
//
// Styling lives in `Recaps.module.css`.

import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Recaps.module.css';

export interface RecapMarkdownProps {
  markdown: string;
  /** Lowercase team-name → CSS color-var reference. Lookup is case-insensitive. */
  teamColors: ReadonlyMap<string, string>;
}

export function RecapMarkdown({ markdown, teamColors }: RecapMarkdownProps) {
  const components: Components = {
    h2: ({ children }) => <h2 className={styles.recapTitle}>{children}</h2>,

    h3: ({ children }) => (
      <div className={styles.recapSectionHeader}>
        <span className={styles.recapSectionBar} aria-hidden="true" />
        <h3 className={styles.recapSectionTitle}>{children}</h3>
      </div>
    ),

    // `_italic_` on top of the title is a kicker ("Gaming Disability — through week N").
    em: ({ children }) => <em className={styles.recapKicker}>{children}</em>,

    // Horizontal rules in the generated markdown are purely visual spacers
    // between sections; the custom section headers now carry that
    // separation, so hide them to avoid double rules.
    hr: () => null,

    // Fenced code blocks: detect the standings table shape; otherwise
    // fall back to a default styled pre.
    pre: (props) => {
      const inner = extractCodeContent(props.children);
      if (inner && isStandingsBlock(inner)) {
        return <StandingsTable raw={inner} teamColors={teamColors} />;
      }
      return <pre className={styles.recapPre}>{props.children}</pre>;
    },

    p: ({ children }) => {
      const match = matchMatchupLine(children);
      if (match) return <MatchupRow match={match} teamColors={teamColors} />;
      const scorer = matchScorerLine(children);
      if (scorer) return <ScorerCallout scorer={scorer} teamColors={teamColors} />;
      return <p className={styles.recapParagraph}>{children}</p>;
    },

    li: ({ children }) => {
      const match = matchMatchupLine(children);
      if (match) {
        return (
          <li className={styles.recapGameItem}>
            <MatchupRow match={match} teamColors={teamColors} />
          </li>
        );
      }
      return <li className={styles.recapBullet}>{children}</li>;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}

// -------------------------------------------------------------------
// Standings table
// -------------------------------------------------------------------

interface StandingsRow {
  rank: string;
  team: string;
  wlt: string;
  pf: string;
  pa: string;
}

function isStandingsBlock(raw: string): boolean {
  // Header looks like "  #  Team  …  W-L-T  PF  PA". Match loosely.
  const first = raw.split('\n', 1)[0] ?? '';
  return /#\s+Team\b/.test(first) && /W-L-T/.test(first);
}

function parseStandings(raw: string): StandingsRow[] | null {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = lines[0]!;
  // Find column start positions from the header so we can slice each row
  // by width — the Python script writes a fixed-width table. Fall back
  // to whitespace splitting if the header shape is unexpected.
  const cols = ['#', 'Team', 'W-L-T', 'PF', 'PA'];
  const starts: number[] = [];
  let cursor = 0;
  for (const label of cols) {
    const idx = header.indexOf(label, cursor);
    if (idx < 0) return null;
    starts.push(idx);
    cursor = idx + label.length;
  }
  starts.push(header.length + 200); // sentinel for the last slice

  const rows: StandingsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const [a, b, c, d, e] = cols.map((_, j) => line.slice(starts[j]!, starts[j + 1]!).trim());
    if (!a || !b) continue;
    rows.push({ rank: a, team: b, wlt: c ?? '', pf: d ?? '', pa: e ?? '' });
  }
  return rows;
}

interface StandingsTableProps {
  raw: string;
  teamColors: ReadonlyMap<string, string>;
}

function StandingsTable({ raw, teamColors }: StandingsTableProps) {
  const rows = parseStandings(raw);
  if (!rows) return <pre className={styles.recapPre}>{raw}</pre>;

  return (
    <div className={styles.standingsWrap}>
      <table className={styles.standingsTable}>
        <thead>
          <tr>
            <th scope="col" className={styles.standingsRank}>
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className={styles.standingsNum}>
              W-L-T
            </th>
            <th scope="col" className={styles.standingsNum}>
              PF
            </th>
            <th scope="col" className={styles.standingsNum}>
              PA
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const color = teamColors.get(row.team.toLowerCase()) ?? 'var(--border)';
            return (
              <tr key={row.rank + row.team} style={{ borderLeftColor: color }}>
                <td className={styles.standingsRank}>{row.rank}</td>
                <td>
                  <span className={styles.standingsTeamDot} style={{ background: color }} />
                  {row.team}
                </td>
                <td className={styles.standingsNum}>{row.wlt}</td>
                <td className={styles.standingsNum}>{row.pf}</td>
                <td className={styles.standingsNum}>{row.pa}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------------
// Matchup detection — "**Team A** <score> — <score> **Team B** (opt. tail)"
// -------------------------------------------------------------------

interface MatchupMatch {
  teamA: string;
  scoreA: string;
  teamB: string;
  scoreB: string;
  tail?: string;
}

/** Attempts to parse `<strong>A</strong> X.XX — Y.YY <strong>B</strong> (tail?)`. */
function matchMatchupLine(children: ReactNode): MatchupMatch | null {
  const parts = Children.toArray(children);
  if (parts.length < 3) return null;

  const first = parts[0];
  const second = parts[1];
  const third = parts[2];

  const teamA = extractStrong(first);
  const teamB = extractStrong(third);
  if (!teamA || !teamB) return null;

  const mid = typeof second === 'string' ? second : null;
  if (!mid) return null;
  // Expected: " <score> — <score> "
  const m = /^\s*([\d.]+)\s+(?:—|-)\s+([\d.]+)\s*$/.exec(mid);
  if (!m) return null;

  // Optional trailing text like " (margin X.XX)" after the second strong.
  let tail: string | undefined;
  if (parts.length >= 4) {
    const rest = parts.slice(3).map((p) => (typeof p === 'string' ? p : '')).join('').trim();
    if (rest) tail = rest;
  }

  return { teamA, scoreA: m[1]!, teamB, scoreB: m[2]!, tail };
}

interface MatchupRowProps {
  match: MatchupMatch;
  teamColors: ReadonlyMap<string, string>;
}

function MatchupRow({ match, teamColors }: MatchupRowProps) {
  const colorA = teamColors.get(match.teamA.toLowerCase()) ?? 'var(--border)';
  const colorB = teamColors.get(match.teamB.toLowerCase()) ?? 'var(--border)';
  const aWon = parseFloat(match.scoreA) >= parseFloat(match.scoreB);

  return (
    <div className={styles.matchupRow}>
      <div className={`${styles.matchupSide} ${aWon ? styles.matchupWin : ''}`}>
        <span className={styles.matchupDot} style={{ background: colorA }} aria-hidden="true" />
        <span className={styles.matchupTeam}>{match.teamA}</span>
        <span className={styles.matchupScore}>{match.scoreA}</span>
      </div>
      <span className={styles.matchupDash} aria-hidden="true">
        —
      </span>
      <div className={`${styles.matchupSide} ${styles.matchupSideRight} ${!aWon ? styles.matchupWin : ''}`}>
        <span className={styles.matchupScore}>{match.scoreB}</span>
        <span className={styles.matchupTeam}>{match.teamB}</span>
        <span className={styles.matchupDot} style={{ background: colorB }} aria-hidden="true" />
      </div>
      {match.tail && <span className={styles.matchupTail}>{match.tail}</span>}
    </div>
  );
}

// -------------------------------------------------------------------
// Highest / lowest scorer callout — "**Team** — <score>"
// -------------------------------------------------------------------

interface ScorerMatch {
  team: string;
  score: string;
}

function matchScorerLine(children: ReactNode): ScorerMatch | null {
  const parts = Children.toArray(children);
  if (parts.length < 2) return null;
  const team = extractStrong(parts[0]);
  if (!team) return null;
  const trail = typeof parts[1] === 'string' ? parts[1] : null;
  if (!trail) return null;
  const m = /^\s*(?:—|-)\s+([\d.]+)\s*$/.exec(trail);
  if (!m) return null;
  return { team, score: m[1]! };
}

interface ScorerCalloutProps {
  scorer: ScorerMatch;
  teamColors: ReadonlyMap<string, string>;
}

function ScorerCallout({ scorer, teamColors }: ScorerCalloutProps) {
  const color = teamColors.get(scorer.team.toLowerCase()) ?? 'var(--border)';
  return (
    <div className={styles.scorerCallout} style={{ borderLeftColor: color }}>
      <span className={styles.scorerDot} style={{ background: color }} aria-hidden="true" />
      <span className={styles.scorerTeam}>{scorer.team}</span>
      <span className={styles.scorerScore}>{scorer.score}</span>
    </div>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Returns the text content if the node is a `<strong>` element wrapping a string. */
function extractStrong(node: unknown): string | null {
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type !== 'strong') return null;
  const kids = Children.toArray(el.props.children ?? []);
  if (kids.length !== 1) return null;
  return typeof kids[0] === 'string' ? kids[0] : null;
}

/**
 * `react-markdown` renders a fenced code block as `<pre><code>…</code></pre>`.
 * Pull the inner text so we can inspect the standings-table shape.
 */
function extractCodeContent(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  for (const part of parts) {
    if (!isValidElement(part)) continue;
    const el = part as ReactElement<{ children?: ReactNode }>;
    if (el.type !== 'code') continue;
    const inner = Children.toArray(el.props.children ?? [])
      .map((c) => (typeof c === 'string' ? c : ''))
      .join('');
    return inner;
  }
  return null;
}
