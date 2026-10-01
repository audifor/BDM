# BS9A Club Strategic State

## Audit result

The pre-implementation audit is recorded in [BS9A_CLUB_STRATEGIC_STATE_AUDIT.md](./BS9A_CLUB_STRATEGIC_STATE_AUDIT.md). The resumed implementation rechecked the important boundaries against the current base:

- `Team.rosterPlayerIds`, player/person profiles, contracts, competitions, seasons and completed games remain their existing sources of truth.
- `TeamEvaluation` derives a lineup projection from player ratings for starter selection and match strength. BS9A does not persist or consult it as a club authority.
- `AiRosterMaintenance` only repairs AI roster depth through the existing world-repair boundary. It does not establish organizational intent or run a continuing GM loop.
- Board confidence and job security belong to the coach-linked `BoardState` and `getJobSecurity` projection.
- Governance V2 objectives belong to their linked institution and active expectation period. Board state is not used as a replacement for Governance.
- Finance V2 `getFinancialHealthSnapshot` provides the financial facts and distress indicators. No new accounting or universal budget threshold was added.
- General manager and sporting director staff roles exist, but no unified GM-person decision style is needed for this milestone.

## Authority boundaries

`GameWorld.clubStrategicStatesByTeamId` is the accepted organizational direction and minimal review memory. `assessClubStrategy` is a pure derived projection of current world truth. It does not persist its explanation or authorize actions.

The Engine reads canonical Domain and GameWorld data. Application lifecycle calls the Engine at initial career setup and preseason. The Analysis workspace presents a read-only inspection view. The user-controlled club can be assessed for advisory context, but automated reviews skip it.

BS9A does not create or approve market, finance, staff, draft, recruiting, contract, ownership, or governance actions. Future AI decisions must combine this club state with the responsible staff member’s decision style; BS9A does not model that style.

## State and assessment models

The persisted `ClubStrategicState` contains:

- accepted mode: `CONTEND`, `COMPETE`, `DEVELOP`, `REBUILD`, `SELL`, or `SURVIVE`
- competitive horizon: `NOW`, `NEAR_TERM`, or `LONG_TERM`
- financial posture: `UNKNOWN`, `HEALTHY`, `CONSTRAINED`, or `STRESSED`
- risk tolerance, development emphasis, retention posture, acquisition aggression, and selling willingness
- `establishedOn`, `lastReviewedOn`, and one structured transition reason

The derived `ClubStrategicAssessment` contains the candidate mode, structured reasons, competition-level pressure, financial pressure, Board pressure, Governance pressure, average roster age, expiring-contract count, and review eligibility/timing. It is reconstructed on demand and does not become duplicated saved truth.

## Modes and transition rules

- `CONTEND`: a top-of-table window supports prioritizing current results.
- `COMPETE`: the neutral balanced direction when no stronger evidence is present.
- `DEVELOP`: weak current results and a young roster support a longer horizon; strong formal Board/Governance pressure can shift that candidate back toward `COMPETE`.
- `REBUILD`: weak current results with an older roster and no stronger financial emergency.
- `SELL`: weak results, an older roster and a cluster of expiring contracts indicate a resource-recovery posture.
- `SURVIVE`: severe canonical financial distress takes priority.

The assessment does not infer relegation danger from league position alone. This base has promotion/relegation resolutions but no universal relegation threshold on each Competition, so strategy does not invent one. It similarly does not infer a title window from standings before any games have been played.

Transitions are deterministic. The accepted state stores the reason associated with the mode change. Review calls accept explicit triggers (`PRESEASON`, `COMPETITION_CHECKPOINT`, `MAJOR_FINANCIAL_SHOCK`, `GOVERNANCE_CHANGE`, and `MAJOR_ROSTER_CHANGE`) or the scheduled cadence.

## Inputs

### Competition and performance

The assessment checks each active competition season containing the Team, calculates that season’s standings from completed Games, and combines the resulting position percentiles. It does not treat `currentSeasonId` as universal context or assume an NBA cap, draft, playoff, promotion or relegation format.

### Roster and contracts

Roster age derives from canonical Person birth dates. Depth below five is surfaced as a structured risk reason. The assessment counts active contracts expiring within one year and surfaces a cluster when several affect a material share of the roster. It does not repair roster/contract inconsistencies or calculate a team Overall.

### Finance V2

BS9A calls `getFinancialHealthSnapshot` for the Team’s Organization and reads its existing currency rows and distress indicators. Liquidity shortfalls, overdue payables, unfunded debt maturity and regulatory breaches map to severe pressure; other existing distress indicators map to constrained pressure. With no financial evidence, posture remains `UNKNOWN`. Low cash alone does not imply `SELL`.

### Governance V2 and Board

Active Governance objectives are selected through their institution’s Team link and their actual evaluation dates. Their existing importance informs Governance pressure; their presence is exposed as a structured reason. Board pressure is derived through the Board domain’s `getJobSecurity` projection. The two signals remain separate in the assessment and Analysis view. No unrecorded ownership intent is inferred.

### Facilities and performance ratings

Facilities have no direct BS9A effect because the audited state does not provide a justified, shared sporting/financial strategy input here. Player ratings and `calculateTeamStrength` are not used as strategic authorities.

## AI and user club behavior

`createNewGame` establishes direction for coached AI clubs after the initial world is assembled. The existing competition preseason lifecycle reviews AI clubs again. `reviewClubStrategy` returns without changing the user club or an unstaffed Team; `assessClubStrategy` remains available for advisory inspection.

There are no GM execution calls in the strategy Engine. The Analysis workspace lists AI-controlled clubs, their accepted mode (or candidate before the first accepted review), contextual posture, pressures, reasons, and last review.

## Inertia and review cadence

The scheduled minimum review horizon is 90 game days. Daily date advances do not call a strategy mutation. Preseason and explicit major triggers may review earlier; the review trigger is a lifecycle input rather than persisted diagnostic history. A same-mode review preserves `establishedOn`; a mode change resets it and updates the transition reason.

Initial world construction and the existing season rollover are integrated review points. Finance, Governance, and major roster systems can invoke the public explicit-trigger API when they already know a material event occurred. BS9A does not redesign the calendar or add daily event polling.

## Determinism and persistence

Assessment derives solely from the canonical world and date. It uses no random source and no `Math.random()`. `GameWorld` stores only the compact accepted state. Save V4 adds `clubStrategicStates`; old V4 and V3 saves default to an empty strategy-state map. V4 round trips preserve accepted mode and review timing. No Save V5 or parallel persistence authority is introduced.

## Observability and deferred scope

The Analysis workspace shows club, accepted/candidate mode, horizon, financial posture, risk tolerance, development emphasis, competitive/financial/Board/Governance pressure, structured reasons, and last review. This is a read-only inspection surface, not an action dashboard.

BS9B can consume the mode, horizon, postures, pressure sources, roster age and contract-expiry evidence when producing concrete team needs. BS9C may combine club direction with an identified GM/sporting director’s personal decision style. BS9D/BS9E remain responsible for action authorization and execution. Detailed market value, roster-role needs, scouting confidence and facilities strategy are deferred.

## Findings

No new P0 finding was found. The audit’s existing P1 coordination risks remain: Finance V2 versus the legacy salary budget, Board vocabulary versus Governance authority, and roster membership versus contract team references. BS9A documents these boundaries and does not change their authorities.
