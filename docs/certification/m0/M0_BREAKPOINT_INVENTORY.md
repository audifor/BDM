# M0.2a breakpoint inventory

Inspected authority: `src/app/game/SimulationBreakpoints.ts` at source commit
`16512bafd624c904ec1ca95c008733671b6938e2`. Production classifications are unchanged.
There are **18 built-in reasons**: ten potentially mandatory, six IMPORTANT, two
INFO. No built-in BACKGROUND candidate is emitted; BACKGROUND is the aggregate
level when the candidate list is empty. The extension boundary is open.

Ordering is the production evaluator's order: BLOCKING, ACTION_REQUIRED,
IMPORTANT, INFO, BACKGROUND; then effective date (or deadline), deadline, source
kind and source ID. Missing dates sort as `9999-12-31`. The complete ordered list,
not just its highest-priority entry, controls certification dispatch.

Ownership below means the precise evaluator payload: USER_TEAM carries
`coachId = world.userCoachId` and the controlled `teamId`; USER_COACH carries
the user coach ID; SYSTEM has no user ownership. Dates/IDs remain canonical.
“User-resolvable” describes an existing gameplay operation and its preconditions,
not automatic M0 support. M0.2a registers exactly three reasons. Its runner
blocks before any action when any mandatory candidate lacks a safe resolver.

## ACTION_REQUIRED and BLOCKING

### userGame

- Level: ACTION_REQUIRED. Source kind/ID: USER_GAME / scheduled Game ID.
  Ownership: USER_TEAM. Target: `{ gameId }`, route `match`.
- Trigger: today's scheduled Game involves the controlled team.
- Canonical operation: `app/game/matchResolution.instantResult`, with an explicit
  seed; real Match Next FAST and canonical completion. Stop: **yes**.
  User-resolvable: **yes**, subject to valid match preparation/availability.
- M0 coverage: M0.1 real engine/replay plus M0.2a frozen-input resolver, persistence,
  multi-obligation ordering and independent replay: **PASS**.

### returnToPlayReview

- Level: ACTION_REQUIRED. Source: USER_RTP_REVIEW / Injury ID. Ownership: USER_TEAM.
  Target: `{ injuryId, playerId }`, route `medical`.
- Trigger: a controlled roster player's `injuryLifecycleStatus` is RTP_REVIEW_DUE.
- Canonical operation: `engine/injury/ReturnToPlayEngine.reviewReturnToPlay`, with
  authorized USER actor and CLEAR_FOR_PLAY or CONTINUE_RECOVERY. Clearance may
  require a passed fitness test. Stop: **yes**. User-resolvable: **conditional**.
- M0 coverage: valid factory-produced due injury, complete candidate detection,
  canonical evidence and fail-closed result: **PASS**. Scripted gameplay resolution:
  **BLOCKED / unregistered**, reserved for M0.2b.

### minimumRoster

- Levels: ACTION_REQUIRED if an affordable routed free-agent offer is READY_TO_CONTACT
  in a non-NCAA ecosystem; otherwise BLOCKING. Source: TEAM_ROSTER_MINIMUM / Team ID.
  Ownership: USER_TEAM. Target/route: `{ teamId }` / `market` only when market-supported;
  absent otherwise.
- Trigger: fewer than five rostered players, or at least five rostered but fewer
  than five eligible/available for today's user Game. The threshold is the existing
  PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS, not a certification rule.
- Canonical operation: existing market contact/offer/Governance/signing lifecycle,
  ultimately `app/marketIntelligence/FreeAgentSigningService.completeAcceptedFreeAgentSigning`
  when authorized and affordable. There is no generic “acknowledge minimum” action.
  Stop: **yes**. User-resolvable: **conditional**; no supported offer means no
  certified immediate solution, never an invented emergency player or forfeit.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN**; scripted
  capability **BLOCKED / unregistered**.

### draftPick

- Level: ACTION_REQUIRED. Source: USER_DRAFT_PICK / current Pick ID. Ownership:
  USER_TEAM. Target: `{ draftId, pickId }`, route `draft`.
