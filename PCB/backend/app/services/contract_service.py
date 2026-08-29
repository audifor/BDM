from __future__ import annotations

import sqlite3
from typing import Any, Dict

from ..repo import contract_repo


def list_contracts(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    items = contract_repo.list_contracts(conn, limit=limit, offset=offset)
    total = conn.execute("SELECT COUNT(1) FROM contract").fetchone()[0]
    return {"items": items, "total": total}
