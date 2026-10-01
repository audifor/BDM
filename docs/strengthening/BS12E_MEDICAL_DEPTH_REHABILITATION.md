# BS12E · Medical Depth, Rehabilitation & Fitness Testing

**Starting point:** `be8e3e01e6b140af74642a70e7dab20dcd0fd199` (BS12D)
**Branch:** `bdm-stage2-bs12e-medical-depth-rehabilitation`
**Status:** implementation complete; focused validation passed.

## 1. Reuse and authority

BS12E extends `InjuryRecord`, the BS12C `reviewReturnToPlay` transition, shared injury availability, existing Staff Medical recommendations, the Calendar Medical lifecycle, and NG Medical / Player Medical projections. Rehab, setback, and fitness-test evidence stays on the InjuryRecord. There is no new injury entity, availability authority, RTP service, Training executor, injury generator, or fatigue value.

## 2. Rehabilitation plan

`InjuryRecord.rehabilitation` stores the current `REST`, `STANDARD_REHAB`, or `ACCELERATED_REHAB` mode, its start/change dates, and user/AI plan-change history. New and migrated injuries default to STANDARD_REHAB. The user can change plans only while the injury is RECOVERING; their selection is recorded and remains authoritative.

The projected first review date is derived from the original `expectedReturnDate`. After half of the projected recovery duration has elapsed, the selected mode adjusts that date by `min(2, ceil(projected recovery days / 30))`: REST adds those days, ACCELERATED_REHAB removes them, and STANDARD_REHAB keeps the baseline. Setback evidence adds its recorded days. `expectedReturnDate` remains the original medical projection.

REST is conservative, STANDARD_REHAB is the baseline, and ACCELERATED_REHAB may move review earlier while increasing setback chance. None changes Career Fatigue or grants development stimulus.

## 3. Setbacks

The Calendar checks once at each seventh recovery day while an injury is still RECOVERING. A seeded roll uses a stable injury/week key. Per-check chances are 0.25% for REST, 0.5% for STANDARD_REHAB, and 1.5% for ACCELERATED_REHAB. A setback appends one evidence record, adds three projected review days, and does not create another InjuryRecord. At most two setbacks can occur per injury, limiting delay to six days.

## 4. Fitness tests and RTP

The canonical `conductFitnessTest` service is shared by user and AI. Serious injuries always require a test; moderate injuries require one when an earlier injury in the same family exists; minor injuries do not. The deterministic PASS / BORDERLINE / FAIL evaluation starts from pass chances of 62% (serious), 72% (moderate), or 84% (minor). REST adds 4 points, ACCELERATED_REHAB subtracts 4, Career Fatigue subtracts fatigue / 500, related history subtracts 5 points for serious or 8 for moderate injuries, and existing Staff Medical quality adjusts by `(quality - 50) / 1000`; the result is clamped to 35–90%. The next 18 percentage points of the seeded draw produce BORDERLINE; the remainder produces FAIL. A record stores date, result, actor, and optional Staff evidence on the InjuryRecord.

PASS permits CLEAR FOR PLAY through BS12C's `reviewReturnToPlay`; a test cannot clear a player itself. BORDERLINE and FAIL keep availability blocked and schedule another review seven days later. A required PASS must follow the most recent setback. Clearance changes only the injury/RTP restriction and does not change Career Fatigue. AI runs the same test service and uses the same RTP transition; a non-PASS result cannot clear.

## 5. Staff and AI decisions

Existing `treatmentRecommendation` / `returnToPlayRecommendation` outcomes remain the Staff advice channel. AI accepts them through the existing recommendation service. Advice influences AI plan selection through its existing bounded recommended recovery days and influences test evaluation through the existing quality score; no parallel recommendation system was added.

AI chooses REST for serious injuries, projected moderate recoveries of at least 30 days, high-fatigue related recurrences, a fixture within two days combined with fatigue of at least 70, or strongly conservative Staff advice; it chooses ACCELERATED_REHAB for healthy, minor recoveries of at most seven days with no related history and supportive advice; other cases use STANDARD_REHAB. Selection is deterministic and goes through `setRehabilitationPlan`, the same authority used by the user.

## 6. Medical history and UI

NG Medical exposes the suggested and current rehab mode, consequences, and plan changes in the injured-player dossier. At a required review it exposes RUN FITNESS TEST, prevents CLEAR FOR PLAY until PASS, and continues to offer the normal RTP decision. History shows injury family, source, severity, plan, setbacks, tests, and actual clearance. Player Medical adds compact rehab, test, and related-history status. Roster remains a shared-availability projection without medical-owned state.

Injury family is derived from the existing injury kinds: LOWER_LEG, HAMSTRING, KNEE, BACK, HAND, and SHOULDER. Related history is labeled RELATED / RECURRENT as a game-history relationship, not a clinical causation claim.

## 7. Save, Calendar, and idempotency

Save V1 persists plan/history, setbacks, and test evidence as InjuryRecord fields. Missing BS12E fields load with STANDARD_REHAB and empty evidence; the existing legacy RTP migration still preserves historically cleared injuries and does not resurrect them. Derived recovery progress and probabilities are not saved.

Daily Calendar order remains Training and other scheduled work, then `MEDICAL_AND_ROSTER_ADVISORIES` (including the weekly setback check), then `AI_MEDICAL_DECISIONS` (Staff advice, AI plan selection, due fitness test, and RTP). Training eligibility continues to use shared availability and never treats rehabilitation as scheduled Training. The setback key is stable per recovery week, fitness tests are stable per injury/date, and clearance remains idempotent through the existing RTP state.

Fitness testing uses the existing RTP review breakpoint; it does not create a second interruption. AI decisions do not create user breakpoints.

## 8. Boundaries and scenarios

- **Career Fatigue:** test context only; recovery and clearance never mutate it.
- **Training:** injured players remain excluded from ordinary Training; rehab creates no session or stimulus.
- **Facilities:** no recovery, test-accuracy, or prevention multiplier; BS17 remains the effects owner.
- **MatchEngine:** untouched; Medical clearance changes only shared availability.
- **User rehab:** choose a plan while recovering; InjuryRecord remains singular and availability stays blocked.
- **AI rehab:** deterministic plan choice, test, and RTP use the same services as the user.
- **Accelerated rehab:** at most two days earlier from plan projection, with a 1.5% weekly setback chance and at most two three-day setbacks.
- **Fitness PASS / FAIL:** PASS only makes canonical clearance legal; non-PASS remains unavailable and is reviewed again after seven days.
- **Legacy save / recurrence:** missing fields default safely; related prior episodes appear in history by current family mapping.

## 9. P0, P1, and BS12F handoff

**P0:** none expected. A test does not create injury or clear a player; setbacks update only the current injury; required testing gates the shared RTP transition.

**P1:** richer role-specific rehabilitation, more anatomical recurrence detail, Staff prevention effects, Facilities effects, and clinical rehab depth remain deferred.

**BS12F handoff:** preserve the single InjuryRecord/RTP/availability chain and Career Fatigue boundary while adding Training execution history and development causality/history.

## Focused verification

The final focused validation passed 61 tests across 8 files: Medical rehab/testing, RTP and Calendar ordering, recurrence, injured-player Training exclusion, Medical and Player projections, and Save migration. `npm run typecheck`, `npm run build`, and `git diff --check` passed. No full suite, statistical batch, or long-horizon simulation was run.
