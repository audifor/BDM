# BS9A Club Strategic State Audit

Audit base: `811e8d87390b2cb34b49e9cb84a0b51f40ffe433` (`bdm-stage2-bs9a-club-strategic-state`).

This audit was completed before BS9A implementation. The inspected authorities are existing world state and domain projections; this document does not establish new gameplay decisions.

## Existing authorities and behavior

| Concern | Existing source of truth / behavior | BS9A implication |
|---|---|---|
| Club identity and roster | `Team` references canonical `organizationId`, section, and `rosterPlayerIds`; roster membership is the canonical roster list. | Club strategic memory can key by `TeamId`; financial facts key by its `OrganizationId`. |
| Player truth and team evaluation | `Player.basketball.ratings` is canonical truth. `src/engine/team/TeamEvaluation.ts` derives `calculatePlayerImpact` from 16 rating keys and uses it for deterministic positional starter selection and a five-player strength projection. | This is a contextual lineup/team projection, not an organizational strategy authority. Do not persist it or call it Overall. BS9A should prefer age, depth, availability, contracts and actual performance signals over a new quality aggregate. |
| AI roster / market behavior | `src/app/market/AiRosterMaintenance.ts` repairs AI rosters below five at its existing season-boundary call, ranking same-gender free agents through organization-knowledge valuation and affordability. It does not create players. The user roster is left to manual signing. | This is narrow maintenance, not a club plan or autonomous ongoing GM loop. Do not broaden it in BS9A. |
| Board state | `BoardState` stores a coach-linked profile, season expectation/objectives, confidence and event history. `BoardEngine` initializes it for a team with a coach and updates it at season evaluation, promotion/relegation, and career job-security boundaries. | Board state is not the canonical club strategy. It can contribute coach/job-security context only where identity and timing match. |
| Governance V2 | `GovernanceInstitution` links one or more teams; bodies, appointments, authority grants, expectation periods, typed objectives, requests, commitments, decisions and evaluations are separate canonical records. Governance objective families include sporting performance, finance discipline, development, roster construction and others. `GovernanceExpectations.ts` explicitly says Board confidence is legacy and outside BG2 evaluation. | Read relevant active institutional objectives/evaluations and constraints when available. Do not make the coach-linked Board confidence a substitute for Governance V2, or infer unrecorded owner intent. |
| Finance V2 | `getFinancialHealthSnapshot` derives cash/liquidity, payables, debt, operating result, commitments, budget variance, forecast, regulatory breaches and distress indicators from Finance V2 ledgers. `assessFinancialHealth` needs a supplied policy; no universal thresholds are implied. FinanceAI creates advice/proposals that require the existing approval boundary. | Reuse snapshot facts and distress indicators. Do not invent universal distress thresholds, duplicate accounting, execute FinanceAI proposals, or equate low cash alone with SELL. |
| Market affordability | Free-agent roster repair also consults `canTeamAffordAdditionalSalary` and legacy `teamFinancesByTeamId` salary budget. | Finance V2 and legacy configured salary budget are adjacent, incompletely coordinated authorities, not interchangeable measures. BS9A should expose this as a coordination risk and never rewrite either. |
| Competition and performance | Competitions and Seasons each own rules/participant context; a season may carry a historical participant snapshot. Standings are derived from completed `Game` results. `currentSeasonId` is a selection pointer, not a universal active competition. | Read standings through the team’s actual competition season(s); do not assume one global league, cap, draft, playoff, promotion or relegation. Missing/ambiguous competition context must remain unknown rather than fabricated. |
| Ownership and decision rights | Organization ownership/control records and Governance bodies/grants/decisions own their distinct legal and formal authority. | Strategic intent cannot authorize or execute spending, market moves, hiring, or a governance decision. |
| Staff / GM | The extensible staff registry has `generalManager`, `assistantGeneralManager`, `directorOfBasketballOperations`, and `sportingDirector` roles. Governance V2 separately models institutional appointments such as `GENERAL_MANAGER` and `SPORTING_DIRECTOR`. There is no unified GM personality / club planning loop. | Strategy belongs to the club. Staff style remains a later decision-context input; BS9A will not build personality AI or infer a decision-maker where assignments conflict or are absent. |
| Persistence | `GameWorld` is the normalized runtime state. Save V4 is the current durable envelope and composes V3 payload with explicit additive V4 fields; V1–V3 migrations remain compatibility paths. `updateGameWorld` and world factories reconstruct validated state. | If review timing and accepted direction need inertia across reloads, add one minimal, team-keyed V4 field with an empty default for older payloads; do not create a second save file or persist assessment/debug projections. |
| User control | `getUserTeam` identifies the team whose coach is `world.userCoachId`. AI roster maintenance explicitly avoids signing for that team. | Strategy inspection may be available for the user team, but no BS9A code may take a GM action. |

