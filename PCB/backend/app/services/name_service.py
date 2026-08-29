from __future__ import annotations

import json
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

try:
    from faker import Faker
    from polyfactory.factories.dataclass_factory import DataclassFactory
except Exception:  # pragma: no cover - optional dependency
    Faker = None
    DataclassFactory = None


NATIONALITY_POOLS: Dict[str, Dict[str, List[str]]] = {
    "ES": {
        "first": [
            "Adrian", "Alvaro", "Carlos", "Dario", "Diego", "Edu", "Felix", "Gonzalo",
            "Hector", "Ivan", "Jaime", "Jorge", "Lucas", "Manuel", "Mario", "Nestor",
            "Oscar", "Pablo", "Rafa", "Raul", "Sergio", "Tomas", "Victor",
        ],
        "first_f": [
            "Ana", "Beatriz", "Carla", "Carmen", "Elena", "Irene", "Julia", "Laura",
            "Lucia", "Maria", "Natalia", "Paula", "Sara",
        ],
        "last": [
            "Alonso", "Cruz", "Diaz", "Ferrer", "Garcia", "Gomez", "Hernandez",
            "Iglesias", "Jimenez", "Lopez", "Marin", "Martinez", "Molina", "Navarro",
            "Ortega", "Perez", "Ramirez", "Romero", "Ruiz", "Sanchez", "Serrano",
            "Suarez", "Torres", "Vega",
        ],
    },
    "US": {
        "first": [
            "Aaron", "Anthony", "Brandon", "Cameron", "Chris", "Derrick", "Ethan",
            "Jamal", "Jason", "Jordan", "Kevin", "Liam", "Marcus", "Noah", "Owen",
            "Ryan", "Trevor", "Tyler", "Zion",
        ],
        "first_f": [
            "Ashley", "Brianna", "Chloe", "Emily", "Grace", "Hailey", "Jasmine",
            "Madison", "Olivia", "Sophia", "Taylor", "Zoe",
        ],
        "last": [
            "Anderson", "Brown", "Clark", "Coleman", "Davis", "Edwards", "Foster",
            "Green", "Harris", "Jackson", "Johnson", "King", "Miller", "Mitchell",
            "Parker", "Robinson", "Smith", "Taylor", "Walker", "Williams",
        ],
    },
    "AR": {
        "first": [
            "Agustin", "Bruno", "Emiliano", "Facundo", "Franco", "Gaston", "Juan",
            "Lautaro", "Marcos", "Matias", "Nicolas", "Rodrigo", "Santiago",
        ],
        "first_f": [
            "Camila", "Florencia", "Julieta", "Lucia", "Mariana", "Martina",
            "Paula", "Sofia", "Valentina",
        ],
        "last": [
            "Alvarez", "Aguirre", "Benitez", "Fernandez", "Gimenez", "Gonzalez",
            "Lopez", "Mendez", "Morales", "Pereyra", "Rios", "Silva", "Sosa",
            "Torres",
        ],
    },
    "FR": {
        "first": [
            "Alexis", "Antoine", "Baptiste", "Clement", "Hugo", "Julien", "Lucas",
            "Mathieu", "Maxime", "Nicolas", "Olivier", "Quentin", "Sebastien",
        ],
        "first_f": [
            "Amelie", "Camille", "Chloe", "Claire", "Elise", "Juliette", "Lea",
            "Manon", "Sophie",
        ],
        "last": [
            "Bernard", "Dubois", "Dupont", "Fontaine", "Garcia", "Leroy", "Martin",
            "Moreau", "Petit", "Rousseau", "Simon", "Thomas",
        ],
    },
    "IT": {
        "first": [
            "Alessandro", "Andrea", "Angelo", "Davide", "Francesco", "Giorgio",
            "Lorenzo", "Marco", "Matteo", "Nicola", "Paolo", "Stefano",
        ],
        "first_f": [
            "Alessia", "Chiara", "Elisa", "Federica", "Francesca", "Giulia",
            "Martina", "Sofia", "Valentina",
        ],
        "last": [
            "Bianchi", "Conti", "Costa", "Esposito", "Ferrari", "Gallo", "Greco",
            "Lombardi", "Mancini", "Romano", "Rossi", "Russo",
        ],
    },
    "RS": {
        "first": [
            "Aleksandar", "Bogdan", "Dusan", "Igor", "Marko", "Milan", "Nemanja",
            "Nikola", "Ognjen", "Stefan", "Vladimir",
        ],
        "first_f": [
            "Ana", "Jelena", "Milica", "Natalija", "Nina", "Sofija", "Teodora",
        ],
        "last": [
            "Jovic", "Jovanovic", "Kovacic", "Markovic", "Milosavljevic", "Nikolic",
            "Petrovic", "Popovic", "Stojanovic",
        ],
    },
    "LT": {
        "first": ["Arnas", "Domas", "Eimantas", "Jonas", "Mantas", "Mindaugas", "Tomas"],
        "first_f": ["Aiste", "Egle", "Gintare", "Juste", "Lina", "Ruta", "Vaida"],
        "last": ["Jankauskas", "Kavaliauskas", "Kazlauskas", "Sabonis", "Valanciunas"],
    },
    "HR": {
        "first": ["Ante", "Dario", "Filip", "Ivan", "Josip", "Luka", "Mario", "Stjepan"],
        "first_f": ["Ana", "Dora", "Ivana", "Marija", "Petra", "Sara", "Tea"],
        "last": ["Bojanovic", "Horvat", "Kovacevic", "Maric", "Petrovic"],
    },
    "SI": {
        "first": ["Anze", "Bostjan", "Jaka", "Luka", "Marko", "Zoran"],
        "first_f": ["Ana", "Eva", "Klara", "Maja", "Nina", "Tina"],
        "last": ["Dragic", "Kovacic", "Novak", "Zupan"],
    },
    "BR": {
        "first": ["Bruno", "Caio", "Diego", "Felipe", "Guilherme", "Joao", "Lucas", "Rafael"],
        "first_f": [
            "Ana", "Beatriz", "Carla", "Fernanda", "Gabriela", "Isabela",
            "Juliana", "Mariana", "Patricia",
        ],
        "last": ["Almeida", "Barbosa", "Costa", "Ferreira", "Gomes", "Moreira", "Silva"],
    },
    "CA": {
        "first": ["Adam", "Caleb", "Evan", "Jared", "Miles", "Nathan", "Tyson"],
        "first_f": ["Ava", "Charlotte", "Emma", "Hannah", "Lily", "Mia", "Olivia", "Sophie"],
        "last": ["Bennett", "Campbell", "Carter", "Grant", "Murray", "Reid", "Turner"],
    },
    "NG": {
        "first": ["Chinedu", "Ifeanyi", "Kelechi", "Kunle", "Obi", "Olumide", "Tunde"],
        "first_f": ["Ada", "Chioma", "Efe", "Ngozi", "Nneka", "Oluwaseun", "Zainab"],
        "last": ["Adeyemi", "Okafor", "Okoro", "Olawale", "Onyeka", "Ogunleye"],
    },
}

