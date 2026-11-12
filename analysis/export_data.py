"""Download all sessions and trials from Supabase into data/raw/.

Run from anywhere:

    python analysis/export_data.py

It needs the Supabase *secret* key in a file `.env` in the repository root:

    SUPABASE_SECRET_KEY=sb_secret_...

(Supabase dashboard -> Project Settings -> API Keys -> secret key.)
The secret key can read and change the whole database, so it lives only in `.env`,
which git ignores. The downloaded data go to `data/`, which git ignores too
(docs/decisions.md, D-17). Nothing is deleted or changed in the database.

Output:
    data/raw/sessions.json     list of rows of the `sessions` table
    data/raw/trials.json       list of rows of the `trials` table (with raw samples)
    data/raw/export_info.json  when the export was made and how many rows
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw"
DEFAULT_URL = "https://fcyhdmthrtkqauxbjpti.supabase.co"  # public project URL

# Trials carry the raw samples (up to ~100 kB each), so they are fetched in small pages.
PAGE_SIZE = {"sessions": 500, "trials": 25}


def get_config() -> tuple[str, str]:
    load_dotenv(ROOT / ".env")
    url = os.environ.get("SUPABASE_URL", DEFAULT_URL).rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        sys.exit(
            "No key found. Create a file .env in the repository root with the line\n"
            "    SUPABASE_SECRET_KEY=sb_secret_...\n"
            "(Supabase -> Project Settings -> API Keys -> secret key)."
        )
    if key.startswith("sb_publishable_"):
        sys.exit(
            "This is the publishable key; it can only insert data. "
            "Use the secret key (sb_secret_...) for the export."
        )
    return url, key


def fetch_table(session: requests.Session, url: str, table: str) -> list[dict]:
    """Fetch every row of a table, page by page, oldest first."""
    rows: list[dict] = []
    page = PAGE_SIZE[table]
    while True:
        resp = session.get(
            f"{url}/rest/v1/{table}",
            params={
                "select": "*",
                "order": "created_at.asc,id.asc",
                "limit": page,
                "offset": len(rows),
            },
            timeout=120,
        )
        if resp.status_code == 401:
            sys.exit(f"401 Unauthorized for '{table}': check SUPABASE_SECRET_KEY in .env.")
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        print(f"  {table}: {len(rows)} rows", end="\r", flush=True)
        if len(batch) < page:
            print()
            return rows


def write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def main() -> None:
    url, key = get_config()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with requests.Session() as s:
        # New secret keys go only in the `apikey` header (not as a Bearer token);
        # the gateway turns it into the right role.
        s.headers.update({"apikey": key, "Accept": "application/json"})
        print(f"Exporting from {url}")
        # Trials first, then sessions: a session is always created before its trials,
        # so every exported trial finds its session even if someone is recording now.
        trials = fetch_table(s, url, "trials")
        sessions = fetch_table(s, url, "sessions")

    write_json(OUT_DIR / "trials.json", trials)
    write_json(OUT_DIR / "sessions.json", sessions)
    n_pilot = sum(1 for r in sessions if r.get("is_pilot"))
    info = {
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "url": url,
        "n_sessions": len(sessions),
        "n_pilot_sessions": n_pilot,
        "n_trials": len(trials),
    }
    write_json(OUT_DIR / "export_info.json", info)

    print(
        f"Saved {len(sessions)} sessions ({n_pilot} pilot) and {len(trials)} trials "
        f"to {OUT_DIR.relative_to(ROOT)}/"
    )


if __name__ == "__main__":
    main()
