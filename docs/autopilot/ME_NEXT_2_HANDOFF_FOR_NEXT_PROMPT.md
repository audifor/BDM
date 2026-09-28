# ME-NEXT 2 · Handoff for the next prompt

## Accepted state

- Milestone: MatchEngine Next 2 · Movement & Offensive Structure.
- Human visual status: **PASS**, confirmed 2026-09-26 after review of scenarios A–D.
- A and D were accepted in the initial review. B and C were corrected and accepted on re-review.
- Debug URL: `http://127.0.0.1:1420/?matchNextDebug=1`.
- Branch: `matchengine-next-2-movement-offensive-structure`.
- Base: `ee38b92` (`ee38b9282ffb63f78942a2ea01e262d4541651a9`).
- Closeout commit: `feat(match-next): establish movement and offensive structure`.

## B and C corrections accepted by the user

- B: after a pass changes the BALL owner and strong/weak side, the former handler gets a SPACE target at the nearest valid point on the attacking three-point arc. It no longer travels to the receiver's vacated physical location. Other spacers retain their physical lanes; valid arc anchors persist through later passes while their players remain in SPACE. Targets still obey court bounds and minimum 3 m spacing.
- C: four runs start at equal `6.3 m` distances. Realistic profiles span max speed `4.8–6.2 m/s`, acceleration `2.3–4.0 m/s²`, and braking `3.0–5.0 m/s²`. The debug panel measures peak speed, acceleration, braking and settled arrival from recorded `MatchState` snapshots; there is no UI-only movement.
- A, B, D and E keep their general player profiles; only C uses the athleticism comparison profiles.

## Validation

- Focused engine, movement and debug tests: **40 passed** across 3 files, one worker. This includes pass reassignment, serialized resume and a two-pass continuity check.
- `npm run typecheck`: pass.
- `npm run build`: pass; the existing large-chunk advisory remains.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: pass.
- `cargo check --manifest-path src-tauri/Cargo.toml`: pass.
- `git diff --check`: pass; no `Math.random()` in `src/`; no React/Zustand/Tauri imports in Domain or Engine; legacy `src/engine/match` diff is empty.
- Full parallel repository run previously had 25 timeout/failure cases across 15 files; all 25 passed when rerun filtered and serially with one worker. `LiveMatchController.test.ts` also passed separately (10 tests).

## Instructions for the next prompt

- Treat ME-NEXT 2 as visually accepted; do not reopen B/C unless the user reports a new issue.
- Continue with exactly the active milestone supplied in the next prompt. That prompt has not been supplied yet, so no next milestone scope is assumed here.
- Preserve the MatchEngine Next / MatchViewer boundary and do not alter legacy MatchEngine without explicit scope.
- The worktree is intentionally uncommitted pending the user's direction on committing.
