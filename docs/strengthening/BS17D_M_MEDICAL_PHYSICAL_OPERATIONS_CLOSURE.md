# BS17D-M Medical physical operations closure

**PASS · BS17D-M FOCAL ANALYSIS AND BS12C COMPATIBILITY**. **Medical specialized Facilities consumers: NOT_IMPLEMENTED. BS17D global: PARTIAL.** This certifies the focal analysis, not a Medical sporting consequence, core Training/Medical PASS or complete BS17D.

Base: `db2c117b845e708c21dc5e805d2949842dcd1fc6`. Accumulative isolated branch: `bdm-stage2-bs17d-medical-closure`. Final SHA is the containing local commit (`git log -1 --format=%H -- docs/strengthening/BS17D_M_MEDICAL_PHYSICAL_OPERATIONS_CLOSURE.md`). Main and other worktrees remain unchanged. BS15 candidate `94c0770` is not in this ancestry; Talent remains BLOCKED_BY_LINEAGE.

## Focal operation inventory

- **Injury creation and diagnosis: NO_PHYSICAL_REQUIREMENT for existing injury recording; NOT_IMPLEMENTED for a separate diagnostic procedure.** `InjuryCreation.createDeterministicInjury` constructs the canonical kind/severity/projected date from the seeded injury occurrence authority. `InjuryRecord` stores injury, rehabilitation, setbacks, tests and RTP. Neither a diagnostic imaging command nor a procedure/equipment requirement is modeled. A named injury or a diagnostic label displayed by UI is not execution of imaging.
- **Medical advisories and risk assessments: NO_PHYSICAL_REQUIREMENT.** `MedicalAdvisory.progressMedicalAdvisories` produces Staff `DelegationOutcome` advice. `acceptMedicalRecommendation` applies its already-approved bounded recommendation effect. `MedicalRiskAssessment` is derived advice. Neither recommendation generation nor acceptance executes a material treatment procedure. A treatmentRecommendation must never be renamed as performed physiotherapy.
- **Rehabilitation plan selection: NO_PHYSICAL_REQUIREMENT.** `Rehabilitation.setRehabilitationPlan` chooses REST/STANDARD_REHAB/ACCELERATED_REHAB and records mode history. `chooseAiRehabilitationMode` uses severity/history/fatigue/fixtures/advice. These modes have no modality, equipment or physical-session command. STANDARD_REHAB does not imply hydrotherapy, instrumental physiotherapy or a rehabilitation-room reservation.
- **Weekly setbacks: NO_PHYSICAL_REQUIREMENT.** `progressRehabilitationSetbacks` uses the existing seeded, bounded BS12E mode policy and persists injury evidence. It is lifecycle processing, not an equipped procedure. Facilities cannot add a modifier.
- **Fitness evaluation and command: NO_PHYSICAL_REQUIREMENT.** `FitnessTest.evaluateFitnessTest` and `conductFitnessTest` compute and persist the existing deterministic review evidence using severity, fatigue, history, rehab mode and Staff advice. No equipment protocol is specified. Calling this a fitness test does not authorize an imaging-room or strength-room prerequisite.
- **RTP review: NO_PHYSICAL_REQUIREMENT.** `ReturnToPlayEngine.reviewReturnToPlay` enforces due review, user/AI ownership and any required passed fitness test. CLEAR_FOR_PLAY or CONTINUE_RECOVERY remains its exclusive authority. A room does not clear an injury or change the projected date.
- **AI lifecycle: NO_PHYSICAL_REQUIREMENT beyond the same existing commands.** `AiMedicalLifecycle` accepts advice, selects a plan, conducts a due test and requests clearance through the shared services. It is not a second medical procedure pipeline.
- **Imaging, instrumental physiotherapy, hydrotherapy, cryotherapy and specialized equipped physical rehabilitation: NOT_IMPLEMENTED.** No productive command, procedure entity, prescribed modality, material execution record, equipment requirement or retry queue exists in the inspected Medical authorities.

There is **no existing productive Medical operation classified PHYSICAL_REQUIREMENT_EXISTS or CAN_BE_CONNECTED_WITH_APPROVED_POLICY** on this base. The P0 restriction policy is approved; this is not a renewed generic BLOCKED_BY_PRODUCT_DECISION finding. The missing dependency is the specialist procedure itself.

