# BS12F Training & Development History

## 1. Blocker resolution and writer audit

The initial audit missed the existing Match stimulus writer. A repository-wide search of `developmentStimulusByPlayerId`, `addDevelopmentStimulus`, and the completion call sites found:

| Source | Writer and status | Provenance |
|---|---|---|
| Scheduled Training | `ScheduledTrainingEngine.executeScheduledSession`; active canonical Training path | Recorded per player and rating, linked to the completed scheduled session |
| Match | `PlayerMatchConsequences.applyPlayerMatchConsequences`; called after `applyCompletedMatch` by `playUserGame` | Recorded per player and rating, linked to the completed Game |
| Legacy Training | `TrainingEngine.executeTeamTraining` / `executeEligibleTraining`; no non-test application call sites, retained for compatibility | Its result uses the retired seven-key surface; the current aggregate only accumulates the 35 canonical keys. It does not contribute current aggregate stimulus |
| Annual development | `OffseasonDevelopment` clears the aggregate after consuming it | Reset only; not a producer |

BS12F adds no Match development mechanic. The Match provenance event records only the existing `PlayerMatchConsequences` output. The corrected finding is **MATCH → DEVELOPMENT STIMULUS = CONNECTED**. The premise in the revised blocker resolution that no producer existed was disproved by the writer audit.

## 2. Training execution history

Completed scheduled sessions retain compact execution evidence directly on `ScheduledTrainingSession`. It records completion date, displayed module name, effective category/intensity, executing Staff IDs, execution-quality multiplier, resolved participants, actual Career Fatigue deltas, stimulus-event links, generated InjuryRecord IDs, and team-cohesion delta. It does not snapshot Players or duplicate InjuryRecords.

The executor IDs are captured before the transient `assignedStaffPersonIds` are cleared. A user-created module's name is copied at execution, so later module deletion does not erase its historical label. Staff profiles remain stable world entities; historical records retain Staff IDs independently of active assignments.

Resolved participation records `FULL`, `REDUCED`, or `REST` at execution time. An unavailable player is recorded as `REST`; REST records zero Training exposure. Individual sessions record their actual FULL/REST execution state as well.

## 3. Stimulus provenance and aggregate authority

`developmentStimulusByPlayerId` remains the sole gameplay aggregate. Append-only `DevelopmentStimulusEvent` records preserve only real positive contributions, with source type, source ID, date, player ID, and sparse 35-key rating amounts. Training session evidence references its event; Match events reference the completed Game. This captures the actual Training and Match writers without changing their calculations.

Annual development snapshots the aggregate stimulus presented to the existing algorithm, then resets the live aggregate as before. Source events and the checkpoint snapshot remain available afterward. Old saves receive no fabricated source records. Their pre-history aggregate may therefore have no reconstructable source detail until new events are recorded.

## 4. Annual development and causal policy

Each annual history row keeps the existing 35-key projection deltas as an explicit compatibility field and adds sparse exact changes for the 80 persisted Player Truth ratings (`before`, `after`, and `delta`). It also records checkpoint date/cycle, age, age-based trend, potential-growth factor, and the 35-key aggregate stimulus input. Unchanged ratings are omitted from the persisted delta map; the Player UI groups changed ratings by the existing rating categories.

The history describes what changed and which inputs were present. It does not divide a rounded final rating delta into exact shares for stimulus, age trend, potential, or seeded variation. Individual Training sessions are never credited with a rating change.

Calendar's existing annual cycle ID remains the idempotency boundary. Historical checkpoint rows and completed Training evidence are protected against edits/removal through `updateGameWorld`.

## 5. UI

NG Training now includes a completed-session history for the user team, with date, module, executor, effective intensity/category, execution quality, FULL/REDUCED/REST counts, and participant-level fatigue, stimulus total, and injury count.

Player Development now includes recent Training history and a stimulus-source timeline. It shows resolved participation, executor, actual fatigue delta, stimulus amount, and injury kind/ID. The annual history shows changed canonical ratings, grouped by category, with prior/current/delta values and checkpoint inputs. Copy states that Training stimulus was one input and does not claim a session directly changed a rating. Match and Training source events remain distinguishable.

## 6. Save, size, and compatibility

Save V1 persists session evidence, sparse provenance events, and the expanded annual history. Missing new fields default to empty history; old saves do not gain invented sessions or stimulus sources. Existing 35-key history consumers continue using `deltas`; canonical views use `truthDeltas` from the same history row, avoiding a second competing history collection.

Storage is proportional to completed sessions, actual positive player contributions, and changed ratings per annual checkpoint. A session stores player IDs and small effect summaries rather than full Player snapshots; stimulus events store sparse values; rating history stores only changed truth keys. No daily fatigue ledger or duplicate Staff/module objects are added.

## 7. Scenarios and checks

- Mixed participation and actual effects are recorded at execution; REST has zero load/stimulus/injury exposure.
- Training and Match writes create distinct source events; no Match behavior is added by BS12F.
- Annual development stores its inputs and sparse 80-rating changes, resets the aggregate, and leaves provenance intact.
- Deleted user modules remain named by execution snapshots; later Staff assignment changes do not rewrite executor IDs.
- Training injuries are referenced by InjuryRecord ID; Medical remains the injury-detail authority.
- Save roundtrip preserves execution, Staff, source-event, and annual-history evidence; old saves default without fabricated records.

## 8. Authority audit and remaining P1s

| Area | Single authority |
|---|---|
| Training plan / AI plan | Existing Training planning services |
| Scheduled execution / participation | Scheduled Training executor and its BS12D resolver |
| Career Fatigue | `careerFatigueByPlayerId` |
| Development stimulus | `developmentStimulusByPlayerId`; provenance is explanatory only |
| Annual development / rating truth | `OffseasonDevelopment` / 80-key Player Truth |
| Development history | One `playerRatingHistoryByPlayerId` row per player/checkpoint, with 35-key compatibility projection |
| Injury / availability / RTP / rehab / fitness testing | Existing InjuryRecord and BS12C-E lifecycle |
| Match simulation | MatchEngine unchanged |

Remaining safe P1s: advanced periodization (future Training product work), deeper anatomical Medical simulation and role-specific rehabilitation (future Medical work), Staff prevention/intelligence (**BS13**), Facilities effects (**BS17**), and legacy Training/Medical surfaces (**BS21**). Match-derived development is already present; BS12F only adds its factual provenance. No P0 remains for BS12 closure.

## 9. Final result

The BS12 gameplay loop is inspectable from Training plan and participation through execution, load/stimulus, annual development and 80-rating history. The Medical loop remains on the existing canonical InjuryRecord, rehab, fitness testing, RTP, and availability authorities. The corrected Match stimulus finding is documented in the BS12A audit, capability map, integration matrix, current game-loop reference, and final certification.

**BS12F: PASS. BS12 · TRAINING + MEDICAL: FULLY CLOSED / PASS.** Focused validation passed: 43 tests across 8 files, TypeScript typecheck, and production build. The working tree was reviewed and committed atomically.
