from __future__ import annotations

import random
from typing import Dict, List, Sequence, Tuple


NATIONALITY_POOLS: Dict[str, Dict[str, List[str]]] = {
    "ES": {
        "first": [
            "Adrian", "Alvaro", "Carlos", "Dario", "Diego", "Edu", "Felix", "Gonzalo",
            "Hector", "Ivan", "Jaime", "Jorge", "Lucas", "Manuel", "Mario", "Nestor",
            "Oscar", "Pablo", "Rafa", "Raul", "Sergio", "Tomas", "Victor",
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
        "last": [
            "Jovic", "Jovanovic", "Kovacic", "Markovic", "Milosavljevic", "Nikolic",
            "Petrovic", "Popovic", "Stojanovic",
        ],
    },
    "LT": {
        "first": ["Arnas", "Domas", "Eimantas", "Jonas", "Mantas", "Mindaugas", "Tomas"],
        "last": ["Jankauskas", "Kavaliauskas", "Kazlauskas", "Sabonis", "Valanciunas"],
    },
    "HR": {
        "first": ["Ante", "Dario", "Filip", "Ivan", "Josip", "Luka", "Mario", "Stjepan"],
        "last": ["Bojanovic", "Horvat", "Kovacevic", "Maric", "Petrovic"],
    },
    "SI": {
        "first": ["Anze", "Bostjan", "Jaka", "Luka", "Marko", "Zoran"],
        "last": ["Dragic", "Kovacic", "Novak", "Zupan"],
    },
    "BR": {
        "first": ["Bruno", "Caio", "Diego", "Felipe", "Guilherme", "Joao", "Lucas", "Rafael"],
        "last": ["Almeida", "Barbosa", "Costa", "Ferreira", "Gomes", "Moreira", "Silva"],
    },
    "CA": {
        "first": ["Adam", "Caleb", "Evan", "Jared", "Miles", "Nathan", "Tyson"],
        "last": ["Bennett", "Campbell", "Carter", "Grant", "Murray", "Reid", "Turner"],
    },
    "NG": {
        "first": ["Chinedu", "Ifeanyi", "Kelechi", "Kunle", "Obi", "Olumide", "Tunde"],
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


def pick_nationality(rng: random.Random | None = None) -> str:
    rng = rng or random
    return _weighted_choice(NATIONALITY_WEIGHTS, rng)


def pick_birthplace(nationality: str, rng: random.Random | None = None) -> str:
    rng = rng or random
    pool = BIRTHPLACES.get(nationality)
    if not pool:
        return "Unknown"
    return rng.choice(pool)


def generate_name(nationality: str, used_names: set[str] | None = None, rng: random.Random | None = None) -> str:
    rng = rng or random
    pool = NATIONALITY_POOLS.get(nationality)
    if not pool:
        pool = NATIONALITY_POOLS["ES"]
    used_names = used_names or set()

    for _ in range(500):
        name = f"{rng.choice(pool['first'])} {rng.choice(pool['last'])}"
        if name not in used_names:
            used_names.add(name)
            return name
    fallback = f"Jugador {len(used_names) + 1}"
    used_names.add(fallback)
    return fallback
