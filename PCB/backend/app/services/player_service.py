from __future__ import annotations

import json
import random
import sqlite3
import time
from typing import Any, Dict, Tuple

from ..repo import contract_repo, player_repo


FOG_TIER_SPREAD = {1: 0.0, 2: 0.05, 3: 0.1, 4: 0.18, 5: 0.28, 6: 0.4}


def _estimate_value(value: int, tier: int, seed: str, min_v: int, max_v: int) -> Tuple[int, Dict[str, int]]:
    tier = max(1, min(6, int(tier or 6)))
    if value is None:
        return value, {"min": min_v, "max": max_v}
    if tier <= 1:
        return int(value), {"min": int(value), "max": int(value)}
    spread = FOG_TIER_SPREAD.get(tier, 0.3)
    delta = max(1, int(value * spread))
    low = max(min_v, int(value) - delta)
    high = min(max_v, int(value) + delta)
    rng = random.Random(f"{seed}:{value}:{tier}")
    estimate = rng.randint(low, high)
    return estimate, {"min": low, "max": high}


def _mask_player_data(data: Dict[str, Any], tier: int, seed: str, source: str = "baseline") -> Dict[str, Any]:
    masked = json.loads(json.dumps(data))
    ranges: Dict[str, Any] = {}

    potential = masked.get("potential")
    est_potential, potential_range = _estimate_value(potential or 0, tier, f"{seed}:potential", 0, 1000)
    masked["potential"] = est_potential
    ranges["potential"] = potential_range

    market_value = masked.get("market_value")
    est_value, value_range = _estimate_value(market_value or 0, tier, f"{seed}:value", 0, 50_000_000)
    masked["market_value"] = est_value
    ranges["market_value"] = value_range

    attrs = masked.get("attributes") or {}
    attr_ranges = {}
    if isinstance(attrs, dict):
        for key, value in attrs.items():
            est_attr, attr_range = _estimate_value(value or 0, tier, f"{seed}:attr:{key}", 1, 1000)
            attrs[key] = est_attr
            attr_ranges[key] = attr_range
        masked["attributes"] = attrs
    ranges["attributes"] = attr_ranges

    masked["scout_view"] = {
        "tier": tier,
        "ranges": ranges,
        "source": source,
    }
    masked.pop("overall", None)
    return masked
from .contract_factory import apply_contract_type, create_contract_data
from .generator_service import generate_player
from .name_service import generate_name


def list_players(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))
    view_team_id = payload.get("view_team_id")
    league_id = payload.get("league_id")
    if not league_id and view_team_id:
        row = conn.execute("SELECT data_json FROM team WHERE id = ?", (int(view_team_id),)).fetchone()
        if row and row["data_json"]:
            try:
                team_data = json.loads(row["data_json"])
            except Exception:
                team_data = {}
            league_id = team_data.get("league_id") or team_data.get("league")

    items = player_repo.list_players(conn, limit=limit, offset=offset, league_id=league_id)
    if league_id:
        league_key = str(league_id).upper()
        total = conn.execute(
            """
            SELECT COUNT(1)
            FROM player p
            LEFT JOIN team t ON json_extract(p.data_json, '$.team_id') = t.id
            WHERE UPPER(COALESCE(
                json_extract(p.data_json, '$.league_id'),
                json_extract(t.data_json, '$.league_id'),
                json_extract(t.data_json, '$.league')
            )) = ?
            """,
            (league_key,),
        ).fetchone()[0]
    else:
        total = conn.execute("SELECT COUNT(1) FROM player").fetchone()[0]
    if view_team_id:
        now = int(time.time())
        reports = {}
        cur = conn.execute(
            "SELECT player_id, data_json, expires_at FROM scout_report WHERE team_id = ? ORDER BY created_at DESC",
            (int(view_team_id),),
        )
        for row in cur.fetchall():
            pid = row["player_id"]
            if pid in reports:
                continue
            expires_at = row["expires_at"]
            if expires_at and int(expires_at) < now:
                continue
            reports[pid] = json.loads(row["data_json"]) if row["data_json"] else {}

        visible_items = []
        for item in items:
            data = item.get("data") or {}
            item_id = item.get("id")
            team_id = data.get("team_id")
            academy_team_id = data.get("academy_team_id")
            if team_id and str(team_id) == str(view_team_id):
                item["data"] = data
                visible_items.append(item)
                continue
            if academy_team_id and str(academy_team_id) == str(view_team_id):
                item["data"] = data
                visible_items.append(item)
                continue

            report = reports.get(item_id)
            is_hidden = bool(data.get("scout_hidden"))
            hidden_academy = academy_team_id and str(academy_team_id) != str(view_team_id)
            if (is_hidden or hidden_academy) and not report:
                continue

            if report:
                tier = int(report.get("tier") or 6)
                source = "report"
            else:
                tier = 6
                source = "baseline"
            item["data"] = _mask_player_data(data, tier, f"{view_team_id}:{item_id}", source=source)
            visible_items.append(item)
        items = visible_items
    return {"items": items, "total": total}


