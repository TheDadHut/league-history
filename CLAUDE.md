# CLAUDE.md

Project orientation for any Claude session working in this repo.

## What this is

A single-page, zero-build fantasy football history site for the **Gaming Disability League** (GDL). All league data is pulled live from the [Sleeper API](https://docs.sleeper.com/) on page load — champions, matchups, rosters, drafts, trades, and transactions are walked backwards through every previous season via `previous_league_id`.

## Current state — read this first

The repo is **mid-migration** from a single hand-edited `index.html` to a modern Vite + React 19 + TypeScript app. Where you are in the migration determines what code you should be touching:

- **Pre-migration / today:** the live site is `index.html` at the repo root. Everything (HTML, CSS, JS, all 9 tabs) lives in that one file.
- **Phases 1–4 (parallel period):** legacy `index.html` keeps serving live; new app being built in `app/` (Vite). Run the new app with `cd app && npm run dev` (port 5173). Run the legacy site with `python3 -m http.server 8000` from the root.
- **Phase 5+:** legacy `index.html` is gone, the React app in `app/` (or flattened to root) is the live site.

The full migration plan, including phases, decisions, agentic dev pipeline, and scheduled agents, is in **[`docs/migration-plan.md`](docs/migration-plan.md)**. **Always follow that plan.** When in doubt about how to do something, check it first.

## Files

| File / dir | Purpose |
| --- | --- |
| `index.html` | Legacy single-file app. ~3.6k lines. HTML at top, CSS in `<style>`, all logic in one `<script>`. |
| `highlights.json` | Manually curated season-by-season highlights. Loaded at runtime. Three nested formats supported (see below). |
| `docs/migration-plan.md` | Source of truth for the migration. |
| `docs/glossary.md` | League lore: owner names, jargon, year-by-year context. **Required reading** for any content/stats agent. |
| `app/` *(post-Phase-1)* | New Vite + React 19 + TS app. |
| `.github/` | PR template; workflows added incrementally per the migration plan. |

### `index.html` landmarks (until retired)

| Lines | Section |
| --- | --- |
| 332–343 | Tab nav (`Overview`, `Records`, `Head-to-Head`, `Seasons`, `Fun Stats`, `Luck & Streaks`, `Trades`, `Owner Stats`, `Founders`). |
| 624 | `CURRENT_LEAGUE_ID` — bump at the start of each new season. |
| 632–642 | `OWNER_COLORS` — substring-matched display name → CSS variable. |
| 645–649 | `FALLBACK_PALETTE` — 12 hues for owners without an explicit color. |
| 690+ | API + utility helpers. |
| 785+ | Owner index, all-time stats, champions, toilet bowl, player stats, bench stats, draft grades, waiver grades, trades. Each `build*()` is a tab's data layer. |
| 2158+ | Render layer — DOM construction for each tab. |

## Sleeper API conventions

- **No auth required.** Public endpoints, served from `https://api.sleeper.app/v1`.
- **No enforced rate limit**, but be polite: cache aggressively. The player DB (~5MB) is cached in `sessionStorage` — don't refetch within a session.
- **History walk:** start at `CURRENT_LEAGUE_ID`, follow `league.previous_league_id` until null. Every prior season is reachable this way.
- **No webhooks / no realtime.** Data is pulled fresh on every page load. The browser is the only client.

## `highlights.json` formats

Three shapes, all mixable within the same season array. Newest entries go first.

```json
{
  "2024": [
    "A plain string becomes one highlight.",
    { "text": "An object with text.", "sub": "Adds one indented sub-line." },
    {
      "text": "Children can nest arbitrarily deep.",
      "children": [
        { "text": "First child." },
        { "text": "Second child.", "children": [{ "text": "Grandchild." }] }
      ]
    }
  ]
}
```

The legacy `sub` form is normalized into `children[]` at runtime — prefer `children` when writing new entries.

**Voice:** terse, irreverent, league-insider. See existing entries in `highlights.json` for tone, and `docs/glossary.md` for jargon and owner identities.

## Testing reality

There is no test suite. Verification is by browser:

1. Run the legacy site (`python3 -m http.server 8000` from root) or the new app (`cd app && npm run dev`).
2. Click through the affected tab(s).
3. For history-walk changes, spot-check at least 2 prior seasons.
4. For UI changes, check both desktop and **mobile** — current site is usable on phones and that parity is non-negotiable.
5. Console must be clean (no Sleeper API failures, no React warnings).

If you can't actually open the page (no display), say so explicitly rather than claiming the change works.

## Conventions

- **Don't hand-edit `index.html` after Phase 1.** Build new features in `app/`.
- **`highlights.json` is a code path** — bad JSON breaks the live site. The pre-commit hook (planned) and CI workflow validate it; locally, `python -m json.tool highlights.json` is the quick check.
- **Agent-authored PRs look human.** No `Co-Authored-By` lines, no agent emojis, no labels announcing the source. Reviewing should feel like reviewing your own work.
- **Don't commit on `main` directly.** Open a PR, even for tiny changes. The PR template at `.github/PULL_REQUEST_TEMPLATE.md` will be auto-populated.

## Agent pipeline

Skills, subagents, hooks, and the Sleeper MCP server are all defined in `docs/migration-plan.md`. The **`/ask`** skill (orchestrator) is the primary entry point — use it for anything fuzzy. Direct skills (`/migrate-tab`, `/draft-highlights`, `/season-summary`, `/review`, `/bump-league`) bypass dispatch when intent is already explicit.

## Quick references

- Migration plan: `docs/migration-plan.md`
- Glossary (league lore, owner names, jargon): `docs/glossary.md`
- Sleeper API docs: https://docs.sleeper.com/
- Debug overlay in the legacy site: `Ctrl+Shift+D`
