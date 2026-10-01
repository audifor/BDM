# BS11C1 · Product Decisions Required

**Status:** open decision register; recommendations are advisory, not decisions.
No item below is silently selected. Resolve a question before implementing the
behavior it governs.

## Gates before BS11C2

### 1. Retention eligibility and extension/renewal windows

- **QUESTION:** What dates make an active player eligible for extension, and
  when may a renewal be negotiated? Are both limited by the competition's
  configured contract-length rules?
- **WHY IT MATTERS:** Controls which workflow may open, successor start/end
  dates, negotiation visibility, and legal validation.
- **CURRENT REPOSITORY EVIDENCE:** BS11A uses a 365-day planning horizon, not
  execution eligibility. `PlayerContract` has an exclusive `expiresOn`.
  `SalaryRules` are season/competition scoped and define contract length
  bounds; no retention window exists.
- **OPTION A:** One configured window before exclusive expiry for both.
- **OPTION B:** Separate active-contract extension window and post-expiry
  renewal window, with no gap allowed.
- **OPTION C:** Allow competition rule sets to define both windows.
- **RECOMMENDATION:** Use explicit competition-scoped eligibility rules and
  distinguish active extension from after-term renewal; do not reuse BS11A's
  planning horizon as a rule.
- **IMPACT:** Required before C2 eligibility and term validation; impacts
  competition rules and UI.

### 2. Successor uniqueness, overlap, and invalidation

- **QUESTION:** May one predecessor have multiple scheduled successors? May
  contract terms overlap? What happens to a successor after trade, release,
  termination, or team affiliation change before its start?
- **WHY IT MATTERS:** Prevents ambiguous active contracts, roster mismatch,
  double-counting, and stale agreements.
- **CURRENT REPOSITORY EVIDENCE:** BS11C0 requires valid active roster integrity
  and exact unique active ContractId at execution. Contract end is exclusive;
  scheduled contracts activate by date but do not create a general roster
  arrival. Existing planning only suppresses some overlapping same-team cases.
- **OPTION A:** One successor per predecessor, no overlap, start exactly at
  predecessor exclusive expiry; invalidate on affiliation/termination change.
- **OPTION B:** Permit gaps and/or multiple future candidates, but require an
  explicit selection and cancellation operation before execution.
- **OPTION C:** Competition-specific overlap and transfer policy.
- **RECOMMENDATION:** A; any cancellation/invalidation must be explicit,
  recorded, and atomic. Approve before successor implementation.
- **IMPACT:** C2 may model a nonbinding negotiation without committing dates;
  successor execution/activation cannot proceed until answered.

### 3. Failed negotiation cooldown and reopen rule

- **QUESTION:** After rejection, withdrawal, or expiry, how long before another
  retention offer may be opened, and what event reopens it?
- **WHY IT MATTERS:** Prevents infinite immediate offer spam while allowing a
  changed situation to be revisited.
- **CURRENT REPOSITORY EVIDENCE:** BS10 has negotiation statuses/rounds and
  idempotent actions; no contract-retention cooldown rule is present.
- **OPTION A:** Fixed rule-configured number of days.
- **OPTION B:** Reopen at the next explicit contract decision checkpoint.
- **OPTION C:** Reopen only after changed circumstances or a new negotiation
  window; record the reopening reason.
- **RECOMMENDATION:** Combine B and C: deterministic next checkpoint, with an
  explicit changed-circumstance reopen. Set duration/checkpoint in product
  rules before implementation.
- **IMPACT:** Required before repeated-offer lifecycle is built in C2.

### 4. Agent-fee terms in retention negotiation

- **QUESTION:** May extension/renewal negotiation include an agent fee in C2,
  and if so must it retain current club-payer settlement or support player/split
  payment now?
- **WHY IT MATTERS:** Existing term sets expose optional `agentFee`, but current
  signing settlement charges the club. A generic fee term without payer creates
  an accounting ambiguity.
- **CURRENT REPOSITORY EVIDENCE:** Free-agent signing creates a club
  `FinancialCommitment` due on signing. Finance V2 is organizational; no
  player/split settlement authority was found.
- **OPTION A:** C2 omits fee negotiation; address payer later.
- **OPTION B:** Reuse `agentFee` with existing CLUB-only settlement.
- **OPTION C:** Build CLUB/PLAYER/split settlement before C2.
- **RECOMMENDATION:** B only if product approves club-only parity; otherwise A.
  Do not claim player/split support until Finance authority is designed.
