# BS12A — Training & Medical Convergence Audit

**Status:** Audit complete; implementation roadmap below is a proposal, not a product decision.
**Original audit baseline:** `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`
**Canonical reconciled baseline:** `282e0893e251aa0e149941cb29cfeadc19ae28c5` (`origin/main` after PRE-BS12 integration)
**Branch:** `bdm-stage2-bs12a-training-medical-convergence-audit`

## Executive finding

BDM already has an executable, persistent scheduled Training system, deterministic 80-rating offseason development, shared career fatigue, match-generated injuries, date-based injury availability, medical staff recommendations, user scheduling controls, and current NG Training / Medical / Player projections. These are connected in several important paths. BS12 should converge them around the existing authorities; it should not add another Training engine, fatigue scalar, injury engine, or development model.

The main gaps are consequential behavior and cross-surface visibility: fixture-density-aware Training decisions, AI-owned team scheduling/rest choices, training-derived injury occurrence, facility capability consumption, explicit medical recovery/return-to-play lifecycle, and a direct Medical-workspace action path for recommendations. Some capabilities are present but hidden in staff/legacy surfaces. Other values are metadata or projections and must not be represented as active simulation effects.

## Scope and evidence

Reviewed the active architecture and product guardrails, active BS12A request, current domain/engine/calendar/save/UI code, focused tests, available historical audit documents, and Git history. The detailed authority and edge map is in [BS12 capability map](BS12_TRAINING_MEDICAL_CAPABILITY_MAP.md); the producer/consumer matrix is in [BS12 integration matrix](BS12_TRAINING_MEDICAL_INTEGRATION_MATRIX.md).

Prior materials found: archived BS0 strengthening audit and gameplay manifestation matrix; archived BS5 Player Dynamic State audit/map; archived BDM authority map. At the original audit baseline, the Master Capability Audit/Registry, Product Manifestation Map, Contract Deep Audit, and dedicated BS12 specification were absent. Canonical main now includes the Master Capability Audit and Registry, which this reconciliation used. Historical documents are useful as leads, not current truth. Relevant history includes `94ec350` (scheduled Training/catalog/effects), `969efa3` (retired duplicate automatic legacy plan execution and made scheduled sessions sole automatic path), `bf5c05e` (Staff training execution), and `a9c906f` (medical recommendation quality and frozen return-date baseline).

### Capability inventory and counts

Counts below are audit inventory rows, not claims that each row is a separate engine. Training has **12** capability groups; its built-in catalog contains **49** definitions. Medical has **9** capability groups. The source-of-truth and lifecycle for each are spelled out in the map and matrix.

| Area | Mapped groups | What is live |
|---|---:|---|
| Training | 12 | Definitions, user modules, team/individual scheduling, execution, Staff delegation, development stimulus, career fatigue, recovery sessions, morale/cohesion effects, daily-load classification, persistence, UI actions |
| Medical | 9 | Post-match injury creation, injury record, date-based active status, availability gate, risk assessment, Staff advisory/recommendation, user accept/reject/dismiss, Player/Medical/Staff projections, save persistence/history |

## Capability findings

### Training

The canonical automatic execution authority is `executeScheduledTrainingSessions`, invoked by `CalendarEngine.advanceDay`. Scheduled team and individual sessions resolve built-in or user-created module definitions, validate collisions, persist, and execute once when due. User-created modules use the same execution path. The old `TeamTrainingPlan`/`IndividualTrainingPlan` and explicit legacy executor remain in code and Save compatibility; the automatic legacy executor was retired. The team focus/intensity plan still serves as input to the user's fill-week scheduling action, so that input is not wholly dead. Do not revive a second automatic executor.

The built-in catalog has **49** definitions across shooting, finishing, ball handling, playmaking, defense, rebounding, physical, recovery, and tactical categories. A completed session can add bounded compatibility-key development stimulus, change Career Fatigue, and apply configured morale/cohesion effects. Staff delegation and execution quality are consumed. Assigned Staff IDs are cleared on completion, so historical attribution to the actual executor is not retained.

Individual stimulus is not an immediate rating mutation. The annual offseason development checkpoint consumes bounded stimulus and develops all **80** canonical Player Truth ratings deterministically; it records a 35-signal projected history and resets stimulus. Training's target/effect mapping is through the 35-key compatibility layer. The 7-key legacy Training screen reads an older rating view and can under-report current stimulus; default NG Training uses the migrated Training workspace.

`careerFatigueByPlayerId` is the single persisted career-fatigue authority. Match consequences add a positive net completed-match delta; scheduled Training adds or reduces it; daily Calendar recovery subtracts a fixed amount. Transient match-session fatigue is separate. Same-day scheduled-load classification is derived from session intensity, duration, and fatigue multiplier; it is not another persisted fatigue value. No schedule-density policy covers back-to-back games, 3-in-5, travel, or training on congested stretches. Training excludes sessions only when the date is a match date.

`injuryRiskWeight` exists in catalog metadata and has no consumer. Training does not create injuries or affect post-match injury probability. Injury occurrence currently depends on actual match minutes, not Training load or Career Fatigue.

### Medical and injury lifecycle

