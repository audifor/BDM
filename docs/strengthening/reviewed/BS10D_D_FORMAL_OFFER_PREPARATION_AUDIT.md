# BS10D-D Formal Offer Preparation Audit

## Scope and existing handoff

BS10D-A already derives free-agent offer intelligence from the exact current BS10C proposal. It carries the organization's expected salary and term as evidence, rechecks salary affordability, reports the closest recommendation responsibility, and leaves selected years, role, opening fee, and transaction authority unknown. BS10D-D adds the missing contact-stage gate and a separate read-only preparation model; it does not mutate `ContractNegotiation`.

## 1. Salary-selection authority

The exact current BS10C `knownExpectedSalary` is organization-scoped `MarketKnowledge.expectedSalary` with source, confidence, and observation date. It is the only usable external-player salary evidence. The A-stage `preparedSalary` field is expectation evidence, not yet a selected club offer. `getFreeAgentMarketTerms` derives signing/bootstrap terms from hidden Player ratings and a seeded generator; it is excluded.

No club offer-vs-expectation policy currently exists. A transparent, knowledge-bounded preparation policy can be explicit: when the current club knows a valid positive integer expected salary, propose matching that exact expectation. The derived `salaryProposal` must remain separate from the source expectation and identify `MATCH_KNOWN_EXPECTATION` as its policy. Missing or invalid expected salary leaves the proposal unresolved. Payroll affordability is recomputed for that exact proposed amount.

## 2. Term-selection authority

The market model permits organization-scoped `MarketKnowledge.expectedYears`; BS10C carries a known value as `expectedTermYears`. BS10D-C's direct contact signal intentionally does not reveal years, so a positive response alone does not make term known. No PlayerContract policy requires a particular number of years or defines a default term. A small explicit club policy may match a current valid known expected-years signal (`MATCH_KNOWN_EXPECTED_YEARS`); otherwise selected term remains unresolved. `getFreeAgentMarketTerms` is not read.

## 3. Promised-role authority

`ContractNegotiation.role` requires `STAR | STARTER | ROTATION | DEPTH`; `PlayerContract` stores no role. `RolePromise` is a separate accepted-role lifecycle and is not an incoming-role selector. BS9 needs (`STARTER_QUALITY_GAP`, `BENCH_QUALITY_GAP`, `POSITIONAL_DEPTH`, `ROLE_GAP`, `TEMPORARY_COVER`, among others) describe club needs, and current roster/lineup data describes own-team truth, but the repository defines no contract-role mapping from those concepts to a promise for this incoming player. The existing A-stage audit correctly left role unknown. No reliable, generally valid role proposal can be selected without inventing a new product rule, so role remains unresolved.

## 4. Agent-fee authority

Representation identifies a player's agent, but `Agent`, `Agency`, `PlayerRepresentation`, and `MarketKnowledge` contain no opening-fee expectation or fee schedule. `agentCounter` adjusts fee only after an OPEN offer and uses negotiation ability; it is not an opening fee authority. The required `ContractNegotiation.agentFee` remains unresolved. The contact response does not reveal a fee.

## 5. Offer responsibility authority

`initiateNegotiationContact` owns non-binding contact only. `recommendSignings` supports user-controlled, advisory, and organizational modes and is a recommendation, not delegated financial execution. `contractRecommendation` is renewal advice; `shortlistPlayers` is candidate curation. There is no responsibility that truthfully owns submitting a player's formal offer.

The responsibility registry distinguishes action responsibilities, supports team-scoped assignment and validation, and can keep a formal-offer action separate from contact and recommendation. A distinct `submitPlayerContractOffer` responsibility is justified for later autonomous execution. It is available to roster leadership/cap-contract roles and supports explicit user-controlled or delegated modes. The normal responsibility enrichment backfills a vacant `userControlled` row; it assigns no staff holder and grants no AI delegation. AI execution requires a current, eligible delegated holder. Advisory or organizational recommendation rows are not execution owners. The user path derives its preparation owner from the explicit user-controlled team, not from AI delegation. This responsibility never substitutes for Governance approval.

