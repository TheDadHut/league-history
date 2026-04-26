#!/usr/bin/env python3
"""Weekly GDL recap generator.

Pulls one week of league data from the public Sleeper API and emits a
markdown recap to stdout: standings, biggest blowout, closest game,
highest and lowest scorers.

Usage
-----
    python3 weekly_recap.py --week 15 --season 2024
    python3 weekly_recap.py --week 14   # season defaults to current league season

Known-good test invocation (used during development):
    python3 weekly_recap.py --week 14 --season 2024

This is a one-script tool. No shared config with the React app on purpose
(different language, different deploy surface). The ~30 lines of duplicated
Sleeper-shape handling vs. src/lib/sleeper.ts is the price of that.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, TypedDict

import requests

# Bump this every offseason alongside src/config.ts (line 10). The two values
# must stay in sync — there's no shared source of truth on purpose, since this
# tool is intentionally standalone.
CURRENT_LEAGUE_ID = "1226697048753983488"

API_BASE = "https://api.sleeper.app/v1"


# ---------------------------------------------------------------------------
# Sleeper response shapes — only the fields this script actually reads.
# Nested fields are Any to avoid maintenance burden.
# ---------------------------------------------------------------------------


class League(TypedDict, total=False):
    league_id: str
    name: str
    season: str
    previous_league_id: str | None


class User(TypedDict, total=False):
    user_id: str
    display_name: str
    metadata: dict[str, Any]


class Roster(TypedDict, total=False):
    roster_id: int
    owner_id: str
    settings: dict[str, Any]


class Matchup(TypedDict, total=False):
    matchup_id: int | None
    roster_id: int
    points: float


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def _get(url: str) -> Any:
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    return resp.json()


def get_league(league_id: str) -> League:
    return _get(f"{API_BASE}/league/{league_id}")


def get_users(league_id: str) -> list[User]:
    return _get(f"{API_BASE}/league/{league_id}/users")


def get_rosters(league_id: str) -> list[Roster]:
    return _get(f"{API_BASE}/league/{league_id}/rosters")


def get_matchups(league_id: str, week: int) -> list[Matchup]:
    return _get(f"{API_BASE}/league/{league_id}/matchups/{week}")


# ---------------------------------------------------------------------------
# History walk
# ---------------------------------------------------------------------------


def resolve_league_id_for_season(season: str | None) -> tuple[str, League]:
    """Walk previous_league_id from CURRENT_LEAGUE_ID until season matches.

    If season is None, returns (current_id, current_league).
    """
    league = get_league(CURRENT_LEAGUE_ID)
    if season is None or str(league.get("season")) == season:
        return CURRENT_LEAGUE_ID, league

    prev_id = league.get("previous_league_id")
    while prev_id:
        league = get_league(prev_id)
        if str(league.get("season")) == season:
            return prev_id, league
        prev_id = league.get("previous_league_id")

    raise SystemExit(f"No league found for season {season} walking back from {CURRENT_LEAGUE_ID}")


# ---------------------------------------------------------------------------
# Team-name lookup. Sleeper team display name precedence:
#   user.metadata.team_name → user.display_name → "Roster N"
# ---------------------------------------------------------------------------


def build_team_name_map(users: list[User], rosters: list[Roster]) -> dict[int, str]:
    users_by_id: dict[str, User] = {u["user_id"]: u for u in users if "user_id" in u}
    out: dict[int, str] = {}
    for r in rosters:
        roster_id = r.get("roster_id")
        if roster_id is None:
            continue
        owner_id = r.get("owner_id")
        user = users_by_id.get(owner_id or "")
        team_name: str | None = None
        if user:
            meta = user.get("metadata") or {}
            team_name = meta.get("team_name") or user.get("display_name")
        out[roster_id] = team_name or f"Roster {roster_id}"
    return out


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def pair_matchups(matchups: list[Matchup]) -> list[tuple[Matchup, Matchup]]:
    """Group matchup entries by matchup_id into (home, away) pairs.

    Entries with no matchup_id (byes) are skipped.
    """
    by_id: dict[int, list[Matchup]] = {}
    for m in matchups:
        mid = m.get("matchup_id")
        if mid is None:
            continue
        by_id.setdefault(mid, []).append(m)

    pairs: list[tuple[Matchup, Matchup]] = []
    for entries in by_id.values():
        if len(entries) == 2:
            pairs.append((entries[0], entries[1]))
    return pairs


def compute_standings(
    league_id: str, through_week: int, team_names: dict[int, str]
) -> list[dict[str, Any]]:
    """Compute W-L-T, PF, PA across weeks 1..through_week."""
    standings: dict[int, dict[str, Any]] = {
        rid: {"team": name, "w": 0, "l": 0, "t": 0, "pf": 0.0, "pa": 0.0}
        for rid, name in team_names.items()
    }

    for week in range(1, through_week + 1):
        try:
            week_matchups = get_matchups(league_id, week)
        except requests.HTTPError:
            continue
        if not week_matchups:
            continue
        for a, b in pair_matchups(week_matchups):
            ra, rb = a["roster_id"], b["roster_id"]
            pa, pb = float(a.get("points") or 0), float(b.get("points") or 0)
            if ra not in standings or rb not in standings:
                continue
            standings[ra]["pf"] += pa
            standings[ra]["pa"] += pb
            standings[rb]["pf"] += pb
            standings[rb]["pa"] += pa
            if pa > pb:
                standings[ra]["w"] += 1
                standings[rb]["l"] += 1
            elif pb > pa:
                standings[rb]["w"] += 1
                standings[ra]["l"] += 1
            else:
                standings[ra]["t"] += 1
                standings[rb]["t"] += 1

    rows = list(standings.values())
    rows.sort(key=lambda r: (-r["w"], -r["pf"]))
    return rows


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------


def fmt_score(p: float) -> str:
    return f"{p:.2f}"


def render_recap(season: str, week: int, league: League, matchups: list[Matchup],
                 team_names: dict[int, str], standings: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append(f"## Week {week} · {season} GDL Recap")
    lines.append("")
    league_name = league.get("name") or "Gaming Disability League"
    lines.append(f"_{league_name} — through week {week}_")
    lines.append("")

    # Standings
    lines.append("### Standings")
    lines.append("")
    lines.append("| # | Team | W-L-T | PF | PA |")
    lines.append("| - | ---- | ----- | -- | -- |")
    for i, row in enumerate(standings, 1):
        record = f"{row['w']}-{row['l']}-{row['t']}"
        lines.append(
            f"| {i} | {row['team']} | {record} | {fmt_score(row['pf'])} | {fmt_score(row['pa'])} |"
        )
    lines.append("")

    # Per-week stats from this week's matchups
    pairs = pair_matchups(matchups)

    # Highest / lowest scorer (team-level) — across all entries this week
    scored: list[tuple[int, float]] = [
        (m["roster_id"], float(m.get("points") or 0))
        for m in matchups
        if m.get("matchup_id") is not None
    ]

    if pairs:
        # Margins
        margins = [
            (a, b, abs(float(a.get("points") or 0) - float(b.get("points") or 0)))
            for a, b in pairs
        ]
        biggest = max(margins, key=lambda t: t[2])
        closest = min(margins, key=lambda t: t[2])

        def matchup_line(a: Matchup, b: Matchup, margin: float) -> str:
            ap = float(a.get("points") or 0)
            bp = float(b.get("points") or 0)
            if ap >= bp:
                winner, loser, ws, ls = a, b, ap, bp
            else:
                winner, loser, ws, ls = b, a, bp, ap
            wn = team_names.get(winner["roster_id"], f"Roster {winner['roster_id']}")
            ln = team_names.get(loser["roster_id"], f"Roster {loser['roster_id']}")
            return f"**{wn}** {fmt_score(ws)} — {fmt_score(ls)} {ln} (margin {fmt_score(margin)})"

        lines.append("### Biggest blowout")
        lines.append("")
        lines.append(matchup_line(*biggest))
        lines.append("")
        lines.append("### Closest game")
        lines.append("")
        lines.append(matchup_line(*closest))
        lines.append("")

    if scored:
        high_rid, high_pts = max(scored, key=lambda t: t[1])
        low_rid, low_pts = min(scored, key=lambda t: t[1])
        lines.append("### Highest scorer")
        lines.append("")
        lines.append(
            f"{team_names.get(high_rid, f'Roster {high_rid}')} — {fmt_score(high_pts)}"
        )
        lines.append("")
        lines.append("### Lowest scorer")
        lines.append("")
        lines.append(
            f"{team_names.get(low_rid, f'Roster {low_rid}')} — {fmt_score(low_pts)}"
        )
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="GDL weekly recap (markdown to stdout)")
    parser.add_argument("--week", type=int, required=True, help="NFL week to summarize")
    parser.add_argument(
        "--season",
        type=str,
        default=None,
        help="Season year (e.g. 2024). Defaults to the current league's season.",
    )
    args = parser.parse_args()

    if args.week < 1 or args.week > 18:
        print(f"Week must be between 1 and 18 (got {args.week})", file=sys.stderr)
        return 2

    try:
        league_id, league = resolve_league_id_for_season(args.season)
    except requests.HTTPError as err:
        print(f"Sleeper API error resolving league: {err}", file=sys.stderr)
        return 1

    season = str(league.get("season") or args.season or "")

    matchups = get_matchups(league_id, args.week)
    if not matchups:
        print(f"No matchup data for week {args.week} of {season}", file=sys.stderr)
        return 1

    has_data = any(m.get("matchup_id") is not None for m in matchups)
    if not has_data:
        print(f"No matchup data for week {args.week} of {season}", file=sys.stderr)
        return 1

    users = get_users(league_id)
    rosters = get_rosters(league_id)
    team_names = build_team_name_map(users, rosters)

    standings = compute_standings(league_id, args.week, team_names)
    print(render_recap(season, args.week, league, matchups, team_names, standings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