def patch_player(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    player_id = payload.get("player_id") or payload.get("id")
    if player_id is None:
        return {"ok": False, "error": "player_id is required"}
    patch = payload.get("patch") or {}
    if not isinstance(patch, dict):
        return {"ok": False, "error": "patch must be an object"}

    row = conn.execute("SELECT id, name, data_json, updated_at FROM player WHERE id = ?", (int(player_id),)).fetchone()
    if not row:
        return {"ok": False, "error": "Player not found"}

    try:
        data = json.loads(row["data_json"]) if row["data_json"] else {}
    except Exception:
        data = {}

    updated = False
    now = int(time.time())

    if "transfer" in patch and isinstance(patch.get("transfer"), dict):
        tr = patch.get("transfer") or {}
        listed = bool(tr.get("listed")) if "listed" in tr else bool((data.get("transfer") or {}).get("listed"))
        asking_price = tr.get("asking_price", (data.get("transfer") or {}).get("asking_price"))
        try:
            asking_price = int(asking_price) if asking_price is not None else None
        except Exception:
            asking_price = None
        data["transfer"] = {**(data.get("transfer") or {}), "listed": listed, "asking_price": asking_price}
        updated = True

    if "notes" in patch and isinstance(patch.get("notes"), list):
        data["notes"] = patch.get("notes")
        updated = True

    note_text = patch.get("notes_append") or patch.get("note_append") or None
    if isinstance(note_text, str) and note_text.strip():
        notes = data.get("notes")
        if not isinstance(notes, list):
            notes = []
        notes.insert(0, {"ts": now, "text": note_text.strip()})
        data["notes"] = notes[:200]
        updated = True

    if "gm_flags" in patch and isinstance(patch.get("gm_flags"), dict):
        flags = data.get("gm_flags")
        if not isinstance(flags, dict):
            flags = {}
        flags.update(patch.get("gm_flags") or {})
        data["gm_flags"] = flags
        updated = True

    if not updated:
        return {"ok": True, "player": {"id": row["id"], "name": row["name"], "data": data, "updated_at": row["updated_at"]}}

    conn.execute(
        "UPDATE player SET data_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(data, ensure_ascii=True), now, int(player_id)),
    )
    conn.commit()
    return {"ok": True, "player": {"id": row["id"], "name": row["name"], "data": data, "updated_at": now}}


def create_player(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    count = int(payload.get("count", 1))
    team_id = payload.get("team_id")
    create_contract = payload.get("create_contract", True)

    created = []
    team_budget = 0
    roster_size = 12
    league_id = payload.get("league_id")
    if team_id:
        row = conn.execute("SELECT data_json FROM team WHERE id = ?", (team_id,)).fetchone()
        if row and row["data_json"]:
            data = json.loads(row["data_json"])
            team_budget = int(data.get("budget") or 0)
            roster_size = int(data.get("roster_size") or 12)
            league_id = data.get("league_id") or league_id

    def _contract_type_for(data: Dict[str, Any]) -> str:
        age = (data.get("bio") or {}).get("age")
        try:
            age = int(age)
        except (TypeError, ValueError):
            age = 0
        return "scholarship" if age and age < 18 else "pro"

    for idx in range(max(1, count)):
        data = payload.get("data")
        if not data:
            data = generate_player(league_id=league_id)
        if isinstance(data, dict):
            data.pop("overall", None)
        if team_id:
            data["team_id"] = team_id
        base_name = payload.get("name")
        if base_name:
            name = base_name if count == 1 else f"{base_name} {idx + 1}"
        else:
            nationality = data.get("bio", {}).get("nationality", "ES")
            gender = data.get("bio", {}).get("gender")
            name = generate_name(nationality, gender=gender)

        player_id, row = player_repo.create_player(conn, name=name, data=data, updated_at=int(time.time()))
        if row.get("data"):
            row["data"].pop("overall", None)
        created.append(row)
        if team_id and create_contract:
            tier = int(data.get("scout", {}).get("tier") or 3)
            contract_type = _contract_type_for(data)
            contract = payload.get("contract") or create_contract_data(
                tier,
                team_budget,
                roster_size=roster_size,
                contract_type=contract_type,
            )
            contract = apply_contract_type(contract, contract_type)
            contract_repo.create_contract(
                conn,
                player_id=player_id,
                team_id=int(team_id),
                data=contract,
                updated_at=int(time.time()),
            )

    return {"items": created, "total": len(created)}
