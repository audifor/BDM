# BS10E-A · Trade Canon Package

## Canonical concepts

| Concern | Canonical source | Meaning |
| --- | --- | --- |
| Proposed command | `TradeProposal` | Ephemeral request to validate/execute an exchange; not persisted negotiation state |
| Executed trade | `TradeRecord` | Immutable completed-trade history |
| Asset ownership | world rosters and pick/right collections | Current ownership facts used by validation |
| Trade rules | `TradeRules` by `SeasonId` and `EcosystemId` | Asset, participant, horizon, retention, cash, and exception limits |
| Salary rules | `SalaryRules` by season | Salary matching assessment when present |
| Club market information | `MarketKnowledge` by organization and player | Informed availability/willingness observations |
| Club basketball knowledge | `OrganizationKnowledge` by organization and player | Sparse, organization-scoped rating evidence |
| Club plan | current BS9 plan and need evidence | Why a target is pursued and which own players may be reviewed |
| Package view | `TradePackageIntelligence` | Derived read-only candidate; never a command or persistence record |

`TradeProposal` remains multi-team and multi-asset. `TradePackageIntelligence` currently derives a narrower 1:1 player view because that is the direct package evidence available from the current selected incoming plan plus outgoing need. It does not reduce or replace canonical trade capability.

## Ecosystem and route support

| Current world route | Trade support in generated defaults | Classification |
| --- | --- | --- |
| NBA-like season with matching trade rules | Yes | Trade candidate can be assessed against configured season rules |
| FIBA-like generated season | No generated trade rules | `UNSUPPORTED` for the current generated setup |
| NCAA-like generated season | No generated trade rules | `UNSUPPORTED` for the current generated setup |
| Cross-ecosystem contracted player acquisition | No player transfer/fee model | `TRANSFER_ROUTE_REQUIRED` / unsupported in trade |
| Free-agent signing | Separate offer and signing workflow | Not a trade |

The general `TradeRules` structure is ecosystem-keyed and is not intrinsically NBA-exclusive. Only NBA-like defaults currently receive generated rules; this audit does not generalize NBA salary rules to other competitions.

## Package identity

- `pursuitId` identifies the initiating club's selected acquisition plan/need, target player, and counterparty club.
- `packageId` identifies the specific ecosystem, season, clubs, and outgoing/incoming asset composition.
- Replacing the outgoing asset changes `packageId` while preserving the pursuit identity.

## Read-only assessment contract

`assessTradePackageIntelligence(world, teamId)` returns a deterministic projection and does not mutate or persist the world. It considers only supported trade enquiries with a current, shared active season and matching trade rules. Outgoing choices must be listed in a currently selected outgoing review need and have an active contract under the initiating club. An ephemeral `TradeProposal` is passed to `validateTrade` to reuse canonical asset and salary legality checks; it is not included in the result.

The response presents separate checks for ecosystem support, roster ownership, active contract presence, salary cap, trade window, and asset eligibility. Salary is `NOT_ASSESSED` when season salary rules are absent. The trade window is always `NOT_ASSESSED` because no deadline/eligibility rule currently exists. Seller availability and willingness stay unknown unless the initiating club has an observation. Rating knowledge is summarized separately for each participant using only that club's organization-scoped knowledge.

## Explicit unknowns

- Trade economic value/fairness: `UNKNOWN`.
- Trade negotiation authority: `UNKNOWN`.
- Governance execution authority: `UNKNOWN`.
- Trade deadline/window legality: `NOT_ASSESSED`.
- Active contract change after an executed trade: unresolved; current engine leaves it unchanged.
- Candidate acceptance: not assessed by a single club's market observation.

Hard failures return `BLOCKED`. Otherwise the candidate is `MORE_INFORMATION_REQUIRED` while authority, negotiation, window, and contract-affiliation semantics remain unresolved. Neither status is execution authorization.

## Workflow reachability and findings

The current Trade Center lets the user construct proposals from rule-permitted assets and teams, then directly executes the proposal after validation. Its “Propose trade” action does not create a negotiation or wait for counterparty acceptance. The Advisory Center can also accept a staff trade recommendation and immediately execute it. Staff recommendations are advisory until the user accepts them, but acceptance is execution today.

- **P0:** direct Trade Center execution and accepted staff recommendation bypass a negotiation/acceptance stage and trade-specific Governance. Engine validation still runs, but authority is not established by that validation.
- **P1:** the default user club is in a FIBA-like current season without generated trade rules, so the current Trade Center path is unavailable in the starter world. Season-keyed trade rules also have no rollover setup.
- **P1:** trade execution moves roster membership but preserves the original contract `teamId`; contract affiliation can diverge from roster ownership.
- **P1:** no canonical deadline/window, consent/no-trade restrictions, trade responsibility for negotiation/execution, trade Governance decision, or economic package valuation exists.

The next negotiation milestone should establish trade-specific interaction and authority states only after the product decisions above are approved. It should not turn staff recommendation or a GM title into authority by implication. Transfer fees/buyouts remain a separate future route.

## Prohibited in this projection

The package service does not call `executeTrade`, save offers or proposals, generate counteroffers, use hidden `MarketReality`, read another club's `OrganizationKnowledge` as if it were the user's knowledge, use synthetic valuation priors as prices, mutate roster or salary state, or imply trade approval from a staff/GM title.