## 6. Governance authority

Governance V2 lists `PLAYER_BUDGET`, `BUDGET`, and other decision types, but no player-contract offer, signing, or individual acquisition commitment. `PLAYER_BUDGET` accepts only a `BUDGET` subject scoped to a team or institution; it grants budget-domain rights, not approval of a particular player's salary/term/role/fee. No current record says individual offers are categorically Governance-free either. Offer Governance therefore remains `UNKNOWN` and no request/type is created here. Adding a contract-commitment decision type would define a new institutional rule across organizations and is not required to produce read-only preparation; BS10D-D does not silently settle it.

## 7. Payroll and Finance authority

`canTeamAffordAdditionalSalary` recomputes active payroll and dead-money obligations against the team's player salary budget. It should be rerun using the proposed offer salary, not merely the BS10B snapshot. Payroll affordability is a financial constraint, separate from execution responsibility and Governance approval. Finance V2 `HEALTHY | CONSTRAINED | STRESSED | UNKNOWN` remains context only; no canonical rule turns a constrained/stressed posture into a hard offer block.

## 8. Positive contact evidence and current-state revalidation

The current positive response is `contactResponse.outcome === 'OPEN_TO_TALKS'` on the canonical same `ContractNegotiation` record. `NOT_INTERESTED` closes the record; a stale contact closes without a response; a pending `CONTACTED` row has no positive authorization to proceed. Preparation must rederive routed current BS10C proposal/plan, match the exact team/player/organization/source proposal/action key to its contact, require the positive response, and recheck current free-agent status, market knowledge, payroll, responsibility, Governance status, and active negotiation uniqueness. A historical response cannot override a stale plan, changed candidate, new signing, or conflicting offer.

## 9. Hidden-truth risks

The preparation engine may use own-team roster/finance facts and the current BS10C club-known evidence only. It must not inspect external Player ratings, potential, personality, agent attributes as a fee proxy, `MarketReality`, or `getFreeAgentMarketTerms`. Changing hidden truth while the relevant MarketKnowledge and public candidate facts are unchanged must not change the preparation result. Salary expectation and term expectation remain distinct from the club's derived proposals, even where the explicit policy chooses to match the known value.

## 10. Action identity, offer state, and exact gap to OPEN

A3's `actionKey` and composite `openingKey` identify the existing contact attempt. A positive preparation attaches to that same deterministic negotiation ID; it creates no `OfferIntent` or second acquisition attempt. A later open must advance that exact `CONTACTED` record to `OPEN` only after all required values and authorities are revalidated.

Current `openNegotiation` structurally accepts salary, years, role, fee, optional agent, and the same action key, and stores an `OPEN` offer on the contact ID. However, it currently requires the formal-offer `responsibleActor` to match the contact's `responsibleActor`; it cannot preserve contact ownership while assigning a distinct authorized offer owner. BS10D-E must resolve that attribution boundary before mutation. The existing `agentCounter` expects the same four offer fields, so the proposed field shape is structurally compatible; this milestone does not implement counter behavior.

The exact gap to OPEN is therefore: current positive contact, current player availability and proposal, selected exact salary and term, an incoming role, opening agent fee, current payroll affordability, a valid formal-offer execution owner (or explicit user action), and a settled Governance decision. This milestone can identify which fields are known and propose bounded salary/term values, but must remain not ready while required role/fee/Governance authorities are unknown.

## Findings

- **P0:** none found in the existing read-only offer-intelligence path.
- **P1:** role selection, opening fee, and per-offer Governance policy have no current authority; these must remain explicit blockers.
- **P1:** no responsibility currently owns formal offer execution; adding `submitPlayerContractOffer` provides a distinct future AI execution boundary, but does not create a Governance grant or action.
- **P1:** `openNegotiation` requires offer actor to match contact actor, so BS10D-E must change or extend attribution before a different offer owner can execute while preserving the contact actor.
