from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Dict, List, Optional

from ..repo import smartphone_content_repo
from . import gm_service


def _fetch_team(conn: sqlite3.Connection, team_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if not team_id:
        row = conn.execute("SELECT id, name, data_json FROM team ORDER BY id LIMIT 1").fetchone()
    else:
        row = conn.execute("SELECT id, name, data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "data": json.loads(row["data_json"]) if row["data_json"] else {},
    }


def _ensure_content_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS smartphone_content ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "team_id INTEGER, "
        "content_type TEXT NOT NULL, "
        "data_json TEXT NOT NULL, "
        "created_at INTEGER NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_smartphone_content_team ON smartphone_content (team_id, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_smartphone_content_type ON smartphone_content (content_type, created_at)"
    )
    conn.commit()


def _list_content(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    content_type: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    _ensure_content_table(conn)
    try:
        return smartphone_content_repo.list_content(conn, content_type=content_type, team_id=team_id, limit=limit)
    except sqlite3.OperationalError:
        return []


def snapshot(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    team = _fetch_team(conn, team_id)
    resolved_team_id = team.get("id") if team else None
    team_data = (team or {}).get("data") or {}
    now = int(time.time())

    meeting_requests = _list_content(conn, resolved_team_id, "meeting_request")
    meeting_requests = [
        item
        for item in meeting_requests
        if str(item.get("state") or "open").lower() not in {"resolved", "rejected", "scheduled", "postponed"}
    ]

    snapshot_payload = {
        "team_id": resolved_team_id,
        "team_name": (team or {}).get("name") or "",
        "generated_at": now,
        "team_state": {
            "morale": int(team_data.get("morale") or 50),
            "reputation": int(team_data.get("reputation") or 0),
        },
        "fan_pulse": team_data.get("fan_pulse") or {},
        "fanPulse": team_data.get("fan_pulse") or {},
        "news": _list_content(conn, resolved_team_id, "news"),
        "rumors": _list_content(conn, resolved_team_id, "rumor"),
        "scandals": _list_content(conn, resolved_team_id, "scandal"),
        "calls": _list_content(conn, resolved_team_id, "call"),
        "voicemails": _list_content(conn, resolved_team_id, "voicemail"),
        "meetings": {
            "requests": meeting_requests,
            "scheduled": _list_content(conn, resolved_team_id, "meeting_scheduled"),
        },
    }
    try:
        gm_snapshot = gm_service.snapshot(conn, {"team_id": resolved_team_id})
        snapshot_payload["gm"] = gm_snapshot.get("snapshot")
    except Exception:
        snapshot_payload["gm"] = None
    return {"snapshot": snapshot_payload}


def create_content(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_content_table(conn)
    team_id = payload.get("team_id")
    content_type = payload.get("content_type") or payload.get("type")
    data = payload.get("data") or {}
    if not content_type:
        raise ValueError("content_type is required")
    created_at = int(payload.get("created_at") or time.time())
    return smartphone_content_repo.create_content(conn, content_type=content_type, data=data, team_id=team_id, created_at=created_at)


def list_content(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_content_table(conn)
    team_id = payload.get("team_id")
    content_type = payload.get("content_type") or payload.get("type")
    if not content_type:
        raise ValueError("content_type is required")
    limit = int(payload.get("limit") or 100)
    items = smartphone_content_repo.list_content(conn, content_type=content_type, team_id=team_id, limit=limit)
    return {"items": items, "count": len(items)}


def log_event(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    team_id = payload.get("team_id")
    event = payload.get("event") or {}
    event_type = event.get("type") or payload.get("type") or "unknown"
    impact = event.get("impact") or payload.get("impact") or {}
    created_at = int(time.time())
    try:
        cur = conn.execute(
            "INSERT INTO smartphone_event (team_id, event_type, event_json, created_at) VALUES (?, ?, ?, ?)",
            (int(team_id) if team_id else None, str(event_type), json.dumps(event, ensure_ascii=True), created_at),
        )
        conn.commit()
    except sqlite3.OperationalError as exc:
        if "smartphone_event" not in str(exc).lower():
            raise
        conn.execute(
            "CREATE TABLE IF NOT EXISTS smartphone_event ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "team_id INTEGER, "
            "event_type TEXT NOT NULL, "
            "event_json TEXT NOT NULL, "
            "created_at INTEGER NOT NULL"
            ")"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_smartphone_event_team ON smartphone_event (team_id, created_at)"
        )
        cur = conn.execute(
            "INSERT INTO smartphone_event (team_id, event_type, event_json, created_at) VALUES (?, ?, ?, ?)",
            (int(team_id) if team_id else None, str(event_type), json.dumps(event, ensure_ascii=True), created_at),
        )
        conn.commit()
    updated_state = None
    if team_id:
        row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(team_id),)).fetchone()
        if row:
            data = json.loads(row["data_json"]) if row["data_json"] else {}
            morale = int(data.get("morale") or 50)
            reputation = int(data.get("reputation") or 0)
            morale = max(0, min(100, morale + int(impact.get("morale") or 0)))
            reputation = max(0, min(1000, reputation + int(impact.get("reputation") or 0)))
            data["morale"] = morale
            data["reputation"] = reputation
            conn.execute(
                "UPDATE team SET data_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=True), created_at, int(team_id)),
            )
            conn.commit()
            updated_state = {"morale": morale, "reputation": reputation}

    return {
        "id": int(cur.lastrowid),
        "team_id": team_id,
        "event_type": event_type,
        "created_at": created_at,
        "team_state": updated_state,
    }
