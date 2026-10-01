# BS12D · Advanced Training, Individual Load & Injury Interaction

**Branch:** `bdm-stage2-bs12d-advanced-training-injury-interaction`

**Starting point:** `c52a21717a5973ee33d99a0df3000d405bcb9847`
**Status:** implementation and focused verification complete; inherited Save V1 round-trip failures are recorded below.

## 1. Reuse audit

BS12D extends the scheduled Training executor, BS12B AI planner and fixture context, `careerFatigueByPlayerId`, canonical Player ratings/stimulus, `InjuryRecord`, `PostMatchInjuries`, shared availability, and the BS12C RTP transition. Team sessions remain one scheduled session. No second executor, injury entity, availability flag, load scalar, or Medical lifecycle was introduced.

## 2. Participation model

`ScheduledTrainingSession.participationByPlayerId` stores only explicit FULL, REDUCED, or REST decisions for a team session. An unset player uses `recommendTrainingParticipation` from current Career Fatigue and upcoming fixture proximity. Player choices are immutable until an explicit user edit; AI writes its decisions only when it creates its own session.

## 3. User individual load control

In the NG Team planner, each scheduled session has a Load control with roster fatigue, the suggested choice, and an Automatic / Full / Reduced / Rest selector. Selecting Automatic removes the explicit override. The existing team session remains intact.

## 4. AI individual load control

The BS12B weekly AI planner writes the same participation map on its ordinary scheduled team sessions. Its deterministic policy is: fatigue at least 85 suggests REST; at least 70 suggests REST within two days of a game or with two games in the next seven days, otherwise REDUCED; at least 50 suggests REDUCED under the same congestion conditions; otherwise FULL. Fixture density still determines session volume and recovery selection.

## 5. Richer AI planning

Existing congestion, fatigue distribution, availability, Training focus, intensity, scheduled work and delegated Training responsibility remain the planning inputs. Balanced focus now selects a team module by stable team ID across tactical, shooting, physical and playmaking options. Healthy, non-dense AI weeks also schedule one individual session on an otherwise free date, targeting the lowest canonical rating within a focus-aligned module. Explicit non-balanced focus remains authoritative. Dense/high-fatigue weeks get no extra individual session. No Staff quality injury multiplier or facility effect was added.

## 6. Physical-load risk inputs

Post-match risk uses actual played seconds as its base exposure, then Career Fatigue and related injury history. Scheduled Training risk uses the executing session's definition, `injuryRiskWeight`, intensity, duration, Career Fatigue and related injury history. REDUCED halves Training occurrence exposure; REST and medically unavailable players are not checked.

## 7. `injuryRiskWeight` semantics

`injuryRiskWeight` is consumed as one bounded multiplier in Training's derived occurrence probability. It is not a probability and is never saved as a player risk value. Catalog weights below 0.5 or above 1.5 are clamped at consumption.

## 8. Training injury creation

An injury check runs only inside `executeScheduledTrainingSessions` for a due, non-conflicting session. A generated injury immediately includes the standard RTP review date and blocks through shared availability. Cancelled, skipped, conflicting, REST, and unavailable cases create no Training injury.

## 9. Canonical injury creation seam

`createInjury` remains the Domain validation factory. `createDeterministicInjury` is the shared consequence construction path used by match and Training creation for deterministic kind, severity, recovery date, RTP initialization and source evidence. Occurrence odds remain context-specific. Training evidence stores `source: TRAINING` and the completed session ID; match evidence stores `source: MATCH` and GameId. Legacy source-less records still load.

## 10. Recurrence model

The six current injury kinds map to LOWER_LEG, HAMSTRING, KNEE, BACK, HAND and SHOULDER families. A prior injury in the same family adds 0.16 when within 365 days and 0.10 when older. Multiple records add linearly and cap at +0.40; same-day and future records do not count.

## 11. Related injury families

| Family | Current kinds |
| --- | --- |
| LOWER_LEG | `ankleSprain` |
| HAMSTRING | `hamstringStrain` |
| KNEE | `kneeSprain` |
| BACK | `backStrain` |
| HAND | `handInjury` |
| SHOULDER | `shoulderStrain` |

