# F5 job market

Coach employment uses the existing `CoachJobOpening`, candidacy, interview and offer records in `GameWorld`, executed by `CoachCareerService` and surfaced by Coach Workspace. An application is only accepted for an open, reputation-eligible vacancy. The offer flow is shared by the user and AI. Acceptance rechecks vacancy availability, ends the previous tenure when applicable, closes the old team authority, appoints the same coach to the destination, updates staff assignment/employment, records history and memory, and withdraws competing offers. Save V4 persists these records.

F5 adds a regression proving an actual vacancy in a different ecosystem can be applied for and accepted without replacing the coach identity. The focused suite passes 6/6 tests.

The offer record currently carries an annual salary and updates the coach finance profile, but the career authority has no coach contract term, expiration date, negotiated clauses or renewal transition. Salary is not a negotiable term in this flow. Pending-offer expiration is also not modelled; no expiry rule was invented. There is no F5 evidence that vacancies arise at an organic frequency across all ecosystems.

Status: **PARTIAL**. No new market subsystem or production-generated offer was added.
