# BS12 Training & Medical Capability Map

This map describes current authorities at the audited BS12A baseline. A capability row is an inventory grouping, not a separate subsystem. Legacy compatibility code is called out where it could be mistaken for a live authority.

**Original audit baseline:** `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`
**Canonical reconciled baseline:** `282e0893e251aa0e149941cb29cfeadc19ae28c5` (`origin/main` after PRE-BS12 integration)

## Training map (12 capability groups; 49 built-in definitions)

| Capability | Canonical truth / persistence | Lifecycle and consumers | Visibility / action / gap |
|---|---|---|---|
| Catalog and definitions | `TRAINING_CATALOG` in `src/domain/training/TrainingCatalog.ts`; 49 built-in definitions; user definitions in `userTrainingModulesById` | Module definition resolves through `TrainingModuleEngine`; effects target compatibility rating keys and fatigue/morale/cohesion effects | NG Modules tab supports user modules; `injuryRiskWeight` is metadata only |
| Team schedule | `scheduledTrainingSessionsById`; team plan is a preset/input | User schedules dated sessions; calendar executes due sessions once | NG Team tab; match dates excluded, no congestion plan |
| Individual schedule | Same scheduled-session authority; plan compatibility in `individualTrainingPlansByPlayerId` | Individual scheduling creates concrete session for player | NG Personal tab; same canonical executor |
| Session execution | `ScheduledTrainingEngine.executeScheduledSession`; status on persisted scheduled session | Sole automatic execution path is called by daily calendar; collision checks and exactly-once completion | Hidden engine capability made actionable in NG; do not revive legacy automatic executor |
| User module lifecycle | `userTrainingModulesById` | User-created module resolves in same scheduler/executor; can be removed | NG Modules tab |
| Training Staff delegation | `trainingResponsibilitiesByTeamId`; assigned IDs on pending sessions | Responsibility/proficiency/quality influence plan or bounded execution | NG Staff tab. Actual assigned IDs cleared at completion, losing executor history |
| Development stimulus | `developmentStimulusByPlayerId` | Session output accumulates bounded 35-key compatibility stimulus; annual development consumes/reset | Player Development exposes canonical 80-key ratings/history, but training causality remains projected |
| Match-to-development input | Same stimulus authority | `PlayerMatchConsequences` adds mapped Match stimulus; annual checkpoint consumes it with Training stimulus | Connected through the existing aggregate; Match provenance is recorded by BS12F |
| Career fatigue | `careerFatigueByPlayerId`, persistent 0–100 scalar | Match adds net change; Training adds or recovery modules reduce; daily Calendar recovery subtracts fixed amount | NG Load/Player views project it; single persistent authority |
| Recovery modules | Same catalog and Career Fatigue authority | Rest/active recovery/mobility/low-load sessions alter Career Fatigue through normal execution | NG Load tab schedules recovery; does not treat injury |
| Daily load classification | Derived from same-day scheduled sessions and load inputs; not persisted | `dailyScheduledLoad` / `classifyDailyLoad` classify workload | NG Load view; no back-to-back, 3-in-5, travel policy |
| Team morale/cohesion effects | Morale/cohesion authorities in Player/team state; not Training-specific parallel fields | Configured completed-session effects, especially tactical/team work | Team effects exist in engine; UI detail varies by surface |

### Training authority and lifecycle notes

- `CalendarEngine.advanceDay` calls `executeScheduledTrainingSessions`. The earlier automatic `executeEligibleTraining` path was removed from calendar execution in `969efa3`.
- `TeamTrainingPlan` remains useful as a team focus/intensity preset for the user fill-week action, and its data remains Save-compatible. `IndividualTrainingPlan` and old explicit `TrainingEngine` functions remain callable but no current production call site makes them a competing automatic authority.
- Session output does not directly mutate the 80 Player Truth ratings. Stimulus flows to `OffseasonDevelopment`, which deterministically changes all 80 canonical ratings at the annual checkpoint and records 35 projected history signals.
- `TrainingLoad` is a derived workload score/classification. `CareerFatigue` is the persistent cumulative player value. The transient in-match fatigue subscale is scoped to a live MatchSession.
- The legacy Training screen's 7-key rating projection does not match the 35-key stimulus output. The default NG workspace uses `TrainingPcbPage`.

## Medical map (9 capability groups)