- Trigger: a Draft is inProgress and its current unselected pick belongs to the
  controlled team.
- Canonical operation: `engine/draft/DraftEngine.makeDraftSelection`, selecting a
  valid available prospect as the authorized team. Stop: **yes**. User-resolvable:
  **conditional** on legal draft/prospect state.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN**; scripted
  capability **BLOCKED / unregistered**.

### mediaOpportunity

- Level: ACTION_REQUIRED. Source: MEDIA_OPPORTUNITY / Opportunity ID. Ownership:
  USER_COACH. Target: `{ opportunityId }`, route `media`.
- Trigger: `getPendingMediaOpportunities(world, userCoachId)` returns a record;
  that query checks pending status/coach, with no extra date gate.
- Canonical operations: `engine/media/MediaEngine.skipMediaOpportunity` or
  `respondToMediaOpportunity`. M0 chooses skip. Stop: **yes**. User-resolvable: **yes**.
- M0 coverage: real pre-match opportunity creation/skip, retained skipped record,
  reserved media count, generated post-match obligation and deterministic replay:
  **PASS**, including frozen input validation.

### coachJobOffer

- Level: ACTION_REQUIRED. Source: COACH_JOB_OFFER / Offer ID. Ownership: USER_COACH.
  Target: `{ offerId }`, route `coach`.
- Trigger: the user's CoachJobOffer has pending status; no expiry/date gate here.
- Canonical operations: `app/coachCareer/CoachCareerService.declineCoachJobOffer`
  or `acceptCoachJobOffer`. M0 chooses decline, preserving the current club.
  Stop: **yes**. User-resolvable: **yes** with a legally offered candidacy.
- M0 coverage: real vacancy -> application -> completed interview -> pending
  offer; decline -> rejected candidacy, unchanged employment/team/Staff/history:
  **PASS**, including frozen input and replay.

### tradeNegotiationResponse

- Level: ACTION_REQUIRED. Source: TRADE_NEGOTIATION / Negotiation ID. Ownership:
  USER_TEAM. Target: `{ negotiationId, revisionId }`, route `trades`.
- Trigger: the user's team participates in PROPOSED/COUNTERED negotiation, did
  not propose its latest revision, has not ACCEPTED/REJECTED that revision, and
  `tradeNegotiationResponseReadiness` returns READY.
- Canonical operation: `app/trades/TradeNegotiationService.respondToTradeNegotiation`
  for authorized accept/reject/counter against the current revision. Binding
  execution/Governance is separate. Stop: **yes**. User-resolvable: **conditional**.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN**; scripted
  capability **BLOCKED / unregistered**.

### seasonComplete

- Level: ACTION_REQUIRED. Source: SEASON_LIFECYCLE / current Season ID. Ownership:
  USER_TEAM with user coach and optional team ID when unemployed. Target:
  `{ seasonId }`, route `competition`.
- Trigger: current Season exists, has completed games and a history record, and
  no next user Game exists.
- Canonical operation: `app/game/startNextSeason.startNextSeasonFor` for supported
  editions; the shared CompetitionLifecycleCoordinator also owns supported
  rollover. It creates future fixtures without arbitrary clock/pointer changes.
  The checkpoint is a projection, not a stored acknowledgement to delete.
  Stop: **yes**. User-resolvable: **conditional** on supported lifecycle and dependencies.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN**; scripted
  capability **BLOCKED / unregistered**. No season simulated in M0.2a.

### unsupportedCompetitionLifecycle

- Level: BLOCKING. Source: COMPETITION_LIFECYCLE / Season ID. Ownership: SYSTEM.
  Target: `{ competitionId, seasonId }`, route `competition`.
- Trigger: `classifyCompetitionLifecycles` reports UNSUPPORTED_FUTURE_LIFECYCLE,
  and that edition is complete with history. Classification uses the latest
  edition per competition; examples include insufficient participants or an
  NCAA edition lacking the required valid populated conference snapshot.
