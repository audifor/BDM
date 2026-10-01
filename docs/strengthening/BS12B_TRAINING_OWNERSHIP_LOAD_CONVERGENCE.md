# BS12B · Training Ownership & Physical Load Convergence

## Reuse audit

Scheduled Training remains the only execution authority. Planning creates ordinary entries in `scheduledTrainingSessionsById` through the existing Training module engine; the existing scheduled-session executor continues to apply Career Fatigue and development stimulus. The implementation reuses `TRAINING_CATALOG`, `TeamTrainingPlan`, team focus mapping, delegated Training responsibility, Career Fatigue, availability, fixture schedule, and Calendar lifecycle. It adds no persisted planning scores, load state, injury state, or development authority.

## Planning authority and fixture context

`buildTrainingPlanningContext(world, teamId, asOfDate)` is a derived read model shared by AI planning and the NG Training workspace. It reports games today, tomorrow, yesterday, completed games in the recent seven-day window, scheduled games in the next seven days, days to/from the nearest game, rest days between upcoming games, roster fatigue distribution, availability, pending sessions and their derived scheduled load, match-date conflicts, and a recommendation. It does not mutate the world.

The small congestion policy treats at least two upcoming games, or at least three recent-plus-upcoming games, as a dense window. It recommends recovery in a dense window and reduces AI weekly volume to one session. A high or very high squad fatigue distribution selects low-load recovery and at most two sessions. Moderate fatigue or high-fatigue players reduce intensity. Open weeks follow the existing plan focus and intensity. AI dates exclude match days and the day before scheduled games, and selected sessions are separated by at least one rest day. No session is created for the user club.

## Career Fatigue and load ownership

Career Fatigue remains the sole persisted cumulative physical-load state. Average, high-player count, very-high-player count, and fatigue band are calculated from player Career Fatigue for the current roster; no aggregate is stored. Daily scheduled load is derived from existing sessions. Training execution still applies its existing Career Fatigue and development-stimulus effects, and execution remains idempotent for completed sessions.

## User and AI ownership

The user club keeps its manually scheduled sessions and existing fill-week controls. The planner only creates sessions for non-user clubs. The NG Team and Load tabs show derived upcoming/recent fixture counts, mean Career Fatigue, scheduled session count, recommendation, and relevant warnings. This is guidance only and does not rewrite the user's schedule.

AI planning runs once at the ISO Monday Calendar checkpoint. It uses the existing delegated `createTeamTrainingPlan` responsibility when a holder is currently employed by that team, and otherwise uses a deterministic planner fallback. It follows the team's existing focus and intensity when load and fixtures allow. Sessions use stable `ai-training:<team>:<date>` IDs, the existing team module scheduler, and the normal execution path. A pending AI plan in the same horizon is preserved; existing sessions on individual dates are not replaced.

## Calendar ordering and fixture changes

After the date advances and the other current lifecycle phases complete through market responses, `AI_TRAINING_PLANNING` runs on ISO Monday, followed by the existing daily `TRAINING` executor. New sessions are always future dated, so the planning pass cannot execute one on the same checkpoint. If a fixture is added or moved onto a previously scheduled session date, the executor skips that session and emits `TRAINING_MATCH_CONFLICT` evidence; the session remains scheduled for inspection. New scheduling on a known fixture date is rejected by the existing scheduler API.

## Boundaries

- **Development:** Training still produces stimulus; annual OffseasonDevelopment remains the only rating-development checkpoint. No immediate rating mutation or progression change was introduced.
- **Medical:** Planning reads availability for context, but does not diagnose, treat, clear, or modify injuries. BS12C owns that work.
- **Injury risk:** `injuryRiskWeight` remains metadata. Training creates no injuries and post-match injury probability is untouched.
- **Facilities:** No facility bonus or consequence was added.
- **MatchEngine:** MatchEngine, MatchNext, Match Presentation, Phaser, and live-match fatigue behavior were not changed. Career Fatigue is not connected to transient MatchSession starting fatigue.
- **Staff:** Existing responsibility resolution identifies the delegated planner when eligible. No Staff hierarchy, personality, or intelligence logic was added.

## Idempotency and observability

The weekly checkpoint is deterministic, stable session IDs prevent duplicate creation, and pending AI sessions in the target horizon suppress a second planning pass. Planner results include per-team action, reason, created session IDs, and delegated Staff ID where used. Calendar lifecycle diagnostics expose planning outcomes and any skipped match-date execution. The user-facing workspace exposes only the derived planning summary and actionable warnings.

## Focused scenarios and findings

The focused tests cover fixture-density derivation and purity, open-week focus planning, dense-week recovery, high-fatigue recovery, user schedule preservation, repeat-planning idempotency, existing-session preservation, fixture-date exclusion and moved-fixture safety, normal one-time execution with Career Fatigue/stimulus effects, and Monday Calendar ordering. Training page coverage verifies the summary appears in the NG workspace and not the legacy surface.

- **P0:** No known P0 findings after focused validation. The scheduled executor remains singular; conflicting match-date sessions are skipped and surfaced; user schedules are left untouched.
- **P1:** Player-specific rest or excluded-player sessions remain a future enhancement because current AI scheduling creates team sessions. Richer focus selection and facilities consequences remain out of scope. Do not activate injury-risk metadata without an approved product decision.

## BS12C handoff

BS12C may build Medical treatment, rehabilitation, return-to-play, diagnosis, and clearance on canonical injury/availability authorities. It can consume this derived Training context where useful. It should preserve scheduled Training as the sole executor and Career Fatigue as the only cumulative physical-load authority; no BS12B rule requires a new Medical or match-simulation state.
