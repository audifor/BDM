# BS17D-M1 Specialized Medical Operations — audit gate

STATUS: **BLOCKED_BY_PRODUCT_DECISION**. Specialized Medical remains **NOT_IMPLEMENTED**; BS17D global remains **PARTIAL**. This document records a completed focal audit, not a successful implementation or M1 PASS.

## Base and isolation

Reviewed base: `43db0beb7da0336892ec1bda84952b6ca9a441c8`, the certified C1 P1 consumption closure. Worktree: `C:/BDM-BS17D-MEDICAL`; branch: `bdm-stage2-bs17d-m1-specialized-medical`. Final documentation SHA is the commit containing this report, reported in delivery. Production code, schemas, UI and tests are unchanged.

The following references were checked with `git merge-base --is-ancestor <SHA> HEAD`; every check returned 0:

- V2: `fbe788ce01f1dd34fc40b360b4661ebaad63457c`.
- Talent T: `64abd26a50e93fd827f27dccabaa486e0e73dd04`.
- Recruiting T1: `582f517e178ae8a7159237fd3d75e2db4c9d8f87`.
- Capacity C: `a5576a9b70552c896ef589438f21380e3234a6f2`.
- Allocations C1: `ece086779ad500833880bc47aad125f60dbc5a66`.
- P1 closure: `43db0beb7da0336892ec1bda84952b6ca9a441c8`.