- Canonical resolution operation: **none for an unsupported configuration**.
  Stop: **yes**. User-resolvable: **no generic action**; needs capability/configuration
  diagnosis rather than skip/acknowledgement.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN**; capability
  **BLOCKED**, with no production repair authorized in M0.2a or implied for M0.2b.

### scheduledGameInPast

- Level: BLOCKING. Source: SCHEDULE_INTEGRITY / earliest past scheduled Game ID
  (date then ID). Ownership: SYSTEM. Target: `{ gameId }`, route `schedule`.
- Trigger: any scheduled Game has `date < currentDate`.
- Canonical resolution operation: no generic supported user action that repairs
  this invariant. Today's user instant action cannot acknowledge an overdue
  schedule; arbitrary date/status/result changes are forbidden. Stop: **yes**.
  User-resolvable: **no general path**; investigate the originating regression.
- M0 coverage: source inventory/recognition only, scenario **NOT_RUN** (no malformed
  overdue-world fixture manufactured). Scripted capability **BLOCKED**.

## IMPORTANT observations — never mandatory by classification

### contractReviewHorizon

- Level: IMPORTANT. Source: USER_CONTRACT_REVIEW / `<teamId>:<currentDate>`.
  Ownership: USER_TEAM. Target `{ teamId }`, route `contracts`.
- Trigger: REVIEW_REQUIRED items enter the existing horizon exactly today with
  no decision, or a DEFER decision has `reviewAgainOn === currentDate`. Deadline
  is the earliest matching expiry. Operation:
  `app/contractReview/ContractReviewService.recordContractReviewDecision`.
- Stop: **no**. User-resolvable/actionable: **yes**, subject to review preconditions.
  M0 reason-specific scenario **NOT_RUN**; observation classification/source inventory
  guarded, no scripted decision attempted.

### retentionCounter

- Level: IMPORTANT. Source: CONTRACT_RETENTION_NEGOTIATION / Negotiation ID.
  Ownership: USER_TEAM. Target `{ negotiationId }`, route `contracts`.
- Trigger: controlled-team retention negotiation is not SIGNED and its derived
  status is PLAYER_COUNTERED. Operations: `respondToRetentionCounter`,
  `submitRetentionOffer`, or `withdrawRetentionNegotiation` in the existing engine.
- Stop: **no**. User-actionable: **conditional** on valid terms/round/authority.
  M0 reason-specific scenario **NOT_RUN**; inventoried observation, no resolver.

### retentionAgreement

- Level: IMPORTANT. Same source, ownership and target as retentionCounter.
- Trigger: unsigned controlled-team retention negotiation derives ACCEPTED.
  Operation: `app/contractRetention/RetentionSigningService.executeAcceptedRetentionAgreement`
  with real authorization/Governance and binding execution; agreement alone is
  not a signed contract.
- Stop: **no**. User-actionable: **conditional**. M0 reason-specific scenario
  **NOT_RUN**; inventoried observation, no resolver.

### marketNegotiation

- Level: IMPORTANT. Source: MARKET_NEGOTIATION / Negotiation ID. Ownership:
  USER_TEAM. Target `{ negotiationId }`, route `market`.
- Trigger: negotiation belongs to the controlled team's organization and status
  is COUNTERED or ACCEPTED. Operations: `engine/market/MarketEngine.respondToNegotiationCounter`
  or the canonical free-agent signing/Governance lifecycle. Accepted-signing
  diagnostics explicitly expose absent/ambiguous institutions, missing decisions,
  rejected/vetoed/withdrawn decisions, absent approver mapping and missing approvals.
- Stop: **no**. User-actionable: **conditional**; not all institutional blockers
  have a user bypass. M0 reason-specific scenario **NOT_RUN**; observation only.

### governanceRequest

- Level: IMPORTANT. Source: GOVERNANCE_REQUEST / Request ID. Ownership: USER_COACH.
  Target `{ requestId }`, route `governance`.
