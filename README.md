# Gaming Disability League · History

A single-page, zero-build fantasy football history site for the **Gaming Disability League** (GDL).
All league data is pulled live from the [Sleeper API](https://docs.sleeper.com/) on page load —
champions, matchups, rosters, drafts, trades, and transactions are walked backwards through every
previous season via `previous_league_id`.

No server, no framework, no package manager. Just an HTML file.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire app — HTML, CSS, and all analytics JS in one file. |
| `highlights.json` | Manually curated season-by-season highlights (optional). Loaded at runtime. |

## Running it

Open `index.html` in a browser, or serve the folder with any static host:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Data is fetched on every load and cached in `sessionStorage` for the Sleeper player DB (~5MB).
A cache-busting query string is appended to `highlights.json` so edits appear immediately.

## Configuration

Everything is at the top of the `<script>` block in `index.html`:

- `CURRENT_LEAGUE_ID` — the Sleeper league ID for the most recent season. The app walks
  backwards from here through `previous_league_id` to build the full history. Update this
  at the start of each new season.
- `OWNER_COLORS` — substring-matched owner color preferences (e.g. any display name
  containing "alex" gets the red accent).
- `FALLBACK_PALETTE` — 12 distinct hues used for any owners without an explicit color.
  Every owner is guaranteed a unique color until the palette runs out.

## Highlights

`highlights.json` holds hand-written notes that appear on each season's archive page.
Three formats are supported (all can be mixed within the same season array):

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

Newest entries go first within each season array. Unknown keys are ignored.

## What's in the app

Nine tabs, all computed client-side from Sleeper data:

- **Overview** — Hall of Champs, league pulse, all-time regular-season standings.
- **Records** — Weekly team highs/lows, single-week and full-season player records.
- **Head-to-Head** — All-time record between any two owners (regular season + playoffs).
- **Seasons** — Per-season standings, playoff bracket, draft recap, weekly matchups, and highlights.
- **Fun Stats** — Blowouts, closest games, hard-luck losses, lucky wins, rivalries, consistency
  vs. volatility, clutch index, blowout record, and benching analysis (points left on the bench
  and the worst individual "shoulda started him" decisions).
- **Luck & Streaks** — Luck rating (actual record vs. what you'd have with median scoring),
  current streaks, and all-time longest win/loss streaks.
- **Trades** — Grand Larceny leaderboards (both While Rostered and Season Total scoring),
  full chronological trade history with filters, and draft-pick-aware caveats.
- **Owner Stats** — Per-owner deep dive: titles, records, draft capital efficiency (DCE),
  waiver archetype, and season-by-season waiver grades.
- **Founders** — The inaugural-season roster.

## Notes

- Keyboard shortcut `Ctrl+Shift+D` toggles a debug overlay.
- Waiver grades and draft capital efficiency are computed locally — the formulas are
  commented inline in `index.html` near the `buildWaiverGrades` and DCE sections.
- Trade fairness is measured two ways: **WR** (points scored while the receiving team still
  rostered the player) and **ST** (all remaining post-trade season points). Draft-pick-only
  trades are shown without a winner since pick value can't be evaluated from Sleeper data alone.