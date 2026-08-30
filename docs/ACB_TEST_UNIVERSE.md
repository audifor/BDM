# ACB 2026/27 test universe

Development snapshot date: 2026-08-30.

Purpose: exercise the normal BDM career, competition, roster, match, scouting, finance and UI flows against a recognizable real-world league without adding ACB-specific engine branches.

## Sourced fields

- 18 club names and codes
- current player names
- listed player positions
- current head-coach names

Source: official ACB 2026/27 market table, checked on 2026-08-30:
https://acb.com/es/liga/tabla-mercado/2026-27

## Generated test fields

BDM generates ratings, tendencies, physical/bio data, development, contracts, finances, staff attributes, personalities and scouting uncertainty. These values are synthetic test data and must not be represented as real-world facts.

## Runtime rules

- selectable from `New Game > Universe > ACB 2026/27 [TEST]`
- any of the 18 clubs can be controlled
- development quick start defaults to Casademont Zaragoza
- 18-team double round robin
- 34 rounds and 306 regular-season games
- generic FIBA-like BDM competition engine only
- no ACB-specific engine logic
- current competition model does not yet implement the real ACB playoff phase

The snapshot is intentionally isolated from the canonical fictional BDM universe.
