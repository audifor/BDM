from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Union

ROOT_DIR = Path(__file__).resolve().parents[3]
DOCS_DIR = ROOT_DIR / "Docs" / "Concepto" / "Players"


DEFAULT_CATALOGS = {
    "attributes": [
        "finishing_close",
        "dunking",
        "mid_range",
        "three_static",
        "free_throw",
        "court_vision",
        "pass_short",
        "def_perimeter",
        "def_post",
        "acceleration",
        "speed_top",
        "strength_static",
        "stamina",
        "durability",
        "ball_control",
        "clutch",
        "work_ethic",
        "mental_tough",
        "chemistry",
        "adaptability",
    ],
    "origins": [f"CTX_{i:02d}" for i in range(1, 51)],
    "mentalities": [str(i) for i in range(1, 21)],
    "traits": ["TRA_PHY_01", "TRA_PER_01", "TRA_MNG_01", "TRA_PSY_01", "TRA_DEV_01"],
    "perks": ["PRK_FIN_01", "PRK_SHO_01", "PRK_PLY_01", "PRK_DEF_01", "PRK_MSC_01"],
    "archetypes": ["FLOOR_GEN", "3_AND_D", "STRETCH_FOUR", "RIM_PROTECTOR"],
    "personalities": ["PERS_001", "PERS_016", "PERS_061"],
    "trait_labels": {},
    "perk_labels": {},
    "archetype_labels": {},
    "mentalidad_labels": {},
    "attribute_labels": {},
    "attribute_categories": {},
    "attribute_desc": {},
    "origin_desc": {},
    "trait_desc": {},
    "perk_desc": {},
    "archetype_desc": {},
    "mentalidad_desc": {},
    "personality_desc": {},
}

MENTALITY_TRANSLATIONS = {
    "MAMBA": "Mamba",
    "MERCENARY": "Mercenario",
    "GENERAL": "General",
    "ROCKSTAR": "Rockstar",
    "BLUE_COLLAR": "Obrero",
    "VOLATILE": "Volatil",
    "ICE_COLD": "Hielo Frio",
    "WINNER": "Ganador",
    "STAT_PADDER": "Cazador de Stats",
    "LOYALIST": "Leal",
    "ENIGMA": "Enigma",
    "TEACHER": "Mentor",
    "BULLY": "Maton",
    "PERFECTIONIST": "Perfeccionista",
    "UNDERDOG": "Underdog",
    "DIVA": "Diva",
    "SYSTEM_PLAYER": "Jugador de Sistema",
    "IRON_WILL": "Voluntad de Hierro",
    "HAPPY_GO_LUCKY": "Alegre",
    "ANALYTICAL": "Analitico",
}


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


def _clean_label(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("*", "").strip())


def _ensure_desc_map(ids: List[str], labels: Dict[str, str], desc_map: Dict[str, str], prefix: str) -> Dict[str, str]:
    for pid in ids:
        if desc_map.get(pid):
            continue
        label = labels.get(pid, pid)
        if prefix:
            desc_map[pid] = _clean_label(f"{prefix}: {label}. Descripcion pendiente.")
        else:
            desc_map[pid] = _clean_label(f"{label}. Descripcion pendiente.")
    return desc_map


def _parse_personality_table(text: str) -> tuple[List[str], Dict[str, str], Dict[str, str]]:
    ids: List[str] = []
    labels: Dict[str, str] = {}
    desc: Dict[str, str] = {}
    for line in text.splitlines():
        if "`PERS_" not in line:
            continue
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cols or not cols[0].startswith("`PERS_"):
            continue
        pid = cols[0].strip("` ").strip()
        label = _clean_label(cols[1]) if len(cols) > 1 else pid
        flag = ""
        narr = ""
        if len(cols) > 11:
            flag = cols[11].strip()
        if len(cols) >= 15:
            narr = cols[-1].strip()
        if flag.startswith("`") and flag.endswith("`"):
            flag = flag.strip("`")
        ids.append(pid)
        labels[pid] = label
        if narr:
            desc[pid] = _clean_label(narr)
        elif flag:
            desc[pid] = _clean_label(f"{label}. Flag: {flag}.")
        else:
            desc[pid] = _clean_label(f"{label}. Rasgo de personalidad.")
    return ids, labels, desc


def _find_first(pattern: str) -> Path | None:
    for path in DOCS_DIR.glob(pattern):
        return path
    return None


