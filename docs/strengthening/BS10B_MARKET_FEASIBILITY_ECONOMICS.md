# BS10B Market Feasibility & Economics

BS10B answers two separate questions: whether a known candidate fits the current need (BS10A) and how approachable that candidate appears to this club through a modeled route. The feasibility assessment is derived on demand, read-only, and is not saved.

## 1. Audit findings

See [BS10B_MARKET_FEASIBILITY_ECONOMICS_AUDIT.md](./BS10B_MARKET_FEASIBILITY_ECONOMICS_AUDIT.md) for the source-by-source audit. The main boundaries are the rating-based bootstrap asking salary, the unknown-prior organization valuation, legacy player salary budget, Finance V2, club MarketKnowledge, hidden MarketReality, and package-dependent TradeEngine validation.

## 2. Route model

`MarketCandidateFeasibility` is added to the exact BS10A candidates returned for each current BS9E `MARKET_INTELLIGENCE_REQUIRED` route. It never rediscovers candidates. Route support is `SUPPORTED`, `UNSUPPORTED`, or `UNKNOWN`; the route name is reported separately from player availability and economic evidence.

## 3. Free-agent route

A candidate on the public free-agent list receives `FREE_AGENT_SIGNING` / `SUPPORTED`. Public free-agent status is distinct from any `MarketKnowledge.availability` observation, both of which are shown independently. A supported route does not by itself mean the candidate is affordable or will sign.

## 4. Contracted-player route

A contract establishes contract status and, for an active contract, current annual salary. It does not establish that the player is available, that their club will sell, or that this club can acquire them. The current contract salary is labeled as such; it is not treated as an asking salary or economic value.

## 5. Trade-route handling

For BS10A's `TRADE_CONTEXT`, BS10B checks that both teams share an active season with matching canonical trade rules. It reports `TRADE` and rule support. Full legality remains `NOT_ASSESSED`, because `TradeEngine.validateTrade` requires a concrete proposal with asset movements and BS10B must not invent a package. Trade salary matching and outgoing assets are not projected.

## 6. Transfer-route decision

BS10A's cross-ecosystem transfer context is retained as `TRANSFER`, but route support is `UNSUPPORTED` with reason `NO_CANONICAL_PLAYER_TRANSFER_OR_FEE_MODEL`. The audited ecosystem-transition code records career ecosystem transitions; it does not define a player transfer, buyout, or transfer fee. BS10B does not invent one.

## 7. OrganizationKnowledge boundary

OrganizationKnowledge remains BS10A's basketball evidence and fit authority. BS10B preserves the candidate's position, role, need, strategy, timeline, and knowledge results. It does not turn those ratings into salary, market price, or financial value.

## 8. MarketKnowledge boundary

Economic and interest signals are selected only from the acting organization's MarketKnowledge, with deterministic newest-date, confidence, source, and availability tie-breaks. Signal values retain source, confidence, and assessment date. Other organizations' knowledge is ignored.

## 9. MarketReality exclusion

`MarketReality` is never read. Changing hidden availability, salary, interest, or seller willingness with club knowledge unchanged cannot change the projection.

## 10. Salary expectation authority

Only a positive integer `MarketKnowledge.expectedSalary` is accepted as a known annual salary. The `getFreeAgentMarketTerms` salary calculation is excluded because it derives salary from true Player ratings. Missing or invalid market salary is UNKNOWN.

## 11. Perceived valuation authority

Perceived economic value is `UNKNOWN`. `deriveOrganizationPlayerValuation` returns synthetic numeric priors for unknown dimensions and is a basketball priority projection, not a defensible club-known economic price. BS10B does not present it as value.

## 12. Player interest

Player interest is present only when the acting club has a `MarketKnowledge.playerInterest` signal. Its value is shown with signal source, confidence, and date; missing interest stays UNKNOWN and a signal is not a promise.

## 13. Seller interest

Seller willingness follows the same rule using `MarketKnowledge.sellerWillingness`. Contract status, free-agent status, personality, and hidden world truth do not fill a missing seller signal.