NATIONALITY_WEIGHTS: Sequence[Tuple[str, float]] = [
    ("ES", 0.45),
    ("US", 0.12),
    ("AR", 0.07),
    ("FR", 0.06),
    ("IT", 0.06),
    ("RS", 0.05),
    ("LT", 0.04),
    ("HR", 0.04),
    ("SI", 0.03),
    ("BR", 0.04),
    ("CA", 0.03),
    ("NG", 0.01),
]

LEAGUE_NATIONALITY_WEIGHTS: Dict[str, Sequence[Tuple[str, float]]] = {
    "ACB": [
        ("ES", 0.42),
        ("US", 0.14),
        ("AR", 0.07),
        ("FR", 0.06),
        ("IT", 0.05),
        ("RS", 0.06),
        ("LT", 0.04),
        ("HR", 0.04),
        ("SI", 0.03),
        ("BR", 0.04),
        ("CA", 0.03),
        ("NG", 0.02),
    ],
    "FEB": [
        ("ES", 0.65),
        ("US", 0.08),
        ("AR", 0.06),
        ("FR", 0.04),
        ("IT", 0.03),
        ("RS", 0.03),
        ("LT", 0.02),
        ("HR", 0.02),
        ("SI", 0.02),
        ("BR", 0.03),
        ("CA", 0.01),
        ("NG", 0.01),
    ],
    "NBA": [
        ("US", 0.70),
        ("CA", 0.05),
        ("FR", 0.04),
        ("ES", 0.03),
        ("RS", 0.03),
        ("LT", 0.03),
        ("IT", 0.02),
        ("AR", 0.02),
        ("BR", 0.02),
        ("HR", 0.02),
        ("SI", 0.02),
        ("NG", 0.02),
    ],
    "WNBA": [
        ("US", 0.82),
        ("CA", 0.04),
        ("FR", 0.03),
        ("ES", 0.03),
        ("IT", 0.02),
        ("RS", 0.02),
        ("LT", 0.01),
        ("HR", 0.01),
        ("SI", 0.01),
        ("BR", 0.01),
    ],
    "NCAA_M": [
        ("US", 0.92),
        ("CA", 0.03),
        ("AR", 0.01),
        ("FR", 0.01),
        ("ES", 0.01),
        ("RS", 0.005),
        ("IT", 0.005),
        ("LT", 0.003),
        ("HR", 0.003),
        ("SI", 0.002),
        ("BR", 0.002),
    ],
    "NCAA_W": [
        ("US", 0.94),
        ("CA", 0.03),
        ("FR", 0.01),
        ("ES", 0.01),
        ("IT", 0.003),
        ("RS", 0.003),
        ("LT", 0.002),
        ("HR", 0.001),
        ("SI", 0.001),
    ],
}