- **IMPACT:** Must be answered if agentFee is exposed by C2; no effect if the
  term is explicitly excluded from C2.

### 5. Extension and renewal product identity

- **QUESTION:** Should extension and renewal use one negotiation flow and
  successor record, with difference only in eligibility/timing, or distinct
  history/transaction semantics?
- **WHY IT MATTERS:** Shapes negotiation type, reports, history, and tests.
- **CURRENT REPOSITORY EVIDENCE:** No extension or renewal execution exists;
  free-agent workflow is specialized around free-agent eligibility.
- **OPTION A:** Shared retention flow and successor type, typed reason
  `EXTENSION` or `RENEWAL`.
- **OPTION B:** Separate workflows and distinct contract record types.
- **OPTION C:** Shared term negotiation with distinct approval/execution
  services.
- **RECOMMENDATION:** A: share negotiation mechanics and successor structure;
  specialize eligibility and keep the reason for audit. Avoid different
  persisted contract kinds absent different legal terms.
- **IMPACT:** Needed for C2 domain shape; does not decide dates or binding
  approval.

## Decisions required before dependent later milestones

### 6. Option exercise identity and optional-year terms

- **QUESTION:** Does exercise activate a pre-agreed optional year inside the
  same contract, create a linked successor contract, or use another explicit
  structure?
- **WHY IT MATTERS:** Determines immutable history, status, Finance schedule,
  roster continuity, and migration.
- **CURRENT REPOSITORY EVIDENCE:** Contract identity is a single record with
  exclusive dates; Finance schedules derive from contract terms; no option
  structure exists.
- **OPTION A:** Linked scheduled successor (recommended).
- **OPTION B:** Typed optional period within original contract.
- **OPTION C:** Explicit amendment record linked to both.
- **RECOMMENDATION:** A to preserve historical terms and derive the new
  schedule, subject to product confirmation.
- **IMPACT:** Blocks options milestone; no option code in C2.

### 7. Option deadline defaults and decision owners

- **QUESTION:** What happens if a team, player, or mutual option holder misses
  the deadline? Which actor may decide for AI clubs/players, and in what order
  does a mutual decision occur?
- **WHY IT MATTERS:** Silence cannot be treated as assent without a rule; it
  affects contractual rights and roster/financial commitments.
- **CURRENT REPOSITORY EVIDENCE:** No option actor exists. BS11B AI review
  intent fails closed; signing authority is not retention authority.
- **OPTION A:** Default unexercised/declined for every option.
- **OPTION B:** Holder-specific defaults configured by competition.
- **OPTION C:** Deadline conflict enters blocking review and holds state.
- **RECOMMENDATION:** Explicit holder-specific rule; avoid a universal default.
  Use a blocking conflict only as safety handling, not as the business outcome.
- **IMPACT:** Blocks deterministic option lifecycle and breakpoint severity.

### 8. Guarantee date and vesting semantics

- **QUESTION:** Are guarantees immediately guaranteed, guaranteed on dates,
  vested by conditions, or combinations; and how do release/termination affect
  the resulting obligation?
- **WHY IT MATTERS:** Drives cash liability, cap treatment, release outcomes,
  Finance recognition, and dead-money effects.
- **CURRENT REPOSITORY EVIDENCE:** Per-year `guaranteedAmount` exists; no
  guarantee dates/vesting event. Finance schedule recognizes guaranteed value
  under explicit policy. Salary Engine models dead money separately.
- **OPTION A:** Date-only vesting schedule.
- **OPTION B:** Typed date or canonical evidence condition, chosen per term.
- **OPTION C:** Competition-specific supported guarantee policy.
- **RECOMMENDATION:** C with a small typed date/condition model and explicit
  termination mapping; no universal league assumption.
- **IMPACT:** Blocks guarantee lifecycle, Finance adapter, and release tests.

### 9. Incentive aggregation and consequence accounting

- **QUESTION:** Which aggregation/window rules apply to stats and team results,
  and when/how are approved cash, escalation, reduction, or guarantee effects
  posted and reflected in cap rules?
- **WHY IT MATTERS:** The same evidence can resolve differently by season,
  competition, or partial period; ledger timing and cap treatment must be
  deterministic.
- **CURRENT REPOSITORY EVIDENCE:** MatchStatLog has games, starts, seconds,
  stats, team, competition, date. Competition authorities are bounded.
  `CONDITIONAL` schedule is only a remainder, not a trigger.
- **OPTION A:** Each term carries explicit window and threshold aggregation;
  consequences use explicit Finance and Salary adapters.
