# BS10 Market Closure Audit

**Reviewed baseline:** `6f7c80e8d6a26202ce8b0c1d00704b036eb358d6`

**Closure branch:** `bdm-stage2-bs10-market-closure`
**Scope:** BS10A, BS10B, BS10C, BS10D-A through I, and BS10E-A through D. This audit verifies their joined market lifecycle; it does not add market mechanics.

## Reviewed record and decision

The milestone documents and their audits are archived under `docs/strengthening/reviewed/`. Their historical findings remain unchanged. The current closure audit compared those decisions with production callers, the live UI and store commands, domain validation, Save layering, and the focused tests listed below.

**Decision: BS10 PASS.** Free-agent and trade acquisitions each have one canonical ordinary execution boundary. No ordinary UI, staff-recommendation, or legacy-market caller reaches the low-level mutation directly. Bilateral trade execution is bound to one exact agreed revision and completes as one world update. Current supported Save V4 preserves both canonical terminal states. Remaining gaps are recorded as P1 or deferred scope below; none corrupts current market world truth or defeats its authority boundary.

## Canonical free-agent flow

The ordinary acquisition path is:

`need / plan → BS10A candidate → BS10B feasibility → BS10C preferred proposal → contact → response → formal offer → counter / acceptance → PLAYER_CONTRACT_SIGNING → atomic signing → planning review`

- The Market workspace uses Application/store commands for contact, prepared offers, counter responses, and signing. A manually selected user target is re-derived through current routed feasibility and proposal identity; contact records USER responsibility and has no salary, term, role, or fee.
- Contact and offer submission do not create contracts, player transactions, or Governance decisions. Offer terms come from the prepared, club-known proposal. Optional role and fee remain absent unless negotiated; the signing service uses the exact accepted salary, years, role and fee and does not recalculate them.
- `completeAcceptedFreeAgentSigning` accepts only the exact current ACCEPTED negotiation and proposal, rechecks player availability, payroll, operational execution ownership, and `PLAYER_CONTRACT_SIGNING` Governance, and returns the original world on a precondition failure. Completion binds one contract, roster addition, signed negotiation, transaction, any explicitly agreed role/fee effect, Governance EXECUTED event, and planning review.
- User actions are USER-controlled. AI signing runs only for eligible AI negotiations and requires current delegated signing execution responsibility as well as Governance approval. An offer owner or staff title alone does not grant signing execution authority.

## Direct free-agent signing and world repair

The production search found one direct `signFreeAgent` caller: `maintainAiTeamMinimumRosters`, invoked at the world-repair lifecycle boundary. No Market UI, AI acquisition checkpoint, GM workflow, or ordinary store action calls it.

The repair helper requires `WORLD_REPAIR`, orders candidates deterministically, skips the user team, does nothing for rosters already at five, and signs only until the five-player floor is restored. Each resulting transaction carries `WORLD_REPAIR` provenance. Repair does not manufacture players and is intentionally separate from ordinary Market governance. Focused tests prove user exclusion, exact minimum, provenance, and idempotent repetition.

## Canonical trade flow and production callers

The ordinary trade path is:

`need / plan → target and outgoing rationale → package intelligence → proposal → counter / reject / accept → AGREED exact revision → per-team PLAYER_TRADE_COMMITMENT → per-team executePlayerTrade responsibility → live revalidation → TradeEngine execution → EXECUTED → planning review`

| Production seam | Production caller / disposition |
|---|---|
| `executeTrade` / `TradeEngine.execute` | `TradeGovernanceExecutionService.completeAgreedTrade` only. It reconstructs the exact stored package and is reached after bilateral readiness and approved Governance. Engine tests are not product callers. |
| `completeAgreedTrade` | Final authorized Governance event in `TradeGovernanceExecutionService`; exact `negotiationId` and `expectedRevisionId` are mandatory. Exact EXECUTED retry returns the unchanged world. |
| `proposeTradeNegotiation`, `respondToTradeNegotiation` | Trade Center / TradesWorkspace user commands and their canonical Application service. They persist proposal, response, counter, and agreement state only; they do not move assets. |
| `acceptTradeRecommendation` | Staff recommendation Application dispatch reaches a legacy handler that returns `negotiationRequired` with no world change. It cannot commit a trade or create an alternate execution route. |
| Legacy trade store actions | No direct execution action or low-level engine import found. The store exposes only proposal/response and commitment commands. |
| `openNegotiation` | `FreeAgentOfferSubmissionService` only; it advances an exact canonical contact to a nonbinding offer. |
| `createNegotiationContact` | `FreeAgentContactService` only; the Engine mutation is behind live routed Application validation. |
| `completeAcceptedFreeAgentSigning` | User store command, authorized signing Governance service, and the delegated AI signing checkpoint. It is the only ordinary signing completion path. |

