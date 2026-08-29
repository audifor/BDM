from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List

ROOT_DIR = Path(__file__).resolve().parents[3]
DOCS_DIR = ROOT_DIR / "Docs" / "Concepto" / "Directiva"

DEFAULT_BOARD = {
    "attributes": ["sct_eval_curr", "psy_owner", "sct_contract", "sct_trade"],
    "profiles": [{"id": "1", "label": "El Magnate Impaciente", "philosophy": "Ganar Ya o Despido"}],
    "attribute_labels": {},
    "attribute_desc": {},
    "roles": [
        {"id": "BRD_01", "category": "OWNERSHIP", "role": "Presidente / Propietario"},
        {"id": "BRD_02", "category": "EXECUTIVE", "role": "CEO / Director Ejecutivo"},
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

def load_board_catalogs() -> Dict[str, object]:
    if not DOCS_DIR.exists():
        return DEFAULT_BOARD

    roles_text = _read_text(DOCS_DIR / "0.Roles.md")
    attrs_text = _read_text(DOCS_DIR / "1.Atributos.md")
    pers_text = _read_text(DOCS_DIR / "2.Personalidades.md")

    attr_pairs = re.findall(r"\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|", attrs_text)
    attributes = [p[0] for p in attr_pairs] or re.findall(r"`([a-z0-9_]+)`", attrs_text)
    attribute_labels = {pid: _translate_attr_label(pid, label) for pid, label, _desc in attr_pairs}
    attribute_desc = {pid: _clean_label(desc) for pid, _label, desc in attr_pairs}
    if not attribute_labels:
        attribute_labels = {pid: _translate_attr_label(pid, pid) for pid in attributes}

    roles: List[Dict[str, str]] = []
    for line in roles_text.splitlines():
        if "BRD_" not in line:
            continue
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cols or not cols[0].startswith("`BRD_"):
            continue
        role_id = cols[0].strip("`")
        category = _clean_label(cols[1]) if len(cols) > 1 else ""
        role_name = _clean_label(cols[2]) if len(cols) > 2 else role_id
        role_desc = _clean_label(cols[4]) if len(cols) > 4 else ""
        roles.append({"id": role_id, "category": category, "role": role_name, "role_desc": role_desc})

    profiles: List[Dict[str, str]] = []
    profile_pairs = re.findall(
        r"\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        pers_text,
    )
    if not profile_pairs:
        profile_pairs = re.findall(
            r"\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*([^|]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|",
            pers_text,
        )
        for profile_id, label, philosophy, key_attr in profile_pairs:
            clean_label = _clean_label(label)
            clean_philosophy = _clean_label(philosophy)
            clean_key_attr = _clean_label(key_attr)
            profiles.append(
                {
                    "id": profile_id.strip(),
                    "label": clean_label,
                    "philosophy": clean_philosophy,
                    "key_attribute": clean_key_attr,
                    "desc": _clean_label(f"Filosofia: {clean_philosophy}. Atributo clave: {clean_key_attr}"),
                }
            )
    else:
        for profile_id, label, philosophy, key_attr, narr in profile_pairs:
            clean_label = _clean_label(label)
            clean_philosophy = _clean_label(philosophy)
            clean_key_attr = _clean_label(key_attr)
            clean_narr = _clean_label(narr)
            profiles.append(
                {
                    "id": profile_id.strip(),
                    "label": clean_label,
                    "philosophy": clean_philosophy,
                    "key_attribute": clean_key_attr,
                    "desc": clean_narr
                    if clean_narr
                    else _clean_label(f"Filosofia: {clean_philosophy}. Atributo clave: {clean_key_attr}"),
                }
            )

    catalogs = {
        "attributes": _unique(attributes) or DEFAULT_BOARD["attributes"],
        "attribute_labels": attribute_labels,
        "attribute_desc": attribute_desc,
        "roles": roles or DEFAULT_BOARD["roles"],
        "profiles": profiles or DEFAULT_BOARD["profiles"],
    }

    catalogs["attribute_desc"] = _ensure_desc_map(catalogs["attributes"], attribute_labels, attribute_desc, "Atributo")

    return catalogs
