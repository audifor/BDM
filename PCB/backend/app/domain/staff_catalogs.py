from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List

ROOT_DIR = Path(__file__).resolve().parents[3]
DOCS_DIR = ROOT_DIR / "Docs" / "Concepto" / "Staff"

DEFAULT_STAFF = {
    "attributes": ["game_mgmt", "psy_locker", "sct_eval_curr", "sct_trade", "med_diagnosis"],
    "traits": ["STR_S_01", "STR_S_14", "STR_M_11"],
    "perks": ["SPR_S_08", "SPR_S_18", "SPR_M_01"],
    "personalities": ["PERS_016", "PERS_041", "PERS_063"],
    "trait_labels": {},
    "perk_labels": {},
    "attribute_labels": {},
    "attribute_desc": {},
    "trait_desc": {},
    "perk_desc": {},
    "personality_desc": {},
    "roles": [
        {"id": "STF_01", "department": "FRONT_OFFICE", "role": "General Manager", "key_attributes": ["sct_eval_curr"]},
        {"id": "STF_02", "department": "COACHING", "role": "Head Coach", "key_attributes": ["game_mgmt"]},
        {"id": "STF_09", "department": "SCOUTING", "role": "Director of Scouting", "key_attributes": ["sct_network_mgmt"]},
    ],
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


def _humanize_id(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ").strip()).title()


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


SPECIAL_ATTR_LABELS = {
    "game_mgmt": "Gestion de partido",
    "rotation_logic": "Logica de rotacion",
    "off_scheme_all": "Esquema ofensivo global",
    "def_scheme_all": "Esquema defensivo global",
    "staff_harmony": "Armonia del staff",
    "tactical_intel": "Inteligencia tactica",
    "tactical_prep": "Preparacion tactica",
    "video_analysis": "Analisis de video",
    "shot_selection_opt": "Optimizacion de tiro",
    "logistics_opt": "Optimizacion logistica",
    "fatigue_reduction": "Reduccion de fatiga",
    "fin_management": "Gestion financiera",
    "small_morale_boost": "Micro-boost moral",
    "off_teach_ft": "Ensenar tiro libre",
    "sct_network_mgmt": "Gestion red scouting",
    "sct_accuracy": "Precision scouting",
}

OFF_TEACH_MAP = {
    "shoot": "Ensenar tiro",
    "finish": "Ensenar finalizacion",
    "handle": "Ensenar manejo",
    "1v1": "Ensenar 1v1",
    "pass": "Ensenar pase",
}

OFF_SCHEME_MAP = {
    "pace": "Esquema ritmo",
    "set": "Esquema sistemas",
    "pnr": "Esquema P&R",
    "space": "Esquema espaciado",
    "iso": "Esquema aislamiento",
    "post": "Esquema poste",
}

DEF_TEACH_MAP = {
    "onball": "Ensenar defensa on-ball",
    "rim": "Ensenar proteccion aro",
    "hands": "Ensenar manos",
    "reb": "Ensenar rebote",
    "screen": "Ensenar navegacion bloqueos",
}

DEF_SCHEME_MAP = {
    "help": "Esquema ayudas",
    "pnr": "Esquema P&R defensa",
    "zone": "Esquema zona",
    "trans": "Esquema transicion",
    "press": "Esquema presion",
}

DEV_MAP = {
    "strength": "Fuerza",
    "speed": "Velocidad y agilidad",
    "vertical": "Salto y pliometria",
    "cardio": "Resistencia",
    "flexibility": "Flexibilidad",
    "coord": "Coordinacion mano-ojo",
    "prospect": "Desarrollo prospectos",
    "veteran": "Mantenimiento veteranos",
    "position": "Conversion de posicion",
    "work_ethic": "Etica de trabajo",
    "load_mgmt": "Gestion de carga",
    "weight": "Control de peso",
    "regression": "Sin regresion",
    "gleague": "Supervision G-League",
    "predraft": "Preparacion pre-draft",
}

PSY_MAP = {
    "ego": "Gestion del ego",
    "locker": "Vestuario",
    "crisis": "Resolver crisis",
    "toughness": "Dureza mental",
    "clutch_dev": "Desarrollo clutch",
    "adapt": "Adaptabilidad",
    "focus": "Enfoque y consistencia",
    "aggress": "Agresividad",
    "welfare": "Bienestar del jugador",
    "role": "Aceptacion de rol",
    "media": "Entrenamiento mediatico",
    "staff": "Armonia staff",
    "owner": "Relacion con dueno",
    "culture": "Cultura",
    "loyalty": "Lealtad",
}

SCT_MAP = {
    "eval_curr": "Evaluacion actual",
    "eval_pot": "Proyeccion potencial",
    "character": "Chequeo de caracter",
    "medical": "Intel medica",
    "draft": "Evaluacion draft",
    "intl": "Red internacional",
    "gem": "Buscar gemas",
    "analytics": "Analitica",
    "cap": "Ingenieria cap",
    "contract": "Negociacion",
    "trade": "Traspasos",
    "value": "Valor activos",
    "recruit": "Reclutamiento",
    "agent": "Relacion agentes",
    "spy": "Intel rival",
}

MED_MAP = {
    "diagnosis": "Diagnostico",
    "acute": "Tratamiento agudo",
    "chronic": "Manejo cronico",
    "fatigue": "Recuperacion fatiga",
    "surgery": "Cirugia",
    "prevent": "Prevencion",
    "nutrition": "Nutricion",
    "sleep": "Ciencia del sueno",
    "regen": "Tecnologia regeneracion",
    "emergency": "Emergencias",
    "infectious": "Control de virus",
    "mental": "Salud mental",
    "rehab_mor": "Motivacion rehab",
    "peaking": "Puesta a punto",
    "longevity": "Longevidad",
}


def _translate_attr_label(attr_id: str, label: str) -> str:
    if attr_id in SPECIAL_ATTR_LABELS:
        return SPECIAL_ATTR_LABELS[attr_id]
    if attr_id.startswith("off_teach_"):
        suffix = attr_id.replace("off_teach_", "")
        return OFF_TEACH_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id.startswith("off_scheme_"):
        suffix = attr_id.replace("off_scheme_", "")
        return OFF_SCHEME_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id == "off_shot_select":
        return "Seleccion de tiro"
    if attr_id == "off_movement":
        return "Movimiento sin balon"
    if attr_id == "off_ato_creative":
        return "Creatividad ATO"
    if attr_id == "off_adjustments":
        return "Ajustes en partido"
    if attr_id.startswith("def_teach_"):
        suffix = attr_id.replace("def_teach_", "")
        return DEF_TEACH_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id.startswith("def_scheme_"):
        suffix = attr_id.replace("def_scheme_", "")
        return DEF_SCHEME_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id == "def_discipline":
        return "Disciplina defensiva"
    if attr_id == "def_matchup":
        return "Explotar emparejamientos"
    if attr_id == "def_comm":
        return "Comunicacion"
    if attr_id == "def_clutch":
        return "Defensa clutch"
    if attr_id == "def_adjustments":
        return "Ajustes defensivos"
    if attr_id.startswith("dev_"):
        suffix = attr_id.replace("dev_", "")
        return DEV_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id.startswith("psy_"):
        suffix = attr_id.replace("psy_", "")
        return PSY_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id.startswith("sct_"):
        suffix = attr_id.replace("sct_", "")
        return SCT_MAP.get(suffix, _humanize_id(attr_id))
    if attr_id.startswith("med_"):
        suffix = attr_id.replace("med_", "")
        return MED_MAP.get(suffix, _humanize_id(attr_id))
    return _humanize_id(label or attr_id)

def load_staff_catalogs() -> Dict[str, object]:
    if not DOCS_DIR.exists():
        return DEFAULT_STAFF

    roles_text = _read_text(DOCS_DIR / "0.Roles.md")
    attrs_text = _read_text(DOCS_DIR / "1.Atributos.md")
    pers_text = _read_text(DOCS_DIR / "2.Personalidades.md")
    traits_s_text = _read_text(DOCS_DIR / "3.Traits deportivos.md")
    perks_s_text = _read_text(DOCS_DIR / "4.Perks Deportivos.md")
    traits_m_text = _read_text(DOCS_DIR / "5.Traits Médicos.md")
    perks_m_text = _read_text(DOCS_DIR / "6.Perks Médicos.md")

    attr_pairs = re.findall(r"\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|", attrs_text)
    attributes = [p[0] for p in attr_pairs] or re.findall(r"`([a-z0-9_]+)`", attrs_text)
    attribute_labels = {pid: _translate_attr_label(pid, label) for pid, label, _desc in attr_pairs}
    attribute_desc = {pid: _clean_label(desc) for pid, _label, desc in attr_pairs}
    if not attribute_labels:
        attribute_labels = {pid: _translate_attr_label(pid, pid) for pid in attributes}

    trait_pairs_s = re.findall(
        r"\|\s*`(STR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        traits_s_text,
    )
    trait_pairs_m = re.findall(
        r"\|\s*`(STR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        traits_m_text,
    )
    if trait_pairs_s or trait_pairs_m:
        trait_labels = {pid: _clean_label(label) for pid, label, _desc, _narr in trait_pairs_s + trait_pairs_m}
        trait_desc = {pid: _clean_label(_narr or _desc) for pid, _label, _desc, _narr in trait_pairs_s + trait_pairs_m}
    else:
        trait_pairs_s = re.findall(
            r"\|\s*`(STR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            traits_s_text,
        )
        trait_pairs_m = re.findall(
            r"\|\s*`(STR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            traits_m_text,
        )
        trait_labels = {pid: _clean_label(label) for pid, label, _desc in trait_pairs_s + trait_pairs_m}
        trait_desc = {pid: _clean_label(desc) for pid, _label, desc in trait_pairs_s + trait_pairs_m}
    traits = [p[0] for p in trait_pairs_s + trait_pairs_m] or (
        re.findall(r"STR_[A-Z]_\d{2}", traits_s_text) + re.findall(r"STR_[A-Z]_\d{2}", traits_m_text)
    )

    perk_pairs_s = re.findall(
        r"\|\s*`(SPR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        perks_s_text,
    )
    perk_pairs_m = re.findall(
        r"\|\s*`(SPR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
        perks_m_text,
    )
    if not perk_pairs_s and not perk_pairs_m:
        perk_pairs_s = re.findall(
            r"\|\s*`(SPR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            perks_s_text,
        )
        perk_pairs_m = re.findall(
            r"\|\s*`(SPR_[A-Z]_\d{2})`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|",
            perks_m_text,
        )
        perk_labels = {pid: _clean_label(label) for pid, label, _desc in perk_pairs_s + perk_pairs_m}
        perk_desc = {pid: _clean_label(desc) for pid, _label, desc in perk_pairs_s + perk_pairs_m}
    else:
        perk_labels = {pid: _clean_label(label) for pid, label, _desc, _narr in perk_pairs_s + perk_pairs_m}
        perk_desc = {pid: _clean_label(_narr or _desc) for pid, _label, _desc, _narr in perk_pairs_s + perk_pairs_m}
    perks = [p[0] for p in perk_pairs_s + perk_pairs_m] or (
        re.findall(r"SPR_[A-Z]_\d{2}", perks_s_text) + re.findall(r"SPR_[A-Z]_\d{2}", perks_m_text)
    )

    personalities, personality_labels, personality_desc = _parse_personality_table(pers_text)
    personalities = personalities or re.findall(r"PERS_\d{3}", pers_text)

    roles: List[Dict[str, object]] = []
    for line in roles_text.splitlines():
        if "STF_" not in line:
            continue
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cols or not cols[0].startswith("`STF_"):
            continue
        role_id = cols[0].strip("`")
        department = cols[1] if len(cols) > 1 else ""
        role_name = _clean_label(cols[2]) if len(cols) > 2 else role_id
        role_desc = _clean_label(cols[5]) if len(cols) > 5 else ""
        key_attrs = re.findall(r"`([a-z0-9_]+)`", line)
        roles.append(
            {
                "id": role_id,
                "department": department,
                "role": role_name,
                "role_desc": role_desc,
                "key_attributes": key_attrs,
            }
        )

    # Ensure key attributes also have labels/desc for UI
    for role in roles:
        for key in role.get("key_attributes") or []:
            if key not in attribute_labels:
                attribute_labels[key] = _translate_attr_label(key, key)
            if key not in attribute_desc:
                attribute_desc[key] = _clean_label(f"Atributo clave: {attribute_labels[key]}.")

    catalogs = {
        "attributes": _unique(attributes) or DEFAULT_STAFF["attributes"],
        "traits": _unique(traits) or DEFAULT_STAFF["traits"],
        "perks": _unique(perks) or DEFAULT_STAFF["perks"],
        "personalities": _unique(personalities) or DEFAULT_STAFF["personalities"],
        "personality_labels": personality_labels,
        "trait_labels": trait_labels,
        "perk_labels": perk_labels,
        "attribute_labels": attribute_labels,
        "attribute_desc": attribute_desc,
        "trait_desc": trait_desc,
        "perk_desc": perk_desc,
        "personality_desc": personality_desc,
        "roles": roles or DEFAULT_STAFF["roles"],
    }

    catalogs["attribute_desc"] = _ensure_desc_map(catalogs["attributes"], attribute_labels, attribute_desc, "Atributo")
    catalogs["trait_desc"] = _ensure_desc_map(catalogs["traits"], trait_labels, trait_desc, "Trait")
    catalogs["perk_desc"] = _ensure_desc_map(catalogs["perks"], perk_labels, perk_desc, "Perk")
    catalogs["personality_desc"] = _ensure_desc_map(catalogs["personalities"], personality_labels, personality_desc, "Personalidad")

    return catalogs
