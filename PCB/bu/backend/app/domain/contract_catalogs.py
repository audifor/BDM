from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parents[3]
DOCS_DIR = ROOT_DIR / "Docs" / "Concepto" / "Contratos"

DEFAULT_CONTRACTS = {
    "clauses": ["CLA_16", "CLA_17", "CLA_19", "CLA_32", "CLA_41", "CLA_42"],
    "bonuses": ["BNS_41", "BNS_26", "BNS_28", "BNS_31"],
}

LEAGUES = ("NBA", "WNBA", "NCAA", "FIBA")


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _unique(seq: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _resolve_doc(*names: str) -> Path | None:
    for name in names:
        path = DOCS_DIR / name
        if path.exists():
            return path
    return None


def _clean_text(value: str) -> str:
    if not value:
        return ""
    value = value.replace("`", "").replace("**", "")
    return value.strip()


def _status(cell: str) -> str:
    if not cell:
        return "no"
    if "✅" in cell or "✔" in cell:
        return "ok"
    if "⚠" in cell:
        return "warn"
    if "❌" in cell or "✖" in cell:
        return "no"
    return "no"


def _parse_contract_table(text: str) -> List[Tuple[str, str, str, Dict[str, str]]]:
    rows: List[Tuple[str, str, str, Dict[str, str]]] = []
    for line in text.splitlines():
        if "|" not in line:
            continue
        if re.match(r"^\s*\|\s*-", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7:
            continue
        raw_id = _clean_text(cells[0])
        if not re.match(r"^[A-Z]{3}_\d{2,3}$", raw_id):
            continue
        name = _clean_text(cells[1])
        desc = _clean_text(cells[2])
        availability = {}
        for idx, league in enumerate(LEAGUES, start=3):
            availability[league] = _status(cells[idx] if idx < len(cells) else "")
        rows.append((raw_id, name, desc, availability))
    return rows


def _load_clause_meta() -> Dict[str, Dict[str, object]]:
    if not DOCS_DIR.exists():
        return {}
    path = _resolve_doc("1.Claúsulas.md", "1.Clausulas.md", "1.ClaÃºsulas.md")
    text = _read_text(path) if path else ""
    rows = _parse_contract_table(text)
    meta: Dict[str, Dict[str, object]] = {}
    for clause_id, name, desc, availability in rows:
        meta[clause_id] = {
            "label": name or clause_id,
            "desc": desc,
            "availability": availability,
        }
    return meta


def _load_bonus_meta() -> Dict[str, Dict[str, object]]:
    if not DOCS_DIR.exists():
        return {}
    path = _resolve_doc("2.Bonus.md")
    text = _read_text(path) if path else ""
    rows = _parse_contract_table(text)
    meta: Dict[str, Dict[str, object]] = {}
    for bonus_id, name, desc, availability in rows:
        meta[bonus_id] = {
            "label": name or bonus_id,
            "desc": desc,
            "availability": availability,
        }
    return meta


def load_contract_clause_meta() -> Dict[str, Dict[str, object]]:
    return _load_clause_meta()


def load_contract_bonus_meta() -> Dict[str, Dict[str, object]]:
    return _load_bonus_meta()


def _allowed_for_universe(meta: Dict[str, Dict[str, object]], universe: str | None) -> List[str]:
    if not meta:
        return []
    if not universe:
        return list(meta.keys())
    universe = universe.upper()
    items = []
    for key, data in meta.items():
        status = (data.get("availability") or {}).get(universe, "no")
        if status in ("ok", "warn"):
            items.append(key)
    return items


def load_contract_clauses(universe: str | None = None) -> List[str]:
    meta = _load_clause_meta()
    clauses = _allowed_for_universe(meta, universe)
    return _unique(clauses) or DEFAULT_CONTRACTS["clauses"]


def load_contract_bonuses(universe: str | None = None) -> List[str]:
    meta = _load_bonus_meta()
    bonuses = _allowed_for_universe(meta, universe)
    return _unique(bonuses) or DEFAULT_CONTRACTS["bonuses"]
