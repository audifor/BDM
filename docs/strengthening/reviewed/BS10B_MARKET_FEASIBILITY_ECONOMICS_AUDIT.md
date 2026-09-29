# BS10B Market Feasibility & Economics Audit

## Scope and starting point

Audited the reviewed BS10A commit (`b675e20`) before implementing BS10B. BS10A produces a read-only, need-specific candidate list from club OrganizationKnowledge, club MarketKnowledge, and the public free-agent list. Its candidates retain the original basketball fit and do not assess financial feasibility.

## Existing authorities

1. **Salary and term:** `getFreeAgentMarketTerms` in `src/app/market/MarketService.ts` derives an asking salary from the player's true ratings through `calculateBootstrapAbilityProxy`, then adds deterministic variance and chooses a term. This is an action-path/bootstrap authority, not a club's known salary expectation. BS10B must not call it. The only club-known salary expectation is optional `MarketKnowledge.expectedSalary`.
2. **Valuation:** `deriveOrganizationPlayerValuation` in `src/domain/intelligence/OrganizationPlayerEvaluation.ts` uses club knowledge when present but its unknown prior supplies a deterministic numeric estimate. Its resulting priority is appropriate only to its existing Draft, Recruiting, and Basketball Operations contexts. It is not a known economic valuation and BS10B must report perceived economic value as UNKNOWN absent a canonical authority.
3. **Affordability:** `getTeamFinancialSnapshot` and `canTeamAffordAdditionalSalary` use current contract payroll, dead money, and the legacy team player salary budget. They can assess a credible, known annual salary only. Finance V2 `getFinancialHealthSnapshot` reports organization cash, liabilities, payroll, forecasts, and distress indicators; it does not replace or combine with the legacy salary-budget check.
4. **Trade legality:** `TradeEngine.validateTrade` validates a concrete `TradeProposal`, including active rules, participants, asset ownership, allowed assets, and salary matching. A proposal requires movements/assets. Calling it from candidate feasibility would require inventing a package; BS10B instead reports whether current season trade rules support a route and leaves package validation unassessed.
5. **Player and seller interest:** club-specific `MarketKnowledge.playerInterest` and `sellerWillingness` are optional numeric observations. There is no other club-known willingness authority for this purpose. Missing signals remain UNKNOWN; recorded values retain source, confidence, and date and are evidence rather than guarantees.
6. **MarketKnowledge vs MarketReality:** `MarketKnowledge` is scoped to an organization and populated by market signals. `MarketReality` is world state initialized by MarketEngine and must never feed club feasibility. Market queries already preserve this boundary.
7. **Hidden-truth leaks:** `getFreeAgentMarketTerms` reads true Player ratings; `deriveOrganizationPlayerValuation` returns numeric priors for unknown dimensions. Neither may supply BS10B salary or value. Personality, agent abilities, hidden MarketReality, and raw Player ratings are also excluded from feasibility.
8. **Ecosystem acquisition paths:** A public free agent has a supported free-agent signing route. Contracted candidates can have a trade route only when the target and candidate teams participate in an active season in the same ecosystem with canonical trade rules. Cross-ecosystem candidates are labeled transfer context by BS10A, but the audited ecosystem transition system handles recorded career transitions and does not define a player transfer fee, buyout, or acquisition transaction. Transfer is therefore unsupported/unknown here. NCAA roster candidates remain outside the professional market path; Recruiting and Draft remain separate.
9. **Duplicate-authority risks:** contract annual salary, market expected salary, legacy payroll budget, Finance V2 organization health, market availability, and TradeEngine salary matching are separate facts. BS10B must label them separately; current contract salary is not seller asking price, club expected salary, or trade value.
10. **Actual gap:** no read-only service combines a current BS9E `MARKET_INTELLIGENCE_REQUIRED` route and the exact BS10A candidates with route support, club-known economic signals, and affordability while preserving UNKNOWN values. BS10B adds this projection without creating an offer, negotiation, proposal, transaction, persisted record, or Governance/Finance mutation.

## Implementation boundaries

- Keep candidate discovery and need fit in BS10A; feasibility consumes those exact candidate IDs and retains their fit fields.
- Do not construct a trade package or claim full trade legality from the presence of rules.
- Use only organization-scoped MarketKnowledge for expected salary, availability, interest, and seller willingness.
- Run the legacy affordability check only when expectedSalary is known. Keep Finance V2 context separate.
- Keep perceived economic value UNKNOWN because no suitable canonical club-known value authority exists.
- Do not model a transfer route until a canonical transfer transaction and economic model exist.