CatalogValue = Union[List[str], Dict[str, str]]


def load_catalogs() -> Dict[str, CatalogValue]:
    if not DOCS_DIR.exists():
        return DEFAULT_CATALOGS

    attrs_text = _read_text(DOCS_DIR / "1.Atributos.md")
    origins_text = _read_text(DOCS_DIR / "0.Origenes.md")
    pers_text = _read_text(DOCS_DIR / "3.Personalidades.md")
    traits_text = _read_text(DOCS_DIR / "4.Traits.md")
    perks_text = _read_text(DOCS_DIR / "5.Perks.md")

    arche_path = _find_first("6.Arquetipos*mentalidades*.md")
    mental_path = _find_first("7.Mentalidades*Arquetipos*.md")

    arche_text = _read_text(arche_path) if arche_path else ""
    mental_text = _read_text(mental_path) if mental_path else ""

    attr_pairs = re.findall(
        r"\|\s*`([a-z0-9_]+)`\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        attrs_text,
    )
    attributes = [p[0] for p in attr_pairs] or re.findall(r"`([a-z0-9_]+)`", attrs_text)
    attribute_categories = {pid: _clean_label(cat) for pid, cat, _label, _desc in attr_pairs}
    attribute_labels = {pid: _clean_label(label) for pid, _cat, label, _desc in attr_pairs}
    attribute_desc = {pid: _clean_label(desc) for pid, _cat, _label, desc in attr_pairs}
    origin_labels = {}
    origin_desc = {}
    origin_pairs = re.findall(
        r"\|\s*\*\*`(CTX_\d{2})`\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        origins_text,
    )
    if origin_pairs:
        origin_labels = {pid: _clean_label(label) for pid, label, _effects, _narr in origin_pairs}
        origin_desc = {pid: _clean_label(_narr or _effects) for pid, _label, _effects, _narr in origin_pairs}
    else:
        origin_pairs = re.findall(
            r"\|\s*\*\*`(CTX_\d{2})`\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            origins_text,
        )
        origin_labels = {pid: _clean_label(label) for pid, label, _ in origin_pairs}
        origin_desc = {pid: _clean_label(desc) for pid, _, desc in origin_pairs}
    origins = [p[0] for p in origin_pairs] or re.findall(r"CTX_\d{2}", origins_text)
    trait_pairs = re.findall(
        r"\|\s*`(TRA_[A-Z]+_\d+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        traits_text,
    )
    if trait_pairs:
        trait_labels = {pid: _clean_label(label) for pid, label, _desc, _narr in trait_pairs}
        trait_desc = {pid: _clean_label(_narr or _desc) for pid, _label, _desc, _narr in trait_pairs}
    else:
        trait_pairs = re.findall(
            r"\|\s*`(TRA_[A-Z]+_\d+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            traits_text,
        )
        trait_labels = {pid: _clean_label(label) for pid, label, _ in trait_pairs}
        trait_desc = {pid: _clean_label(desc) for pid, _, desc in trait_pairs}
    traits = [p[0] for p in trait_pairs] or re.findall(r"TRA_[A-Z]+_\d+", traits_text)

    perk_labels = {}
    perk_desc = {}
    perk_pairs = re.findall(
        r"\|\s*`(PRK_[A-Z]+_\d+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        perks_text,
    )
    if perk_pairs:
        perk_labels = {pid: _clean_label(label) for pid, label, _desc, _narr in perk_pairs}
        perk_desc = {pid: _clean_label(_narr or _desc) for pid, _label, _desc, _narr in perk_pairs}
    else:
        perk_pairs = re.findall(
            r"\|\s*`(PRK_[A-Z]+_\d+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            perks_text,
        )
        perk_labels = {pid: _clean_label(label) for pid, label, _desc in perk_pairs}
        perk_desc = {pid: _clean_label(desc) for pid, _, desc in perk_pairs}
    perks = [p[0] for p in perk_pairs] or re.findall(r"PRK_[A-Z]+_\d+", perks_text)

    arche_pairs = re.findall(
        r"\*\*([A-Z0-9_]+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        arche_text,
    )
    if not arche_pairs:
        arche_pairs = re.findall(
            r"\*\*([A-Z0-9_]+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
            arche_text,
        )
        archetype_labels = {pid: _clean_label(label) for pid, label, *_rest in arche_pairs if pid != "ID"}
        archetype_desc = {
            pid: _clean_label(f"{desc}. Boosts: {boosts}. Nerfs: {nerfs}")
            for pid, _label, _cat, desc, boosts, nerfs in arche_pairs
            if pid != "ID"
        }
    else:
        archetype_labels = {pid: _clean_label(label) for pid, label, *_rest in arche_pairs if pid != "ID"}
        archetype_desc = {
            pid: _clean_label(narr or f"{desc}. Boosts: {boosts}. Nerfs: {nerfs}")
            for pid, _label, _cat, desc, narr, boosts, nerfs in arche_pairs
            if pid != "ID"
        }
    archetypes = [p[0] for p in arche_pairs if p[0] != "ID"] or [a for a in re.findall(r"\*\*([A-Z0-9_]+)\*\*", arche_text) if "_" in a and a != "ID"]

    mental_pairs = re.findall(
        r"\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        mental_text,
    )
    if not mental_pairs:
        mental_pairs = re.findall(
            r"\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
            mental_text,
        )
        mentalidad_desc = {
            pid: _clean_label(f"Motivacion: {motivacion}. Partido: {in_game}. Fuera: {off_game}")
            for pid, _label, motivacion, in_game, off_game in mental_pairs
        }
    else:
        mentalidad_desc = {
            pid: _clean_label(narr or f"Motivacion: {motivacion}. Partido: {in_game}. Fuera: {off_game}")
            for pid, _label, motivacion, in_game, off_game, narr in mental_pairs
        }
    mentalities = [p[0] for p in mental_pairs if 0 < int(p[0]) <= 20] or [m for m in re.findall(r"\*\*(\d+)\*\*", mental_text) if 0 < int(m) <= 20]
    mentalidad_raw_labels = {pid: _clean_label(label) for pid, label, *_rest in mental_pairs}
    mentalidad_labels = {pid: MENTALITY_TRANSLATIONS.get(label, _clean_label(label)) for pid, label, *_rest in mental_pairs}

    personalities, personality_labels, personality_desc = _parse_personality_table(pers_text)
    personalities = personalities or re.findall(r"PERS_\d{3}", pers_text)

    catalogs = {
        "attributes": _unique(attributes) or DEFAULT_CATALOGS["attributes"],
        "origins": _unique(origins) or DEFAULT_CATALOGS["origins"],
        "mentalities": _unique(mentalities) or DEFAULT_CATALOGS["mentalities"],
        "traits": _unique(traits) or DEFAULT_CATALOGS["traits"],
        "perks": _unique(perks) or DEFAULT_CATALOGS["perks"],
        "archetypes": _unique(archetypes) or DEFAULT_CATALOGS["archetypes"],
        "personalities": _unique(personalities) or DEFAULT_CATALOGS["personalities"],
        "origin_labels": origin_labels,
        "personality_labels": personality_labels,
        "trait_labels": trait_labels,
        "perk_labels": perk_labels,
        "archetype_labels": archetype_labels,
        "mentalidad_labels": mentalidad_labels,
        "mentalidad_raw_labels": mentalidad_raw_labels,
        "attribute_labels": attribute_labels,
        "attribute_categories": attribute_categories,
        "attribute_desc": attribute_desc,
        "origin_desc": origin_desc,
        "trait_desc": trait_desc,
        "perk_desc": perk_desc,
        "archetype_desc": archetype_desc,
        "mentalidad_desc": mentalidad_desc,
        "personality_desc": personality_desc,
    }

    catalogs["origin_desc"] = _ensure_desc_map(catalogs["origins"], origin_labels, origin_desc, "Origen")
    catalogs["trait_desc"] = _ensure_desc_map(catalogs["traits"], trait_labels, trait_desc, "Trait")
    catalogs["perk_desc"] = _ensure_desc_map(catalogs["perks"], perk_labels, perk_desc, "Perk")
    catalogs["archetype_desc"] = _ensure_desc_map(catalogs["archetypes"], archetype_labels, archetype_desc, "Arquetipo")
    catalogs["mentalidad_desc"] = _ensure_desc_map(catalogs["mentalities"], mentalidad_labels, mentalidad_desc, "Mentalidad")
    catalogs["personality_desc"] = _ensure_desc_map(catalogs["personalities"], personality_labels, personality_desc, "Personalidad")
    catalogs["attribute_desc"] = _ensure_desc_map(catalogs["attributes"], attribute_labels, attribute_desc, "Atributo")

    return catalogs
