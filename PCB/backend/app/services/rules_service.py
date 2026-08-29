from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ..domain.contract_catalogs import (
    load_contract_bonus_meta,
    load_contract_bonuses,
    load_contract_clause_meta,
    load_contract_clauses,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
RULES_DIR = ROOT_DIR / "infra" / "rules"
COMP_RULES_DIR = RULES_DIR / "competition_rules"
FACILITIES_CATALOG = RULES_DIR / "facilities_catalog.json"
BOARD_OBJECTIVES_CATALOG = RULES_DIR / "board_objectives_catalog.json"


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def list_leagues() -> Dict[str, Any]:
    return _read_json(RULES_DIR / "leagues.json")


def list_competition_rules() -> List[str]:
    if not COMP_RULES_DIR.exists():
        return []
    return sorted([p.name for p in COMP_RULES_DIR.glob("*.json")])


def get_competition_rules(rules_file: str) -> Dict[str, Any]:
    if not rules_file:
        return {}
    path = COMP_RULES_DIR / rules_file
    if not path.exists():
        return {}
    return _read_json(path)


def snapshot() -> Dict[str, Any]:
    catalog = list_leagues()
    leagues = catalog.get("leagues") or []
    enriched = []
    for league in leagues:
        rules_file = league.get("rulesFile") or ""
        rules = get_competition_rules(str(rules_file))
        enriched.append({**league, "rules": rules})
    return {"defaultLeague": catalog.get("defaultLeague"), "leagues": enriched}


def facilities_catalog() -> Dict[str, Any]:
    return _read_json(FACILITIES_CATALOG)


def board_objectives_catalog() -> Dict[str, Any]:
    catalog = _read_json(BOARD_OBJECTIVES_CATALOG)
    objectives = catalog.get("objectives") or []
    thresholds = catalog.get("confidence_thresholds") or {}
    if objectives:
        levels = list(thresholds.keys()) or ["very_high", "high", "medium", "low", "critical"]
        for obj in objectives:
            if "comparison" not in obj:
                metric = str(obj.get("metric") or "")
                if metric in {"league_position", "cup_round"}:
                    obj["comparison"] = "<="
                else:
                    obj["comparison"] = ">="
            if "rewards" not in obj:
                reward_conf = int(obj.get("reward_confidence") or 0)
                reward_budget = int(obj.get("reward_budget") or 0)
                obj["rewards"] = [
                    {"threshold": level, "confidence": reward_conf, "budget": reward_budget}
                    for level in levels
                ]
            if "penalties" not in obj:
                penalty_conf = int(obj.get("penalty_confidence") or 0)
                penalty_budget = int(obj.get("penalty_budget") or 0)
                dismissal = penalty_conf <= -25
                obj["penalties"] = [
                    {
                        "threshold": level,
                        "confidence": penalty_conf,
                        "budget": penalty_budget,
                        "dismissal": dismissal,
                    }
                    for level in levels
                ]
    catalog["objectives"] = objectives
    return catalog


def contract_catalog(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    league_id = str(payload.get("league_id") or "").upper()
    universe = str(payload.get("universe") or "").upper()
    if not universe:
        if league_id == "NBA":
            universe = "NBA"
        elif league_id == "WNBA":
            universe = "WNBA"
        elif league_id.startswith("NCAA"):
            universe = "NCAA"
        else:
            universe = "FIBA"

    clause_meta = load_contract_clause_meta()
    bonus_meta = load_contract_bonus_meta()
    allowed_clauses = load_contract_clauses(universe)
    allowed_bonuses = load_contract_bonuses(universe)

    def _pack(items: List[str], meta: Dict[str, Dict[str, object]]) -> List[Dict[str, Any]]:
        out = []
        for item_id in items or []:
            info = meta.get(item_id) or {}
            availability = info.get("availability") if isinstance(info.get("availability"), dict) else {}
            status = availability.get(universe, "no") if isinstance(availability, dict) else "no"
            out.append(
                {
                    "id": item_id,
                    "label": info.get("label") or item_id,
                    "desc": info.get("desc") or "",
                    "status": status,
                }
            )
        return out

    return {
        "ok": True,
        "universe": universe,
        "clauses": _pack(allowed_clauses, clause_meta),
        "bonuses": _pack(allowed_bonuses, bonus_meta),
    }