- **OPTION B:** Restrict first version to one season and one-time cash.
- **OPTION C:** Configure all semantics by competition.
- **RECOMMENDATION:** B for first delivery, then typed explicit extensions;
  defer an incentive if its source or accounting rule is unsupported.
- **IMPACT:** Blocks bonus/effect implementation. Awards remain deferred until
  canonical awards authority exists.

### 10. Trade kicker accounting

- **QUESTION:** Does a kicker change cash salary, cap hit, or both, and how is
  it calculated/capped/recognized after a qualifying trade?
- **WHY IT MATTERS:** Affects contract obligation, trade matching, payroll,
  club cash, and recipient/retaining team.
- **CURRENT REPOSITORY EVIDENCE:** Trade preserves contract terms; Salary Engine
  owns cap matching, retained salary is separate; Finance has no kicker
  producer. Event category names do not create behavior.
- **OPTION A:** One-time cash only, independent cap treatment.
- **OPTION B:** Cash plus cap amount under competition rule.
- **OPTION C:** Competition-specific typed formula/limits.
- **RECOMMENDATION:** C, after an explicit rule/accounting spec; no generic
  formula now.
- **IMPACT:** Blocks kicker clause and trade validation tests.

### 11. Agent-fee payer settlement

- **QUESTION:** Beyond existing club-paid signing fees, should player-paid and
  split fees be supported, and what authority/ledger records settle them?
- **WHY IT MATTERS:** Finance V2 is organization scoped; player cash accounts
  were not found.
- **CURRENT REPOSITORY EVIDENCE:** Existing successful free-agent signing
  creates club FinancialCommitment, category `PLAYER_AGENT_FEE`, due on signing.
- **OPTION A:** Club payer only.
- **OPTION B:** Add player financial ledger first, then player payer.
- **OPTION C:** Support split only after both payer ledgers and allocation
  evidence exist.
- **RECOMMENDATION:** Preserve CLUB-only until player/split authority exists;
  represent payer explicitly so future extension is safe.
- **IMPACT:** May gate fee terms in C2; player/split settlement is deferred.

### 12. No-trade waiver and consent authority

- **QUESTION:** Who holds/waives no-trade protection; who gives trade consent;
  can an agent act for the player; what is the deadline/default; is additional
  Governance approval required?
- **WHY IT MATTERS:** Trade Engine must know whether exact proposal execution is
  blocked, and whose affirmative decision is legally sufficient.
- **CURRENT REPOSITORY EVIDENCE:** Trade executes movement and preserves
  contracts; no clause/consent path. Governance and trade responsibilities are
  separate.
- **OPTION A:** Player-only explicit consent/waiver tied to proposal revision.
- **OPTION B:** Player or authorized agent under canonical representation.
- **OPTION C:** Competition-specific consent rules.
- **RECOMMENDATION:** B only with explicit representation authority and exact
  proposal revision binding; pending consent blocks execution.
- **IMPACT:** Blocks clause/trade integration. Does not change current trades.

### 13. Buyout and release-clause terms

- **QUESTION:** Which party can invoke each right, what trigger/payment applies,
  and how do cap, guarantee, cash, and roster effects resolve?
- **WHY IT MATTERS:** Existing release is unilateral and immediate; buyout and
  release clause create different negotiated/contractual effects.
- **CURRENT REPOSITORY EVIDENCE:** Contract termination reason is `released`;
  Finance event strings include `CONTRACT_BUYOUT_DUE`, with no contract-term
  producer. Dead money is separate.
- **OPTION A:** Buyout requires mutual agreement; release clause is a holder's
  unilateral typed right.
- **OPTION B:** Competition rules define permissible holders and settlement.
- **OPTION C:** Defer both until all financial consequences are specified.
- **RECOMMENDATION:** B, implemented only for supported rules; preserve current
  release behavior.
- **IMPACT:** Blocks buyout/release clause execution and termination accounting.

### 14. RolePromise observation and breach thresholds

- **QUESTION:** What observation window and threshold determine fulfilled,
  at-risk, and breached, and which observable role evidence has priority?
- **WHY IT MATTERS:** Existing status labels lack a transition engine; false
  breach can affect player trust and future negotiation.
- **CURRENT REPOSITORY EVIDENCE:** Promise is separate and created ACTIVE on
  some signings. Match logs provide starts/minutes; roster roles and rotation
  context exist. No canonical evaluator was found.
