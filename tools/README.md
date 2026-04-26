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
  receives the full recap, stdout receives the teaser.
- `--auto-write-to-recaps-dir` — used by the scheduled workflow. Auto-detects
  week + season, writes the recap to `recaps/<season>/week-<week>.md`, and
  prints that path to stdout. During off-season, exits cleanly with empty
  stdout. Cannot be combined with `--out` or `--teaser`.

### What it outputs

- Standings (W-L-T, PF, PA) sorted by wins then PF
- Biggest blowout of the week
- Closest game of the week
- Highest team-level scorer
- Lowest team-level scorer

### What it doesn't do

- No player-level breakdowns, no waiver-wire reads, no trade summaries.
- No HTML, no email — scheduling lives in
  `.github/workflows/weekly_recap.yml`.
- The league ID is hard-coded at the top of the script. Bump it alongside
  `src/config.ts` (line 10) every offseason.
