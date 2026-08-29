# BDM · Codex ↔ Cursor engineering handoff audit

Audit date: 2026-08-29. Scope: repository, architecture, persistence,
simulation boundaries, BDMOS UI and PCB migration layer. This document records
observed facts and a safe improvement order; it does not start A1.

## Current architecture

- Desktop: Tauri 2 (`src-tauri`) with a deliberately small Rust surface.
- UI: React 19, TypeScript, Vite and Zustand.
- Direction: `UI → Application → Engine → Domain`.
- Canonical state: JSON-safe `GameWorld`; save services live in `src/save`.
- Simulation: pure TypeScript Engine with deterministic random-source boundary.
- Migration UI: isolated under `src/ui/pcb-migrated`; temporary state is React
  state and `localStorage` only.

## Verified controls

- `npm run typecheck`: PASS (latest M7R check).
- `npm run build`: PASS (latest M7R check).
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: PASS.
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS.
- Test files discovered: 148.
- `Math.random(` in `src`: 0.
- React/Zustand/Tauri imports in `src/domain` and `src/engine`: 0.
- Runtime donor imports/path references in `src`: 0; remaining `renderer/src`
  mentions are CSS comments only.

## Validation caveat

`npm test` was started twice but did not complete within the interactive
30-second command window. Cursor should run it locally without a short command
timeout and record the full result before any certification claim.

## High-priority product and migration work

Items 1-5 below were addressed across two remediation rounds on branch
`m7-pcb-migration-closure` (2026-08-29); see `docs/PCB_MIGRATION_CLOSURE.md`
for full evidence. **Round 1 was rejected by external review**: several
"wired" workflows were UI-only appearances (state set but never rendered,
callbacks declared in the parent but not consumed by the child component).
Round 2 fixed those plus a further batch of inert controls found by a
button-by-button re-audit (not just a grep for `() => undefined`). Residual
limitations after round 2: donor PCB frontend source is no longer present in
this repo to diff against, and **no interactive browser visual pass has been
performed in any session** — this is the sole reason M7 is not CERTIFIED.

1. ~~Finish M7R workflow evidence~~ **DONE.** 31-surface evidence table in
   `docs/PCB_MIGRATION_CLOSURE.md` (Content/Visual/Functionality/Workflow per
   surface), updated in round 2 with the additional fixes below.
2. ~~Replace remaining migration no-ops~~ **DONE (round 2).** Beyond round 1's
   Club staff/hiring/objective actions, Tactics Match Plan overrides, and
   Competition team/player click + match simulation, round 2 fixed: Club
   Staff "Gestionar" (was setting state nobody rendered), Tactics "Ver
   scouting" (no onClick), Competition Calendar Anterior/Siguiente and
   Jornada anterior/siguiente + select (no handlers, fake "Jornada 1"),
   Competition team/player click (parent wired but child never consumed the
   props), Plantilla Líderes/Influyentes chips (no onClick), Training
   Responsable select + session end time (no onChange), Training Modules
   Configurar (no onClick), Tactics board GUARDAR AJUSTES (no onClick). All
   now covered by interaction tests (`@testing-library/react` + `jsdom`,
   added as devDependencies) that assert observable DOM effects, not just
   render.
3. ~~Complete Club fixture coverage for Staff, Board, Facilities~~ **DONE.**
   (Analytics was already complete.) Fixtures remain UI-only under
   `src/ui/pcb-migrated/club/fixtures`, not in GameWorld/Save.
4. ~~Remove unreachable Golden reconstruction files~~ **DONE.**
   `GoldenManagerWorkspace.tsx`/`.css`/`.test.tsx` deleted; confirmed no
   remaining consumer first.
5. ~~Complete M7R global validation~~ **AUTOMATED CHECKS DONE, VISUAL PASS
   OUTSTANDING.** typecheck/build/cargo fmt+check/boundary searches/`npm ci`
   all pass; `npm test` is 687/688 (one pre-existing, out-of-scope failure in
   Plantilla's static-render test, unrelated to this branch — re-verified
   against the branch's pre-round-2 tip). The interactive browser visual pass
   required by M7's own remediation item 6 has not been run. A1 has not been
   started and remains a separate future milestone.

## Core-game improvement map (after M7R / under explicit future milestones)

| Area | Existing foundation | Next safe focus |
| --- | --- | --- |
| GameWorld & saves | Normalized JSON-safe world and V1/V2 save paths | Preserve backwards compatibility; add migration tests for each schema change |
| Engine | Calendar, match, development, market, scouting and season modules | Improve behavior only via deterministic Engine services and tests |
| Match UX | Separate viewer and engine | Add viewer controls without giving UI authority over simulation |
| UI state | Zustand bridge and desktop window framework | Keep feature state outside Domain/Engine; derive display values |
| PCB migration | M1–M6 surfaces in `pcb-migrated` | Temporary adapters first; canonical reconnection only in A1+ |

## Cursor operating rules

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`,
   `docs/autopilot/PRODUCT_GUARDRAILS.md` and the active milestone first.
2. Preserve the dirty baseline; never reset, clean or restore unrelated work.
3. Do not add migration mocks, `pcbasket.*` state or React imports to
   Domain/Engine/Save.
4. For UI-only prototypes, place deterministic fixtures under the feature's
   `src/ui/pcb-migrated/**/fixtures` or adapter boundary.
5. Before handoff run: `npm test`, `npm run typecheck`, `npm run build`,
   `cargo fmt --check`, `cargo check`, `rg 'Math.random\\(' src`, boundary
   searches and `git diff --check`.

## Collaboration protocol

- Codex: use this document plus `PCB_MIGRATION_CLOSURE.md` as the factual
  starting point; update evidence rather than claiming unverified parity.
- Cursor: keep work atomic by milestone, name the source-of-truth file in the
  PR/commit description, and report validation with failures unmasked.
- Both: distinguish `TEMP_ADAPTED` UI behavior from canonical BDM behavior.

## Handoff status

Working tree: clean on branch `m7-pcb-migration-closure` (branched from a
clean `main`); diff is migration-only.

M7 / M7R: **NOT CERTIFIED — blocked by visual certification.** All functional
and workflow criteria are implemented and covered by automated interaction
tests as of remediation round 2; all automated validation passes. See
`docs/PCB_MIGRATION_CLOSURE.md` "M7 remediation round 2" for full evidence.
The sole remaining blocker is that no interactive browser visual pass has
been performed in any session — do not mark this CERTIFIED until that pass
is run and its result recorded.

A1: **not started**.
