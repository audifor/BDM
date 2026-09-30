# BS10E-A · Trade Canon, Reachability & Package Audit

## Scope and disposition

This audit traces trade assets and rules through domain models, validation, mutation, world generation, season lifecycle, knowledge, valuation, planning, staff advice, Governance, and UI entry points. It adds a read-only package intelligence projection that joins the existing need-selected acquisition and outgoing review paths. It does not persist offers, negotiate, approve, or execute trades.

The canonical command remains `TradeProposal`; the canonical completed history remains `TradeRecord`. The existing N-team, multi-asset design is preserved. The package view is deliberately a narrow one-player-for-one-player candidate generated from current planning evidence; it does not redefine the trade system or claim economic fairness.

## Current canonical trade model

`src/domain/trade/TradeModels.ts` models a proposal as a command input and a record as executed history. Participants can include multiple teams and movements can exchange players, materialized draft picks, future draft pick rights, player rights, draft pick swap rights, and cash. Proposals can also include retained salary and salary exception usage. Trade rules are scoped by both `SeasonId` and `EcosystemId`; they control participants, assets, future-pick horizon, cash, retention, and exceptions.

`src/engine/trade/TradeEngine.ts` is the central validator and executor. Validation checks rule/season/ecosystem agreement, participant membership and count, asset permission, ownership, duplicate or same-team movements, future-pick horizon, cash and retention bounds, salary exception usage, and salary matching when salary rules exist. The engine does not assess a trade deadline/window, contract consent, no-trade consent, or economic fairness. Missing salary rules make salary matching unassessed rather than establishing salary legality.

Execution changes roster membership and relevant pick/right owners, salary exceptions and retained obligations, lineups, and trade history. It does not create a player transaction of kind `trade`. It also leaves player contracts unchanged: `TradeEngine.test.ts` asserts that the contract stays intact. As a result, after a player moves, the roster can name the new team while the active contract still names the old team. `RosterContractIntegrity` does not reconcile a trade record into a contract affiliation change. This is an unresolved contract and transaction semantics decision; this milestone does not change it.

Player rights can move between ecosystems independently of the player roster and contract. This must not be mistaken for a completed player transfer. BS10B cross-ecosystem contracted candidates are marked as transfer-context/unsupported because there is no player transfer and fee model. NCAA recruiting and free-agent signing remain distinct acquisition routes.

## Reachability and defaults

The world generator gives NBA-like seasons `createNbaLikeTradeRules`, including up to four teams, all modeled asset kinds, a four-year future-pick horizon, retained salary, cash consideration, and salary exceptions. FIBA-like and NCAA-like generated seasons receive no trade rules by default. The rules type can describe another ecosystem when explicitly configured, but the generator does not provide those rules.

The starter world contains FIBA, NBA-like, and NCAA seasons, and the user's initial club is in the FIBA slice. The market trade UI obtains rules from `world.currentSeasonId`. The default current FIBA season has no trade rules, so the player's default Trade Center route is not reachable. Trade rules are keyed to a season and are not rolled forward by `src/engine/world/startNextSeason.ts`; newly advanced seasons therefore need an explicit rules lifecycle decision.

Rules contain a season window, but no trade deadline or date eligibility model. The package projection checks that the candidate and both clubs belong to a shared currently active season with matching trade rules. It reports the trade window itself as `NOT_ASSESSED`; season activity is not treated as deadline legality.

## Knowledge and value boundaries

`MarketReality` is hidden global simulation state. `MarketKnowledge` is organization-scoped information with optional availability and seller willingness, provenance, confidence, and assessment date. The new projection reads only the initiating club's observation of the incoming player's market status, and does not use hidden global availability, expected salary, or willingness.

For basketball ratings, the projection reports only known and missing dimensions found in each club's own `OrganizationKnowledge`. It never emits hidden player ratings or synthetic estimates. Unknown market availability and willingness remain unknown. This is consistent with the current Trade presentation helper's use of receiver-specific organization knowledge and `?` for unknown ratings.

