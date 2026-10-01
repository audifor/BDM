# BS11F Contract Hub & Final Integration

## Result

**BS11F: PASS.** The hub is a projection and action surface over existing contract, negotiation, Governance, release, Finance, and lifecycle authorities. No new domain authority or persisted state was introduced. Focused validation passed; no full suite or long-horizon simulation was run.

## 1. Reuse audit

| Existing surface/capability | Finding and integration |
|---|---|
| Player contract view | Already showed contract details and lineage; kept as concise summary and added route to the hub for user-club players. |
| Roster | Existing canonical roster was retained; added a compact `PLAN` indicator with expiry, successor, negotiation, and intent. |
| Club Strategy / Analysis | Contained detailed retention controls and strategic planning. Detailed operations now route to Contracts / Planning; its `RetentionPanel` is reused in the hub. |
| Market / signing | Existing market governance handled free-agent signing. Retention signing continues through D1 and the existing signing Governance service; the hub invokes the existing store/application actions. |
| Governance | Existing appointment, proposal, approval and decision services remain decision authority. The hub displays the linked decision evidence and offers the existing workflow. |
| Release confirmation | BS11E `ContractReleaseService` already provided assessment and execution. Hub displays its preview and executes through the store release action after confirmation. |
| Contract review | BS11B review intent and outlook are reused. No second intent model was added. |
| History / lineage | PlayerContract predecessor and termination fields, transactions, retention execution, Governance evidence and RolePromise remain source data. |
| Finance | Existing `ContractFinancialSchedule` and amount projection are used; the hub does not calculate obligations itself. |
| Breakpoints | Existing contract review and retention signing attention are routed to `contracts`; no new breakpoint type was added. |
| Inbox/news and legacy surfaces | No separate canonical contract action surface was found that needed porting. Legacy screens remain non-authoritative. |
| Capability registry / deep audit | No BDM Master Capability Registry, Product Manifestation Map, or Contract Deep Audit file was present in this checkout. Reviewed BS11A-E artifacts were available under `docs/strengthening/reviewed/`. |

## 2. Contract Hub and information architecture

The canonical user-facing application is **Contracts / Planning**, registered in the current workspace and start menu. It has six sections: **Overview**, **Expiring**, **Negotiations**, **Signed future**, **Release / risk**, and **History**. The tables use five grouped columns (player, contract, compensation, lineage/approval, planning) rather than a wide field-per-column layout. Empty states are explicit.

The hub uses canonical state only. It does not define contract status, compensation, planning, negotiation, Governance, release, or history authority.

## 3. Current contract projection

Overview lists active user-club contracts with player/position, active or expiring label, expiry, current annual cash salary, guarantees, cap hit only when current SalaryRules and the contract treatment make cap accounting relevant, successor/signing evidence, and planning indicators. No cap number is fabricated for uncapped rules. Currency is not inferred; unprofiled amounts are labeled contract units. Guaranteed Finance exposure is read from Finance schedule amounts.

## 4. Expiring contracts and planning

Expiring filters active contracts ending by the current season end. The existing BS11B intent is visible and editable for the user-controlled club: `PURSUE_EXTENSION`, `ALLOW_EXPIRY`, `REVIEW_RELEASE`, and `DEFER`. Intent remains planning only; it does not itself create a negotiation, contract, approval, or release.

## 5. Negotiations and supported terms

The hub reuses the existing retention panel and actions for opening a negotiation, making/submitting offers, responding to counters, withdrawal, accepting counters, and requesting/recording signing decisions. Existing negotiation history, latest terms, response/counter, and cooldown are projected by that panel.

`NEGOTIATING`, `ACCEPTED IN PRINCIPLE`, and signed execution remain distinct. Accepted terms are displayed. Terms with no binding representation (currently options, incentives, clauses, and unsupported non-club agent-fee payer variants) stay visible and show the structured signing blocker. The D1 service independently rejects such terms; UI visibility is not the enforcement boundary.

No hidden player/agent willingness, score, MarketReality, target salary, or private AI decision math is rendered.

## 6. Signing and Governance