Completed matches with actual player minutes can create deterministic, seeded injury records. Current kinds are ankle sprain, hamstring strain, knee sprain, back strain, hand injury, and shoulder strain; severity is minor/moderate/serious. The record carries player, kind, severity, injured date, expected return date, and optional source game. Injury status is derived from the date interval `[injuredOn, expectedReturnDate)`; there is no daily injury mutation or separate healed flag.

Active injury is the Medical availability authority. `isPlayerAvailable` checks active injury; competition squad assembly composes that with competition eligibility. Match preparation uses the shared boundary. Fatigue alone does not make a player unavailable. Medical risk assessment is a read-only score/band based on active injury, Career Fatigue thresholds, and prior injury count; it does not change injury odds or participation.

Medical advisory processing runs in the daily calendar phase. A team with an eligible medical advisory holder can receive treatment and return-to-play recommendations for an active injury. Staff medical quality, workload, and temperament affect the recommendation. Recommendation acceptance is explicit and changes the InjuryRecord expected return date from a frozen baseline, avoiding compounding. Reject/dismiss does not apply it. There is no diagnosis, actual treatment execution, injury-specific rehabilitation, chronic/recurrent causal record, clearance/fit/match-ready stage, or fitness test. A Training recovery module changes Career Fatigue only; it does not treat an injury.

The Medical workspace projects open advisory counts and injury/risk/history views, but recommendation decisions are performed through the Staff workspace. AI advisories can be generated for teams with genuine delegated medical staff; no AI accept/dismiss, rehab, or return-to-play decision loop was found. User team authority is explicit through Staff recommendation actions. The current NG Player medical surface shows readiness, injury, load/recovery timeline, history patterns, and Staff notes/treatment gaps. Roster projections show injury, availability, and staff comments but do not unify Training and Medical actions.

### Match, development, Staff, facilities, and Save

Both match completion paths apply dynamic match consequences and then post-match injury generation. The completed game and match-stat log supply actual played seconds; seeded outcomes prevent nondeterministic injury rolls. **Reconciliation correction:** canonical main no longer initializes transient MatchSession fatigue from Career Fatigue. Career Fatigue still feeds pre-match rotation planning, and completed-match load is still written back to the shared Career Fatigue field. Match development can add stimulus, which the annual development checkpoint consumes. Active injury plus competition eligibility filters the match squad. Match-derived injury records are the only active injury creation path found.

Training Staff assignments, responsibility, proficiency, and bounded execution quality affect scheduling/execution. Medical Staff role quality and workload affect recommendations; user-controlled, vacant, or organizational assignments do not fabricate recommendations. This is a real Staff integration. Rich Staff career, politics, and AI reasoning belong to BS13.

CFI8 exposes derived Basketball, strength/conditioning Training, Performance, Medical, Rehabilitation, and Recovery capability contexts from CFI2 access, CFI3 capability, and CFI4 condition/serviceability. The contexts are not persisted and no Training or Injury engine currently consumes them. No synthetic facility rating is used. BS17 owns facility investment/construction/maintenance; BS12 may consume existing contexts only under approved gameplay rules.

Save V1 persists Injury records, Training plans/responsibilities/sessions/scheduled sessions/user modules, development stimulus, career fatigue, and Player rating history. Defaults/migrations support older fields. Availability, active-injury status, Medical risk, daily load, and facility context are derived. There is no event ledger for each fatigue change, completed-session result, actual Staff executor, or full 80-rating delta history; PlayerRatingHistory projects 35 signals. Save authority is coherent, but event-level auditability is limited.

## Manifestation and reuse findings

- **Current default route:** NG Training and Medical workspaces are connected to canonical state. Training offers team/personal/load/staff/modules controls, session scheduling/cancellation, user modules, and recovery scheduling. Medical surfaces injury/risk/history and advisory count; recommendation action is in Staff.
- **Player:** current Player views expose 80-rating development/history and medical readiness/injury/load/recovery projections. Medical treatment and Staff-note gaps are visible as gaps, not implemented treatment.
- **Roster:** injury and availability are projected; it is not the canonical authority and does not add a second availability flag.
- **Legacy routes:** `MedicalPcbPage.tsx` is hard-coded sample data mounted only in explicit legacy shell mode. It is not the default simulation surface. Legacy Training's 7-key projection mismatches the 35-key stimulus projection and should be corrected or retired if that route remains supported. These are reuse/manifestation opportunities, not grounds for duplicate domain systems.
- **Hidden versus disconnected:** Staff workspace exposes recommendation decisions; the legacy TeamTrainingPlan is a scheduler input and compatibility model; the existing facility capability contexts are real but disconnected from Training/Medical. `injuryRiskWeight` is metadata, not a hidden injury system.

## Duplicate-authority and risk assessment

No second active persistent fatigue, injury, availability, risk, or 80-rating authority was found. The transient MatchSession fatigue subscale is an intentional in-match representation; derived active status and risk are projections. The remaining practical risks are stale legacy UI, legacy Training's old explicit execution API being accidentally reactivated, loss of completed-session Staff attribution, metadata being mistaken for an effect, and injury recommendations being mistaken for treatment or medical clearance. Recovery mechanisms write the same Career Fatigue value by design.

