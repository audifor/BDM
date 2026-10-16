# P0E · Persisted WorldDB P0C People → Tauri → GameWorld → Save V4

**Branch:** `feat/p0e-persistent-name-consumer-smoke`, stacked on BDM [PR #117](https://github.com/audifor/BDM/pull/117).
**Upstream:** BDM-DB P0E branch `feat/person-name-p0e-persistent-worlddb` (stacked after [PR #65](https://github.com/audifor/BDM-DB/pull/65)).
**State:** isolated integration probes; **NOT** a playable roster certification or live runtime activation.

## Two opt-in checks using the SAME real persisted P0C fixture

1. **Tauri read from file:** `world_db_bootstrap.rs::p0e_read_persistent_worlddb_people_via_actual_tauri_person_adapter`. With `BDM_P0E_STAGE_DB` (path to a P0E SQLite clone) and `BDM_P0E_MANIFEST` (JSON Rust materializer output) it opens the WorldDB read-only, uses the production `query_person` adapter for every P0E `personId`, and compares name components and second-component provenance to the manifest.
2. **GameWorld/Save V4:** `WorldDbGameBootstrap.test.ts` includes `P0E persistent names flow through GameWorld and Save V4 using source-backed manifest`. With `BDM_P0E_MANIFEST` it takes the same exported P0E names, places them as **standalone people** into an otherwise valid in-memory WorldDB bootstrap slice fixture, creates a `GameWorld`, runs the real Save V4 serializer and deserializer, and asserts all names and provisional semantics survive unchanged.

## Critical distinction

The production bootstrap **only selects required person IDs from player rosters, staff and ownership links**. Newly generated P0E standalone people have no `player` or `staff` profile and are **not automatically added to a playable roster**. The second check **injects them in a test slice**; it does not assert they came from the production roster-selection SQL.

This separation is deliberate: P0E proves the persisted name materializer and both adapters without adding fabricated player ratings, salaries, citizenship or club contracts. Real *playable* NewGen wiring requires a separately certified real player/staff generation and team link, then an actual Tauri bootstrap/Save V4 loading such a linked person.

## Safety and regression

- Existing `Person.nameComponent` is optional. Legacy players/WorldDB without the metadata table keep the old path.
- Read-only Tauri connection in test. No write to world source, existing player, roster or games.
- The opt-in tests do nothing without the relevant environment variables; **a green GitHub CI for these tests certifies compilation and hermetic P0D regressions only**. The full P0E bridge becomes certified when Windows runs them with the real P0E SQLite and manifest and produces logs.
- No merge to `main`, no Courtside UI changes, no automatic game activation.
