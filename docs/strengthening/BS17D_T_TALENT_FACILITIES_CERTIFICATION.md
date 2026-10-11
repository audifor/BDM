# BS17D-T Talent / Facilities certification

STATUS: PASS · BS17D-T INTEGRATION AUDIT

- TALENT PHYSICAL CONTEXT: LIVE (read-only).
- TALENT PRODUCTIVE CONSUMER / TALENT FACILITIES CONSUMER: NOT_IMPLEMENTED.
- TRAINING ACADEMY CONSUMER: LIVE, limited to the existing scheduled Training P0 execution path.
- PLAYER SUPPLY AUTHORITY: PRESERVED.
- SAVE / CALENDAR: PASS.
- MX: PASS within the implemented informational and recorded-attempt scope.
- BS17D GLOBAL STATUS: PARTIAL.

This certifies an informative Talent integration and proves that the existing Training physical consumer acts on actual BS15 youth rosters. It does not create or certify a separate Talent-owned physical procedure.

## Base and authority

Base: `fbe788ce01f1dd34fc40b360b4661ebaad63457c` (certified bounded convergence V2).
Final SHA: the local commit containing this report; resolve with `git log -1 --format=%H -- docs/strengthening/BS17D_T_TALENT_FACILITIES_CERTIFICATION.md`.
Branch: `bdm-stage2-bs17d-talent-facilities`.
Worktree: `C:/BDM-BS17D-TALENT-FACILITIES`.

Verified ancestors:

- BS15: `94c077092224a9f75c861a853d9d52fceae526fe`.
- Frozen BS16 K-C: `97c58b98b9192a569f30bdfd8b63565f0b02a744`.
- BS17D-M: `6945cb90604bd349edd9d2333aa7d1861e9a311a`.
- Bounded convergence V2: the base above.

Main remained at `8a0b359e9ae48fe372668241788c9d5aa7a33b03`, origin/main at the BS15 SHA, and the certified convergence worktree at the base. No newer BS16 commits were imported. No merge, rebase, cherry-pick or push was performed.

The active user mandate is preserved in [BS17D-T contract](BS17D_T_TALENT_FACILITIES_CONTRACT.md). Existing authorities remain BS15B/C/D/E/G, BS17D-P0, BS17D-M/BS12C and convergence V2. No product proposal was silently promoted to a decision.

## Focal operation audit

- Youth intake (`YouthPathwayEngine.acceptYouthIntake`): NO_PHYSICAL_REQUIREMENT. Uses explicit pathway relation, cohort Place, gender/age eligibility and the canonical materialization command. A Place input is geographical population authority, not a building prerequisite. No architecture-based intake quota was introduced.
- Candidate generation/materialization (`TalentSupply`, `AnnualTalentSupply`): NO_PHYSICAL_REQUIREMENT. CandidateKey, seeded generation, PlayerId and idempotence remain BS15-owned. Facility condition/access never creates extra Players.
- Academy registration, promotion, release and age-out (`YouthPathwayEngine`): NO_PHYSICAL_REQUIREMENT. These are registration/movement/decision operations, not use of a court. No new building gate.
- Youth roster scheduled Training (`ScheduledTrainingEngine.executeScheduledSession`): PHYSICAL_OPERATION_EXISTS and PHYSICAL_REQUIREMENT_APPROVED. The existing module registry `TrainingPhysicalRequirements` supplies concrete requirements, the P0 resolver checks CFI8 capabilities and BS17C Team/date/service/interval evidence, then Training alone emits workload/stimulus. It selects the canonical Team roster, including the Player accepted through BS15 intake. No youth-specific Training engine was added.
- Calendar automatic Training: PHYSICAL_OPERATION_EXISTS through that same owner. `CalendarEngine` runs scheduled Training in its TRAINING phase. The legacy generic `executeTeamTraining` compatibility path is not the automatic Calendar owner and is not newly certified as a P0-gated youth operation. No new requirement mapping was invented for it.
- College enrollment/eligibility, recruiting contact/pitch, Portal and Draft pathways: NO_PHYSICAL_REQUIREMENT in their current identity/legal/staff decision contracts. Their owners are untouched. Facility standards supply no automatic recruiting or development bonus.
- Recruiting visits and evaluations (`RecruitingEngine.performRecruitingAction`, `recordRecruitingEvaluation`): PHYSICAL_OPERATION_EXISTS as campus/off-campus events; the physical resource connection is BLOCKED_BY_PRODUCT_DECISION. The real visit ledger records dates, participants, lodging nights, permissions and outcome. Its NCAA lodging-night limit is legal policy, not room capacity. There is no Facility/component assignment or approved physical requirement/allocation policy. No venue or hotel constraint was fabricated.
- Separate academy activity, accommodation assignment or Talent-owned physical procedure: NOT_IMPLEMENTED. An ACADEMY_CENTER record is not an executable activity. An explicit operation owner, requirement and allocation/compatible demand contract would be needed before declaring those consumers LIVE.
- Talent youth infrastructure display: READ_ONLY_PHYSICAL_CONTEXT. It follows configured youth TeamPathwayRelations, associated organization infrastructure and existing BS17C/CFI8 read models. Displaying context does not authorize intake or execute Training.

## Implemented integration and MX

