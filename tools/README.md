# tools/

Python sidecar for offline / scheduled work that doesn't belong in the
browser app. One script per file, no shared framework, no `tools/config.py`.

## `weekly_recap.py`

Generates a markdown weekly recap for the GDL from the public Sleeper API
and writes it to stdout. Pipe it to a file or a chat webhook as you like.

### Run it

```bash
cd tools
pip install -r requirements.txt
python3 weekly_recap.py --week 14 --season 2024
```

`--season` is optional; if omitted, the script uses the current league's
season as reported by Sleeper. For older seasons it walks
`previous_league_id` back from the current league.

`--week` is also optional. When omitted, the script reads the current NFL
week and season type from `GET /v1/state/nfl`:

- During the regular season or playoffs, it generates a recap for the
  current week.
- During the preseason or off-season, it exits cleanly (`exit 0`) with a
  short message on stderr and no stdout — so the scheduled workflow doesn't
  appear to fail year-round.

When `--week` is supplied explicitly, the recap is generated regardless of
season type.

Known-good test invocation: `--week 17 --season 2024` (used to verify the
script in this PR).

### Flags

- `--week N` — week to summarize. Optional; auto-detected when omitted.
- `--season YYYY` — season year. Optional; defaults to the current league.
- `--out PATH` — write the full recap markdown to a file instead of (or in
  addition to, when combined with `--teaser`) stdout. Parent directories
  are created automatically.
- `--teaser` — print only the header + standings table (a short blurb
  suitable for a Discord/Slack webhook). Combinable with `--out`: the file
  receives the full recap, stdout receives the teaser. **Kept for backward
  compatibility — the scheduled workflow no longer uses it.** The workflow
  now posts the full recap via `post_recap.py`.
- `--auto-write-to-recaps-dir` — used by the scheduled workflow. Auto-detects
  week + season, writes the recap to `recaps/<season>/week-<week>.md`, and
  prints that path to stdout. During off-season, exits cleanly with empty
  stdout. Cannot be combined with `--out` or `--teaser`.

### What it outputs

- Standings (W-L-T, PF, PA) sorted by wins then PF
- All games this week (one line per game, sorted by margin descending)
- Biggest blowout of the week
- Closest game of the week
- Highest team-level scorer
- Lowest team-level scorer
- Active streaks (consecutive W or L runs of length 2+, season-to-date,
  sorted by length descending; section omitted entirely when nobody has a
  2+ streak)

Streaks are computed during the same weekly walk that builds standings, so
they cost no extra Sleeper API calls. A Week 17 recap fetches all 17 weekly
matchup endpoints regardless — that's already the standings cost.

Major sections are separated by `\n---\n` so they render as horizontal
rules in markdown.

### What it doesn't do

- No player-level breakdowns, no waiver-wire reads, no trade summaries.
- No HTML, no email — scheduling lives in
  `.github/workflows/weekly_recap.yml`.
- The league ID is hard-coded at the top of the script. Bump it alongside
  `src/config.ts` (line 10) every offseason.

## `post_recap.py`

Reads a markdown recap file and POSTs it to a Discord or Slack webhook,
chunking the content to fit each platform's per-message cap.

### Run it

```bash
python3 tools/post_recap.py \
  --path recaps/2024/week-17.md \
  --webhook-url 'https://discord.com/api/webhooks/...' \
  --webhook-format discord \
  --link 'https://github.com/.../pull/42'
```

### Flags

- `--path PATH` — markdown file to post. Required.
- `--webhook-url URL` — webhook URL. Required.
- `--webhook-format {discord,slack}` — payload shape and per-message cap.
  Required.
- `--link URL` — optional. Appended to the final chunk only as a single
  `Full recap: <url>` line.

### Chunking

- Discord: cap 2000 chars; we use 1900 for safety headroom.
- Slack: cap 4000 chars; we use 3800.
- Splits preferentially on `\n## ` and `\n### ` boundaries to keep sections
  intact, then on `\n` for oversized sections, then on raw character counts
  as a last resort.
- A `time.sleep(0.5)` runs between chunks to stay well under Discord's
  ~5 requests / 2 seconds webhook rate limit.

### Discord vs. Slack rendering caveat

The recap is GitHub-flavored markdown. Discord renders `**bold**` and
markdown tables reasonably; Slack `mrkdwn` does not — Slack uses
`*single-asterisk*` for bold and ignores tables entirely, so a recap posted
to a Slack webhook will display the raw `**` and `|` characters. If that
matters, use a Discord webhook or render a Slack-flavored variant on the
read side. The poster intentionally does not transform the markdown.