## Physical context versus clinical authority

CFI8 exposes MEDICAL_EXAMINATION/MEDICAL_IMAGING, rehabilitation PHYSIOTHERAPY/HYDROTHERAPY/STRENGTH_TRAINING/CARDIO_TRAINING, and recovery HYDROTHERAPY/CRYOTHERAPY/PHYSIOTHERAPY. These are verified anatomy/access/availability facts, not executed clinical acts. The shared P0 resolver can already distinguish availability, compatible limitation, unavailability and unverified evidence and evaluate entitled alternatives. No resolver call is wired to block an unrelated clinical command.

An actual future procedure must be owned by Injury/Medical (canonical prescription/procedure identity, timing, execution/result/pending state and retry command). Its own approved material requirement may then consume CFI8 and P0. Facilities must own only asset/component/right/date/capacity evidence. Defining such a new clinical procedure is outside BS17D-M and expressly prohibited by its no-invention instruction. A capability adapter test cannot turn that missing consumer LIVE.

## Causal negative evidence and manager experience

`MedicalPhysicalCompatibility.test.ts` constructs pairs differing only in physical serviceability/access/content: functional versus LIMITED/OOS imaging, denied access, unknown source information, restoration and a valid alternative. CFI8 or the P0 resolver demonstrably changes physical availability. Real clinical commands demonstrably continue with equivalent nonphysical world results: rehabilitation selection, setbacks, genuine Staff advisory generation/acceptance, actual fitness testing, CONTINUE_RECOVERY, clearance and the AI lifecycle. Advisory generation is explicitly checked to leave InjuryRecord untouched before acceptance. Comparisons include every nonphysical collection, so Finance/Governance/Players/matches/fatigue are not silently modified by physical context.

Save V4 round-trips physical facts and actual clinical fitness evidence, preserving replay behavior without another result. Tests normalize legacy fixture Staff defaults through the existing Save boundary before paired comparisons; no production migration is added.

The existing Medical workspace is the canonical surface for advice acceptance/dismissal, rehab plan choice, fitness tests and RTP. Its model remains equal across these physical variants. Facilities remains the canonical surface for physical anatomy, access and serviceability. No procedure button, invented clinical alert, specialist procedure result, recovery bonus or duplicate Facilities screen is added. Unchanged clinical commands are not described as Facilities LIVE consumers.

## BS12C and scope

BS12C explicitly assigns no recovery effect to Facilities. Its RECOVERING → RTP_REVIEW_DUE → CLEARED lifecycle, actual clearance evidence and independent competition availability remain unchanged. Serious/related injuries retain their BS12E fitness-test gate. No clinical severity, duration, efficacy, recurrence probability, fatigue formula or RTP rule is changed.

Only this certification and compatibility tests are added. No production Medical/Training/Facilities/Save/Finance/Governance/MatchEngine/Player-supply code changes. Training P0 LIVE behavior remains under its own approved registry. No merge, push, dependency installation or BS17E work.

## Remaining blockers and next action

Medical physical consumers remain NOT_IMPLEMENTED because the corresponding specialist procedures do not exist. Future closure must begin in the Medical owner milestone with explicitly approved real procedures, not by converting advice or rehabilitation modes into equipment operations. Talent still requires authorized canonical BS15 integration. These limits preserve BS17D PARTIAL; no global PASS is declared.

## Validation

- **255/255 focused tests PASS in 25 files**, zero failed or pending tests; report: local temporary `BS17D-M-focused-tests.json`.
- Includes **8 new Medical physical compatibility tests**, all existing Injury/Medical/Training engine tests, **17 Training P0 causal tests**, Medical workspace/model, Player Medical model, Training workspace, CFI8, BS17C scoped physical operations and scheduled-module Save persistence.
- `npm run typecheck`: PASS. `npm run build`: PASS. `git diff --check`: PASS.
- Zero `Math.random(` in src and zero improper production React/Zustand/Tauri imports in Domain/Engine.
- No production authority or save-schema changes; no new formula or multiplier. Focused validation follows the requested Fast Loop; no full repository, annual simulation or Rust suite was started.
- Final review confirms the diff contains only this analysis/certification and the negative causal regression file. No NOT_IMPLEMENTED procedure is claimed LIVE.