BIRTHPLACES: Dict[str, List[str]] = {
    "ES": ["Madrid", "Barcelona", "Valencia", "Sevilla", "Malaga", "Zaragoza", "Bilbao", "Murcia", "Granada", "Girona"],
    "US": ["Chicago", "Dallas", "Houston", "Los Angeles", "Miami", "New York", "Philadelphia", "Phoenix"],
    "AR": ["Buenos Aires", "Cordoba", "Rosario", "Mar del Plata"],
    "FR": ["Paris", "Lyon", "Marseille", "Lille", "Bordeaux"],
    "IT": ["Rome", "Milan", "Bologna", "Florence", "Naples"],
    "RS": ["Belgrade", "Novi Sad", "Nis"],
    "LT": ["Kaunas", "Vilnius", "Klaipeda"],
    "HR": ["Zagreb", "Split", "Zadar"],
    "SI": ["Ljubljana", "Maribor"],
    "BR": ["Sao Paulo", "Rio de Janeiro", "Brasilia"],
    "CA": ["Toronto", "Vancouver", "Montreal"],
    "NG": ["Lagos", "Abuja", "Kano"],
}

LOCALE_BY_NATIONALITY: Dict[str, str] = {
    "ES": "es_ES",
    "US": "en_US",
    "AR": "es_AR",
    "FR": "fr_FR",
    "IT": "it_IT",
    "RS": "sr_RS",
    "LT": "lt_LT",
    "HR": "hr_HR",
    "SI": "sl_SI",
    "BR": "pt_BR",
    "CA": "en_CA",
    "NG": "en_NG",
}

_NAMES_JSON_ENV = os.getenv("PCBASKET_NAMES_JSON")
_NAMES_JSON_PATH = Path(_NAMES_JSON_ENV) if _NAMES_JSON_ENV else (
    Path(__file__).resolve().parents[1] / "infra" / "names_by_country.json"
)
_USE_NAME_POOLS_ONLY = os.getenv("PCBASKET_USE_NAME_POOLS", "").strip().lower() in {"1", "true", "yes"}


