# BDM Codex Autopilot Instructions

## Project authority

This repository is BDM / Basketball Dynasty Manager.

Before changing code, read:
1. `docs/ARCHITECTURE.md`
2. `docs/autopilot/PRODUCT_GUARDRAILS.md`
3. The active milestone file supplied by the autopilot runner.

If the repository contains a fuller MASTER PROJECT PROMPT / SOURCE OF TRUTH, it outranks this file on product decisions.

Rules:
- Anything marked DECIDED in the project source of truth is canonical.
- Never silently convert a PROPOSAL into DECIDED.
- Never resolve a TO DECIDE / POR DECIDIR item without human approval.
- Technical implementation details may be chosen autonomously only when they do not change product behavior or architectural boundaries.

## Permanent architecture

- Tauri 2 is the desktop container.
- React + TypeScript + Vite are UI.
- Zustand is a bridge/UI state layer, never the simulation engine.
- Domain and Engine are pure TypeScript.
- Rust is for native Tauri/filesystem/save validation where appropriate.
- MatchEngine is separate from MatchViewer.
- MatchViewer is Football Manager-like: tokens/cards, pause and playback speeds. No direct NBA 2K-style control.
- Persistent world and simulation remain JSON-safe unless a later explicit architecture milestone changes this.
- Do not use `Math.random()` in `src/`.
- Prefer injected deterministic RNG streams.
- Do not persist derived values when they can be reconstructed from source-of-truth data.

## Autopilot working contract

Work on exactly ONE milestone per Codex run.

Before editing:
- inspect `git status`;
- read the active milestone;
- inspect relevant code and tests;
- preserve existing architecture and working behavior unless the milestone explicitly changes it.

During implementation:
- keep scope narrow;
- do not opportunistically refactor unrelated areas;
- do not add production dependencies unless the milestone explicitly requires them;
- do not change product rules that are not specified;
- do not delete tests merely to make the suite pass;
- add tests for new behavior where the milestone requires them;
- keep Domain/Engine free of React, Zustand and Tauri imports;
- do not push.

Definition of Done, unless the milestone explicitly narrows it:
- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- search `Math.random(` in `src/`, expected zero
- check for improper React/Zustand/Tauri imports in `src/domain` and `src/engine`
- inspect `git diff`
- create one atomic local commit with the milestone's requested commit message
- leave the working tree clean

## Stop conditions

Return BLOCKED and do not start another milestone when:
- a product decision not already approved is required;
- a DECIDED source-of-truth rule would need to change;
- a major architecture change outside milestone scope is required;
- validation cannot be made green without hiding/removing valid coverage;
- there is an unexplained regression;
- the milestone cannot be finished cleanly in the current run;
- the requested scope materially expands beyond the milestone;
- a dependency installation or network access is required but not explicitly authorized.

If blocked after edits, make a best effort to restore the repository to the clean state at the start of the run. Never commit a knowingly partial or broken milestone.

## Review discipline

Before committing:
- compare the final diff with the milestone scope;
- look for accidental persistence of derived data;
- look for duplicated formulas/RNG logic;
- check determinism;
- check that UI has not absorbed simulation logic;
- check that tests assert the intended contract rather than implementation accidents.

For a larger milestone, you may delegate a focused review to a subagent if available, but do not use delegation just to increase work volume.

## Reporting

The runner supplies an output schema. Return its required structured result accurately.
`DONE` means the requested commit exists and the working tree is clean.
`BLOCKED` means no successful milestone commit was produced.