- Trigger: request recipient is the user's COACH actor; events effective by today
  derive ISSUED, ACKNOWLEDGED or ACCEPTED. Due date is metadata, not severity escalation.
  Operation: `app/governance/ClubGovernanceRequestResponse.respondToClubGovernanceRequest`
  for supported authorized responses; accepted work may require a real domain effect.
- Stop: **no**. User-actionable: **conditional** by request/action authority.
  M0 reason-specific scenario **NOT_RUN**; inventoried observation, no resolver.

### governanceApproval

- Level: IMPORTANT. Source: GOVERNANCE_DECISION / Decision ID. Ownership: USER_COACH.
  Target `{ decisionId, bodyId }` (first missing user approval), route `governance`.
- Trigger: decision status derived from effective events is not REJECTED, VETOED,
  WITHDRAWN or EXECUTED; decision rights require an approver body with a currently
  active user-coach appointment and no APPROVED event for that body. Operation:
  `app/governance/BoardGovernanceCommands.recordClubGovernanceDecisionEvent`
  or the existing decision-type-specific command; execution remains separate.
- Stop: **no**. User-actionable: **conditional** on body/type authority. M0
  reason-specific scenario **NOT_RUN**; inventoried observation, no resolver.

## INFO observations — never mandatory by classification

### marketNegotiationAwaitingExternalResponse

- Level: INFO. Source: MARKET_NEGOTIATION / Negotiation ID. Ownership: USER_TEAM.
  Target `{ negotiationId }`, route `market`.
- Trigger: controlled-organization negotiation is CONTACTED or OPEN and
  `contactResponse` is absent. No human acknowledgement resolves an external
  wait; normal `progressNegotiationContactResponses` / formal-response calendar
  processing owns the due transition.
- Stop: **no**. User-resolvable: **not as a mandatory decision**; wait is legitimate.
  M0 reason-specific scenario **NOT_RUN**; inventoried observation, no resolver.

### marketContactResponse

- Level: INFO. Same source, ownership and target as the preceding reason.
- Trigger: controlled-organization negotiation is CONTACTED or OPEN and
  `contactResponse` exists (including OPEN formal offers retaining their contact
  response). CONTACTED positive/refusal diagnostics differ from OPEN offer-wait
  diagnostics. Existing `openNegotiation` / prepared-offer application operations
  can follow a positive contact; external formal responses remain lifecycle-owned.
- Stop: **no**. User-actionable: **conditional**, no mandatory acknowledgement.
  M0 reason-specific scenario **NOT_RUN**; inventoried observation, no resolver.

## Open application extension boundary: additionalCandidates

`SimulationBreakpointContext.additionalCandidates` accepts arbitrary reason,
source kind/ID, ownership, target and any of the five levels. The evaluator assigns
ordering keys and sorts them alongside built-ins. This boundary is **open**, not
an implied approved reason/action catalogue.

- ACTION_REQUIRED/BLOCKING extensions: stop, including unknown names and
  prototype/inherited object-key names. Return UNKNOWN_EXTENSION/MISSING_RESOLVER
  with date, complete candidate evidence, diagnostic and canonical world hash.
  A built-in name with forged source/owner/target fails canonical preconditions.
- IMPORTANT/INFO extensions: observations, retained with no action and no blocker.
- BACKGROUND extensions: nonmandatory observations.
- User-resolvability/operation: unknown unless explicitly registered with a real
  canonical authority. There is no acknowledgement/deletion fallback.
- M0.2a coverage: unknown ACTION_REQUIRED and BLOCKING, IMPORTANT/INFO observation
  behavior, mismatched ownership/source/action target, and lower-ranked mandatory
  preflight: **PASS**. Tests inject read-only diagnostic inputs, never inconsistent
  canonical entities or simulated service effects.

Executable inventory check reads the production evaluator's TypeScript AST,
including conditional reason expressions, and verifies these 18 named entries
against the certification recognition list and this document. It fails if a new
expression cannot be inventoried. Recognition is not a claim of gameplay execution:
only userGame, mediaOpportunity and coachJobOffer are resolved in M0.2a; RTP is
observed and deliberately BLOCKED; the other mandatory paths await approved scope.