def _load_external_name_pools() -> None:
    if not _NAMES_JSON_PATH.exists():
        return
    try:
        raw = _NAMES_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception:
        return
    countries = data.get("countries") if isinstance(data, dict) else None
    if not isinstance(countries, dict):
        countries = data if isinstance(data, dict) else {}
    for code, pool in countries.items():
        if not isinstance(pool, dict):
            continue
        male = pool.get("first") or pool.get("first_male") or pool.get("first_name_male") or pool.get("male") or []
        female = pool.get("first_f") or pool.get("first_female") or pool.get("first_name_female") or pool.get("female") or []
        last = pool.get("last") or pool.get("last_name") or pool.get("surnames") or []
        if not isinstance(male, list) or not isinstance(female, list) or not isinstance(last, list):
            continue
        norm_code = str(code or "").upper()
        if not norm_code:
            continue
        def _clean(values: list) -> list[str]:
            seen = set()
            out = []
            for item in values:
                if not item:
                    continue
                value = str(item).strip()
                if not value or value in seen:
                    continue
                seen.add(value)
                out.append(value)
            return out
        NATIONALITY_POOLS[norm_code] = {
            "first": _clean(male),
            "first_f": _clean(female),
            "last": _clean(last),
        }


_load_external_name_pools()


@dataclass
class _PersonName:
    name: str


_FACTORY_CACHE: Dict[str, object] = {}
_FAKER_CACHE: Dict[str, object] = {}


def _faker_name(locale: str, gender: str | None = None) -> str | None:
    if not Faker:
        return None
    try:
        faker = _FAKER_CACHE.get(locale)
        if not faker:
            faker = Faker(locale)
            _FAKER_CACHE[locale] = faker
        gender = (gender or "").upper()
        if gender == "F" and hasattr(faker, "name_female"):
            return faker.name_female()
        if gender == "M" and hasattr(faker, "name_male"):
            return faker.name_male()
        return faker.name()
    except Exception:
        return None


def _polyfactory_name(locale: str) -> str | None:
    if not Faker or not DataclassFactory:
        return None
    try:
        factory = _FACTORY_CACHE.get(locale)
        if not factory:
            faker = Faker(locale)

            class _NameFactory(DataclassFactory[_PersonName]):
                __model__ = _PersonName
                __faker__ = faker

                @classmethod
                def get_provider_map(cls):
                    providers = super().get_provider_map()
                    providers[str] = cls.__faker__.name
                    return providers

            factory = _NameFactory
            _FACTORY_CACHE[locale] = factory
        built = factory.build()
        return getattr(built, "name", None)
    except Exception:
        return None


def _weighted_choice(weighted: Sequence[Tuple[str, float]], rng: random.Random) -> str:
    total = sum(w for _, w in weighted)
    if total <= 0:
        return weighted[0][0]
    roll = rng.random() * total
    for key, weight in weighted:
        roll -= weight
        if roll <= 0:
            return key
    return weighted[-1][0]


def pick_nationality(league_id: str | None = None, rng: random.Random | None = None) -> str:
    rng = rng or random
    league_key = str(league_id or "").upper()
    weights = LEAGUE_NATIONALITY_WEIGHTS.get(league_key, NATIONALITY_WEIGHTS)
    return _weighted_choice(weights, rng)


def pick_birthplace(nationality: str, rng: random.Random | None = None) -> str:
    rng = rng or random
    pool = BIRTHPLACES.get(nationality)
    if not pool:
        return "Unknown"
    return rng.choice(pool)


def generate_name(
    nationality: str,
    used_names: set[str] | None = None,
    rng: random.Random | None = None,
    gender: str | None = None,
) -> str:
    rng = rng or random
    pool = NATIONALITY_POOLS.get(nationality)
    if not pool:
        pool = NATIONALITY_POOLS["ES"]
    used_names = used_names or set()
    gender_key = str(gender or "").upper()
    first_pool = pool.get("first_f") if gender_key == "F" else None
    if not first_pool:
        first_pool = pool.get("first", [])

    for _ in range(500):
        locale = LOCALE_BY_NATIONALITY.get(str(nationality or "").upper(), "en_US")
        name = None if _USE_NAME_POOLS_ONLY else (_faker_name(locale, gender=gender_key) or _polyfactory_name(locale))
        if not name:
            name = f"{rng.choice(first_pool)} {rng.choice(pool['last'])}"
        if name not in used_names:
            used_names.add(name)
            return name
    fallback = f"Jugador {len(used_names) + 1}"
    used_names.add(fallback)
    return fallback
