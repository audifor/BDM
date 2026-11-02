# F5 authority audit

Audit base: `feature/career-f4c-unified-world` at `f17f3251` (F4C). Statuses describe the shipped code at the F5 audit, not a claim of full F5 certification.

| Situation | Event / authority / decision / execution | Consequence, UI, persistence | Status |
|---|---|---|---|
| Start a career | New Game appointment -> `CoachCareerService` / `CoachEmployment` | Coach identity and initial team are available in Coach Workspace; Save V4 persists world state | CONNECTED |
| Apply for work | Open `CoachJobOpening` -> eligibility -> candidacy -> interview -> offer | Coach Workspace presents real openings, candidacies and offers; Save V4 | CONNECTED |
| Accept / decline | `acceptCoachJobOffer` / `declineCoachJobOffer` | Employment, team coach, staff assignment, career history, memory and inbox change; Save V4 | CONNECTED |
| Move between ecosystems | Same CoachCareer flow in the unified `GameWorld` | F5 adds one reproducible service test for a real cross-ecosystem vacancy; broader ecosystem/category matrix unverified | PARTIAL |
| Board dismissal | Governance/Board firing-risk decision -> `fireCoachFromTeam` | Employment ends, vacancy opens, history and memories update; focused service coverage exists | CONNECTED |
| Renewal / expiry | No canonical coach contract term, expiry or renewal operation found | Employment continues without a contract boundary; no renewal control is exposed as a real operation | MISSING |
| Reputation | Match results and season achievement events -> `CoachReputation` | Reputation is persisted and read by job eligibility/ranking; direct causal UI evidence is limited | PARTIAL |
| Human relationships | HRPG, Staff and Memory authorities | Coach relationships and memories persist independently of current team; old-team access is not transferred by CoachCareer | CONNECTED |
| Unemployment | Employment status plus Coach Workspace and Director Hub no-team projection | Career and real vacancies remain accessible; team-dependent workspaces can report unavailable | PARTIAL |
| Season continuation | Existing competition/calendar lifecycle and Save V4 | Existing shorter career-loop evidence; no F5 three-season or ten-season certification run | PARTIAL |
| UI / Save V4 | Courtside Coach Workspace, New Game and Save V4 | Real job flow has UI and round-trip coverage from prior phases; Windows GUI acceptance pending | PARTIAL |

No second career, reputation, relationship, memory, market or calendar authority was introduced. F5 changes in this audit are certification-only; no production behavior was changed.
