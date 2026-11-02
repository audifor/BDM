# BDM Career - F3 final report

## Estado

**PARTIAL**.

The human experience is now playable through existing HRPG authorities and the Home Director Hub, with focused functional evidence and a deterministic 30-day A/B/C/D acceptance test. Native Windows visual acceptance and the full global suite remain pending/unconcluded, so PASS would be inaccurate.

## Base and isolation

- Branch: `feature/career-f3-human-experience`
- Worktree: `C:\BDM-worktrees\career-f3-human-experience`
- Base: F2 commit `a00b0d53`.
- `feature/worlddb-global-playable-02` and `docs/playable/evidence/f3/ab-comparison.json` were not modified.
- No push and no merge, per `AGENTS.md`.

## Code changed

- `directorHubModel.ts`: projects open, actionable user HRPG situations from the existing service.
- `DirectorHubPanel.tsx`: renders choices and calls `decideUserHumanSituation` through the store.
- `director-hub.css`: compact responsive choice layout.
- `directorHubModel.test.ts` and `DirectorHubPanel.test.tsx`: projection, real command execution and Save V4 coverage.
- `PlayableF3HumanCareer.test.ts`: 30-day A/B/C and club-change D certification.
- The seven F2.1/F3 documents in `docs/career/`.

## Systems reused

`HumanSimulationService`, `HumanSimulationEngine`, `HumanSources`, `StaffTrustMeeting`, `StaffHumanReactionEngine`, `StaffHumanAdvisoryEvents`, `StaffHumanAdvisoryPattern`, `StaffHumanResponsibilityEvents`, `StaffRecommendationService`, `StaffCareerAutonomy`, CoachLife, CoachCareer, Staff and Coach presentation models, MatchEngine Next and Save V4.

No second RPG, relationship, memory, morale, recommendation counter, calendar or Inbox was added.

## Defect corrected

Existing HRPG situations and their real choices had no user-facing Home consumer. The new Home card is a read-model projection and its action is the existing canonical store command. Informational recommendations remain non-actionable and informational dismissals remain free of human rejection reactions.

## Example causal trace

The real first staff meeting is admitted from F1's Inbox source. The user selects `seekInput` or `setDirection` in Home. The existing `StaffTrustMeeting` authority resolves it, writes the meeting memories/morale/relationship events and persists the resolved HRPG situation. The Hub then rebuilds from the updated world; it does not retain a duplicate decision.

## Results

- Hub/HRPG focused run: PASS (6 tests).
- HRPG focused run: PASS (24 tests).
- F3 temporal A/B/C/D test: PASS, 3/3 tests; same F2 day-zero and controlled salt across three 30-day sport runs plus a real club-change Save V4 case.
- F0B 30-day regression: PASS, 4/4 tests.
- F1 regression: PASS, 20/20 tests.
- F2 regression: PASS, 24/24 tests across mechanisms, attribution and 30-day comparison.
- MatchEngine causality: human choices do not receive an invented universal performance multiplier; sport changes must come from existing training/tactics/lineup/fatigue authorities.
- Save V4: UI round-trip test passes; D continuity round-trip is covered by the F3 acceptance test.

## Validation status

- `npm run typecheck`: PASS.
- `npm run build`: PASS; existing Vite chunk/circularity warnings remain.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: PASS.
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS.
- `Math.random(` in `src`: 0; Domain/Engine UI imports: 0.
- Hub, HRPG and Home UI tests: PASS; focused regression 7 files / 56 tests PASS.
- F0B/F1/F2/Save V4/30-day tests: PASS as listed above.
- `npm test -- --reporter=dot`: attempted on this branch; after an operational window it was still running, emitted `x` failures and no Vitest summary, so it was interrupted and is **INCONCLUSIVE**. The focused suites above are reported separately and are not presented as a global-suite substitute.
- Native Windows visual acceptance: PENDING because Computer Use native pipe was unavailable.

## Remaining limitations

- The focused F3 slice surfaces HRPG user situations in Home; Staff and Coach already expose their existing human state, but no new conversational UI was added.
- A human relationship is not asserted to change MatchEngine unless a canonical sporting authority consumes it.
- Full global-suite and native-Windows evidence remain required before upgrading the status to PASS.

## Delivery constraint

One local atomic commit will be created. A remote PR cannot be opened without pushing the branch; `AGENTS.md` explicitly prohibits push, so no remote PR is claimed.
