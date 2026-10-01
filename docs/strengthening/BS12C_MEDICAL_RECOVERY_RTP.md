# BS12C — Medical Recovery, Return-to-Play & Final Certification

**Branch:** `bdm-stage2-bs12c-medical-recovery-rtp`
**Starting point:** BS12B `b32c2a73c163e76808a2baee8fe0eece8fd4d33`
**Status:** PASS.

## 1. Reuse audit and product decisions

BS12C extends the canonical `InjuryRecord`, the existing `isInjuryActive` availability boundary, Staff `DelegationOutcome` recommendations and `acceptMedicalRecommendation`, Calendar lifecycle phases, user breakpoint projection, and the existing NG Medical and Player Medical surfaces. It adds no second injury entity or treatment/rehabilitation engine.

Approved rules: `expectedReturnDate` is a projected recovery and initial review date; it does not clear a newly created canonical injury. The lifecycle is RECOVERING → RETURN-TO-PLAY REVIEW → CLEARED. A due review offers only CLEAR FOR PLAY and CONTINUE RECOVERY. Career Fatigue is context, not medical clearance. Staff advice may adjust the projected date through its existing bounded acceptance rule, but it is not clearance. No recovery effect is assigned to Facilities.

## 2. InjuryRecord and lifecycle

`InjuryRecord.returnToPlay` stores `reviewDueOn`, optional actual `clearedOn`, and ordered review evidence (date, decision, actor, and optional Staff/recommendation references). `createInjury` initializes canonical new injuries with `reviewDueOn = expectedReturnDate`; injury creation probabilities, types, severity and MatchEngine are untouched.

Before the review date, the injury is RECOVERING and blocks participation. From the review date onward, it remains active and unavailable until a canonical clearance decision. CONTINUE RECOVERY records the decision and schedules another review on the following day; it does not change `expectedReturnDate`. CLEAR FOR PLAY records the actual date and review evidence while preserving the injury record and history.

The single `reviewReturnToPlay` transition validates review timing and user/AI team ownership. Both user actions and AI decisions use it. Medical clearance only removes the injury restriction; competition eligibility and other availability authorities remain independent.

## 3. Staff advice, ownership, and AI policy

The Medical workspace exposes the existing recommendation accept/dismiss actions. Acceptance calls the same `StaffRecommendationService`/`acceptMedicalRecommendation` seam used elsewhere. Accepted advice applies only the existing bounded date adjustment and never clears an injury. The workspace displays recommendation and Staff context when present.

The Calendar first generates Medical/roster advisories, then runs `AI_MEDICAL_DECISIONS`. AI clubs accept each pending valid Medical return/treatment recommendation for their own club through the existing acceptance seam. Invalid/stale recommendations are skipped. When an AI club's injury reaches its adjusted review date, AI calls the shared RTP service and clears the player. This is the deterministic fallback when there is no eligible Staff holder or pending advice; it uses no hidden medical rating or fatigue threshold. User clubs are excluded from the AI pass and retain the final decision.

Daily order is DATE_ADVANCE → normal fatigue/training phases → MEDICAL_AND_ROSTER_ADVISORIES → AI_MEDICAL_DECISIONS → remaining scheduled phases. Breakpoint projection exposes each due user-club review as ACTION_REQUIRED in Medical. AI reviews create no user breakpoint. Repeated processing does not duplicate recommendation outcomes or reviews: recommendation IDs are stable, only unapplied outcomes are accepted, and clearance removes the injury from future due reviews.

## 4. Save compatibility and projections

Save V1 parsing accepts the optional RTP state and validates its basic shape. The existing version-upgrade chain therefore carries the extension through V2–V4; serialization preserves the canonical injury object. A legacy injury loaded strictly after its expected date is migrated as historically cleared on that date, preventing injury resurrection. A legacy injury still active on its expected date enters review at that date; injuries before that date continue recovering.

Medical availability remains derived from the active injury lifecycle through the shared query; no player availability flag is persisted. Player Medical displays RECOVERING, RETURN-TO-PLAY REVIEW, and CLEARED/history with projected and actual dates. Roster/competition availability continues to consume the shared availability result. The Medical workspace is the action surface for review and recommendation decisions; Player Medical is a compact projection, not a duplicate action surface. Review decisions remain in `InjuryRecord` evidence; recommendation disposition remains in the existing outcome history.

## 5. Boundaries and scenarios

- **Training / Career Fatigue:** BS12B remains the sole Training planner/executor and fatigue authority. Clearance does not alter fatigue. Training recovery remains fatigue-only and is not injury rehabilitation.
- **Facilities:** CFI medical, rehabilitation and recovery facts remain informational; there is no invented recovery bonus.
- **MatchEngine:** untouched. An uncleared injury blocks through the existing eligibility/availability path; clearance permits that path to evaluate other restrictions normally.
- **Scenario A:** new injury persists, blocks participation and shows a projected review date; it does not auto-clear early.
- **Scenario B:** at review date the player remains unavailable and a user review/breakpoint appears; CLEAR records actual clearance and restores medical availability.
- **Scenario C:** CONTINUE keeps the player unavailable and records another review date without duplicating the injury or changing its projected recovery date.
- **Scenario D:** Medical exposes the existing recommendation decision; acceptance adjusts only the projected date and never clears.
- **AI:** club advice is resolved via the canonical service, then due injuries are cleared using the shared RTP transition; no user breakpoint is generated.
- **Save:** RTP state and reviews roundtrip; old past-date injuries remain historically cleared.
- **Availability:** RECOVERING and review-due injuries block; CLEARED stops blocking medically, while competition eligibility stays independent.

## 6. Focused verification

Focused tests cover lifecycle/authorization, user breakpoint and AI integration, recommendation reuse, save roundtrip and legacy migration, Medical workspace actions, Player projection, shared availability/eligibility, Staff recommendation behavior, and Training planning. No full suite or long-horizon simulation is run. MatchEngine source is unchanged. The focused regression command passed 77 tests across 9 files. A focused Calendar/Save selection passed 1 test (3 other files were filtered by the named selection). `npm run typecheck`, `npm run build`, and `git diff --check` passed. No full suite or long-horizon simulation was run.

## 7. P0 / P1 and BS12 result

**P0:** None identified within BS12 scope.
**P1:** Remaining system-depth opportunities are listed and classified in [BS12 final certification](BS12_FINAL_CERTIFICATION.md); none blocks the approved Training + Medical lifecycle closure.

**BS12C: PASS.** **BS12 Training + Medical: PASS** once required focused validation and clean commit are complete.

## 8. Required audit index

1. Reuse audit — Sections 1–2. 2. Product decisions — Section 1. 3. InjuryRecord changes — Section 2. 4. Recovery lifecycle — Section 2. 5. `expectedReturnDate` — Sections 1–2. 6. RTP review — Section 2. 7. Clear decision — Section 2. 8. Continue recovery — Section 2. 9. Staff recommendations — Section 3. 10. User ownership — Section 3. 11. AI ownership — Section 3. 12. Availability — Section 2. 13. Calendar order — Section 3. 14. Save/migration — Section 4. 15. Medical UI — Sections 3–4. 16. Player/Roster projections — Section 4. 17. History — Sections 2 and 4. 18. Training boundary — Section 5. 19. Facilities boundary — Section 5. 20. MatchEngine boundary — Section 5. 21. Idempotency — Section 3. 22. Scenarios — Section 5. 23. P0 — Section 7. 24. P1 — Section 7 and certification. 25. Final result — Section 7.