- **OPTION A:** Evaluate on explicit review windows using agreed role target
  versus observed starts/minutes.
- **OPTION B:** Keep status ACTIVE until manually reviewed.
- **OPTION C:** Competition/contract-specific threshold configuration.
- **RECOMMENDATION:** A with transparent evidence and no automatic termination;
  approve thresholds before transition behavior.
- **IMPACT:** Blocks automatic consequence/evaluator. Basic promise display can
  be built without breach inference.

### 15. Player preference weights and information

- **QUESTION:** Which canonical inputs and weights determine player/agent
  retention preferences, and what information may actors observe?
- **WHY IT MATTERS:** Determines acceptance/counter behavior, determinism,
  fairness, and the boundary between market truth and club knowledge.
- **CURRENT REPOSITORY EVIDENCE:** MarketKnowledge is club-scoped; MarketReality
  and player truth are separate. Free-agent response has a specialized hidden
  willingness path. Agent abilities/personality are canonical.
- **OPTION A:** Explainable deterministic weighted factors with injected
  context/knowledge.
- **OPTION B:** Rule-authored preferences with narrow hand-tuned weights.
- **OPTION C:** User-only negotiation until AI response is approved.
- **RECOMMENDATION:** C for initial C2 unless an approved actor model exists;
  later use B/A with visible inputs and no hidden universal valuation.
- **IMPACT:** Gates AI response behavior and actor tests.

### 16. AI club authority

- **QUESTION:** Which staff role recommends, negotiates, approves, and executes
  AI club retention decisions, and which actions require owner/Governance?
- **WHY IT MATTERS:** Responsibility ownership is absent; conflating
  recommendation, signing, and execution would create unapproved authority.
- **CURRENT REPOSITORY EVIDENCE:** Staff V2/BS9 responsibilities include
  contract recommendation and negotiation/signing responsibilities for other
  flows; BS11B AI review-intent owner fails closed. `executePlayerContractSigning`
  is not contract-review ownership.
- **OPTION A:** Defer all AI retention to BS13 integration.
- **OPTION B:** Assign existing contract recommendation plus explicit
  negotiation/execution authority now.
- **OPTION C:** User-only C2, with later product approval for AI roles.
- **RECOMMENDATION:** A/C; do not assign authority by inference.
- **IMPACT:** AI review and negotiation are deferred; user-owned workflow may
  proceed only within confirmed responsibilities.

### 17. Governance approval and binding point

- **QUESTION:** Is approval required after accepted terms but before successor
  creation/execution; what exact subject, expiry, rejection, and revalidation
  rules apply?
- **WHY IT MATTERS:** Prevents a review intent or negotiation acceptance from
  becoming a binding contract without authorized approval.
- **CURRENT REPOSITORY EVIDENCE:** `PLAYER_CONTRACT_SIGNING` exists for
  free-agent signing; BS11B intent is nonbinding and does not require
  Governance. Current approval subject/timing is tied to signing flow.
- **OPTION A:** Reuse existing signing action after accepted terms and before
  atomic successor execution.
- **OPTION B:** Approval only for exceptions above a configured authority
  limit.
- **OPTION C:** Explicitly require both club authorization and Governance.
- **RECOMMENDATION:** A as the baseline, subject to existing governance policy;
  never create successor before approval. Specify expiry and exact predecessor
  reference.
- **IMPACT:** Blocks binding execution milestone; nonbinding negotiation may
  be modeled separately.

### 18. Competition-specific contract limits

- **QUESTION:** Which `SalaryRules` contract length/compensation rules apply to
  extension, renewal, options, and incentives when the effective date crosses
  seasons or competition tiers?
- **WHY IT MATTERS:** A successor may be negotiated under one season's rules
  but activate under another's.
- **CURRENT REPOSITORY EVIDENCE:** Salary rules are season scoped, and world
  ecosystems can move teams across linked tiers. No retention rule exists.
- **OPTION A:** Apply rules at negotiation date.
- **OPTION B:** Apply rules at effective season/date.
- **OPTION C:** Validate both; reject if either disallows the terms.
- **RECOMMENDATION:** C for legality, with explicit effective-date authority
  for salary/cap treatment; confirm product policy.
- **IMPACT:** Must be answered before successor legality is finalized.

## Deferred or not product questions

- Awards incentives wait for a canonical awards authority.
- Unsupported continental/international qualification triggers wait for a
  canonical configured competition output.
- Arbitrary scripting is excluded by approved product rule.
- No question permits retroactive mutation of historical contract terms.
