from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Dict, List, Optional


def _row_to_event(row: sqlite3.Row) -> Dict[str, Any]:
    data = json.loads(row["data_json"]) if row["data_json"] else {}
    return {
        "id": int(row["id"]),
        "team_id": row["team_id"],
        "event_type": row["event_type"],
        "severity": row["severity"],
        "state": row["state"],
        "title": row["title"],
        "body": row["body"],
        "event_date": row["event_date"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "data": data,
    }


def create_event(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    event_type: str,
    severity: str,
    state: str,
    title: str,
    body: str,
    event_date: Optional[str],
    data: Dict[str, Any],
    created_at: Optional[int] = None,
) -> Dict[str, Any]:
    now = int(created_at or time.time())
    cur = conn.execute(
        "INSERT INTO gm_event (team_id, event_type, severity, state, title, body, event_date, data_json, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            int(team_id) if team_id is not None else None,
            str(event_type),
            str(severity or "info"),
            str(state or "open"),
            str(title or ""),
            str(body or ""),
            str(event_date or ""),
            json.dumps(data or {}, ensure_ascii=True),
            now,
            now,
        ),
    )
    conn.commit()
    return {
        "id": int(cur.lastrowid),
        "team_id": int(team_id) if team_id is not None else None,
        "event_type": str(event_type),
        "severity": str(severity or "info"),
        "state": str(state or "open"),
        "title": str(title or ""),
        "body": str(body or ""),
        "event_date": str(event_date or ""),
        "created_at": now,
        "updated_at": now,
        "data": data or {},
    }


def get_event(conn: sqlite3.Connection, event_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, team_id, event_type, severity, state, title, body, event_date, data_json, created_at, updated_at "
        "FROM gm_event WHERE id = ?",
        (int(event_id),),
    ).fetchone()
    if not row:
        return None
    return _row_to_event(row)


def list_events(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    limit: int = 100,
    states: Optional[List[str]] = None,
    include_global: bool = True,
) -> List[Dict[str, Any]]:
    clauses = []
    params: List[Any] = []
    if team_id is not None:
        if include_global:
            clauses.append("(team_id = ? OR team_id IS NULL)")
            params.append(int(team_id))
        else:
            clauses.append("team_id = ?")
            params.append(int(team_id))
    if states:
        placeholders = ",".join("?" for _ in states)
        clauses.append(f"state IN ({placeholders})")
        params.extend([str(s) for s in states])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = (
        "SELECT id, team_id, event_type, severity, state, title, body, event_date, data_json, created_at, updated_at "
        f"FROM gm_event {where} ORDER BY created_at DESC LIMIT ?"
    )
    params.append(int(limit))
    rows = conn.execute(query, params).fetchall()
    return [_row_to_event(row) for row in rows]


def update_event_state(conn: sqlite3.Connection, event_id: int, state: str) -> None:
    conn.execute(
        "UPDATE gm_event SET state = ?, updated_at = ? WHERE id = ?",
        (str(state), int(time.time()), int(event_id)),
    )
    conn.commit()


def create_decision(
    conn: sqlite3.Connection,
    event_id: Optional[int],
    team_id: Optional[int],
    options: List[Dict[str, Any]],
    created_at: Optional[int] = None,
) -> Dict[str, Any]:
    now = int(created_at or time.time())
    cur = conn.execute(
        "INSERT INTO gm_decision (event_id, team_id, state, choice_key, options_json, created_at, resolved_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            int(event_id) if event_id is not None else None,
            int(team_id) if team_id is not None else None,
            "pending",
            None,
            json.dumps(options or [], ensure_ascii=True),
            now,
            None,
        ),
    )
    conn.commit()
    return {
        "id": int(cur.lastrowid),
        "event_id": int(event_id) if event_id is not None else None,
        "team_id": int(team_id) if team_id is not None else None,
        "state": "pending",
        "choice_key": None,
        "options": options or [],
        "created_at": now,
        "resolved_at": None,
    }


