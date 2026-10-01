# BS11C2 · Retention Negotiation

## Status

**BS11C2 PASS** after focused validation. The implementation was committed locally after the focused tests, typecheck, build, and diff checks passed. No merge or push was performed.

## 1. Phase 0 reuse check

Reviewed the Master Capability Reuse Registry, Contract Deep Audit, Reuse First directive, BS11A reviewed documentation, BS11B PASS, BS11C0 PASS, BS11C1 product canon and decision register, and the BS11C implementation plan. Existing `PlayerContract`, roster-integrity assessment, competition rules, SalaryRules, BS10 market negotiation, Save V4, and SimulationBreakpoints remain authoritative. No second roster-integrity query, Finance path, Governance signing path, free-agent eligibility path, or breakpoint engine was added.

## 2. Reused BS10 pieces

- `NegotiationTermSet` and `NegotiationRole` provide the shared salary, years, and proposed role terms.
- `agentCounter` is reused for deterministic negotiation-hardness and fee adjustments when an actual player representation and canonical Agent record exist.
- `PlayerRepresentation` identifies the counterpart origin. The existing free-agent opening, hidden willingness, MarketReality response, signing side effects, and Finance/Governance paths are not reused.
- Retention has its own typed history because BS10 rounds carry free-agent context and side effects that are unsafe for predecessor-bound retention.

## 3. Eligibility

`assessRetentionEligibility` requires the exact active predecessor, one active contract for the player, matching team and roster, BS11C0 integrity `VALID`, user-controlled club, a participating professional competition with one unambiguous rule value, the configured date window, no continuous successor, no active retention negotiation, no active cooldown, and legal proposed years. NCAA-like ecosystems are excluded. Expired players return to the BS10 free-agent route.

## 4. Window authority

`CompetitionRules.retentionWindowDaysBeforeExpiry` is the separate rule authority. `DEFAULT_RETENTION_WINDOW_DAYS_BEFORE_EXPIRY` supplies 365 calendar days. It does not read BS11A planning horizon. Competition construction validates positive whole days. The retention engine uses `GameWorld.currentDate` and the exclusive predecessor `expiresOn`.

## 5. User authority

Application service commands check that the team is controlled by `world.userCoachId`. The Analysis / Club Strategy screen renders initiation and response controls only for that team. BS11B intent is informational; Pursue does not auto-open, and Allow Expiry, Review Release, or Defer do not open or close a negotiation.

## 6. Player/agent actor boundary

The player/agent acts only as the counterpart responding to a user offer. If canonical representation and Agent data exist, BS10's deterministic `agentCounter` may adjust a counter. No AI club retention owner or autonomous initiation is introduced.

## 7. Information boundary

Retention response reads no `MarketKnowledge`, `MarketReality`, `PlayerTruth`, or hidden ratings. Club MarketKnowledge is not shown in this panel; if surfaced in future, it must be labeled as a club estimate. Raw scores and target salary are not persisted or rendered.

## 8. Term set

Terms extend the shared BS10 shape with optional `agentFeePayer`, which is `CLUB` whenever an agent fee is present. Supported fields are annual salary, years, optional role proposal, and optional club-paid fee. Options, bonuses, clauses, guarantees, and other term families remain excluded. An offered role is a proposal; no `RolePromise` record or evaluator is created here.

## 9. Economic baseline

No canonical player/agent-owned economic demand exists in this base. The response uses the active predecessor's current-season `cashSalary`, falling back to `compensation.annualSalary`; zero or missing salary is guarded. The effective date for a future successor is predecessor `expiresOn`.

## 10. Weighted response factors

Calibration weights are centralized in `RETENTION_RESPONSE_CALIBRATION`: salary 45%, duration/security 20%, role/opportunity 15%, morale 10%, relationship 5%, and club context 5%.

## 11. Neutral fallbacks

Salary uses the canonical ratio. Duration preference by career stage, role ordering for player satisfaction, morale interpretation for negotiation, relationship-to-club preference, and club-context preference are not established in this context; these factors remain 1.00 neutral. No guessed age bracket, prestige, geography, or preference is added. This leaves those enrichments for BS11C6.

## 12. ACCEPT / COUNTER / REJECT

The primary economic bands are centralized: at least 0.95 is acceptable, 0.80 to below 0.95 is counter territory, and below 0.80 is rejection risk. A deterministic weighted score gates acceptance; counters and rejection are deterministic. The term set remains nonbinding under every response.

## 13. Counter generation

A counter is recorded in immutable round history. A later club revision appends one new round and marks the previous round with a club action. Counter terms may change only supported salary, years, role, and club-paid agent fee. The existing Agent counter helper is used only with an actual Agent; counter bounds are checked before storage.

## 14. Cooldown

Rejected and withdrawn negotiations persist `closedOn` and `reopenOn = closedOn + 3 calendar days`. Eligibility refuses the same team/player/predecessor lifecycle before `reopenOn`; the exact date is allowed. Counter and accepted outcomes do not start cooldown. Save V4 persists this evidence.

## 15. Invalidation

Submissions and counter responses revalidate the current predecessor, team, window, roster, active-contract integrity, and successor status. Daily lifecycle runs `RETENTION_NEGOTIATION_INVALIDATION` after expired-contract reconciliation. Trade, release, termination, expiry, or changed integrity makes the old negotiation non-executable and terminal as applicable; it is never retargeted.