## Priorities and ownership

**P0:** None identified in the default NG path. Existing scheduled-session execution/idempotence and active-injury squad exclusion have focused coverage.
**P1:** AI team Training/rest choices; fixture-density-aware workload planning; explicit product rule for Training/physical load contribution to injury likelihood; Medical recommendation action discoverability; explicit medical recovery/clearance/RTP lifecycle if product requires it; facility-context consumption only with approved effects; repair or retire the legacy sample Medical and 7-key Training projection if legacy mode remains supported.
**P2:** Full 80-key causal history, completed-session result/executor history, richer injury recurrence/body-area causal chronology, and further information polish.

### Reduced BS12B+ roadmap (proposal only)

1. **BS12B — Training ownership and physical-load convergence.** Preserve scheduled sessions as the sole executor. Decide and implement AI-owned schedules/rest plus fixture-density-aware planning using existing Career Fatigue and scheduler. Product approval is required before consuming `injuryRiskWeight` or changing match injury probability. Consume existing CFI contexts only if approved consequences exist. Correct the legacy projection only if legacy UI is supported. Do not add a second fatigue state.
2. **BS12C — Medical availability and recovery decisions.** First obtain product approval on whether treatment, rehabilitation, and distinct return-to-play/fitness stages are required. If approved, extend the existing InjuryRecord/availability authority and recommendation flow; define who can decide, what changes availability, and how decisions/history persist. Surface actions through Medical or an explicit Staff link. Do not present fatigue recovery as injury treatment.
3. **BS21 handoff.** Decide whether explicit legacy shell mode remains supported; if so, replace sample Medical data with canonical projection and align Training projection, otherwise retire those legacy routes. BS21 owns cross-app UX and information convergence.

BS12 owns Training/Medical domain lifecycle and gameplay decisions. BS13 owns richer Staff reasoning/career/delegation/politics. BS17 owns facility build/maintenance/investment. BS21 owns cross-app UX and legacy-route policy. All roadmap items are **PROPOSAL**; no unapproved product decision is promoted to DECIDED.

## Focused validation

Reconciliation re-ran six focused test files on canonical main: scheduled Training, Player Dynamic State/post-match consequences, annual development, Medical advisory, availability, and Staff recommendation. The existing live-fatigue test also verifies MatchSession fatigue initializes at zero. Result: **7 files passed, 72 tests passed**. No full suite, build, or long-horizon simulation was run; this is documentation-only.

## Canonical-main reconciliation

The original audit baseline was `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`; it is not canonical main. The reconciled baseline is `282e0893e251aa0e149941cb29cfeadc19ae28c5`. The original audit commit `279406dab99cacff1d8458236b297843798e873c` supplied these three documents; its two additional file changes were zero-content BS11 document renames and were not imported.

**Findings unchanged:** Training execution remains owned by the scheduled Training executor; Career Fatigue by `careerFatigueByPlayerId`; Player development by canonical 80 ratings plus `OffseasonDevelopment`; injury by `InjuryRecord`; availability by active injury plus the eligibility boundary; medical risk by derived assessment; Medical advisory by the Staff recommendation flow; and facilities by existing CFI context. The Master Capability Reuse Audit is present on canonical main. The original audit could not see it; this reconciliation can. Its Training/Medical/Player/Staff/Facilities entries corroborate the reuse-first findings and add the wider context that Player Truth has 80 ratings and 40 tendencies without a persisted overall, Staff V2 already has broad capabilities to reuse, and Facilities CFI1–CFI8 are canonical while CFI8 sporting contexts still have no Training/Medical consumer or canonical workspace.

**Finding corrected:** the original matrix's `Training / Career Fatigue → Match` and `Match → Career Fatigue` description overstated the live MatchEngine connection. PRE-BS12 integration removed the initial-fatigue input to MatchSession and removed its conversion helper. Career Fatigue still influences rotation planning before a match; it does not initialize transient MatchSession fatigue. Match completion still writes Career Fatigue from match-session load.

**Findings added from the Master Capability Audit:** Facilities has a broader persisted CFI1–CFI8 capability and lifecycle than this focused audit could establish originally; Staff and Player systems are already extensive reuse targets, not greenfield subsystems; the NG workspace shell already covers core Training/Medical/Player/Roster surfaces. These additions do not change the BS12 subsystem authority map.

**UI check:** NG Training, NG Medical, Player medical/development projections, and Roster injury/availability projections remain exposed through the NG workspace host and navigation catalog. The integration changed `src/main.tsx` only to remove the excluded MatchNext debug entry point; Training/Medical/Player/Roster routes and navigation files were unchanged.

**Roadmap:** the reduced proposal remains supported: BS12B owns Training ownership and physical-load convergence; BS12C owns medical decisions and recovery/RTP convergence. No new milestone is justified by this delta. Product decisions on injury-risk effects, facility consequences, and medical treatment/RTP remain proposals requiring approval.

**Outcome:** BS12A is **CANONICAL / CLOSED / PASS** as a reconciled documentation audit. No P0 was found. Existing P1 opportunities remain unchanged.