Trade Center and TradesWorkspace contain no direct execution call. Accepting staff advice is not execution: the advice is not marked accepted and its world stays unchanged until the separate trade negotiation flow is used.

Each participant independently authorizes negotiation using USER identity or that team's delegated `negotiatePlayerTrade` responsibility. Each independently satisfies Governance for the exact revision and has an `executePlayerTrade` owner. The decision subject includes negotiation, revision, and team identity; a changed revision gets distinct decision identity. Team A cannot create, approve, or execute Team B's commitment.

Before binding execution, the service rechecks current revision, participants, season/ecosystem, trade window, asset ownership and eligibility, contracts, salary rules, retention, exceptions, and Governance readiness. It calls `TradeEngine` once and publishes one complete result. Agreement alone is nonbinding.

## Contract, roster, history, atomicity, and retry behavior

- Free-agent signing creates one new contract for the signing team, one matching roster membership, one `signedFreeAgent` transaction, and one signed negotiation. The signing service detects orphaned preexisting effects and refuses to duplicate them.
- A player trade preserves the same `ContractId` and contract terms while changing `contract.teamId` with roster membership. Retained salary is a separate sourced obligation. Each moved player receives one `traded` transaction linked to the single package `TradeRecord` through `sourceTradeId`.
- GameWorld validates completed trade effects against negotiation, revision, decision evidence, record, transactions, contracts, rosters, picks, rights, retention, and exceptions. Trade failure returns the original world; the application publishes asset effects only after complete engine validation. Governance EXECUTED events are committed in that same successful final update.
- Exact SIGNED and EXECUTED retries are no-ops. Deterministic IDs and completion guards prevent duplicate contracts, transactions, TradeRecords, RolePromises, fee commitments, retention, exceptions, or Governance execution.
- Material roster changes trigger `reviewClubManagementPlanning` after the complete market mutation.

## Knowledge and valuation boundaries

BS10 candidate, feasibility, proposal, and package intelligence read the acting club's `OrganizationKnowledge`, that club's `MarketKnowledge`, public facts, and its own roster/contracts/internal facts. They do not use a counterparty's private knowledge, hidden external player ratings, or `MarketReality` as club decision truth. Missing evidence remains missing/UNKNOWN. Free-agent salary/term bootstrap from hidden ratings is excluded from ordinary proposals and signing.

The reviewed player/agent response engine may consult hidden `MarketReality` to produce the external response; that boundary remains unchanged. It does not feed club evaluation. `deriveOrganizationPlayerValuation` remains basketball-priority intelligence (including its documented deterministic prior when a knowledge dimension is unknown); BS10 does not turn that priority into economic value, trade price, fairness, or acceptance probability. The legacy staff trade advisory may rank a basketball recommendation, but package intelligence still reports economic value UNKNOWN and the advisory acceptance path cannot bind a trade.

## Governance, responsibility, UI and breakpoints

Operational responsibility and institutional authority are separate checks. Free agency uses `initiateNegotiationContact`, `submitPlayerContractOffer`, and `executePlayerContractSigning`; trades use `negotiatePlayerTrade` and `executePlayerTrade`. These do not imply `PLAYER_CONTRACT_SIGNING` or `PLAYER_TRADE_COMMITMENT`. Governance requires mapped decision rights, active appointments, approval evidence, and a real execution right. Titles do not grant rights.

The Market workspace exposes candidate/readiness, contact and response, offer and counter, accepted terms, signing Governance, and final signing status. The Trade Center / TradesWorkspace exposes package validation, proposal and revision history, nonbinding agreement, per-side commitment status, and execution result. Neither exposes hidden MarketReality. Product surfaces route mutations through the canonical store/Application services.

Incoming live trade proposals/counters with a ready user response are `ACTION_REQUIRED`; already answered, proposer-owned, or non-ready items do not create a dead-end breakpoint. One P1 mismatch remains for free agency: `COUNTERED` and `ACCEPTED` negotiations have real Market actions but are still reported as nonblocking `IMPORTANT`, based on the earlier pre-signing-UI design. The Market workspace now supports counter decisions and signing Governance, so breakpoint severity should be reconciled in a dedicated game-loop/observability follow-up. This does not block access to the Market action or permit unsafe advancement effects.

## Persistence investigation

The app's `saveCurrentGame` writes and validates Save V4; `loadSavedGame` reads V4 and supported earlier layers. Save V4 wraps the Save V3 staff/market runtime that carries Governance decisions and events. The new focused closure assertions round-trip signed free-agent negotiation, contract, and transaction through V4, and executed trade negotiation, linked Governance decisions/events, and TradeRecord through V4.

