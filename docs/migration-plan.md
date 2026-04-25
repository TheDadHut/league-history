# Migration Plan: `index.html` → Vite + React + TypeScript

> Status: **locked, in progress.** Decisions are settled (see Phase 0). Build-order step 1 (this commit) is the documentation foundation; Phase 0.5 onwards is still pending.

## Goal

Move the GDL history site off a single hand-edited `index.html` onto a modern, modular stack that:

- Splits code by tab / feature instead of one 5000-line script.
- Gives type safety around the Sleeper API shapes.
- Keeps deploying to **GitHub Pages** as a static site (no server).
- Doesn't break the live site at any point during the migration.

## Target stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Build tool | **Vite** | Fast HMR, zero-config TS, first-class static-output. |
| Framework | **React 19** (current Vite default) | Largest ecosystem for the table/chart-heavy UI we need. |
| Language | **TypeScript** | Sleeper data shapes are gnarly; types catch the most likely bugs. |
| Routing | **react-router** (hash mode) | Hash routing avoids GitHub Pages 404 issues on deep links. |
| Styling | **CSS Modules** to start | No new lib to learn; can adopt Tailwind later if desired. |
| Tables | **TanStack Table** | Sortable/filterable stat tables without writing them from scratch. |
| Charts | **Recharts** | Good React-native chart lib; covers what `Records`/`Luck` need. |
| Tests | **Vitest** (later) | Same config as Vite; opt in once stat logic is extracted. |
| State | **Built-in only** (`useState` + `useContext`) | Add Zustand only if/when shared state hurts. No Redux. |
| TS config | **`strict: true`** from day one | Catches null/undefined and implicit-`any` bugs at compile time. |

## Constraints

- **Pages-only hosting, subpath forever.** No custom domain planned. Vite `base: '/league-history/'`, hash-based router so deep links don't 404.
- **No backend.** Sleeper fetches stay client-side, exactly as today.
- **`highlights.json` stays hand-edited.** Lives at repo root pre-migration; moves to `app/public/highlights.json` in Phase 4 so Vite serves it verbatim.
- **Live site cannot break.** The current `index.html` keeps serving until the new app reaches parity in Phase 5.

## Phased plan

### Phase 0 — Decisions locked

All stack and policy decisions are settled and baked into the relevant phases below. Headline picks:

- Stack: Vite + React 19 + TypeScript (`strict: true`).
- State: built-in `useState` + `useContext` only; no Redux/Zustand unless pain emerges.
- Folder: `app/` subfolder during migration, flatten to repo root after Phase 5 cutover.
- Hosting: GitHub Pages, subpath `/league-history/`, hash router. No custom domain.
- Pages source switches from "Deploy from a branch" to "GitHub Actions" only in Phase 5.
- MCP: `sleeper-mcp` lives outside this repo at `~/code/sleeper-mcp/`.
- Routines: PRs look human — no labels, agent mentions, or co-author lines.

### Phase 0.5 — Add the highlights validator (do now, pre-migration)

The only workflow worth setting up before the migration. It's framework-agnostic and survives every phase below with at most a path tweak.

- [ ] Add `.github/workflows/validate-highlights.yml`:
  - Trigger: PRs that touch `highlights.json`.
  - Step: `python -m json.tool highlights.json > /dev/null` (fails on bad JSON).
- [ ] Update the path to `app/public/highlights.json` in Phase 4 when the file moves, then to `public/highlights.json` after the Phase 5 flatten.

> **Why no other workflows yet?** Pages currently serves `index.html` directly from the repo with no action needed. A deploy workflow today would be ~20 lines we throw away in Phase 5. A `ci.yml` (typecheck/build/test) has nothing to run against until Phase 1.

### Phase 1 — Scaffold (no behavior change)

