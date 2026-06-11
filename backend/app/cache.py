"""SQLite-backed TTL cache for geo/risk lookups.

Keyed by an arbitrary string (we use the /24 subnet for geo and the full IP for
risk). Values are JSON blobs. A single file DB keeps deployment trivial; attach a
volume to persist it across backend restarts.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any

DB_PATH = os.environ.get("IPCHECK_DB_PATH", "/data/ipcheck.db")

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    # Fall back to a local file if the configured dir is not writable.
    path = DB_PATH
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
    except (OSError, sqlite3.OperationalError):
        path = os.path.join(os.getcwd(), "ipcheck.db")
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cache (
            namespace TEXT NOT NULL,
            key       TEXT NOT NULL,
            value     TEXT NOT NULL,
            expires   REAL NOT NULL,
            PRIMARY KEY (namespace, key)
        )
        """
    )
    conn.commit()
    _conn = conn
    return conn


def get(namespace: str, key: str) -> dict[str, Any] | None:
    conn = _connect()
    with _lock:
        row = conn.execute(
            "SELECT value, expires FROM cache WHERE namespace = ? AND key = ?",
            (namespace, key),
        ).fetchone()
    if row is None:
        return None
    value, expires = row
    if expires < time.time():
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def set(namespace: str, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
    conn = _connect()
    expires = time.time() + ttl_seconds
    with _lock:
        conn.execute(
            "INSERT OR REPLACE INTO cache (namespace, key, value, expires) VALUES (?, ?, ?, ?)",
            (namespace, key, json.dumps(value), expires),
        )
        conn.commit()