Legacy market payloads default missing negotiations and trade negotiations to empty collections. Save V2 can represent ordinary/legacy negotiations but does not carry the Governance runtime required to faithfully represent signed or executed terminal evidence; its serializer explicitly rejects those terminal states unless Save V3 is constructing its compatibility projection. Save V3/V4 preserve the terminal links and Governance evidence. This is an expected legacy-layer limitation, not a current-save compatibility bug or a schema-version mismatch. No historical save rewrite is warranted.

## Lifecycle and supported routes

Trade execution requires configured current-season rules and an OPEN configured window. Missing rules/window fail closed; no real-world deadline is synthesized. Successor season rules roll forward only when reviewed same-competition/ecosystem rules exist, using the existing season lifecycle path. Trade support remains ecosystem/rules-specific: configured professional/NBA-like contexts can trade; default FIBA-like and NCAA support may be absent. Draft, recruiting, and free-agent lifecycle remain separate; trade window support does not alter free-agent availability or negotiation timing.

Cash consideration returns `CASH_SETTLEMENT_UNAVAILABLE` before any package effect; no non-cash subset is applied. Cross-ecosystem contracted acquisition remains `TRANSFER_ROUTE_REQUIRED`, not a trade, and there is no identified canonical transfer/buyout milestone owner in the reviewed roadmap. These are explicit deferred scopes.

No BS10 trade path adds `tradeValue`, `fairnessScore`, or `acceptanceProbability`. `deriveOrganizationPlayerValuation` is not an economic model. Universal economic fairness and richer autonomous counterparty policy remain deferred.

## AI and generated-world configuration

AI free-agent acquisition can proceed through the canonical routed contact/offer/response path only when actual delegated market responsibilities exist, and signing also needs valid professional Governance configuration and approval. The application does not invent delegation, appointments, rights, or board approval. Generic autonomous Governance approval is deferred to BS18 Governance Gameplay.

Generated worlds may have no professional club Governance configuration or delegated market operators; default user clubs may initially have no available free agents; default FIBA/NCAA trade support may be absent. These are respectively Governance Gameplay, world/data setup, and competition/rule configuration gaps. They are not grounds to synthesize authority or to declare the canonical application/domain lifecycle broken. No universal autonomous AI trade fairness/counter policy exists; this is deliberate deferred behavior.

## Focused closure validation

The focused closure set reuses the existing canonical seam tests rather than duplicating the full milestone suites. It covers selected feasible user targets and USER contact, term-free contact and offer, nonbinding proposals/agreement, exact accepted signing, bilateral trade commitments and execution, staff recommendation rejection, direct-sign repair isolation, contract/roster integrity, Save V2/V3 compatibility, planning review, UI presentation, and breakpoint behavior.

Command:

```text
npm test -- src/app/marketIntelligence/FreeAgentContactService.test.ts src/app/marketIntelligence/FreeAgentOfferSubmissionService.test.ts src/app/marketIntelligence/NegotiationCounterResponseService.test.ts src/app/marketIntelligence/FreeAgentSigningService.test.ts src/app/marketIntelligence/TradePackageIntelligenceService.test.ts src/app/trades/TradeNegotiationService.test.ts src/app/trades/TradeGovernanceExecutionService.test.ts src/engine/market/RosterContractIntegrity.test.ts src/app/market/AiRosterMaintenance.test.ts src/app/staffRecommendations/StaffRecommendationService.test.ts src/save/GameWorldSaveV2.test.ts src/save/GameWorldSaveV3.test.ts src/app/gmPlanning/GMPlanningLifecycleService.test.ts src/app/game/SimulationBreakpoints.test.ts src/ui/trades/TradePresentation.test.ts
```

Result: **13 focused files, 149 tests passed.** The two edited canonical terminal-state tests were rerun after adding Save V4 round-trips: **2 files, 17 tests passed.** `npm run typecheck` passed on the pre-documentation tree and is rerun for closure. No UI source changed, so no build was required. No full suite or long-horizon simulation was run.

## Findings

| Priority | Finding | Classification |
|---|---|---|
| P0 | None. No ordinary execution bypass, authority collapse, partial market mutation, roster/contract mismatch, or current Save loss was found. | Closed for BS10. |
| P1 | Free-agent counter/accepted-deal breakpoint severity is still IMPORTANT although Market actions exist. | Game-loop / breakpoint follow-up; canonical action remains reachable. |
| P1 | Professional Governance and delegated operators are absent in generated defaults; available free agents and trade support vary by world/ecosystem. | BS18 Governance Gameplay and world/data/rule setup. Do not synthesize authority here. |
| Deferred | Cash settlement, transfer/buyout, universal trade fairness, generic autonomous Governance approvals, autonomous AI counterparty policy. | Explicit product/system scope; no hidden partial implementation. |

The final closure summary is [BS10 Market Closure](BS10_MARKET_CLOSURE.md).