- [ ] `npm create vite@latest app -- --template react-ts`
- [ ] In `app/vite.config.ts` set `base: '/league-history/'`.
- [ ] Verify `app/tsconfig.json` has `"strict": true` (Vite's `react-ts` template defaults to strict; confirm it wasn't disabled).
- [ ] Add `.nvmrc` at repo root pinning Node 20 (LTS) so CI and local match.
- [ ] Install router: `npm i react-router-dom` and configure hash router (subpath-safe).
- [ ] Add `.gitignore` entries for `app/node_modules`, `app/dist`.
- [ ] Add `app/README.md` with `npm install`, `npm run dev`, `npm run build`.
- [ ] Commit: "Scaffold Vite + React + TS app".
- [ ] Add `.github/workflows/ci.yml`:
  - Trigger: PRs touching `app/**`.
  - Steps: `npm ci` + `npm run build` + `npx tsc --noEmit` (in `app/`).
  - Test job stays out until Vitest is added in Phase 6.

### Phase 2 — Extract the data layer

This is the highest-value step — it's reusable and testable.

- [ ] Create `app/src/lib/sleeper.ts` with typed wrappers for the Sleeper endpoints currently called from `index.html`:
  - `getLeague(leagueId)`
  - `getRosters(leagueId)`
  - `getUsers(leagueId)`
  - `getMatchups(leagueId, week)`
  - `getDraft(draftId)`, `getDraftPicks(draftId)`
  - `getTransactions(leagueId, week)`
  - `getPlayers()` (cached in `sessionStorage`, same as today)