## 12. Match injury integration

Post-match occurrence still requires positive played seconds. Its base remains 0.5% plus up to 1.5 percentage points at 40 minutes, multiplied by a Career Fatigue factor from 0.85 to 1.10 and the capped 1.00 to 1.40 recurrence factor. The final probability is capped at 5%; the current maximum with these inputs is 3.08%. Match consequences run after completion and MatchEngine is unchanged.

## 13. Risk bounds

Training's base is 0.25%, multiplied by participation (1.0 or 0.5), clamped weight (0.5–1.5), intensity (0.75–1.25), duration (0.5–1.5), Career Fatigue (0.85–1.10) and recurrence (1.0–1.4). With current bounds, FULL Training exposure ranges from about 0.040% to 1.083%; REDUCED halves it. REST is exactly zero because it skips the risk check. The shared probability clamp is 5%.

## 14. UI

NG Training exposes suggested fatigue-based participation and explicit controls on each scheduled team session. Load remains grounded in Career Fatigue and existing fixture context. No raw injury probability or new dashboard was added.

## 15. Save

Save V1 now reads/writes optional session participation decisions and injury source evidence. Old sessions and injuries default without new fields. A focused BS12D round-trip test covers REST plus a Training-sourced injury linked to its completed session, then removes those fields and verifies legacy defaults. The existing canonical full-world equality test has a mismatch in unrelated world collections; the same mismatch was reproduced in a detached worktree at `c52a217`.

## 16. Calendar ordering

The retained order is AI Training planning → future scheduled sessions → due Training execution and participant effects → Training injury check → Medical/roster advisories → AI Medical decisions. Training injuries therefore enter BS12C availability and RTP before later calendar lifecycle work. Match injury checks remain in post-match consequence processing.

## 17. Staff boundary

Existing Training responsibility and execution-quality effects remain in place. Staff quality does not affect injury risk or recovery. BS13 retains richer Staff intelligence.

## 18. Facilities boundary

No CFI injury prevention, recovery, or Training-quality multiplier was introduced. BS17 remains the Facilities effects owner.

## 19. MatchEngine boundary

No MatchEngine, MatchNext, Match Presentation, Phaser or transient match-fatigue code changed. Career Fatigue is read by post-match consequence processing only.

## 20. Scenarios

- **A:** high-fatigue user player shows a REST suggestion and can be explicitly rested without cancelling the team session.
- **B:** dense AI weeks retain BS12B low volume and each session stores the AI's per-player recommendation.
- **C:** a deterministic high-load Training check creates a source-tagged canonical injury, blocks availability, and enters the existing RTP review and clearance path.
- **D:** low load has lower derived exposure than normal/high; it is nonzero.
- **E:** related history increases risk modestly, with a +0.40 cap and no guarantee.
- **F:** equal match minutes with different Career Fatigue produce different post-match probabilities; MatchEngine is unchanged.

## 21. P0, P1 and BS12E handoff

**P0:** none identified in the changed paths. Session completion remains the idempotency authority; unavailable players cannot receive normal Training effects or injury checks; RTP and user ownership remain canonical.

**P1:** richer per-player periodization and role-based development targets; detailed recurrence anatomy; Staff prevention effects; Facilities effects; rehab depth; broader inherited Save V1 round-trip equality gaps.

**BS12E handoff:** build further player-specific workload planning only if it can keep participation on the existing scheduled-session authority, Career Fatigue as the sole persisted load, and InjuryRecord/RTP as the sole injury and Medical truth.

## Focused verification

Training planning, scheduled execution, risk/recurrence, direct BS12C RTP and availability regressions passed: **79 tests across 9 files**. Calendar ordering passed **2 named tests**; no long-horizon simulation ran. Focused Save evidence and legacy defaults passed. A 100,000-draw deterministic shared-roll batch produced strictly increasing LOW < NORMAL < HIGH and higher related-history occurrence counts. `npm run typecheck`, `npm run build`, and `git diff --check` passed.
