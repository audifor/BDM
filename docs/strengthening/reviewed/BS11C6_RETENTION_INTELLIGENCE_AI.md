# BS11C6 · Retention Intelligence and AI Ownership

## Status and branch

**BS11C6 PASS** after focused validation. C6 uses recorded player context in the existing deterministic response and gives AI-controlled clubs a bounded, nonbinding retention owner. It creates no successor contract or signing authority.

- Validated predecessor: C5 implementation `4ab7749d588c45ee5aa766a6ef359ae21857f3c1`.
- Separate C5 archive commit: `afdf87ed6e75f2ae8ff8fa98f906febe3a232723`.
- C6 branch: `bdm-stage2-bs11c6-retention-intelligence-ai`.

## 1. Reuse audit

The BS0 strengthening master audit and matrix, BS9A/B/C/E audits, BS10D-F and BS10D-I audits, BS11B review-intent documentation, BS11C1 canon/decision register, and reviewed C2-C5 documents were inspected alongside current source. This C5-based checkout does not contain separate Master Capability Reuse Registry, Master Capability Audit, Contract Deep Audit, or Reuse First files; those were not available in this branch. No other BDM worktree was read or changed to obtain them.

| Area | Canonical source found | C6 use |
|---|---|---|
| Player truth | `Player` and `Person` profiles; birth date, development stage, basketball ratings and traits | No age-derived service years, ratings-as-contract-value, or inferred personal goals |
| Player state | `MoraleProfile.value`, 0–100, and recorded morale events | Small bounded response modifier; missing morale is neutral |
| Role expectation | `RolePromise`, separate from `PlayerContract`; only existing ACTIVE promise for the same player/organization is compared | Proposed role above/below that recorded promise can affect the response; no promise means neutral |
| Relationships | Directed person-to-person `RelationshipProfile`; a direct player-to-current-head-coach record may exist | Small bounded modifier; absent record is neutral. No player-to-club relation is invented |
| Agent | `AgentAbilities`, `AgentProfessionalPersonality`, `PlayerRepresentation`, and canonical `agentCounter` | Existing negotiation/aggressiveness/opportunism counter behavior is reused; agent remains separate from player preferences |
| Review intent | BS11B `PURSUE_EXTENSION`, `ALLOW_EXPIRY`, `REVIEW_RELEASE`, `DEFER` and `assessContractReviewOutlook` | Existing explicit intent is honored. Unreviewed AI candidates receive a transient derived intent from accepted club strategy plus the BS9 continuity need; no decision record is created |
| Club strategy and needs | `ClubStrategicState`, `assessClubNeeds`, and BS9 contract-continuity evidence | Selects AI pursue/allow-expiry intent and priority; does not select an external target or create a second strategy model |
| Finance / salary | Existing legacy player salary budget and `canTeamAffordAdditionalSalary`; C2 SalaryRules proposal validation | AI checks only the known marginal salary increase over the predecessor and lets the shared validator enforce the existing term/rule boundary |
| Lifecycle | Daily `CalendarEngine`; existing C2 open, submit, counter, accept, withdraw and invalidation operations | One filtered, nonblocking AI retention phase uses the same negotiation history and eligibility |

The separate BS10 agent audit warns that MarketReality/player truth is hidden from the club-side negotiation owner. C6 follows that boundary. Current response uses the predecessor's canonical salary as its public reference; AI opening terms use that same current salary and do not read MarketReality, hidden target salary, private response score/factors, or undisclosed agent internals.

**Not found or not safely interpretable for retention:** player-declared salary/security targets; player-specific competitive/career goals; a player-to-club relationship; reliable current role/minutes expectations beyond an ACTIVE RolePromise; a role-promise fulfillment evaluator; geography/family preferences; or a canonical player preference for club strategy mode. Generic player personality dimensions exist, but their retention semantics are not decided, so C6 does not map ambition, loyalty, or competitiveness into acceptance. No separate master capability registry/audit files were present in this branch.

**Reuse risks avoided:** hidden MarketReality as AI knowledge; agent style as player intent; RolePromise as PlayerContract truth; staff advisory recommendations as negotiation authority; Board or Governance pressure as signing approval; Finance V2 cash health as salary-cap affordability; and a second negotiation or AI-retention collection.

## 2. Player preference context and response calibration

The existing response still prioritizes salary (`0.45` weight), term security (`0.20`), role opportunity (`0.15`), morale (`0.10`), relationship (`0.05`), and club context (`0.05`). C6 replaces neutral role, morale, and relationship factors only when their canonical source is present. Missing data stays at `1.00`; `clubContext` stays neutral because there is no player-specific career/competitive-fit authority.

- Role opportunity compares the proposed role with the latest ACTIVE RolePromise for this player and organization. A higher promise adds `0.15`; a lower promise subtracts `0.15`; equal roles are acceptable. It does not convert the proposal into a promise or infer actual playing time.
- Morale maps the recorded 0–100 value around 50 with a maximum `±0.12` factor; `<40` and `>60` produce structured reasons.
- The direct player-to-head-coach relationship maps its `-100..100` scalar to a maximum `±0.10` factor; values outside `±20` produce a positive/negative reason.
- The combined modifiers are centralized in `RETENTION_RESPONSE_CALIBRATION`, remain deterministic, and cannot waive the existing salary economic band. A focused boundary regression proves adverse canonical context can change a near-threshold response and an improved promised role can restore acceptance.