## 14. Affordability authority

For the free-agent signing route only, a known expected salary is checked through `canTeamAffordAdditionalSalary`. The result means the amount fits the current legacy player payroll budget under that API. No candidate salary means affordability UNKNOWN. Trade-route affordability is NOT_APPLICABLE here because its salary matching is package-dependent.

## 15. Finance V2 boundary

The assessment carries the current BS9 need's Finance V2 posture as context. It remains separate from free-agent payroll affordability. BS10B does not combine cash health and legacy player salary budget into one score.

## 16. Trade legality

Rule presence supports a possible trade route only. Asset ownership, outgoing/incoming salaries, exceptions, retained salary, roster rules, and final package legality require a proposal and remain unassessed. No `validateTrade` call or trade execution occurs.

## 17. Feasibility model

Each candidate includes route, route support, public/market availability, expected salary evidence, affordability, current contract salary when active, player/seller signals, perceived value, package-legality status, Finance V2 context, blockers, and an approachability band. These components remain independently inspectable. Temporary-cover versus structural scope stays on the need and BS10A timeline-fit context; it can inform later judgment but does not select a contract term or alter market facts.

## 18. Ordering

Feasibility ordering is deterministic and lexicographic: approachability band (`HIGH`, `MEDIUM`, `UNKNOWN`, `LOW`, `BLOCKED`), route support (`SUPPORTED`, `UNKNOWN`, `UNSUPPORTED`), existing BS10A need-fit band, then stable PlayerId. No one-number score replaces basketball fit.

## 19. Blockers

Only an unsupported modeled route and a known free-agent salary above the current legacy player budget become blockers. A signal such as `NOT_FOR_SALE` is preserved as market evidence and is not elevated to absolute legal certainty. Unknown route or salary is never converted to a low band.

## 20. UNKNOWN semantics

Missing expected salary, player interest, seller willingness, perceived value, or route facts stay missing/UNKNOWN. In particular, unknown salary is neither cheap nor affordable, and unknown market availability is not a negative signal.

## 21. AI and user perspectives

The application service uses the existing routed assessment and strategy context. AI clubs use their own OrganizationKnowledge and MarketKnowledge. The user view retains BS10A's explicit analytics perspective while market signals remain club-scoped. Strategy and Finance V2 context can inform judgment but do not change route, salary, willingness, or affordability facts. Neither view reads hidden market truth.

## 22. BS10A integration

BS10A remains responsible for candidate discovery and fit. `assessRoutedMarketCandidateFeasibility` first obtains current routed BS10A results, then decorates those same candidate IDs with feasibility. No discovery or fit formulas were moved into BS10B.

## 23. UI

The Analysis market-candidate section now displays approachability, route support, expected salary evidence, affordability, current contract annual salary, optional interest signals, perceived-value UNKNOWN, separate Finance V2 context, and route/blocker notes. It exposes no action controls.

## 24. Persistence

Feasibility is a pure derived result and is not persisted. The service does not open negotiations, create offers or proposals, change contracts, run transactions, mutate Governance, or create Finance workflow records.

## 25. BS10C contract

BS10C can consume the candidate ID, existing BS10A need-fit evidence, route support, club-known salary and willingness signals with provenance, payroll affordability where applicable, current contract salary, and explicit UNKNOWN/NOT_ASSESSED fields. It must still build and validate any concrete proposal through its canonical action authority.

## 26. P0/P1 findings

- **P0:** none found or introduced.
- **P1:** salary-based affordability remains tied to the legacy team budget while Finance V2 describes broader organizational health. The split is surfaced, not resolved. No canonical transfer fee/action model exists, so transfers remain unsupported. Perceived economic value remains unknown until a defensible club-known valuation authority exists.

## Verification

Focused tests cover hidden-rating and MarketReality isolation, legitimate and missing MarketKnowledge, free-agent route and budget check, contracted-player uncertainty, trade rules without a package, unsupported transfer context, deterministic output, BS10A candidate-ID retention, and unchanged negotiation/transaction/Governance state. No full test suite or long-horizon simulation was run.
