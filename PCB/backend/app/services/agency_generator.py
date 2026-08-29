from __future__ import annotations

import random
import uuid
from typing import Dict, List, Tuple

from .name_service import generate_name, pick_nationality

AGENCY_TIERS = ["Boutique", "Mid-Range", "Mega-Agencia", "Academy"]
MARKET_SEGMENTS = ["MALE", "FEMALE", "COED"]
FOCUS_NICHES = ["ELITE", "YOUTH_PROSPECTS", "VETERANS", "JOURNEYMEN"]
AGENT_STYLES = ["Wheeler Dealer", "Shark", "Family Man", "Shadow", "Corporate"]

CORP_PERKS_POOL = ["MEDIA_EMPIRE", "SHADOW_NETWORK"]
AGENT_TRAITS_POOL = ["TRA_AGT_05"]
AGENT_PERKS_POOL = ["PRK_AGT_12"]

AGENT_TRAIT_LABELS = {
    "TRA_AGT_05": "Snake Oil Salesman",
}

AGENT_PERK_LABELS = {
    "PRK_AGT_12": "Poison Pill Master",
}

AGENT_TRAIT_DESC = {
    "TRA_AGT_05": "Vendedor de humo; persuade con promesas y narrativa para cerrar acuerdos.",
}

AGENT_PERK_DESC = {
    "PRK_AGT_12": "Especialista en clausulas que complican la respuesta de rivales.",
}

REGIONS = [
    "IBERIA",
    "USA_EAST",
    "USA_WEST",
    "BALKANS",
    "FRANCE",
    "ITALY",
    "LATAM",
    "AFRICA",
    "NORDIC",
    "UK",
]

AGENCY_NAME_PARTS = [
    "Apex",
    "Nova",
    "Summit",
    "Prime",
    "Atlas",
    "Orbit",
    "Legend",
    "Pulse",
    "Vertex",
    "Titan",
    "Aspire",
    "Pillar",
]

AGENCY_NAME_SUFFIX = ["Sports", "Hoops", "Agency", "Group", "Basket", "Partners"]


def _rand_score(min_v: int = 80, max_v: int = 960) -> int:
    return random.randint(min_v, max_v)


def _pick_agency_name(used: set[str]) -> str:
    for _ in range(200):
        name = f"{random.choice(AGENCY_NAME_PARTS)} {random.choice(AGENCY_NAME_SUFFIX)}"
        if name not in used:
            used.add(name)
            return name
    name = f"Agency {len(used) + 1}"
    used.add(name)
    return name


def generate_agency() -> Dict[str, object]:
    tier = random.choices(AGENCY_TIERS, weights=[40, 35, 15, 10], k=1)[0]
    market = random.choices(MARKET_SEGMENTS, weights=[65, 15, 20], k=1)[0]
    focus = random.choices(FOCUS_NICHES, weights=[25, 30, 25, 20], k=1)[0]

    if tier == "Mega-Agencia":
        base = (650, 980)
    elif tier == "Mid-Range":
        base = (420, 820)
    elif tier == "Boutique":
        base = (280, 700)
    else:
        base = (200, 620)

    agency_id = str(uuid.uuid4())
    agency = {
        "agency_id": agency_id,
        "tier": tier,
        "market_segment": market,
        "focus_niche": focus,
        "market_dominance": _rand_score(*base),
        "scouting_power": _rand_score(*base),
        "reputation_score": _rand_score(*base),
        "alumni_prestige": _rand_score(*base),
        "nil_infrastructure": _rand_score(*base),
        "legal_defense": _rand_score(*base),
        "grudge_pool": {},
        "corporate_perks": random.sample(CORP_PERKS_POOL, k=random.randint(0, min(2, len(CORP_PERKS_POOL)))),
    }
    return agency


def generate_agencies(count: int = 10) -> List[Dict[str, object]]:
    used_names: set[str] = set()
    agencies: List[Dict[str, object]] = []
    for _ in range(max(1, count)):
        agency = generate_agency()
        agency["name"] = _pick_agency_name(used_names)
        agencies.append(agency)
    return agencies


def _network_map() -> Dict[str, int]:
    regions = random.sample(REGIONS, k=random.randint(4, 6))
    return {r: random.randint(10, 100) for r in regions}


def generate_agent(agency: Dict[str, object]) -> Dict[str, object]:
    agent_id = str(uuid.uuid4())
    style = random.choice(AGENT_STYLES)
    nationality = pick_nationality()
    name = generate_name(nationality)

    agent_traits = random.sample(AGENT_TRAITS_POOL, k=random.randint(0, min(1, len(AGENT_TRAITS_POOL))))
    agent_perks = random.sample(AGENT_PERKS_POOL, k=random.randint(0, min(1, len(AGENT_PERKS_POOL))))

    agent = {
        "agent_id": agent_id,
        "agency_id": agency["agency_id"],
        "style": style,
        "greed": _rand_score(120, 980),
        "aggressiveness": _rand_score(80, 960),
        "professionalism": _rand_score(100, 980),
        "vindictiveness": _rand_score(60, 920),
        "gender_spec": _rand_score(100, 1000),
        "youth_recruitment": _rand_score(80, 980),
        "transfer_portal": _rand_score(60, 920),
        "salesmanship": _rand_score(120, 980),
        "hustle_factor": _rand_score(80, 980),
        "flexibility": _rand_score(60, 980),
        "media_reach": _rand_score(60, 980),
        "influence": _rand_score(80, 980),
        "ethics_alignment": _rand_score(40, 1000),
        "coercion_level": _rand_score(40, 980),
        "favors_ledger": random.randint(-10, 10),
        "trust_multiplier": round(random.uniform(0.5, 2.0), 2),
        "traits": agent_traits,
        "traits_label": [AGENT_TRAIT_LABELS.get(t, t) for t in agent_traits],
        "traits_desc": [AGENT_TRAIT_DESC.get(t, AGENT_TRAIT_LABELS.get(t, t)) for t in agent_traits],
        "active_perks": agent_perks,
        "active_perks_label": [AGENT_PERK_LABELS.get(p, p) for p in agent_perks],
        "active_perks_desc": [AGENT_PERK_DESC.get(p, AGENT_PERK_LABELS.get(p, p)) for p in agent_perks],
        "network": _network_map(),
        "name": name,
        "nationality": nationality,
    }
    return agent


def generate_agents(agencies: List[Dict[str, object]], per_agency: Tuple[int, int] = (3, 7)) -> List[Dict[str, object]]:
    agents: List[Dict[str, object]] = []
    for agency in agencies:
        count = random.randint(per_agency[0], per_agency[1])
        for _ in range(count):
            agents.append(generate_agent(agency))
    return agents