`buildYouthFacilitiesContext` reads configured youth teams, dated facilities/names/Place, scoped Organization and Team rights, existing component availability and persisted Training physical attempts. It does not mutate GameWorld or predict a session using another registry.

Talent Operations now displays this context and navigates to the existing Facilities workspace. Actual recorded Training attempts reuse `TrainingPhysicalExplanation`, including the owner's cause and component evidence. Historical attempts are labelled as recorded; current availability is dated separately. No new sport effect, persistent field, planning command or allocation authority was introduced.

Organization rights remain visibly distinct from Team rights. Nominal component capacity and its unit may be shown when known. Operational capacity and occupancy stay unknown. Associated infrastructure missing from this read model does not establish global absence. UNKNOWN preserves Training continuity; verified OUT_OF_SERVICE or denied/expired Team access blocks only the resource-dependent scheduled module. Shared rights do not manufacture reservations, slots or exclusivity.

## Causal evidence

Ten deterministic causal tests use seed `151617`, initial date `2032-10-01`, explicit U18 relation/competition, and the actual BS15 intake command. Both male and female youth populations are covered.

- Full versus OUT_OF_SERVICE worlds differ only in condition evidence: the same registered Player receives the court-module stimulus in the available world, while the unavailable world keeps that session pending with a recorded cause and no stimulus. Independent team-cohesion Training still executes.
- Restoration retries the pending court session through Training, without replaying the completed independent session. Repeated execution and Save/reload preserve exactly-once evidence.
- UNKNOWN, compatible LIMITED, Organization-only denied access and expired Team access are tested against existing owner outcomes. The existing 17 Training P0 regressions additionally cover concrete limitations and alternatives.
- Intake/materialization/registration/promotion keep identical PlayerId, CandidateKey, players/persons, rosters and source facts across physical variants. Materialization/intake are idempotent, including reload. No extra Players, arbitrary potential changes or injury mutations appear.
- Shared Team rights preserve source facts, and operational capacity stays null. Reading context and UI navigation leave serialized GameWorld unchanged.
- Calendar advances the actual youth scheduled session once, retains a blocked attempt over reload, allows restoration through the owner and cannot replay the completed stimulus on the next day. Finance phase executes once. The five existing cross-system causal tests remain PASS.

There are no production diffs in Domain, Engine, Save, Calendar, Finance, Governance or the existing Facilities resolver. This preserves supply batching/incremental validation, RNG, BS12C and frozen Finance K-C without duplicating formulas. Facilities never directly mutates Players.

## Validation and reproduction

Focused validation: **170/170 PASS in 13 files**, zero failures or pending tests.

- New youth/Facilities integration: 10.
- Existing YouthPathwayEngine: 5; TalentSupply: 8.
- CFI8 SportingFacilityContext: 42; Training P0: 17.
- Facilities Save V4: 30; facility operations Save: 9.
- Calendar: 25; combined convergence causal tests: 5.
- Medical/BS12C compatibility: 8.
- New Talent MX: 3; existing Talent workspace: 1; Talent projections: 7.

`npm run typecheck`: PASS. `npm run build`: PASS; the existing Vite chunk-size warning remains visible. `git diff --check`: PASS. No `Math.random()` in src or improper production React/Zustand/Tauri imports in Domain/Engine. A pre-existing test-only React server-render import is not production engine coupling. Rust is unchanged; the narrowed user validation contract does not require a Rust/full-suite rerun.

Machine-readable evidence, test names, source fixture fingerprint, ancestry and raw local log/report SHA-256 digests are in [evidence](BS17D_T_TALENT_FACILITIES_EVIDENCE.json). Raw reports are retained locally under ignored `node_modules/.cache/bs17d-t/`; source tests and summarized evidence are committed.

From this worktree with the already provisioned dependencies, reproduce the exact focused set:

```powershell
$bs17tEvidence = Get-Content docs/strengthening/BS17D_T_TALENT_FACILITIES_EVIDENCE.json -Raw | ConvertFrom-Json
$bs17tTests = $bs17tEvidence.focusedTests.files.path
npx vitest run @bs17tTests --maxWorkers=1 --reporter=verbose
npm run typecheck
npm run build
git diff --check
```

No World DB 2029, Y1-Y30 or full suite was rerun. The original historical failure remains **UNRESOLVED_HISTORICAL_CAUSE**, and the V2 known-baseline classifications remain unchanged in the original convergence evidence. These focused passing tests do not replace or explain that run. No new regression was demonstrated in the tested scope.

## Remaining decisions and next action

No new product decision was needed for this read-only context or reuse of existing approved Training P0. A separate Talent-owned physical activity, recruiting venue requirement or accommodation consumer still needs an explicit approved operation/owner/requirement and allocation policy, with comparable physical demand/capacity where applicable. Until then Talent's separate physical consumer remains NOT_IMPLEMENTED; infrastructure alone is insufficient.

BS17D remains PARTIAL. Specialized Medical remains NOT_IMPLEMENTED; no BS12C changes. BS16 is not declared globally complete, and Facilities AI/global quantitative allocation are not certified. Do not start BS17E/F while their BS16 dependencies remain open.

Next executable action: use this local certified scoped result to define and approve a concrete missing Talent physical operation if required, then implement only that owner's consumer with causal evidence. Otherwise retain the current boundaries and continue only a separately authorized milestone.