Player, agent, club strategy and club knowledge remain distinct. Player preference factors affect only the response computed inside the shared negotiation engine. Agent abilities/style continue to shape an existing counter through `agentCounter`; they do not set player preference. Structured reasons are persisted as response evidence. The numeric score/factor derivation remains an internal test/engine projection and is not saved, rendered, or returned in the AI decision evidence.

## 3. AI review intent, offer, and counter behavior

BS11B remains the review projection and user decision authority. C6 does not write or reinterpret saved BS11B records:

- Existing `PURSUE_EXTENSION` may negotiate.
- Existing `ALLOW_EXPIRY` and `REVIEW_RELEASE` do not initiate or continue retention.
- `DEFER` waits until its recorded revisit date; after it is due, the current strategy/need may derive a new transient AI intent.
- For an AI review with no persisted decision, accepted `PROTECT_CORE` strategy derives `PURSUE_EXTENSION`; `OPEN` derives `ALLOW_EXPIRY`; `SELECTIVE` pursues only a HIGH/CRITICAL, HIGH-fit continuity need when the accepted financial posture is not STRESSED. This is transient actor behavior, not a new BS11B decision record or a persisted intent.

AI is restricted to teams with a non-user coach. The user-controlled team remains governed by its existing commands, even when its review says `PURSUE_EXTENSION`. Before opening, the AI uses `assessAiRetentionEligibility`, which shares C2's active/exact predecessor, unique contract, roster membership, integrity, professional ecosystem, configured window, no-successor, active negotiation, cooldown, SalaryRules, and term validation checks. The AI cannot bypass missing rules or ambiguous state.

Opening terms use the predecessor's current annual salary for one year. This uses known contract information and avoids fabricating market expectations. An increase over that predecessor salary must fit the existing salary-budget check. When a player/agent counters, the AI accepts in principle only if those exact counter terms remain structurally/rule valid and the salary delta is affordable; otherwise it withdraws. C6 does not revise terms or create an endless counter loop. The common negotiation cooldown applies, and any prior negotiation history for that predecessor blocks a second autonomous attempt.

Structured transient `AiRetentionDecisionEvidence` reports team, player, date, review intent, strategy mode, need, negotiation, eligibility, action, and reasons. Calendar maps it into ordinary phase diagnostics. It is not saved and does not become `ACTION_REQUIRED` or a user-facing breakpoint. The AI never inspects hidden player/agent factors when building an offer; it sees only its own strategy/need, predecessor terms, salary budget, and the public counter proposal.

## 4. Lifecycle, performance, persistence, and boundaries

`AI_RETENTION_NEGOTIATIONS` runs after stale-retention invalidation. A single pass indexes contracts expiring within the existing BS9 365-day review horizon and active retention negotiations, then assesses only affected AI teams. It does not re-run strategy review or create BS9/GM plans. Each candidate uses the existing negotiation collection. One date-keyed opening and one bounded response are idempotent; no duplicate active/history record is created.

No Save V4 change is required: intent is derived from current sources, AI negotiation actions use the existing saved retention records, and diagnostics are transient. No UI change is required; current user Club Strategy controls remain user-only. A one-day lifecycle regression confirms an AI-only action completes the day and creates no user breakpoint.

Accepted AI terms remain agreement-in-principle only. C6 creates no PlayerContract successor, Finance commitment/payment, Governance decision, roster mutation, release, trade, option exercise, incentive evaluation, or consent execution. BS11D owns binding signing and must revalidate the exact predecessor/roster integrity and binding authority. BS11E retains release/termination consequences. Buyout and trade-kicker semantics remain deferred, and a future Trade lifecycle owns consent enforcement.

## 5. Compatibility, findings, and handoffs

- C2 salary/years, deterministic response, cooldown, invalidation, and user control remain intact.
- C3 options/guarantees, C4 incentives, and C5 proposed trade consent are passed through unchanged in the full structured term set.
- SalaryRules remain the only source for contract-length legality; missing effective rules fail closed. C6 does not infer service years from age.
- No player/agent preference state, AI intent record, duplicate negotiation collection, or new Save V4 shape is added.
- **P0:** None found in the focused C6 surface.
- **P1:** Player career/competitive goals and exact retention preference weights remain limited; no player-to-club relation; RolePromise breach/fulfillment authority absent; AI review intent is deliberately derived/transient rather than an explicit persistent decision; default salary budget is not a coordinated Finance V2/cap approval; successor signing, activation, buyout, kicker, and trade-consent execution remain future lifecycle work.
- **BS11D:** materialize accepted terms only through approved signing Governance and atomic successor execution after exact predecessor and roster-integrity revalidation.
- **BS11E:** retain authority for release/termination and any separately approved mutual buyout/exit semantics.
- **Future Trade:** define binding consent actor/deadline/default/decision history and pre-mutation enforcement; define kicker basis and cash/cap/Finance treatment before implementation.

## 6. Focused validation

| File / command | Result |
|---|---:|
| `src/engine/contractRetention/ContractRetentionEngine.test.ts` | PASS; included in 31 passed, 0 failed, 0 skipped across both focused files; 19.60s |
| `src/engine/contractRetention/AiRetentionEngine.test.ts` | PASS; included in 31 passed, 0 failed, 0 skipped across both focused files; 19.60s |
| `src/app/contractReview/ContractReviewService.test.ts` | PASS; 10 passed, 0 failed, 0 skipped; 46.58s (BS11B source unchanged) |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; 8.75s Vite build, existing large-chunk warning |
| `git diff --check` | PASS |

No full suite or long-horizon simulation was run. The lifecycle integration test advances one calendar day only. No Save V4 or UI test was needed because neither persistence schema nor UI changed.
