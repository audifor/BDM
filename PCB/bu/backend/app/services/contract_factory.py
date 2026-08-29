from __future__ import annotations

import random
from datetime import date
from typing import Dict, List

from ..domain.contract_catalogs import (
    load_contract_bonus_meta,
    load_contract_bonuses,
    load_contract_clause_meta,
    load_contract_clauses,
)

BASE_CLAUSES = ["CLA_16", "CLA_17", "CLA_19", "CLA_32"]
BASE_BONUSES = ["BNS_41", "BNS_26", "BNS_28"]

TIER_EXTRA_CLAUSES = {
    1: ["CLA_04", "CLA_07", "CLA_41", "CLA_83", "CLA_87"],
    2: ["CLA_05", "CLA_07", "CLA_41", "CLA_83"],
    3: ["CLA_05", "CLA_08", "CLA_43"],
    4: ["CLA_08", "CLA_42", "CLA_65"],
    5: ["CLA_42", "CLA_08"],
    6: ["CLA_42"],
}

TIER_EXTRA_BONUSES = {
    1: ["BNS_07", "BNS_26", "BNS_31", "BNS_32"],
    2: ["BNS_28", "BNS_30", "BNS_36"],
    3: ["BNS_28", "BNS_31", "BNS_33"],
    4: ["BNS_31", "BNS_36", "BNS_37"],
    5: ["BNS_31", "BNS_40"],
    6: ["BNS_31"],
}

TIER_SALARY_MULT = {1: 2.2, 2: 1.6, 3: 1.2, 4: 0.9, 5: 0.7, 6: 0.5}

TIER_GUARANTEE = {
    1: (90, 100),
    2: (75, 95),
    3: (55, 80),
    4: (40, 65),
    5: (30, 55),
    6: (20, 45),
}


def _add_years(start: date, years: int) -> date:
    try:
        return start.replace(year=start.year + years)
    except ValueError:
        # February 29 fallback
        return start.replace(month=2, day=28, year=start.year + years)


def _pick_years(tier: int) -> int:
    if tier <= 1:
        return random.choice([3, 4])
    if tier == 2:
        return random.choice([2, 3])
    if tier == 3:
        return random.choice([2, 3])
    if tier == 4:
        return random.choice([1, 2])
    return 1


def _pick_clauses(tier: int, universe: str | None) -> List[str]:
    available = set(load_contract_clauses(universe))
    clauses: List[str] = []
    for base in BASE_CLAUSES:
        if base in available:
            clauses.append(base)
    extras = [c for c in TIER_EXTRA_CLAUSES.get(tier, []) if c in available]
    if extras:
        take = random.randint(1, min(3, len(extras)))
        clauses.extend(random.sample(extras, take))
    return list(dict.fromkeys(clauses))


def _pick_bonuses(tier: int, universe: str | None) -> List[str]:
    available = set(load_contract_bonuses(universe))
    bonuses: List[str] = []
    for base in BASE_BONUSES:
        if base in available:
            bonuses.append(base)
    extras = [b for b in TIER_EXTRA_BONUSES.get(tier, []) if b in available]
    if extras:
        take = random.randint(1, min(3, len(extras)))
        bonuses.extend(random.sample(extras, take))
    return list(dict.fromkeys(bonuses))


def _pack_items(items: List[str], meta: Dict[str, Dict[str, object]]) -> List[Dict[str, object]]:
    packed = []
    for item_id in items:
        info = meta.get(item_id, {})
        packed.append(
            {
                "id": item_id,
                "label": info.get("label", item_id),
                "desc": info.get("desc", ""),
                "availability": info.get("availability", {}),
            }
        )
    return packed


def create_contract_data(
    tier: int,
    team_budget: int,
    roster_size: int = 12,
    universe: str | None = "FIBA",
) -> Dict[str, object]:
    tier = max(1, min(6, int(tier or 3)))
    years = _pick_years(tier)

    start = date(2026, 7, 1)
    end = _add_years(start, years).replace(month=6, day=30)

    avg_salary = max(80_000, int(team_budget / max(1, roster_size)))
    salary = int(avg_salary * TIER_SALARY_MULT.get(tier, 1.0) * random.uniform(0.85, 1.15))
    salary = max(60_000, min(2_200_000, salary))

    raise_pct = random.choice([0.0, 0.02, 0.03, 0.04])
    yearly_salary = []
    current = salary
    for _ in range(years):
        yearly_salary.append(int(current))
        current = int(current * (1 + raise_pct))

    g_min, g_max = TIER_GUARANTEE.get(tier, (50, 80))
    guaranteed_pct = random.randint(g_min, g_max)

    option = None
    if tier <= 2 and years >= 3 and random.random() < 0.35:
        option = {"type": "player", "year": years}
    elif tier <= 4 and years >= 2 and random.random() < 0.2:
        option = {"type": "team", "year": years}

    clauses = _pick_clauses(tier, universe)
    bonuses = _pick_bonuses(tier, universe)
    clause_meta = load_contract_clause_meta()
    bonus_meta = load_contract_bonus_meta()

    contract = {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "years": years,
        "salary": yearly_salary[0],
        "yearly_salary": yearly_salary,
        "raise_pct": raise_pct,
        "currency": "EUR",
        "guaranteed_pct": guaranteed_pct,
        "clauses": clauses,
        "clauses_detail": _pack_items(clauses, clause_meta),
        "bonuses": bonuses,
        "bonuses_detail": _pack_items(bonuses, bonus_meta),
        "status": "active",
        "universe": universe,
    }
    if option:
        contract["option"] = option
    return contract


def create_staff_contract_data(
    tier: int,
    team_budget: int,
    staff_size: int = 10,
    universe: str | None = "FIBA",
) -> Dict[str, object]:
    staff_budget = max(200_000, int(team_budget * 0.25))
    staff_size = max(1, int(staff_size or 1))
    contract = create_contract_data(
        tier=tier,
        team_budget=staff_budget,
        roster_size=staff_size,
        universe=universe,
    )
    contract["contract_type"] = "staff"
    return contract