## 16. Trade behavior

A nonbinding negotiation is not transferred with a player. Changed roster/contract context invalidates it. The future rule for a binding successor traveling with the player is reserved for BS11D Trade integration.

## 17. BS11B interaction

Review intent remains planning evidence. It does not mutate on counter/accept/reject and does not grant authority. The user may explicitly open retention when current eligibility is valid, independent of intent.

## 18. Finance boundary

No commitment, cash payment, payroll, cap hit, guarantee, dead money, retained salary, or due agent fee is created. The optional club fee is only proposed nonbinding text.

## 19. Governance boundary

No `PLAYER_CONTRACT_SIGNING` or equivalent Governance request/decision is created. Accepted terms are evidence for later BS11D authorization and revalidation.

## 20. Save

Save V4 adds optional `retentionNegotiations`; old V4 payloads default to an empty collection. Only identities, immutable rounds, supported terms, reasons, accepted terms, and close/cooldown evidence are persisted. Eligibility and response calculations are derived. V1 competition parsing preserves the additive rule when present and defaults older saves through the competition factory.

## 21. Breakpoints

The existing evaluator surfaces user-club `PLAYER_COUNTERED` and `ACCEPTED` records as `IMPORTANT`, routes them to Analysis, and allows advancement. Eligibility and open negotiations do not stop simulation. No second breakpoint engine exists. A terminal invalidation that would affect a future binding action is not itself blocking.

## 22. UI

The existing Analysis / Club Strategy contract surface shows predecessor expiry, current salary, window/eligibility, status, latest offer and response, counter, supported terms, reasons, cooldown, and accepted terms. Actions are user-club-only. Accepted terms state that they are not yet a signed contract. No hidden score or target is shown.

## 23. Focused tests

`npm ci` completed in this worktree (159 packages added). `package.json` and `package-lock.json` remained unchanged. npm reported three dependency advisories during its install summary; no audit or dependency update command was run.

The focused command was:

```text
npm test -- src/engine/contractRetention/ContractRetentionEngine.test.ts src/app/contractReview/ContractReviewService.test.ts src/engine/market/RosterContractIntegrity.test.ts src/engine/market/MarketEngine.test.ts src/save/GameWorldSaveV4.test.ts src/app/game/SimulationBreakpoints.test.ts src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx src/domain/competition/Competition.test.ts
```

Result: **8 test files passed; 92 tests passed, 0 failed, 0 skipped; 102.21 seconds**. The retention tests cover eligibility and status, user authority, integrity, deterministic salary bands, MarketKnowledge/MarketReality isolation, canonical Agent counter behavior, idempotency, accepted nonbinding terms, counter/revision history, release invalidation, cooldown persistence, effective-rule fail-closed behavior, and Save V4 compatibility. The other files cover BS11B, BS11C0, reused BS10 MarketEngine behavior, Save V4, breakpoints, UI, and rule authority. No full suite was run.

`npm run typecheck` passed. `npm run build` passed; Vite reported the existing large-chunk advisory. `git diff --check` passed. No unrelated suites or long simulations were run.

## 24. Findings

- **P0:** None found in the focused validation surface.
- **P1:** SalaryRules expose service-year salary bands, cap/applicable exception legality, but current player data has no canonical service-years field and BS11C2 terms do not yet contain a future cap-hit schedule. C2 checks supported contract-length rules and fails closed when effective-date rules are unavailable; exact salary legality and schedule materialization remain BS11D execution checks. Do not infer service years from age.
- **P1:** In the seeded starting world, the user club's competition season has no applicable SalaryRules entry for the proposed effective date. C2 correctly returns `EFFECTIVE_CONTRACT_RULES_UNAVAILABLE` and the UI shows the blocker; a user can progress an offer only when canonical effective-date rules exist. Do not synthesize those rules in C2.
- **P1:** Canonical deeper preference interpretation and autonomous AI club ownership remain deferred as specified.

The initial focused run exposed six test failures: the fixtures lacked effective-date SalaryRules and the breakpoint assertion assumed no unrelated pre-existing stop condition. Test fixtures were corrected to supply an explicit SalaryRules record for the response cases, with a separate fail-closed test for missing rules; breakpoint advancement is compared before and after the retention counter. Typecheck then exposed an optional BS10 counter salary type; the implementation now narrows that field before assignment. The complete focused set passed on the final rerun.

## 25. BS11C3 handoff

Options and guarantees belong to BS11C3. Also retain the specified later work: incentives to C4; clauses/consent/buyout/kicker to C5; deeper Agent, RolePromise, and player preference convergence plus AI ownership to C6 / BS13; Governance and binding successor execution, successor activation and roster continuity to BS11D; release/termination chain behavior to BS11D / BS11E; final Contract Hub to BS11F.

## 26. BS11D execution handoff

Before binding execution, BS11D must revalidate current and effective-date rules, user/Governance authority, the exact predecessor, roster integrity, active-contract uniqueness, and one-successor/no-overlap policy. It alone creates a new immutable successor whose start is the predecessor's exclusive `expiresOn`. No C2 acceptance mutates predecessor history or creates the successor, roster arrival, Finance obligation, or Governance result.
