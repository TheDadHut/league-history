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

Known-good test invocation: `--week 17 --season 2024` (used to verify the
script in this PR).

### What it outputs

- Standings (W-L-T, PF, PA) sorted by wins then PF
- Biggest blowout of the week
- Closest game of the week
- Highest team-level scorer
- Lowest team-level scorer

### What it doesn't do

- No player-level breakdowns, no waiver-wire reads, no trade summaries.
- No HTML, no email, no scheduling — just stdout.
- The league ID is hard-coded at the top of the script. Bump it alongside
  `src/config.ts` (line 10) every offseason.