| Capability | Canonical truth / persistence | Lifecycle and consumers | Visibility / action / gap |
|---|---|---|---|
| Injury creation | `InjuryRecord` in `injuriesById`, created by `PostMatchInjuries` | Completed game + actual player seconds; deterministic seeded chance/severity/duration; optional source game | Match consequence path only; Training does not create injury |
| Injury state and date window | `InjuryRecord.injuredOn`, `expectedReturnDate`; persisted | Active iff date is in `[injuredOn, expectedReturnDate)`; no daily mutation/healed flag | Medical, Player, Roster projections derive status |
| Injury history | Persisted injury records; prior count derived | Historical records can inform risk band; no explicit causal recurrence/body-area chain | Medical/Player history projections; richer chronology absent |
| Availability | Shared `isPlayerAvailable` and competition eligibility boundary | Active injury excludes; match squad assembly composes medical availability with competition eligibility | Match preparation and roster/medical projections; no second persisted available flag |
| Medical risk assessment | Derived read-only `MedicalRiskAssessment` score/band | Active injury, Career Fatigue thresholds, prior injury count; no participation or occurrence side effect | Medical risk view; not injury probability |
| Staff advisories and recommendation generation | Persisted medical advisory outcome / `StaffRecommendationService` | Daily calendar processing with genuine delegated holder; recommendation based on Staff quality, workload, temperament | Medical shows advisory count; Staff workspace carries decision actions |
| User recommendation decision | Advisory outcome plus InjuryRecord expected return date | Explicit accept applies bounded date adjustment from frozen baseline; reject/dismiss does not apply | Staff NG action path; Medical direct action is absent |
| Recovery / treatment / RTP | No injury-treatment or RTP authority found | Training recovery changes Career Fatigue only; expected date naturally ends active interval | No diagnosis, actual treatment, rehab, fitness test, clearance, fit/match-ready stage |
| Medical manifestations and Save | Save V1 injury/advisory state; NG Medical, Player, Roster projections | Injury and recommendations are persisted; active status/risk/availability derived | Default NG uses canonical data; legacy Medical PCB is hard-coded sample data |

### Medical lifecycle notes

1. Match completes; dynamic match consequences and post-match injury generation run using the completed game/stat log.
2. An injury record is stored with a seeded return date. The injury is active by date, not by a mutable status flag.
3. The daily medical advisory phase may create Staff recommendations. It does not automatically treat or clear the player.
4. User may accept/reject/dismiss a Staff recommendation. Accept changes expected return date from its frozen original baseline and marks the outcome applied.
5. Availability derives from active injury plus competition eligibility. Once date is outside the active interval, injury no longer blocks availability; no separate medical clearance state exists.

## Shared and adjacent authorities

| Adjacent system | Existing authority | BS12 relationship |
|---|---|---|
| Player Truth | `Player.PlayerRatings` contains 80 canonical ratings; 35-key V2 and 7-key V1 are projections | Annual development mutates canonical ratings; Training stimulus maps through 35 compatibility keys |
| Development | `OffseasonDevelopment` / `developPlayerForSeason`; deterministic seeded baseline, bounded stimulus | Sole annual rating development process found; don’t create another development engine |
| Match dynamic state | `careerFatigueByPlayerId` and `developmentStimulusByPlayerId`; transient MatchSession fatigue during game | Completed-match consequences write shared player dynamic state |
| Staff | Training responsibilities/execution quality; Medical advisory responsibilities/quality | Training and Medical consume existing staff truth; richer Staff career/reasoning is BS13 |
| Facilities | CFI8 derived capability contexts for Training, Performance, Medical, Rehabilitation, Recovery | Existing but no Training/Medical engine consumer; BS17 owns facility operations |
| Save | GameWorldSaveV1 persists source-of-truth records and backward-compatible fields | Derived status/load/risk/facility context is reconstructed, not persisted |

## Duplicate authority inventory

| Concern | Current representations | Finding |
|---|---|---|
| Fatigue | CareerFatigue persisted scalar; transient MatchSession fatigue; derived daily load | One career authority. MatchSession fatigue is an in-game transient input; daily load is a derived score. |
| Injury | InjuryRecord plus derived active status | One persisted injury authority; no second injury engine found. |
| Availability | Active InjuryRecord + eligibility composition | Derived boundary; no persisted second availability flag. |
| Risk | MedicalRiskAssessment | Read-only derived projection, not another injury chance. |
| Training execution | Scheduled executor plus retained legacy explicit functions | Only scheduled executor is automatic; retain legacy API carefully and do not reconnect as a second calendar path. |
| Development | 80 truth keys; 35 V2 and 7 V1 views; 35-key stimulus/history | Compatibility projections, not duplicate canonical Player data. Legacy Training UI mismatch is a presentation defect. |
| Recovery | Training recovery sessions and daily Calendar recovery both alter Career Fatigue | Two intentional producers for one scalar, not duplicated state. Neither is injury care. |

## Canonical-main reconciliation

The Master Capability Reuse Audit was absent from the original audit baseline and is present on canonical main. It confirms the broader reusable Player Truth, Staff V2, and Facilities CFI1–CFI8 capabilities; it does not identify competing BS12 authorities. In particular, CFI8 remains a derived sporting context without a Training/Medical consumer.

The only BS12-relevant authority delta found is the MatchEngine starting-fatigue boundary: canonical main no longer supplies `careerFatigueByPlayerId` as initial transient MatchSession fatigue. Career Fatigue remains canonical world state and still informs pre-match rotation planning. Match completion continues to update that same Career Fatigue authority and development stimulus; injury, availability, Training, Medical, Staff recommendation, and facilities authorities are otherwise unchanged. NG Training, Medical, Player medical/development projections, and Roster injury/availability projections remain exposed; the integration removed only the MatchNext debug route from startup, with no change to these workspace routes.
