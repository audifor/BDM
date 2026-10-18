# BDM main consolidation gate — BS19 HRPG, PERSON50 and BS18

Date: 2026-10-18. Source main at start: `ceaa45529ce23c4e94bbc2cef17d9d0d987552b6`.
Integration branch: `integration/bs19-person50-bs18-main-gate-20261018`. No changes on `main`.

## Integrated content and provenance

- HRPG BS19 stacked #142–154, preserving all canonical daily simulation, PERSON identity, Save V4, and P0–P8 adapters.
- PERSON50 #135 convergence **selected without overwriting HRPG**: 76 kinds with explicit source-kind validation, real Staff recommendation evidence, and strict Save V4 journal/source/delta integrity. Existing PLAYER/STAFF contract events from shared #133 lineage preserved.
- Player feedback correction: the **conversation itself** is a professional interaction; the triggering training session and stimulus remain the source evidence in `context`. This avoids falsely labelling praise/criticism as a sporting `developmentEvent` in the canonical PERSON50 experience registry.
- BS18 #141: user-addressed Governance request lifecycle, app command, GameStore integration and pre-existing Board NG surface. No new generic governance engine or Board meeting simulator.

## Deliberately excluded

- Courtside feature branches and Screens: UI NG Board is an existing, separate surface and does not alter Courtside.
- Independent BDM-DB repo, WorldDB name/physical import generators, the PLAYER repertoire branches #137–140, and other DB-dependent work.
- No changes to the inherited WorldDB bootstrap adapter already in BS19/PERSON50. These are necessary **read bridges**, not a merge of DB development branches.

## Integration gate

1. TypeScript and frontend build.
2. PERSON50 76-event semantics, genuine staff recommendations, Coach-to-Player evidence and strict Save V4.
3. BS18 real Governance request responses and Board NG UI.
4. HRPG lifecycle and historical BS19 adapters; Save V4 and Memory.
5. Full Vitest suite on exact head SHA, with resource-safe timeout; failures must be differentiated from inherited baseline.
6. Rust format; native Rust check/tests separately if runner dependencies permit.
7. No merge to `main` until no unexplained new failures and no unreviewed shared-GameStore/Save data loss. No claim of Y30 or large-scale simulation.

## Open compatibility cautions

- Earlier PERSON50 branch #128/#129 and experimental journal #130 are NOT additional authorities; do not merge duplicate writers.
- Non-empty `personalityExperienceHistory` saves need a verified-evidence migration; reject explicitly, never silently discard.
- #141 BS18 changes the legacy NG Board but not Courtside.
- BS19 HRPG currently has a globally incomplete suite and is not Y30 certified.
- PLAYER repertoire #140 requires pending external DB source gates; excluded here.

This consolidation is a **reviewable draft branch** and not automatically equivalent to BS19 or BS18 global certification.

## Main CI baseline (prior to this integration)

`main` was already red at SHA `ceaa45529ce23c4e94bbc2cef17d9d0d987552b6`, GitHub Actions run [38172556246](https://github.com/audifor/BDM/actions/runs/38172556246) (2026-10-11). All four Vitest shards failed. Do **not** classify every failed existing test as a new HRPG regression.

Examples grounded in the original GitHub job logs:
- Many five-second timeouts in UI, daily simulation, staff politics, recruitment, season progression, Save/Load. This branch increases CI test/hook timeouts to 30 seconds and bounds workers per shard to 2; no assertions are muted.
- `src/engine/match/MatchSession.test.ts`: difference in FIBA/NCAA game-format fixture.
- `src/engine/match/rotation/MatchRotationRunner.test.ts`: player being substituted out was not active for team.
- `src/presentation/match-next/audit/nextTruth.audit.test.ts`: observed shot-clock rule mismatch.
- `src/engine/marketIntelligence/FreeAgentOfferIntelligence.test.ts`: expected actionable free-agent proposal fixture missing.
- `src/engine/eligibility/CollegePortalTurnover.test.ts`: platform-specific `C:/Temp/...` fixture path unavailable on Linux.
- `src/ui/desktop/DesktopAppHost.test.ts` and `src/ui-ng/applications/matchNextDebug/MatchNextDebugApp.test.tsx`: baseline UI expectations differ from actual rendered state.

Any full-suite failure on the integration head requires **exact test + error + comparison to this baseline**. Absence of a failure from this short list is not proof of regression freedom. See raw logs for the remaining baseline issues.

## Workflow configuration

The inherited `.github/workflows/ci.yml` ran each shard with default five-second timeout and unbounded worker scheduling on shared runners. In the integration branch, each shard has at most two workers, 30-second test/hook timeouts, and 60-minute job limit. The additional integration gate executes a complete unsharded Vitest run with the same bounded worker options; it is intentionally redundant coverage, not evidence that prior baseline failures vanished.

**Do not mark this gate PASS or merge `main` on the strength of the focused job alone.**