D1 remains the binding signing transition for user and AI retention agreements. It validates active predecessor and roster integrity, supported terms, salary/service-time rules, Finance, execution authority, and Governance. Retention requests create the canonical Governance decision; appointed Governance authorities approve or deny it. The hub surfaces decision identifiers from execution evidence, and the retention panel shows signing state and reasons using existing services. Approval is not synthesized by the UI.

## 7. Signed successors and contract chain

The Signed future section filters canonical scheduled contracts and labels them `Signed for future`. It shows term, compensation, predecessor relationship, signing evidence, and projected future guaranteed obligations. The predecessor?s current contract stays distinct from its scheduled successor; a future contract is not presented as currently active.

History projects existing contracts, predecessor links, termination dates, and relevant player transactions. It does not create a new event ledger. Some events that have no canonical persisted evidence cannot be reconstructed and remain a documented data limitation.

## 8. Release and Finance

Release / risk calls the BS11E assessment. It shows affected contract IDs, readable blocker/reason, and Finance consequences when available. A ready preview explains roster and linked-successor effects; execution asks for confirmation and goes through the canonical `releasePlayer` action, which revalidates and atomically applies release. Capped release remains blocked when canonical economic treatment is unavailable; the UI does not invent dead money. Buyout and mutual termination are not offered as actions.

Finance amounts come from `getContractFinancialScheduleAmounts` or the release assessment. The hub does not duplicate the Finance workspace or persist derived values.

## 9. Player, Roster, Club Strategy and breakpoint integration

- **Player:** current contract summary includes status, salary/expiry, successor, RolePromise, negotiation and termination facts where available. User-club players can open Contracts / Planning with club/player context.
- **Roster:** compact `PLAN` secondary information makes expiry, successor, negotiation, and review intent visible without widening the primary table with every contract field.
- **Club Strategy:** strategic planning remains there. Detailed retention operations route to the canonical hub, which reuses the existing panel.
- **Governance:** no duplicate approval authority or approval workflow was created.
- **Breakpoints:** contract review and retention counters/agreement attention route to Contracts. Signed retentions are omitted from outstanding-retention attention. Existing breakpoint types are reused.
- **AI visibility:** the normal interface exposes contract facts and public/user-authorized events only; the focused AI regression confirms private diagnostics are not persisted or exposed.

## 10. Actions and user-facing status language

Actions route to established store/application services: review intent, retention negotiation operations, Governance signing workflow, and release assessment/execution. UI click handlers only select the action and require release confirmation; they do not implement business rules.

Labels map canonical states to readable terms: **Active**, **Expiring**, **Negotiating**, **Accepted in principle**, **Awaiting approval**, **Signed for future**, **Released**, **Terminated**, and **Expired**. These labels do not add domain states. Unsupported binding terms and economic blockers remain visible with reasons.

## 11. Authority audit

| Concern | Single authority retained |
|---|---|
| Contract truth | `PlayerContract` in `GameWorld` |
| Retention negotiation and history | BS11C retention engine and negotiation records |
| Salary legality / cap treatment | `SalaryRules` and D0 compensation materialization |
| Binding retention execution | D1 `RetentionSigningService` |
| Governance decision | Governance decision services and appointed authority |
| Financial obligations | Finance / `ContractFinancialSchedule` |
| Release and termination consequences | BS11E `ContractReleaseService` |
| Expiry and successor activation | `ContractLifecycle` |
| Roster membership | Canonical team roster plus roster-contract integrity checks |
| Planning intent | BS11B contract review records |

No second authority was added to React, Zustand, or the hub. Zustand remains the UI/application bridge.

## 12. Focused scenarios and regression evidence

