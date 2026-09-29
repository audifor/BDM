# BS10C Acquisition Proposal Intelligence Audit

Audited the reviewed BS10B base (`443b4f1`) before implementation. BS10B returns read-only candidates with feasibility, route support, club-known salary/availability/interest evidence, legacy payroll affordability where applicable, and explicit UNKNOWN / NOT_ASSESSED values.

## 1. Existing proposal authorities

There is no general persisted incoming acquisition proposal model. The existing `DelegationOutcome` stores Basketball Operations recommendations as scalar payloads and records whether an advisory outcome was applied; it is not a derived BS10A/BS10B proposal view. Investment/Finance proposals are separate domains and do not authorize a player acquisition.

## 2. Existing free-agent negotiation authority

`MarketEngine.openNegotiation` creates and persists a `ContractNegotiation` with concrete salary, years, role, and agent fee. It is an action seam and BS10C must not call it. `MarketService.signFreeAgent` creates a contract and transaction. Its `getFreeAgentMarketTerms` uses hidden Player ratings and cannot be used to fill a proposal salary or term.

## 3. Existing trade-proposal authority

`TradeProposal` is an input shape to `TradeEngine.validateTrade` and `executeTrade`; it is not a persisted proposal database. Trade records are written on execution. `acceptTradeRecommendation` reconstructs the recommendation payload and executes the trade after revalidation. BS10C must not call either execution seam or create a fake `TradeProposal` just to run validation.

## 4. Existing outgoing-asset selection logic

`BasketballOperationsAdvisory.expendableOwnRoster` orders own active-contract players by positional need and organization valuation. `tradeRecommendation` pairs the first legal outgoing player with each ranked incoming target. This is a separate advisory workflow and would construct an outgoing package; BS10C does not reuse it or name outgoing assets.

## 5. Valuation and fairness authorities

`deriveOrganizationPlayerValuation` is an organization-knowledge-aware priority projection, but unknown dimensions receive deterministic synthetic numeric priors. The trade advisory uses that numeric ordering and `validateTrade` for legality; neither establishes organization-relative fair value or package fairness. BS10B already found no canonical perceived economic value. BS10C will keep trade value UNKNOWN and packages NOT_CONSTRUCTED.

## 6. Salary and term authorities

Club-scoped `MarketKnowledge.expectedSalary` and `expectedYears` are optional observations with source, confidence, and date. They can be carried as expectations, not as an offer. BS10B exposes expected salary but not expected years; BS10C may read the selected organization's existing `expectedYears` signal only to preserve its provenance. The selected contract term remains NOT_SELECTED. `getFreeAgentMarketTerms` is a hidden-rating-based action/bootstrap authority and is excluded.

## 7. Governance and action boundaries

`GovernanceOptionPolicy` maps only supported response families; `EXTERNAL_ACQUISITION` has no mapped concrete signing/trade Governance decision and its authority is UNKNOWN. Broad GM plan execution readiness is not concrete transaction authority. `openNegotiation`, `signFreeAgent`, and `executeTrade` are mutation seams. A proposal view will report `AUTHORITY_UNKNOWN` without opening a request or invoking an action.

## 8. Persistence authorities

Negotiations, contracts, player transactions, executed trade history, and advisory `DelegationOutcome` records have their own persistent authorities. BS10C adds no persistence model: its proposal IDs are deterministic derived identifiers, not stored entity IDs.

## 9. Hidden-truth risks

`getFreeAgentMarketTerms` reads true Player ratings to estimate salary and years. `MarketReality` contains hidden availability, salary, interest, and seller willingness. Organization valuation also produces a numeric prior for unknown ratings. The BS10C selection path must use only the already-computed BS10A/BS10B candidate and feasibility data plus club-scoped MarketKnowledge for the existing expected-years signal; it must not inspect Player ratings, personality, potential, or MarketReality.

## 10. Duplicate-proposal risks

Persisting a parallel proposal record would duplicate plans, negotiations, advisory outcomes, or executed trade records and create stale-state/idempotency problems. The proposal view will be recomputed from current plan and candidate inputs. Stable IDs are derived from team, plan, selected candidate (or no-candidate marker), and proposal type; they do not imply stored state.

## 11. Actual BS10C gap

The current pipeline stops at several ranked BS10B candidates. It does not select one current preferred exact player, carry that player's known facts into a proposal/intention, expose limited alternatives, or explain no-action cases. BS10C adds that pure derived layer. Free agents become non-executing approach intentions; supported trade routes become enquiries with no package; unsupported transfers remain no-action results.

## Authority and responsibility conclusion

For a current incoming-market route, workflow metadata identifies `BS10_MARKET_INTELLIGENCE` as the responsible system. It does not identify an execution actor for contacting a player or club; a staff role may own separate signing/trade advisory responsibilities, but that is not transaction authority. BS10C will preserve the current workflow readiness, report responsible system where available, and leave concrete role/transaction authority UNKNOWN.
