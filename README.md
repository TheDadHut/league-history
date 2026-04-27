# Gaming Disability League · History

Fantasy football history site for the **Gaming Disability League** (GDL).
Live data on every page load from the [Sleeper API](https://docs.sleeper.com/);
no backend, no DB, no auth.

Live: <https://thedadhut.github.io/league-history/>

## Tech stack, with reasoning

- **TypeScript (strict)** — Sleeper response shapes are non-trivial (matchups,
  brackets, transactions, drafts, players). Strict-mode types caught real bugs
  while porting from the legacy single-file site.
- **React 19 + Vite** — modern frontend baseline; Vite for the build, hash
  router so the GitHub Pages subpath (`/league-history/`) just works.
- **Vitest** — unit tests for the pure stat selectors in `src/lib/stats/`.
  The Sleeper layer and tab UIs are verified by browser; the math is verified
  by tests.
- **GitHub Pages** — static hosting matches the no-backend constraint;
  deploys from `main` via `.github/workflows/deploy.yml`.
- **Python `tools/`** — when the right tool isn't the browser. Currently a
  weekly-recap generator and a webhook poster, run on a Tuesday-morning cron
  that opens a PR with the recap markdown and posts the same content to a
  Discord/Slack webhook.

## Architecture at a glance

- **Browser app (`src/`)** — fetches the entire league history on every load
  by walking `league.previous_league_id` back to the inaugural season.
- **Stat selectors (`src/lib/stats/`)** — pure functions over normalized
  Sleeper data; unit-tested with Vitest.
- **Shared data layer (`src/lib/leagueData.tsx`)** — fetches once, exposes a
  React context that every tab consumes. Player DB (~5MB) is cached in
  `sessionStorage` to keep refresh cheap.
- **Python sidecar (`tools/`)** — offline / scheduled work that doesn't
  belong in the browser. `weekly_recap.py` walks the Sleeper API to render
  a markdown weekly recap; `post_recap.py` chunks the recap to fit
  Discord/Slack webhook caps. Wired together by `weekly_recap.yml`, which
  runs Tuesdays at 14:00 UTC, opens a PR with the recap under
  `recaps/<season>/week-NN.md`, and posts the content to a webhook.

## What's in the app

Nine tabs, all computed client-side from Sleeper data:

- **Overview** — Hall of Champs, league pulse, all-time regular-season standings.
- **Records** — Weekly team highs/lows, single-week and full-season player records.
- **Head-to-Head** — All-time record between any two owners (regular + playoffs).
- **Seasons** — Per-season standings, playoff bracket, draft recap, weekly
  matchups, and curated highlights.
- **Fun Stats** — Blowouts, closest games, hard-luck losses, lucky wins,
  rivalries, consistency vs. volatility, clutch index, and benching analysis.
- **Luck & Streaks** — Median-scoring luck rating, current streaks, all-time
  longest win/loss streaks.
- **Trades** — Grand Larceny leaderboards (While Rostered + Season Total),
  full chronological history with filters.
- **Owner Stats** — Per-owner deep dive: titles, records, draft capital
  efficiency, waiver archetype, season-by-season grades.
- **Founders** — The inaugural-season roster.

The site was rewritten from a single hand-edited HTML file to a Vite, React,
and TypeScript app, one tab at a time.

## Run it locally

React app:

```bash
npm install
npm run dev      # http://localhost:5173/league-history/
npm run build    # type-check + production build into dist/
npm run preview  # serve dist/ to spot-check the prod build
```

Tests:

```bash
npm run test:run
```

Python recap:

```bash
cd tools
pip install -r requirements.txt
python3 weekly_recap.py --week 14 --season 2024

# Post a saved recap to a webhook (chunks for Discord/Slack caps):
python3 post_recap.py \
  --path ../recaps/2024/week-14.md \
  --webhook-url "$RECAP_WEBHOOK_URL" \
  --webhook-format discord
```

Use Node 20 (see `.nvmrc`).

### Configuration

Everything app-side is in `src/config.ts`:

- `CURRENT_LEAGUE_ID` — Sleeper league ID for the most recent season; the
  app walks backwards from here. Bump at the start of each new season.
- `OWNER_COLORS` — substring-matched owner color preferences.
- `FALLBACK_PALETTE` — 12 distinct hues for owners without an explicit color.

The Python tool also has `CURRENT_LEAGUE_ID` hard-coded at the top of
`tools/weekly_recap.py`. Bump both together.

The scheduled weekly recap workflow reads two repo-level settings:

- `RECAP_WEBHOOK_URL` (secret) — the Discord/Slack webhook target. When
  unset, the workflow generates the recap PR and skips the post step.
- `RECAP_WEBHOOK_FORMAT` (variable, `discord` or `slack`) — selects the
  payload shape and per-message cap. Defaults to `discord` when unset.

## CI / deploy

- Build, typecheck, lint, format-check, and tests run on every PR
  (`.github/workflows/ci.yml`).
- `public/highlights.json` is JSON-validated on PRs that touch it
  (`.github/workflows/validate-highlights.yml`).
- Push to `main` that touches app code triggers
  `.github/workflows/deploy.yml` → GitHub Pages.
- `.github/workflows/weekly_recap.yml` runs Tuesdays at 14:00 UTC, opens
  (or updates) a PR with the rendered recap markdown, and posts the same
  content to the configured webhook. Off-season runs exit cleanly with no
  PR and no post.
- Dependabot watches npm and GitHub Actions.

## Future ideas

The Python sidecar is the obvious lever: a draft-night helper that pulls
live ADPs, an offseason player-projection diff, a year-end awards generator
that rolls up the same selectors the React app already uses. The browser
app is where the league actually spends its time; everything else is sugar.