The source C1 closure worktree was clean. Main stayed at `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; its pre-existing untracked `docs/visual-proposal/` was preserved. No other worktree was changed, no new Finance commits imported, no merge or push performed.

## Audit answers and executable authorities

1. **Existing executable operations:** `setRehabilitationPlan`, `conductFitnessTest`, `reviewReturnToPlay`, recommendation acceptance, and Calendar's rehabilitation-setback/advisory/AI lifecycle processing. Injury generation records a simulated injury; it does not perform imaging or a specialist diagnostic procedure. Risk assessment is a derived warning, not treatment execution.
2. **Prescription authority:** user coach/AI team ownership authorizes current decisions through `MedicalActionAccess.ts`. Staff advisory responsibility authorizes bounded recommendations. Neither defines a clinician-indicated equipped act or a specialist prescribing command.
3. **Scheduling:** plan changes require a current RECOVERING injury; fitness testing requires the existing due-review/test rules; RTP requires its canonical review and fitness gates. There is no specialist session scheduler or verified appointment interval.
4. **Plan acts:** `RehabilitationState` contains REST/STANDARD_REHAB/ACCELERATED_REHAB, start/change dates and mode-change history. It contains no prescribed acts, modality, session identity, adherence or fulfillment ledger. A mode selection is not an administered procedure.
5. **Dates/durations:** injury projection, plan-change dates, setback dates, test dates and RTP review/clearance dates exist. No specialized act duration, frequency, equipment demand or appointment time is modeled. The projected injury duration cannot stand in for a room reservation interval.
6. **Completion:** InjuryRecord persists plan changes, setbacks, fitness records and RTP reviews. Tests and reviews have actual evidence; there is no act-fulfillment authority for equipped rehabilitation. Staff recommendation acceptance records a decision, not administration of therapy.
7. **Legitimate effects:** BS12E already defines bounded mode-based review-date adjustment, seeded setbacks, fitness evaluation and its review consequences; BS12C owns clearance. These are existing Medical rules, not effects of physical sessions. There is no rule connecting completion of an equipped act to any of them.
8. **Manager UI:** Medical Workspace shows injuries, plan modes, suggested modes, consequences, setbacks, tests, clearance, risk and Staff advice. Productive controls select modes, run due fitness tests, resolve recommendations and review RTP. It exposes no specialized prescription or appointment execution. No unavailable clinical option was added.
9. **Approved physical requirements:** none of these ordinary Medical commands has an explicit equipment protocol. CFI8 can describe PHYSIOTHERAPY, MEDICAL_EXAMINATION, MEDICAL_IMAGING, HYDROTHERAPY and CRYOTHERAPY compatibility, but anatomy does not establish indication or treatment. Mapping STANDARD_REHAB to PHYSIOTHERAPY or a fitness test to diagnostic equipment would invent a requirement.
10. **Clinical restrictions:** current lifecycle, severity/history test requirements, ownership and required PASS-before-clearance gates are real. Modality-specific indications, contraindications and performing-professional eligibility are absent. Existing Staff role names alone do not supply those policies.

## Classification and evidence

- Ordinary plan selection, advisory, fitness testing, RTP and risk projection: **NO_PHYSICAL_REQUIREMENT** in the current approved model.
- Imaging, instrumental physiotherapy, hydrotherapy/cryo and equipped rehabilitation: **NOT_IMPLEMENTED** consumers. Their introduction presently requires **BLOCKED_BY_PRODUCT_DECISION**; they are audit candidates, not approved procedures.
- **PHYSICAL_REQUIREMENT_EXISTS:** no current specialized Medical operation found.
- **CAN_BE_CONNECTED_WITH_APPROVED_POLICY:** none found without adding clinical indication, material protocol and legitimate fulfillment semantics.

Source evidence:

- `src/domain/injury/Injury.ts`: mode/history, setbacks, fitness records and RTP state; no prescription/act entity.
- `src/engine/injury/Rehabilitation.ts`: mode selection and seeded setbacks, no session execution.
- `src/engine/injury/MedicalActionAccess.ts`: USER coach/AI team access, not specialist prescribing authority.
- `src/engine/injury/MedicalAdvisory.ts`: treatment recommendation payload contains injury/player/base date/extra days, not a prescribed procedure.
- `src/engine/injury/FitnessTest.ts` and `ReturnToPlayEngine.ts`: actual commands with canonical gates, no material protocol or timed act.
- `docs/strengthening/BS12E_MEDICAL_DEPTH_REHABILITATION.md`, sections 2, 5, 7–9: rehabilitation modes/history; rehab creates no Training session; clinical rehabilitation depth remains deferred.
- `docs/strengthening/BS12C_MEDICAL_RECOVERY_RTP.md`: single recovery/review/clearance authority.
- `docs/strengthening/BS17D_P0_SPORTING_OPERATIONS_POLICY.md`, Medical section: requires an actual productive procedure and prohibits inventing procedures or clinical effects.
- `src/domain/facilities/FacilityComponentCapability.ts`: physical capability mapping, not clinical policy.

The prior BS17D-M analysis was corroborated against current implementation. Its historical Talent/ancestry limitations do not apply to this integrated base.

## Integration boundary and production coverage

**Facilities/CFI8:** material context already exists; no Medical LIVE consumer was connected. **C1:** `PhysicalAllocation` is subordinate to a canonical Training session; `physicalAllocations(world)` enumerates Training allocations. There is no typed Medical consumer or Medical scheduling authority. Generalizing that allocator before an approved clinical act exists would create unused infrastructure. Bidirectional Training/Medical conflict prevention is therefore **NOT_IMPLEMENTED**, not inferred from Training tests.

**Execution/consequences:** no new procedures, prescriptions, session states or clinical effects were added. Facilities does not mutate Injury, natural recovery, Career Fatigue, fitness or RTP. Ordinary Medical remains independent of physical context.

**UNKNOWN:** existing ordinary operations continue without inventing treatment, infrastructure or rights. No specialized execution is claimed under UNKNOWN. Specialized AVAILABLE/LIMITED/UNAVAILABLE handling, cancellation, alternatives and fulfillment remain unimplemented; descriptive availability is insufficient for M1 PASS.

**Save V4/Calendar:** existing InjuryRecord and physical evidence persist under their current authorities; no new persistent clinical authority or temporal executor was added. Specialized act identity, completion exactly-once, cancellation and reprogramming cannot be certified in the absence of an act model.

**MX/UI:** current Medical decisions remain reachable; Facilities displays material facts. Cross-workspace specialized scheduling, alternatives and act history were not implemented. A reservation must not be presented as treatment administered.

**Real-world coverage:** World DB physical ingestion (`src/app/game/WorldDbPhysicalContent.ts`) preserves documented places/facilities and team associations, uses UNKNOWN facility type/status context where appropriate, and does not synthesize usage rights from associations. It creates no specialist clinical indication, treatment machine, appointment or prescription. `createNewGame.ts` and World DB bootstrap do not supply the missing equipped-act authority. Enriched fixtures prove bounded cases only, not universal production medical infrastructure.

## Required product decision — proposal, not DECIDED

Recommended next contract: one Medical-indicated equipped rehabilitation act, with operational fulfillment evidence only and no new clinical multiplier, acceleration, fatigue effect or RTP entitlement. It may be implemented only after the following are explicitly approved:

1. Which canonical Medical decision indicates the act, for which injuries/lifecycle/eligibility and contraindications? The manager must not invent the indication.
2. Who may indicate and perform it, with which real Staff assignment and authorization? Advisory quality is not prescribing permission.
3. Which explicit capability/component/equipment protocol satisfies that act? Do not infer a protocol from STANDARD_REHAB or interchangeable physical units.
4. What does one completed act fulfill within the canonical rehabilitation plan, and where is that source evidence recorded? Distinguish plan change, reservation and completion. No new clinical benefit is proposed.
5. Which interval/demand may the manager schedule from the approved plan? Specify timing authority and permitted cancellation/reprogramming without inventing a regimen or reserving unknown capacity.

Alternatives and consequences:

- **Approve the narrow equipped-rehab contract:** enables a real plan-owned Medical consumer, typed reuse of C1 and bounded UI/Save/Calendar work. These clinical and material details remain undecided until approved.
- **Keep specialized Medical deferred:** ordinary Medical and natural recovery continue unchanged; BS17D stays PARTIAL and there is no M1 LIVE certification.
- **Approve a separate instrumental fitness protocol:** builds on an executable command, but adds an explicit indication/material/professional/timing policy. It cannot be assumed from the existing test name and is not implemented here.

No therapeutic efficacy decision is needed for a purely operational record, but operational neutrality does not itself authorize clinical indication or fulfillment semantics.

## Validation and independent review

**202/202 tests PASS across 20 files**, using `npm test -- --maxWorkers=1 --testTimeout=30000` followed by the exact file list retained in `evidence/BS17D_M1_AUDIT_EVIDENCE.json`. This is functional validation under an explicit 30-second per-test budget, not a performance certification. Assertions, fixtures, production code and test configuration were unchanged. The evidence includes complete captured logs and their SHA-256 fingerprints.

Coverage includes Medical physical negative causal pairs (8 cases), rehabilitation/fitness/RTP/advisory/chronology/risk, Medical UI and projections, Medical/RTP persistence, Save V4 physical operations/anatomy, Calendar, C1 allocation, Training physical/P1 consequences, Youth Facilities, Recruiting demonstrations, Talent consolidation and **all five V2 cross-system cases**. Physical-world pairs demonstrate ordinary clinical command/result invariance, rights denial, LIMITED/OOS/unknown context, restoration, legitimate alternatives and reload. They do not substitute for an absent specialized Medical consumer or certify Medical/Training cross-occupancy.

`npm run typecheck`: **PASS**. `npm run build`: **PASS**, with the existing bundle chunk-size warning. `git diff --check` and staged diff check: **PASS**. Source scans found zero `Math.random(` and zero direct React/Zustand/Tauri imports in Domain/Engine. Rust checks and the global suite were not rerun for this documentation-only audit; no Rust or production changes exist.

Earlier attempts remain visible: the default parallel run had 14 test timeouts, 167 passing tests and one worker-start timeout; the initial two-file Save V4 run had two timeouts and 12 passes. A serial attempt retaining the 5-second test limit also timed out in MedicalAdvisory and was terminated before completion. The final single-worker 30-second run passed all 202 tests. This supports functional assertion equivalence under the stated budget; it does not prove the exact environmental cause of the initial delays or remove the default-budget limitations. No test assertions were weakened and no BS15 performance program was reopened.

Independent focused review by `m1_clinical_gate_review` inspected Injury, Rehabilitation, MedicalAdvisory, FitnessTest, MedicalActionAccess, BS12E and CFI8. It independently found no authorized equipped-act route and identified the same five missing policy decisions. This is a completed audit review, **not** an adversarial PASS of nonexistent Medical session execution. Specialized duplication, cancellation, cross-consumer bypass and completion checks remain untested because that workflow does not exist.

Historical World DB 2029 remains **UNRESOLVED_HISTORICAL_CAUSE**. V2 remains bounded. No Y1–Y30 or historical 2029 execution was rerun. BS16 global and BS17D global are not declared complete.

**SAFE TO FREEZE:** NO as an M1 implementation base certified LIVE; the unchanged inherited C1 P1 baseline retains its previously certified bounded scope. Documentation may be retained as the audit decision record.

**NEXT ACTION:** approve or supply the missing five-part Medical contract, then resume this isolated branch. Do not start BS17E/F or fabricate an indication to force PASS.