| Scenario | Evidence / result |
|---|---|
| A. Expiring ? pursue ? negotiate ? accept ? Governance ? sign ? successor | Hub test covers expiry, setting pursue, opening negotiation; D1 and Governance focused tests cover proposal, approval, scheduled successor and idempotence. **PASS across focused UI/service tests.** |
| B. Allow expiry ? no retention negotiation ? natural expiry | Existing review and `ContractLifecycle` focused coverage confirms natural expiry; intent remains nonbinding. **PASS.** |
| C. Release ? preview ? execute ? history/roster/Finance consequences | Hub test exercises preview and confirmed execution; BS11E tests cover history, roster, surviving guarantees, and Finance. **PASS.** |
| D. Scheduled successor ? activation ? continuous roster | Focused lifecycle test checks the day before, activation date, and day after. **PASS.** |
| E. Accepted unsupported term ? visible blocker ? no signing | Hub option test checks accepted option display and absence of signing control; D1 test proves unchanged world on unsupported options. **PASS.** |
| AI retention/signing continuity | AI test covers deterministic accepted counter and defers signing to D1; Governance test retries signing only on actual approval. **PASS.** |
| Boundary with no successor | Test checks day before expiry, expiry, and day after, roster removal/free-agent transition without duplicate transaction. **PASS.** |

These are focused application/service scenarios, not a full browser journey or long-horizon simulation. No production data was manufactured.

## 13. Remaining P1 inventory and deferred owners

All entries below are **SAFE DEFERRED OWNER** for BS11 closure because the core workflows fail closed or the capability is explicitly outside BS11F scope. No unapproved behavior was introduced.

| P1 | Current disposition | Deferred owner / next milestone |
|---|---|---|
| Capped release / dead money | Release returns `ECONOMIC_TREATMENT_UNAVAILABLE`; no charge is fabricated. | SalaryRules + Finance contract termination policy; require product decision before implementation. |
| Atomic trade movement of contract chains | Existing trade execution does not move linked successor chains as a new BS11F feature. | TradeEngine / trade execution milestone; define chain and roster atomicity first. |
| Option binding and exercise | Negotiable accepted options remain visible but D1 blocks signing. | Binding contract-terms/lifecycle milestone with approved exercise rules. |
| Incentive binding, evaluation and payment | Accepted incentive terms remain visible but D1 blocks signing. | Contract lifecycle + Finance, with MatchStatLog integration only after product rule approval. |
| Trade-consent binding and enforcement | Proposed consent is negotiation information, not an enforceable right. | TradeEngine consent authority and Governance/product rules milestone. |
| Buyout | No production action or implied semantics. | Contract economics/product decision, then Finance and termination owner. |
| Mutual termination | No production action or implied semantics. | Contract termination policy/product decision, then release lifecycle owner. |
| Imported player with unknown service-time baseline | Binding compensation fails closed with `SERVICE_TIME_UNKNOWN`. | Player import/service-time data authority; D0 SalaryRules consumes the canonical baseline. |
| Agent-fee variants | Club-paid fee has Finance commitment; unsupported payer variants fail closed. | Negotiation binding terms + Finance commitment policy. |
| RolePromise fulfillment/breach depth | Release records broken promise; richer fulfillment evaluation is not present. | Player-role / RolePromise lifecycle owner, integrating match/stat evidence by approved rule. |
| Finance/cap edge cases | Canonical schedules and supported cap treatment are used; unresolved cases block rather than guess. | Finance + SalaryRules; own each newly approved accounting/cap rule. |
| AI contract debug visibility | Private diagnostics remain out of normal user UI and persistent state. | Developer/debug surface owner, if a diagnostic product surface is approved. |

## 14. P0 findings and certification

**P0 findings blocking BS11 core scope: none.** Supported retention/signing/release paths preserve authority and fail closed on unsupported economics or data. No new major domain authority was required.

BS11 is complete when judged against its approved scope: current contracts and planning, retention and AI continuity, Governance-backed binding for supported terms, successor activation and roster continuity, supported release and Finance consequences, readable history, and visible blockers. Advanced mechanics in the P1 table remain explicit future work.

## Validation

- Focused tests: **14 files, 110 passed**; dedicated SystemBar breakpoint route: **1 passed, 6 skipped by test-name filter**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**. Vite emitted the existing large-chunk advisory (>500 kB); build completed.
- `git diff --check`: run at final review (see commit record / task report).
- Full suite: **not run**, per milestone policy. Long-horizon simulation: **not run**.