def get_decision(conn: sqlite3.Connection, decision_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, event_id, team_id, state, choice_key, options_json, created_at, resolved_at "
        "FROM gm_decision WHERE id = ?",
        (int(decision_id),),
    ).fetchone()
    if not row:
        return None
    options = json.loads(row["options_json"]) if row["options_json"] else []
    return {
        "id": int(row["id"]),
        "event_id": row["event_id"],
        "team_id": row["team_id"],
        "state": row["state"],
        "choice_key": row["choice_key"],
        "options": options,
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }


def list_decisions(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    state: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    clauses = []
    params: List[Any] = []
    if team_id is not None:
        clauses.append("team_id = ?")
        params.append(int(team_id))
    if state:
        clauses.append("state = ?")
        params.append(str(state))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        "SELECT id, event_id, team_id, state, choice_key, options_json, created_at, resolved_at "
        f"FROM gm_decision {where} ORDER BY created_at DESC LIMIT ?",
        (*params, int(limit)),
    ).fetchall()
    items = []
    for row in rows:
        options = json.loads(row["options_json"]) if row["options_json"] else []
        items.append(
            {
                "id": int(row["id"]),
                "event_id": row["event_id"],
                "team_id": row["team_id"],
                "state": row["state"],
                "choice_key": row["choice_key"],
                "options": options,
                "created_at": row["created_at"],
                "resolved_at": row["resolved_at"],
            }
        )
    return items


def resolve_decision(conn: sqlite3.Connection, decision_id: int, choice_key: str) -> None:
    conn.execute(
        "UPDATE gm_decision SET state = ?, choice_key = ?, resolved_at = ? WHERE id = ?",
        ("resolved", str(choice_key), int(time.time()), int(decision_id)),
    )
    conn.commit()


def create_agenda_item(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    title: str,
    description: str,
    date: Optional[str],
    time_value: Optional[str],
    kind: str,
    event_id: Optional[int] = None,
    data: Optional[Dict[str, Any]] = None,
    created_at: Optional[int] = None,
) -> Dict[str, Any]:
    now = int(created_at or time.time())
    cur = conn.execute(
        "INSERT INTO gm_agenda (team_id, event_id, date, time, title, description, kind, data_json, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            int(team_id) if team_id is not None else None,
            int(event_id) if event_id is not None else None,
            str(date or ""),
            str(time_value or ""),
            str(title or ""),
            str(description or ""),
            str(kind or "event"),
            json.dumps(data or {}, ensure_ascii=True),
            now,
            now,
        ),
    )
    conn.commit()
    return {
        "id": int(cur.lastrowid),
        "team_id": int(team_id) if team_id is not None else None,
        "event_id": int(event_id) if event_id is not None else None,
        "date": str(date or ""),
        "time": str(time_value or ""),
        "title": str(title or ""),
        "description": str(description or ""),
        "kind": str(kind or "event"),
        "created_at": now,
        "updated_at": now,
        "data": data or {},
    }


def list_agenda_items(
    conn: sqlite3.Connection,
    team_id: Optional[int],
    limit: int = 200,
) -> List[Dict[str, Any]]:
    clauses = []
    params: List[Any] = []
    if team_id is not None:
        clauses.append("team_id = ?")
        params.append(int(team_id))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        "SELECT id, team_id, event_id, date, time, title, description, kind, data_json, created_at, updated_at "
        f"FROM gm_agenda {where} ORDER BY date ASC, time ASC LIMIT ?",
        (*params, int(limit)),
    ).fetchall()
    items = []
    for row in rows:
        items.append(
            {
                "id": int(row["id"]),
                "team_id": row["team_id"],
                "event_id": row["event_id"],
                "date": row["date"],
                "time": row["time"],
                "title": row["title"],
                "description": row["description"],
                "kind": row["kind"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "data": json.loads(row["data_json"]) if row["data_json"] else {},
            }
        )
    return items
