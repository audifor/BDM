# F5 cross-ecosystem mobility

The unified world stores teams, competitions and ecosystems together. CoachCareer openings record their destination ecosystem and category; acceptance uses the same coach identity and career history and updates team/staff employment.

F5 regression: from `createNewGame`, select a staffed team in an ecosystem different from the current user's team, create a vacancy by the canonical firing operation, apply through the normal candidacy/interview/offer flow, and accept. Assertions cover different ecosystem IDs, stable `userCoachId`, old club detached, destination club attached, employment/history updated and head-coach staff assignment moved. Command: `vitest run src/app/coachCareer/CoachCareerService.test.ts` — **PASS, 6 tests**.

This is a controlled route test, not evidence that a natural offer was generated. FIBA/NBA/NCAA cross-matrix, women/men category eligibility, old governance authority cleanup, global-competition ambiguity and Save V4 immediately after each ecosystem transition remain unverified. No athlete eligibility rules were applied to coaches.

Status: **PARTIAL**.