`deriveOrganizationPlayerValuation` is not a trade price or fairness model. When knowledge is sparse, it fills dimensions with deterministic organization/player priors, then computes current/future value, risk, and priority. Basketball operations advice uses this valuation to rank incoming and outgoing assets. Those rankings are basketball-priority signals influenced by synthetic priors; they are not market prices or counterparty acceptance signals. This projection therefore returns economic status `UNKNOWN` and does not call that valuation helper.

## Planning, advice, and authority

BS9's `GMDecisionContextEngine` routes supported external acquisition needs through `EXTERNAL_ACQUISITION` and surplus/aging-core review needs through `OUTGOING_MARKET_REVIEW`. BS10A/B/C retain the selected plan, candidate route, and trade enquiry. BS10C stops at `TRADE_ENQUIRY`; package construction is `NOT_CONSTRUCTED`, and perceived trade value stays `UNKNOWN`.

Basketball operations' staff `tradeRecommendation` builds a simple one-player-for-one-player proposal. Its ranking uses the synthetic valuation described above. Unknown seller availability can still be treated as eligible if it is not explicitly `NOT_FOR_SALE`. Recommendation acceptance validates and executes immediately. There is no autonomous staff trade execution found, but an accepted recommendation is a direct execution path.

The responsibility registry has a `tradeRecommendation` responsibility and user-controlled defaults, but no distinct negotiation, counterparty acceptance, or final trade execution responsibility. Governance has no trade decision type or corresponding decision option mapping. A GM role or staff recommendation must not be inferred as execution authority.

## Current mutation paths and material finding

`gameStore.executeTrade` directly calls the engine. `TradeCenterScreen` labels its action “Propose trade” but calls that execution method immediately after local validation; the route has no counterparty acceptance or Governance stage. `TradesWorkspace` also calls the same direct execution path. The Advisory Center can accept a staff `TRADE` recommendation, which also immediately executes. These are live mutation paths with engine legality validation, but without an intervening trade negotiation or trade Governance authority decision.

This is a P0 product workflow gap for any future trade governance milestone. It is documented here and intentionally not changed: BS10E-A forbids trade mutation changes. The read-only service does not call these APIs and does not return an executable proposal.

## Added package intelligence contract

`src/app/marketIntelligence/TradePackageIntelligenceService.ts` joins current supported trade enquiries with current selectable, need-based outgoing reviews of type `POSITION_SURPLUS` or `AGING_CORE`. Outgoing player choices are constrained to current active contracts and the outgoing need's related players. The incoming player and counterparty come from the selected supported trade candidate. Every projection uses one outgoing player and one incoming player and validates an ephemeral proposal against `TradeEngine` rules without returning or saving it.

The result separates ecosystem support, roster ownership, active contract presence, salary assessment, trade-window assessment, and asset eligibility. It reports the reason evidence attached to the outgoing club need, recipient-specific knowledge coverage, and the initiating club's available market observation. It provides separate stable composition (`packageId`) and target/plan pursuit (`pursuitId`) identities. A change in outgoing player changes package identity without changing the pursuit identity.

The output explicitly leaves economic value and execution authority `UNKNOWN`, marks trade-window assessment `NOT_ASSESSED`, and identifies unresolved post-trade contract affiliation, negotiation authority, and trade Governance authority. Hard legality failures yield `BLOCKED`; otherwise the view remains `MORE_INFORMATION_REQUIRED` because these open gates have not been resolved. No offer, counteroffer, acceptance, approval, or execution state is persisted.

## Follow-up scope

Future milestones should decide contract team-affiliation semantics for completed trades; define trade window and deadline rules; introduce explicit counterparty negotiation and acceptance state; decide trade-specific responsibilities and Governance authority; and define any economic valuation model separately from basketball roster utility. Those are product decisions and are not silently decided by this audit.

## Focused verification

- `npm test -- src/app/marketIntelligence/TradePackageIntelligenceService.test.ts`
- `npm run typecheck`

No full test suite, long-horizon simulation, UI build, or trade mutation path was run as part of this milestone.
