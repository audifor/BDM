# BS13 Staff Integration Matrix

This matrix traces a real Staff source through a consumer, actual consequence and visible result. A Responsibility registration without a consumer is listed separately as disconnected. “User manifestation” includes explicit outcome/advisory surfaces; it does not imply that every consequence has an explanation.

| Staff source | Consumer | Actual consequence | User manifestation | Status |
|---|---|---|---|---|
| Staff role assignment + `createTeamTrainingPlan` holder | `TrainingPlanning` / weekly AI planner | Planner context can resolve Staff; AI schedules sessions and attributes a valid holder; planning context uses fatigue/schedule | Training plan/session view; Staff assignment/workload | CONNECTED |
| Staff attributes + personality + workload, via `trainingQuality` | `ScheduledTrainingEngine` | Effective team/individual module and intensity quality; stimulus/session consequences, never direct rating edits | Session outcome/history and development progress | CONNECTED |
| Staff medical role/responsibility + medical quality | Medical advice/risk/RTP engines | Produces assessment/recommendation quality; injury/availability engine still owns medical transition | Medical/advisory surfaces | CONNECTED |
| Staff evaluator + `assignScouts` / `prioritizeRegions` | `DelegatedScouting` | Canonical scouting assignments/region priority are changed through scouting operations | Scouting assignments/region UI | CONNECTED |
| Staff role/proficiency + `oppositionReport` / `prospectReport` | Scouting advisory and Draft prospect advisory | Report quality/uncertainty and persisted outcome; does not create unsupported knowledge or select a Draft pick | Report/prospect advice | CONNECTED |
| Staff scouting/tactics expertise + `oppositionScouting` | `OppositionScoutingReportEngine` | Unapplied report/recommendation outcome; report remains preparation input, not MatchEngine command | Opposition report/advisory view | CONNECTED |
| Staff recruiting coordinator/recruiter + advisory responsibilities | `RecruitingAdvisory` | Identifies/evaluates prospects and suggests priority as outcomes; Recruiting Engine remains action/commit/sign authority | Recruiting recommendations; accept/dismiss where supported | CONNECTED |
| Staff basketball-operations role + recommendation responsibilities | `BasketballOperationsAdvisory` / GM decision context | Quality-ranked signings, player shortlist, contract/trade recommendations; no automatic signing or trade | Club strategy/recommendation panels | CONNECTED |
| Staff contact/offer/signing responsibility + assignment | Market contact, offer preparation, signing authority services | Determines authorized actor/execution gate; market and contract engines validate/commit | Free-agent/contract workflow | CONNECTED |
| Staff actor + `negotiatePlayerTrade` / `executePlayerTrade` | Trade negotiation and governance execution | Can respond/negotiate or execute an authorized operational step; TradeEngine validates atomic transfer and governance remains applicable | Trade workflow and transaction history | CONNECTED |
| Staff prospect report holder | Draft prospect advisory | Adds a scouting advisory outcome for a prospect; no pick order or selection changes | Prospect report | PARTIAL |
| Head-coach Coach facade + StaffProfile | Match/Coach RPG/result pathways | Coach identity and professional context are available; coach experience/RPG operates separately from the match simulation result | MatchViewer and Coach screen | PARTIAL |
| Staff quality + `rotationPlanning` declaration | Rotation/lineup systems | No live Responsibility caller was traced; declaration is Head-Coach-only and cannot be held by Staff | Rotation remains user/engine-managed | DISCONNECTED |
| Staff tactics roles + `defensiveGamePlan`, `offensivePreparation`, `matchupRecommendation` declarations | Tactical plans / match preparation | No active consumer caller found for these kinds | None beyond generic responsibility UI | DISCONNECTED |
| Performance/medical roles + `manageRecovery`, `recommendWorkloadChange` declarations | Recovery/training load | Existing recovery systems run, but these Staff responsibility kinds do not resolve to an end-to-end caller | None from these responsibility rows | DISCONNECTED |
| Staff contract salary | Organization `ContractFinancialSchedule` | Adds STAFF_SALARY cash/guaranteed expense exposure under the contract schedule | Finance/contract views | CONNECTED |
| Staff politics/career autonomy/human state | Staff political, career, culture, cohesion, conflict engines | Persists state, evaluates reactions/positions, opens requests or cases; not general governance authority | Staff dynamics and governance contexts | PARTIAL |
| Staff personality/morale/relationships | Human, quality and culture consumers | Shapes specified quality/reaction/culture behavior; not a universal performance bonus | Dynamics/profile panels | PARTIAL |
| Staff training quality | PlayerDevelopment transition | Session stimulus later informs Player development; Staff does not directly change Player ratings | Training/development history | PARTIAL |
| Staff professional profile in Facilities | Facilities Engine | No current Staff input/consequence | None | ABSENT |
| Staff role in Youth/Newgens | Youth ecosystem | No youth Staff authority or consumer | None | ABSENT |
| Staff role in Media | Media/news systems | No Staff media authority or consumer | None | ABSENT |

## Required distinctions

- **Recommendation versus authority:** an advisory outcome has `applied: false` until an explicit acceptance path; it does not become a signing, trade, medical transition or recruiting action by being generated.
- **Modifier versus decision owner:** quality functions can change the bounded quality of a report/session/recommendation. The consumer domain owns the final action and canonical mutation.
- **Delegated versus advisory:** delegated resolution requires a valid holder in delegated mode and the consumer may apply the result. Advisory resolution requires advisory mode and produces an unapplied outcome.
- **Registry versus caller:** the six disconnected kinds above are valid domain vocabulary, not live gameplay. Their presence in `RESPONSIBILITY_REGISTRY` alone has no effect.
- **Coach facade versus MatchEngine:** Coach identity and role use StaffProfile, but this does not make Staff ratings a MatchEngine input. Coach/Staff attribute storage has a separate unresolved projection seam (see authority map).
- **Configured versus automated:** a delegated row authorizes eligible execution when a caller runs. It does not create a cadence, assign a holder, or guarantee a Staff decision.

## Connected systems

Training, Medical, Scouting, Recruiting, Contract/Market, Trades and Finance have concrete Staff-backed consumers. Human RPG has concrete Staff state engines and surfaces. Draft has prospect advice but no Staff pick authority.

## Partial systems

Match/coaching, Rotation, Tactics, Draft, NCAA, Governance/Board, Morale/Relationships and Player Development have a narrower connection described above; none should be described as fully Staff-owned.

## Absent systems

Facilities staffing/effects, Youth/Newgen Staff authority and Media Staff authority are absent. Their named milestone ownership remains outside BS13.
