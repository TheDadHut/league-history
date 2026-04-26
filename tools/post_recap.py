#!/usr/bin/env python3
"""Post a markdown recap file to a Discord or Slack webhook.

Reads the file at ``--path``, splits it into chunks that fit the target
platform's per-message cap, and POSTs each chunk in order. The optional
``--link`` is appended to the last chunk only as a "Full recap: <url>"
line.

Usage
-----
    python3 tools/post_recap.py \
        --path recaps/2024/week-17.md \
        --webhook-url 'https://discord.com/api/webhooks/...' \
        --webhook-format discord \
        --link 'https://github.com/.../pull/42'

Notes
-----
- Discord caps webhook message ``content`` at 2000 chars; Slack caps
  ``text`` at 4000. We use a small safety buffer (1900 / 3800) to leave
  headroom for the appended link / occasional escaping.
- Discord rate-limits webhooks at roughly 5 requests / 2 seconds. We
  insert a 0.5s sleep between chunks to stay well under that.
- Slack mrkdwn renders ``*single*`` as bold (not ``**double**``) and does
  not render markdown tables. The recap is emitted with GitHub-flavored
  markdown either way; Slack readers will see the raw asterisks. Convert
  on the read side or pick a Discord webhook.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Literal

import requests

WebhookFormat = Literal["discord", "slack"]

# Per-platform per-message caps with a small safety buffer.
CAPS: dict[str, int] = {
    "discord": 1900,  # actual cap: 2000
    "slack": 3800,  # actual cap: 4000
}

# Discord webhook rate limit is ~5 requests / 2 seconds. 0.5s between
# chunks keeps us comfortably under that for any realistic recap size.
SLEEP_BETWEEN_CHUNKS_S = 0.5


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def _split_keep_separator(text: str, separator: str) -> list[str]:
    """Split ``text`` on ``separator`` and re-attach the separator to each
    piece except the first, so concatenating the result yields the input.
    """
    parts = text.split(separator)
    if len(parts) == 1:
        return parts
    out = [parts[0]]
    for piece in parts[1:]:
        out.append(separator + piece)
    return out


def _greedy_pack(pieces: list[str], cap: int) -> list[str]:
    """Concatenate consecutive pieces while total length <= cap."""
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if not current:
            current = piece
            continue
        if len(current) + len(piece) <= cap:
            current += piece
        else:
            chunks.append(current)
            current = piece
    if current:
        chunks.append(current)
    return chunks


def _split_oversized(piece: str, cap: int) -> list[str]:
    """Split a piece that's larger than ``cap`` using progressively finer
    boundaries: ``\n`` first, then raw character chunks.
    """
    if len(piece) <= cap:
        return [piece]

    # Newline-level split, then greedy-pack.
    line_pieces = _split_keep_separator(piece, "\n")
    if len(line_pieces) > 1:
        packed = _greedy_pack(line_pieces, cap)
        # If every line individually fits, packing solved it.
        if all(len(c) <= cap for c in packed):
            return packed
        # Otherwise descend into each oversized chunk.
        out: list[str] = []
        for c in packed:
            if len(c) <= cap:
                out.append(c)
            else:
                out.extend(_split_oversized(c, cap))
        return out

    # Last resort: hard character chunking.
    return [piece[i : i + cap] for i in range(0, len(piece), cap)]


def chunk_recap(text: str, cap: int) -> list[str]:
    """Split a markdown recap into chunks no larger than ``cap`` chars.

    Splits preferentially on ``\n## `` and ``\n### `` boundaries to keep
    sections intact. Falls back to ``\n`` and then character-level chunking
    when an individual section is itself larger than the cap.
    """
    if len(text) <= cap:
        return [text]

    # First pass: split on H2 boundaries so the title block stays attached
    # to whatever follows it.
    h2_pieces = _split_keep_separator(text, "\n## ")
    # Second pass: split each H2 piece on H3 boundaries.
    section_pieces: list[str] = []
    for piece in h2_pieces:
        section_pieces.extend(_split_keep_separator(piece, "\n### "))

    # Greedy-pack neighboring sections that fit together.
    packed = _greedy_pack(section_pieces, cap)

    # Any chunk still larger than cap gets split further.
    out: list[str] = []
    for c in packed:
        if len(c) <= cap:
            out.append(c)
        else:
            out.extend(_split_oversized(c, cap))
    return out


def attach_link(chunks: list[str], link: str | None, cap: int) -> list[str]:
    """Append "Full recap: <link>" to the last chunk, splitting off a new
    final chunk if the addition would overflow.
    """
    if not link or not chunks:
        return chunks

    suffix = f"\n\nFull recap: {link}"
    last = chunks[-1]
    if len(last) + len(suffix) <= cap:
        chunks[-1] = last + suffix
        return chunks
    # Otherwise, post the link as its own final chunk. Strip the leading
    # newlines so it isn't visually orphaned.
    chunks.append(f"Full recap: {link}")
    return chunks


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def post_chunk(url: str, chunk: str, fmt: WebhookFormat) -> None:
    """POST a single chunk to the webhook. Raises on non-2xx."""
    if fmt == "discord":
        payload = {"content": chunk}
    elif fmt == "slack":
        payload = {"text": chunk}
    else:  # pragma: no cover - argparse choices guard this
        raise ValueError(f"Unsupported webhook format: {fmt}")
    response = requests.post(url, json=payload, timeout=20)
    response.raise_for_status()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Post a markdown recap file to a Discord or Slack webhook."
    )
    parser.add_argument(
        "--path",
        type=Path,
        required=True,
        help="Path to the markdown recap file to post.",
    )
    parser.add_argument(
        "--webhook-url",
        type=str,
        required=True,
        help="Webhook URL.",
    )
    parser.add_argument(
        "--webhook-format",
        type=str,
        choices=["discord", "slack"],
        required=True,
        help="Which webhook payload shape to use.",
    )
    parser.add_argument(
        "--link",
        type=str,
        default=None,
        help="Optional URL appended as 'Full recap: <link>' to the final chunk.",
    )
    args = parser.parse_args()

    path: Path = args.path
    if not path.is_file():
        print(f"Recap file not found: {path}", file=sys.stderr)
        return 2

    text = path.read_text(encoding="utf-8")
    if not text.strip():
        print(f"Recap file is empty: {path}", file=sys.stderr)
        return 2

    fmt: WebhookFormat = args.webhook_format
    cap = CAPS[fmt]

    chunks = chunk_recap(text, cap)
    chunks = attach_link(chunks, args.link, cap)

    total = len(chunks)
    print(f"Posting {total} chunk(s) to {fmt} webhook", file=sys.stderr)
    for i, chunk in enumerate(chunks, 1):
        try:
            post_chunk(args.webhook_url, chunk, fmt)
        except requests.HTTPError as err:
            print(
                f"Webhook POST failed on chunk {i}/{total} ({len(chunk)} chars): {err}",
                file=sys.stderr,
            )
            return 1
        except requests.RequestException as err:
            print(
                f"Webhook POST errored on chunk {i}/{total}: {err}",
                file=sys.stderr,
            )
            return 1
        print(f"  chunk {i}/{total} posted ({len(chunk)} chars)", file=sys.stderr)
        if i < total:
            time.sleep(SLEEP_BETWEEN_CHUNKS_S)

    return 0


if __name__ == "__main__":
    sys.exit(main())