- [ ] Create `app/src/lib/history.ts` with the `walkPreviousLeagues(currentLeagueId)` helper.
- [ ] Create `app/src/types/sleeper.ts` with the response shapes (start with what's used; expand as needed).
- [ ] Move `CURRENT_LEAGUE_ID`, `OWNER_COLORS`, `FALLBACK_PALETTE` into `app/src/config.ts`.

### Phase 3 — Migrate one tab at a time

Order chosen by complexity (simplest first):

1. **Founders** — static-ish list, perfect first migration.
2. **Overview** — Hall of Champs, league pulse, all-time standings.
3. **Records** — weekly highs/lows, season records.
4. **Head-to-Head** — owner-vs-owner table.
5. **Seasons** — biggest tab; migrate after the patterns are settled.
6. **Fun Stats**
7. **Luck & Streaks**
8. **Trades** — most logic-dense; migrate near the end.
9. **Owner Stats** — depends on waiver/DCE logic; migrate last.

For each tab:

- [ ] Extract pure stat-computation functions into `app/src/lib/stats/<tab>.ts`.
- [ ] Build the component(s) under `app/src/tabs/<Tab>/`.
- [ ] Wire as a dynamic `import()` in the router so each tab code-splits (Vite handles chunking automatically).
- [ ] Visually compare against the live site for at least 2 prior seasons, on **desktop and mobile** (mobile parity is non-negotiable — current site is usable on phones).
- [ ] Open a PR per tab (small, reviewable, easy to revert).

### Phase 4 — Highlights + debug overlay

- [ ] Move `highlights.json` to `app/public/highlights.json` so Vite serves it verbatim.
- [ ] Re-add the `Ctrl+Shift+D` debug overlay as a React component.
- [ ] Re-add cache-busting query string for `highlights.json`.

### Phase 5 — Cut over Pages deployment

- [ ] Add `.github/workflows/deploy.yml` using `actions/deploy-pages`:
  - Trigger on push to `main` (path filter on `app/**`).
  - Permissions: `pages: write`, `id-token: write`.
  - Concurrency group `pages` with `cancel-in-progress: false` (don't cancel an in-flight deploy).
  - Steps: `setup-node` (cache npm) → `cd app && npm ci && npm run build` → `actions/upload-pages-artifact` with `path: app/dist` → `actions/deploy-pages`.
- [ ] In repo Settings → Pages, switch source from "Deploy from a branch" to "GitHub Actions".
- [ ] Verify the deployed site matches the old one (spot-check every tab on at least 2 prior seasons, desktop + mobile).
- [ ] Delete the root `index.html` in a PR titled "Retire legacy index.html".
- [ ] Rewrite `README.md` for the new build/run workflow (`npm install` / `npm run dev` / `npm run build`); kill the "just open the HTML file" instructions.
- [ ] **Flatten `app/` to repo root** (per folder-layout decision). Move `app/*` → `./`, update `deploy.yml` paths (`app/dist` → `dist`, `app/**` → `**`), update path filters, run a deploy, verify.

> **Rollback:** If a Pages deploy ships broken, `git revert` the offending commit on `main` and push — the deploy workflow re-runs and Pages is back to the previous good state in a couple of minutes. No special tooling needed.

### Phase 6 — Backfill safety nets (optional, post-migration)

- [ ] Add Vitest, then add a `test` job to `ci.yml`. Write tests for the gnarly stat functions (DCE, waiver grades, trade fairness).
- [ ] Add ESLint + Prettier; add a `lint` job to `ci.yml`.
- [ ] (Optional) Dependabot for `app/package.json` and the GitHub Actions versions.

## CI/CD shape

Workflows are added incrementally — not all at once.

| File | Added in | Trigger | Purpose |
| --- | --- | --- | --- |
| `validate-highlights.yml` | **Phase 0.5** (now) | PR touching `highlights.json` | `python -m json.tool` — fail on bad JSON. |
| `ci.yml` | Phase 1 | PR touching `app/**` | `npm ci`, `npm run build`, `tsc --noEmit`. Lint/test jobs added in Phase 6. |
| `deploy.yml` | Phase 5 | Push to `main` (paths: `app/**`) | Build → upload Pages artifact → `deploy-pages`. |

Final layout:

```
.github/workflows/
├─ validate-highlights.yml   # PR: highlights.json validity
├─ ci.yml                    # PR: typecheck + build (+ lint/test in Phase 6)
└─ deploy.yml                # main: build + deploy to Pages
```

## Agentic dev pipeline

The Claude Code layer that makes day-to-day work on this repo faster. Built incrementally alongside the migration.

### Foundation — `CLAUDE.md` (do first, free)

Repo-rooted file that orients every Claude session. Should cover:

- Current state ("single `index.html` today, mid-migration to Vite + React + TS in `app/`") and link to this plan.
- Sleeper API conventions: history-walk via `previous_league_id`, no auth required, no enforced rate limit but cache aggressively (the `sessionStorage` player-DB pattern is ~5MB and should stay).
- The three `highlights.json` shapes (string / `{text, sub}` / `{text, children[]}`).
- Test-by-browser reality, by phase:
  - **Pre-migration / Phases 0–4:** legacy `index.html` is the live site — open it directly or via `python3 -m http.server` at port 8000.
  - **Phases 1–4 (parallel):** Vite dev server runs the new app in `app/` via `npm run dev` at port 5173; coexists with the legacy site.
  - **Phase 5+:** the new app is the live site; legacy `index.html` is gone.
- One-line summary of each of the 9 tabs and where its code lives (legacy line range or `app/src/tabs/<Tab>/`).

### Documentation files

The reference docs that orbit `CLAUDE.md` and get loaded/linked by agents.

| File | Purpose | Loaded how |
| --- | --- | --- |
| `CLAUDE.md` (repo root) | Project orientation, current state, conventions, links to other docs. | Auto-loaded every session. |
| `docs/migration-plan.md` (this file, after commit) | Source of truth for the migration phases and agent pipeline. | Linked from `CLAUDE.md`; agents instructed to "follow `MIGRATION_PLAN.md`". |
| `docs/glossary.md` | League lore: owner display names, "Gaming Disability League" / "Best Trader Tile" / "Grand Larceny" / "DCE" / "WR vs ST" definitions, year-by-year context, inside jokes. | Loaded by `CLAUDE.md`; explicitly referenced in `sports-stats-expert` and `highlights-writer` system prompts. **Without this, agents can't write in-voice or judge what's noteworthy.** |
| `docs/conventions.md` *(optional, only if it grows)* | Naming (PascalCase components, kebab-case files, camelCase fns), file organization, CSS Modules conventions, stat-fn location rules. | Starts as a section inside `CLAUDE.md`; graduates to its own file only if it gets long. |

> **Glossary first, conventions later.** The glossary is the single biggest unlock for the content/stats agents — they have no way to discover league lore on their own. Conventions can stay inline in `CLAUDE.md` until there's enough of them to justify splitting out.

### Custom skills (`.claude/skills/`)

Slash commands that encode repeated workflows.

| Skill | Purpose | Built in |
| --- | --- | --- |
| `/ask <question>` | **Primary entry point.** Hands the request to `orchestrator`, which classifies it and dispatches to the right specialist. Use this for anything fuzzy, exploratory, or cross-cutting. | After orchestrator (step 6) |
| `/migrate-tab <name>` | Direct entry to `tab-porter` (skips orchestrator). Reads the legacy tab, extracts stats, builds the React component, opens a PR. | Phase 3 |
| `/draft-highlights <year>` | Direct entry to `highlights-writer` for one season. Opens a PR. | After Sleeper MCP |
| `/season-summary <year>` | Long-form season recap; same agent as draft-highlights, different prompt. | After Sleeper MCP |
| `/review [target]` | Direct entry to `code-reviewer` on the current branch or a given PR/diff. | After domain specialists |
| `/bump-league <new-id>` | Swap `CURRENT_LEAGUE_ID`, smoke-test, PR. Pure skill, no agent. | Phase 1+ |

> **Skills vs subagents:** Skills are the slash-command entry points; subagents do the focused sub-tasks. `/migrate-tab` is one command that orchestrates `tab-porter` → `stat-extractor` under the hood. Don't think of them as competing — the skill is the verb you type, the subagent is the worker it spawns.

### Subagents (`.claude/agents/`)

Two layers under the top-level **`orchestrator`**:

- **Workflow specialists** — do end-to-end pieces of the pipeline (port a tab, draft highlights, fetch data).
- **Domain specialists** — deep expertise in one technology or topic, called on demand by the orchestrator *or* by workflow specialists that need a focused opinion.

Skills (slash commands) bypass the orchestrator and call specialists directly when intent is already explicit.

```
orchestrator                       ← top-level dispatcher; default for free-form requests
│
├─ Workflow specialists
│  ├─ tab-porter                   ← migration work (one tab end-to-end)
│  │  └─ stat-extractor            ← extracts a pure stat fn from legacy index.html
│  ├─ highlights-writer            ← drafts highlights.json entries in the right voice/shape
│  └─ sleeper-fetcher              ← thin wrapper over the Sleeper MCP server
│
└─ Domain specialists              ← consulted by orchestrator and workflow agents
   ├─ react-expert                 ← React 19 patterns, hooks, component design
   ├─ typescript-expert            ← types for Sleeper shapes, generics, strict-mode fixes
   ├─ css-expert                   ← CSS Modules, layout, responsive/mobile parity
   ├─ html-expert                  ← semantic markup, accessibility basics
   ├─ sports-stats-expert          ← formula sanity (DCE, waiver grades, luck), stat ideas
   └─ code-reviewer                ← reviews PRs for correctness, style, gotchas
```

#### Workflow specialists

- **`orchestrator`** — receives any free-form request, classifies it (migration / content / data / code question / review), dispatches accordingly. Handles general capability inline when no specialist fits.
- **`tab-porter`** — orchestrates `stat-extractor` + React component scaffolding for one full tab migration. Consults `react-expert`, `typescript-expert`, and `css-expert` while building. Invoked by `/migrate-tab` or `orchestrator`.
- **`stat-extractor`** — input: tab name. Output: typed pure function pulled out of `index.html`. Consults `sports-stats-expert` to validate the extracted formula.
- **`highlights-writer`** — converts raw Sleeper output into `highlights.json` voice/shape. Consults `sports-stats-expert` to identify what's actually noteworthy.
- **`sleeper-fetcher`** — wraps the Sleeper MCP server. Used by any data-driven workflow.

#### Domain specialists

- **`react-expert`** — React 19 idioms, hooks, component composition, Suspense for data, code-splitting via dynamic `import()`. Consulted by `tab-porter`.
- **`typescript-expert`** — `strict: true` survival, type-narrowing, generics for Sleeper response shapes, eliminating `any`. Consulted by `tab-porter` and `stat-extractor`.
- **`css-expert`** — CSS Modules conventions, responsive breakpoints, mobile parity (a non-negotiable per Phase 3). Consulted by `tab-porter`.
- **`html-expert`** — semantic structure, ARIA basics, keyboard navigation. Consulted on demand.
- **`sports-stats-expert`** — fantasy football domain knowledge: validates formulas (DCE, waiver grades, luck rating, clutch index), proposes new stats, sanity-checks results against league context. Consulted by `stat-extractor` and `highlights-writer`.
- **`code-reviewer`** — reviews PRs and large diffs. Looks for correctness, mobile regressions, accidental `any` types, dead code, security smells. Invokable via `/review` skill or by `orchestrator` on request.

> **When to call orchestrator vs a direct skill?** Default to `/ask` — it's the main entry point and routes to the right specialist for you. Use the direct skills (`/migrate-tab`, `/draft-highlights`, `/review`, `/bump-league`) when the intent is already explicit and you want to skip the dispatch step.

### Orchestrator dispatch rules

These are the rules baked into `orchestrator`'s system prompt. They're explicit so behavior is predictable and you can audit a dispatch you disagree with.

#### Direct routing — request type → handler

| If the request is about… | Dispatch to | Notes |
| --- | --- | --- |
| Porting / migrating a tab from `index.html` to React | `tab-porter` | Or recommend `/migrate-tab <name>` if the tab is named. |
| Extracting one specific stat function from legacy code | `stat-extractor` | Usually called via `tab-porter`, but standalone is fine. |
| Drafting weekly or per-game highlights | `highlights-writer` (data via `sleeper-fetcher`) | Suggest `/draft-highlights <year>` if scope is one season. |
| Drafting an end-of-season recap | `highlights-writer` with season prompt | Suggest `/season-summary <year>`. |
| Pulling raw Sleeper data ("what were the matchups in week N") | `sleeper-fetcher` | Just fetch and summarize — no analysis layer needed. |
| React idioms, hooks, component design | `react-expert` | Advice only; doesn't write/edit code. |
| TypeScript types, generics, strict-mode fixes | `typescript-expert` | Advice only. |
| CSS layout, responsive/mobile, CSS Modules | `css-expert` | Advice only. |
| Semantic HTML / accessibility | `html-expert` | Advice only. |
| Stat formula sanity, new stat ideas, "is X a good metric" | `sports-stats-expert` | Advice only. |
| Reviewing a branch / PR / diff | `code-reviewer` | Suggest `/review [target]`. |
| Bumping `CURRENT_LEAGUE_ID` for a new season | `/bump-league` skill | No agent needed — pure mechanical workflow. |
| `highlights.json` edit / addition | Handle inline; remind user the JSON validator hook will catch syntax errors | No specialist needed. |
| Anything else (general coding, file edits, git ops, debugging) | Handle inline | Don't dispatch for the sake of dispatching. |

#### Multi-specialist chains

For requests that touch more than one domain, run specialists in this order before producing a final answer or PR:

- **"Build/port a new tab"** → `tab-porter` leads → consults `react-expert`, then `typescript-expert`, then `css-expert` (in that order). `code-reviewer` runs at the end before the PR is opened.
- **"Design and add a new stat"** → `sports-stats-expert` (designs the formula) → `stat-extractor`-style implementation in `app/src/lib/stats/` → `typescript-expert` for the typing → `react-expert` for the surface in the relevant tab → `code-reviewer` before PR.
- **"Make this tab look better on mobile"** → `css-expert` leads → `react-expert` if structural changes needed → `code-reviewer` before PR.
- **"Fix a regression in X stat"** → `sports-stats-expert` validates the expected output → fix in `app/src/lib/stats/` → `code-reviewer` before PR.

#### When NOT to dispatch

Don't spawn a specialist if any of these apply:

- The question can be answered in one or two sentences from general knowledge.
- The user already explicitly named the tool ("just edit `app/src/config.ts`").
- It's a status check (`git status`, "what branch am I on", "did the last build pass").
- The user is mid-task and asking a quick clarifying question — answer inline.

#### Handoff format

When dispatching to a specialist, the orchestrator should pass:

1. The user's original ask, verbatim.
2. Any context already gathered in this session (files read, decisions made).
3. A clear deliverable ("return the typed function", "return a PR-ready diff", "return one paragraph of advice").
4. The constraint "follow `MIGRATION_PLAN.md` and `CLAUDE.md`" — never let a specialist drift from project conventions.

### Skills, subagents, or both — final mapping

Quick rules:

- **Skill** = explicit user trigger (`/foo bar`).
- **Subagent** = isolated context for focused work.
- **Combo** = both — clean entry point + isolated work.

| Thing | Skill | Subagent | Notes |
| --- | --- | --- | --- |
| `orchestrator` | **`/ask`** | yes | **Primary entry point.** The skill is how you talk to the pipeline day-to-day. |
| `tab-porter` | **`/migrate-tab`** | yes | Combo. Subagent isolates the heavy legacy-code reading. |
| `stat-extractor` | — | yes | Pure subagent. Only ever called by `tab-porter`. |
| `highlights-writer` | **`/draft-highlights`**, **`/season-summary`** | yes | Two skills, same agent, different prompts. |
| `sleeper-fetcher` | — | yes | Pure worker. Other agents call it. |
| `react-expert` | — | yes | Reach via `/ask` or as a sub-call from `tab-porter`. |
| `typescript-expert` | — | yes | Same. |
| `css-expert` | — | yes | Same. |
| `html-expert` | — | yes | Same. |
| `sports-stats-expert` | — | yes | Same. |
| `code-reviewer` | **`/review`** | yes | Combo. Also future-proofs CI integration. |
| `bump-league` | **`/bump-league`** | — | Pure skill — mechanical, no isolation needed. |

### Instructions each piece needs

**`CLAUDE.md` (project root)** — covered earlier; always loaded.

**Each subagent** (`.claude/agents/<name>.md` with frontmatter):

- `description` — one sentence the orchestrator uses to decide *when* to dispatch here. Be specific. ("React 19 patterns and idiomatic component design" beats "React stuff".)
- `model` — pin per the model-assignments tables above.
- `tools` — restrict to what's needed. Domain experts shouldn't have `Edit`/`Write` (they advise, they don't ship). `code-reviewer` needs `Read`/`Grep`/`Bash` but not `Write`.
- **System prompt (body)** — persona, expertise scope, output format, what *not* to do. Domain experts especially need a "stay in your lane — defer to other specialists for off-topic asks" line.

**Each skill** (`.claude/skills/<name>.md`):

- `description` — what it does and when to use it.
- `args` — expected arguments (e.g., `<tab-name>`, `<year>`, `[target]`).
- **Body** — step-by-step playbook, including which subagent to spawn and with what prompt.

**Settings (`.claude/settings.json`)** — hooks (JSON validator on `highlights.json`, Phase 5 `index.html` warning) and Bash allowlists for routine commands (`npm`, `git`, `python -m http.server`).

### Hooks (`settings.json`)

Small, catch real bugs locally.

- **PreToolUse `Edit`/`Write`** on `highlights.json` → run `python -m json.tool` after; reject on failure. Local mirror of the CI workflow, instant feedback.
- **Stop hook (Phase 5+)** — warn if `index.html` was edited in the session (you should be in `app/`, not the legacy file).

### MCP server — `sleeper-mcp` (highest-leverage optional)

A small TS MCP server (~150 lines) exposing Sleeper endpoints as tools: `getLeague`, `getRosters`, `getMatchups`, `getDraft`, `getTransactions`, `walkPreviousLeagues`. Once wired up, every skill and scheduled agent can pull live data with a tool call instead of writing `fetch` boilerplate.

**Location:** Outside this repo, at `~/code/sleeper-mcp/`. Skills and routines reference it by absolute path. Keeping it out of the repo means other Claude projects can use it too without cloning this one.

### Model assignments

Each subagent and routine pins its own model so the right tool runs each job.

**Workflow specialists & routines**

| Agent / routine | Model | Why |
| --- | --- | --- |
| `orchestrator` | **Opus 4.7** | Top-level dispatcher — picks the workflow for every free-form request. A wrong dispatch wastes more than the model premium saves. |
| `tab-porter` | **Opus 4.7** | Orchestration with judgment — planning, splits, integrating extracted stats with new components. Runs ~9 times total (one per tab), so cost is bounded. |
| `stat-extractor` | **Sonnet 4.6** | Careful code reading + type inference. Opus is overkill; Haiku risks misreads on dense legacy JS. |
| `highlights-writer` | **Sonnet 4.6** | Voice + creative summarization. Sonnet's writing is good enough; Opus would burn budget weekly. |
| `sleeper-fetcher` | **Haiku 4.5** | Mechanical API wrapping. Fast and cheap; no judgment needed. |
| Content agent (routine) | **Sonnet 4.6** as coordinator | Light coordination — delegates the heavy work to `sleeper-fetcher` (Haiku) and `highlights-writer` (Sonnet). Bypasses the orchestrator since intent is already fixed. |

**Domain specialists**

| Specialist | Model | Why |
| --- | --- | --- |
| `react-expert` | **Sonnet 4.6** | Solid React knowledge across the model tier; Opus rarely changes the answer for idiomatic React. |
| `typescript-expert` | **Sonnet 4.6** | Type-system reasoning needs care but isn't usually Opus-grade. Escalate manually for gnarly generic puzzles. |
| `css-expert` | **Sonnet 4.6** | Layout + responsive thinking. Haiku tends to hand-wave on edge cases. |
| `html-expert` | **Haiku 4.5** | Semantic markup is well-trodden ground; Haiku is plenty. |
| `sports-stats-expert` | **Sonnet 4.6** | Domain reasoning + formula validation. Escalate to Opus when designing brand-new stats from scratch. |
| `code-reviewer` | **Sonnet 4.6** | Good default for routine PR review. Use Opus for large/architectural diffs by overriding at invocation. |

How pinning works in practice:

- **Subagents:** `model:` field in `.claude/agents/<name>.md` frontmatter.
- **Routines:** model is set when the schedule is created; Claude Code respects it on every fire.
- **Skills (`/migrate-tab` etc.):** inherit the caller's model, but spawn subagents that carry their own pin — so the heavy lifting always lands on the right model regardless of which session model invoked the skill.

### Build order for the pipeline

1. **Documentation foundation:** commit this plan to `docs/migration-plan.md`, write `CLAUDE.md`, write `docs/glossary.md` (league lore + jargon).
2. **Domain specialists** (`react-expert`, `typescript-expert`, `css-expert`, `html-expert`, `sports-stats-expert`, `code-reviewer`) — they're just prompt files, cheap to scaffold, and immediately consultable from any session even before workflow agents exist.
3. `sleeper-mcp` server + `sleeper-fetcher` subagent (unlocks every data-driven workflow).
4. `/draft-highlights` + `highlights-writer` (proves out the content side on one season; uses `sports-stats-expert` for "what's noteworthy" judgment + `glossary.md` for voice).
5. `/migrate-tab` + `stat-extractor` + `tab-porter` (proves out the migration side on **Founders**; consults `react-expert`/`typescript-expert`/`css-expert`).
6. `orchestrator` + `/ask` skill (built last — needs all specialists in place to dispatch usefully).
7. Hooks (after the patterns above settle, so you know what to enforce).

> Domain specialists move to step 2 because they're high-leverage immediately: even before the orchestrator exists, you can manually invoke them from any session for one-off questions (e.g., "ask `sports-stats-expert` if this DCE formula has any blind spots").

## Scheduled agents (Claude routines)

Long-running automation via Claude Code's `schedule` skill. The migration itself is hands-on — done in regular Claude Code sessions, not on a cron — so the only scheduled routine is the content agent.

### Content agent — weekly highlights drafter

- **Cadence:** Tuesdays 9 AM ET during NFL regular season + playoffs (Sept–Feb). Off-season: monthly check, or skip.
- **Job:** Pull last week's matchups, transactions, and trades via `sleeper-mcp`. Run the `highlights-writer` subagent over the data. Open a PR titled `Highlights: Week N, <year>` with proposed `highlights.json` additions.
- **Human in loop:** You review and merge — agent never writes to `main` directly.
- **End-of-season variant:** First Tuesday of February runs a `/season-summary` instead, drafting the year's highlight reel.
- **Built in:** After the content pipeline (step 3 of build order) is working manually.

> **PRs look human.** No labels, agent mentions in titles/descriptions/commits, or `Co-Authored-By` lines. Reviewing should feel like reviewing your own work.

### Routines layout

```
.claude/routines/
└─ weekly-highlights.yaml      # content agent
```

## What this plan deliberately avoids

- Server-side rendering (Pages can't run it).
- A backend or database (defeats the "free static hosting" goal).
- A CSS framework on day one (don't bundle a learning curve into the migration).
- Rewriting stat logic during migration — port first, refactor later.
