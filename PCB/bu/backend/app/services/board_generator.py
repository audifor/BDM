from __future__ import annotations

import random
from typing import Dict, List

from ..domain.board_catalogs import load_board_catalogs
from .name_service import generate_name, pick_nationality


def _rand_attr(mean: float, std: float, min_v: int = 1, max_v: int = 1000) -> int:
    value = int(random.gauss(mean, std))
    return max(min_v, min(max_v, value))


def _generate_attributes(attributes: List[str]) -> Dict[str, int]:
    base = random.randint(380, 720)
    return {key: _rand_attr(base, 130) for key in attributes}


def generate_board_member(role: Dict[str, str], used_names: set[str] | None = None) -> Dict[str, object]:
    catalogs = load_board_catalogs()
    attributes = catalogs["attributes"]
    profiles = catalogs["profiles"]
    attribute_labels = catalogs.get("attribute_labels", {})
    attribute_desc = catalogs.get("attribute_desc", {})

    nationality = pick_nationality()
    name = generate_name(nationality, used_names or set())
    profile = random.choice(profiles) if profiles else {"id": "1", "label": "Perfil", "philosophy": "", "key_attribute": "", "desc": ""}

    member = {
        "name": name,
        "nationality": nationality,
        "role_id": role.get("id"),
        "role": role.get("role"),
        "category": role.get("category"),
        "profile_id": profile.get("id"),
        "profile_label": profile.get("label"),
        "profile_philosophy": profile.get("philosophy"),
        "profile_key": profile.get("key_attribute", ""),
        "profile_desc": profile.get("desc", ""),
        "attributes": _generate_attributes(attributes),
        "attributes_label": attribute_labels,
        "attributes_desc": attribute_desc,
    }
    return member


def generate_board_for_team(target_size: int | None = None) -> List[Dict[str, object]]:
    catalogs = load_board_catalogs()
    roles = catalogs["roles"]
    used_names: set[str] = set()

    role_map = {r["id"]: r for r in roles}
    core_ids = ["BRD_01", "BRD_02", "BRD_05", "BRD_09", "BRD_11", "BRD_16", "BRD_17"]
    board: List[Dict[str, object]] = []
    for role_id in core_ids:
        role = role_map.get(role_id)
        if role:
            board.append(generate_board_member(role, used_names))

    remaining = [r for r in roles if r["id"] not in core_ids]
    random.shuffle(remaining)

    if target_size is None:
        target_size = len(board) + random.randint(2, 4)
    target_size = max(len(board), min(int(target_size), len(roles)))
    extras_needed = max(0, target_size - len(board))
    extras = remaining[:extras_needed]
    for role in extras:
        board.append(generate_board_member(role, used_names))

    return board