## Existing strategy/state model

There is no coherent club strategic mode, strategic assessment, mode memory, or club-level review cadence in the audited sources. `BoardState` is the nearest named model, but it is coach employment/objective state with narrow season lifecycle hooks. Governance V2 captures institutional authority and objectives, not a chosen operating mode for the basketball club. No equivalent canonical CONTEND/COMPETE/DEVELOP/REBUILD/SELL/SURVIVE authority was found.

## Duplicate-authority and integration risks

1. **Finance coordination (P1):** Finance V2 ledgers/forecasts and the legacy team salary budget can both constrain market decisions, but they express different facts and are not a unified affordability answer. BS9A will read Finance V2 health and preserve the existing salary-budget authority.
2. **Board versus Governance (P1):** coach-linked legacy Board objectives/confidence overlap in vocabulary with institutional Governance expectations. They are not interchangeable: use Governance V2 as formal institutional pressure and label any Board/job-security signal separately.
3. **Roster versus contract (P1):** `Team.rosterPlayerIds` and active contract team references are independently stored; the reviewed authority map identifies incomplete cross-record reconciliation. BS9A must read each for its own purpose and not repair or duplicate contract state.
4. **Performance projection (P2):** the existing `calculatePlayerImpact` average is useful for lineup ranking, but turning it into a persisted club score would create a hidden Overall-like authority. BS9A will not do that.

No existing unified Club/GM strategic authority was found, so adding a compact derived assessment plus minimal persisted review memory fills a real gap rather than duplicating the systems above.

## Reusable systems

- `Team`, `Organization`, and `OrganizationSection` for club identity and organizational finance scope.
- actual season membership, schedules, completed results and standings for competition performance where evaluable.
- player canonical birth/age, availability, roster membership and contract terms for age/timeline/depth context.
- Finance V2 snapshot and existing regulatory breach facts; existing financial policy only where explicitly configured.
- Governance institution/team linkage, active objectives, formal decisions/constraints, and existing manager evaluation evidence.
- existing Board profile/objectives and career job-security projection, kept explicitly separate from Governance V2.
- existing deterministic world/date/update and Save V4 boundaries.

## Actual BS9A gap and boundary

BDM currently has domain-specific facts and maintenance/advice behaviors, but no deterministic explanation of what a particular AI-controlled club is trying to accomplish, no stable accepted direction across small fluctuations, and no structured diagnostic that future BS9B needs and BS9C decision context can consume. BS9A will add that strategic context only. It will not execute market, finance, staffing, governance, draft, recruiting, or contract actions, change MatchEngine or lifecycle architecture, or introduce a new team Overall.

## Resumed verification

The continuation run rechecked these findings against the requested `811e8d8` base before implementation:

- `src/app/market/AiRosterMaintenance.ts` is called by `src/app/repair/WorldRepairCoordinator.ts`; it signs only affordable, same-gender free agents for non-user teams below the five-player minimum. It does not supply longer-term strategy.
- `src/domain/board/Board.ts` exposes the authoritative `getJobSecurity` projection. BS9A reads that projection and keeps its pressure separate from active Governance V2 objectives.
- `src/domain/finance/FinancialHealth.ts` exposes the existing snapshot and distress indicators, including liquidity, payables, debt-maturity, operating-loss and regulatory evidence. BS9A consumes the indicator kinds and does not calculate cash health again.
- `src/domain/world/GameWorld.ts` validates that contracts reference real Teams and Players, but does not require every rostered player to have a contract or enforce a single roster/contract membership view. The coordination risk remains real and out of scope.
- `src/save/GameWorldSaveV4.ts` is the current Save V4 boundary. BS9A adds one optional-on-read, empty-by-default collection there and does not create a parallel save authority.

The original audit conclusions remain supported. No existing canonical club strategy or review memory was found, and no audit finding required changing the planned BS9A boundary.
