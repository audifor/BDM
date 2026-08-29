from __future__ import annotations

import random
from typing import Dict, List

from ..domain.staff_catalogs import load_staff_catalogs
from .name_service import generate_name, pick_nationality


def _rand_attr(mean: float, std: float, min_v: int = 1, max_v: int = 1000) -> int:
    value = int(random.gauss(mean, std))
    return max(min_v, min(max_v, value))


def _sample_unique(pool: List[str], count: int) -> List[str]:
    if count <= 0:
        return []
    if count >= len(pool):
        return list(pool)
    return random.sample(pool, count)


def _generate_attributes(attributes: List[str], key_attrs: List[str]) -> Dict[str, int]:
    base = random.randint(420, 760)
    attr_map: Dict[str, int] = {}
    for key in attributes:
        attr_map[key] = _rand_attr(base, 120)
    for key in key_attrs:
        if key not in attr_map:
            attr_map[key] = _rand_attr(base + 80, 100)
        else:
            attr_map[key] = min(1000, attr_map[key] + random.randint(80, 160))
    return attr_map


def generate_staff_member(role: Dict[str, object], used_names: set[str] | None = None) -> Dict[str, object]:
    catalogs = load_staff_catalogs()
    attributes = catalogs["attributes"]
    traits = catalogs["traits"]
    perks = catalogs["perks"]
    personalities = catalogs["personalities"]
    personality_labels = catalogs.get("personality_labels", {})
    personality_desc = catalogs.get("personality_desc", {})
    trait_labels = catalogs.get("trait_labels", {})
    perk_labels = catalogs.get("perk_labels", {})
    attribute_labels = catalogs.get("attribute_labels", {})
    attribute_desc = catalogs.get("attribute_desc", {})
    trait_desc = catalogs.get("trait_desc", {})
    perk_desc = catalogs.get("perk_desc", {})

    nationality = pick_nationality()
    name = generate_name(nationality, used_names or set())
    personality = random.choice(personalities) if personalities else "PERS_016"

    key_attrs = role.get("key_attributes") or []
    attr_map = _generate_attributes(attributes, list(key_attrs))

    staff_traits = _sample_unique(traits, random.randint(0, 2))
    staff_perks = _sample_unique(perks, random.randint(0, 2))

    staff = {
        "name": name,
        "nationality": nationality,
        "role_id": role.get("id"),
        "role": role.get("role"),
        "department": role.get("department"),
        "experience_years": random.randint(2, 25),
        "personality": personality,
        "personality_label": personality_labels.get(personality, ""),
        "personality_desc": personality_desc.get(personality, ""),
        "attributes": attr_map,
        "attributes_label": attribute_labels,
        "attributes_desc": attribute_desc,
        "traits": staff_traits,
        "traits_label": [trait_labels.get(t, t) for t in staff_traits],
        "traits_desc": [trait_desc.get(t, "") for t in staff_traits],
        "perks": staff_perks,
        "perks_label": [perk_labels.get(p, p) for p in staff_perks],
        "perks_desc": [perk_desc.get(p, "") for p in staff_perks],
    }
    return staff


def generate_staff_for_team(target_size: int | None = None) -> List[Dict[str, object]]:
    catalogs = load_staff_catalogs()
    roles = catalogs["roles"]
    used_names: set[str] = set()

    if not roles:
        return []

    roles_by_dept: Dict[str, List[Dict[str, object]]] = {}
    for role in roles:
        dept = str(role.get("department") or "")
        roles_by_dept.setdefault(dept, []).append(role)

    core_roles: List[Dict[str, object]] = []
    for dept in ["FRONT_OFFICE", "COACHING", "PLAYER_DEV", "SCOUTING", "SUPPORT_TECH", "MEDICAL"]:
        if roles_by_dept.get(dept):
            core_roles.append(random.choice(roles_by_dept[dept]))

    core_ids = {r.get("id") for r in core_roles if r.get("id")}
    remaining = [r for r in roles if r.get("id") not in core_ids]

    if target_size is None:
        target_size = len(roles)
    target_size = max(len(core_roles), min(int(target_size), len(roles)))

    staff_roles = list(core_roles)
    if target_size > len(staff_roles) and remaining:
        take = min(len(remaining), target_size - len(staff_roles))
        staff_roles.extend(random.sample(remaining, k=take))

    staff = [generate_staff_member(role, used_names) for role in staff_roles]
    return staff
