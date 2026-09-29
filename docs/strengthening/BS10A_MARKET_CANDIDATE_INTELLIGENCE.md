# BS10A Market Candidate Intelligence

## 1. Audit findings and authority

See [BS10A_MARKET_CANDIDATE_INTELLIGENCE_AUDIT.md](./BS10A_MARKET_CANDIDATE_INTELLIGENCE_AUDIT.md). Existing Basketball Operations exact-player advisories combine discovery with affordability, valuation, or trade validation. The Market workspace has a public free-agent list and separate club-specific `MarketKnowledge`; Draft and Recruiting have their own candidate domains. BS10A adds a read-only need-specific query and does not replace any of these authorities.

## 2. Candidate authority and candidate universe

The projection discovers candidates only from:

- the target Organization's `OrganizationKnowledge` subjects;
- that Organization's `MarketKnowledge` subjects; and
- the public free-agent list derived from roster membership and active/scheduled contract status.

It removes the club's own roster and excludes explicit Draft prospects, Recruiting profiles, and Players rostered by NCAA-like programs from the professional candidate universe. It does not search all Players as a fallback. Discovery sources are returned on each exact Player result. The projection is derived and is not persisted as a second shortlist.

## 3. Public, known, and hidden information

The audited BS10A public fields are identity/name, date of birth/derived age, listed primary position, explicitly populated secondary positions, current roster/team, canonical contract status, and professional free-agent-list membership. BS10A does not assume height, weight, measurements, stats, medical status, personality, intentions, or development future are public.

Basketball estimates come only from the target Organization's `OrganizationKnowledge`. BS10A accepts the existing seven sparse basketball dimensions and the existing `potential:physical` knowledge dimension for development context. Arbitrary dimensions such as `overall`, medical, personality, or hidden Player Truth are not copied into the result. `PlayerKnowledge` is not an AI fallback.

Each known dimension retains its estimate, uncertainty, coverage, confidence, assessment date, provenance, and available evidence/report references. Assessment freshness lowers evidence confidence; absent estimates remain absent and appear in `missingKnowledge`. Medical confidence is explicitly listed as missing because the current organization-knowledge model has no audited external medical dimension.

## 4. Need and fit model

The Application route resolves the exact current BS9E plan's `needId` against the current BS9 decision context. It does not rebuild ClubNeeds. The pure Engine projection reports separate need, position, role, strategy, and timeline fit bands. It has no universal score, Player Overall, Market Overall, valuation, or affordability result.

Position fit uses the listed primary position (`HIGH`) or an explicitly listed secondary position (`MODERATE`). A mismatch is `LOW`; unavailable position facts remain `UNKNOWN`. It does not infer flexibility from ratings.

Role mapping is deliberately narrow and visible: `creation` informs `PRIMARY_HANDLING`, `shooting` informs `SPACING`, and `interiorDefense` informs `RIM_PROTECTION`. A role estimate's uncertainty interval yields `HIGH` when its lower bound is at least 60, `LOW` when its upper bound is below 50, and otherwise `MODERATE`. The role factor remains `UNKNOWN` when there is no estimate or when evidence quality is too weak. It does not reproduce BS9B role ratings from external Player Truth.

Strategy is a separate factor. `CONTEND`/`COMPETE` can use known current evidence for a need with a function target. `DEVELOP`/`REBUILD` only use a known `potential:physical` estimate together with public age context; missing potential stays `UNKNOWN`. Other strategies stay `UNKNOWN` here rather than becoming generic stereotypes. Age is reported as timeline context; it never makes a player good by itself.

For `TEMPORARY` needs, a public free agent can align with immediate cover; a contracted player's timing stays unknown absent canonical availability. For structural needs, age bands (23 and under, 24–31, 32+) expose a longer-term timeline factor separately from basketball fit. No contract term or commitment is inferred.

## 5. Availability, finance, contract, and value boundaries

Free-agent status comes from the canonical public list. A club-specific `MarketKnowledge` signal may report `OPEN`, `LISTENING`, or `NOT_FOR_SALE`, including source, confidence, and date. An absent signal remains `UNKNOWN`. A contract does not imply `AVAILABLE_FOR_TRADE` or seller willingness. `TRADE_CONTEXT` is shown only when both clubs share an active canonical trade-rules season; cross-ecosystem contracted players may be labeled `TRANSFER_CONTEXT` with availability still unknown.

The BS9 need's club-level financial posture is exposed as context, and candidate financial feasibility is explicitly `NOT_ASSESSED`. BS10A does not calculate affordability, read an asking salary, generate contract terms, or call valuation. Exact value, salary cost, affordability, and route-specific feasibility belong to BS10B.

## 6. Ordering, uncertainty, and knowledge limits

Ordering is deterministic and lexicographic: need fit, position fit, role fit, strategy fit, timeline fit, OrganizationKnowledge confidence, reported availability context, then PlayerId. Every component is returned and visible; there is no hidden aggregate score.

Sparse candidates may appear with `LIMITED` knowledge, lower confidence, high uncertainty, and explicit missing dimensions. If no candidate has enough basketball knowledge to distinguish them, the projection reports `MARKET_KNOWLEDGE_INSUFFICIENT`; an empty result is valid. This can inform a future scouting pathway, but BS10A creates no scouting assignment.

## 7. AI and user perspectives

The same Engine query and discovery rules apply to AI and user clubs. The result labels `ORGANIZATION_KNOWLEDGE` versus `USER_ANALYTICS`; user analytics do not grant AI broader information and do not use `PlayerKnowledge` to fill missing OrganizationKnowledge.

## 8. BS9E routing, persistence, and UI

The Application service consumes only current `EXTERNAL_ACQUISITION` workflow decisions on `MARKET_INTELLIGENCE_REQUIRED`. Outgoing market review is left to a later incoming/outgoing market milestone. The service is called as an Analysis read; it does not poll daily or mutate `GameWorld`.

The Analysis club strategy view shows the plan's compact candidate list, fit bands, knowledge status, availability source, current team context, known dimensions, missing knowledge, and structured reasons. It presents no Offer, Sign, Trade, Transfer, or Scouting action.

## 9. BS10B and BS10C deferred work

- **BS10B:** route-specific feasibility and economics, including canonical salary expectations, contract terms, affordability, trade eligibility/matching, seller/player interest, and valuation with explicit authority and uncertainty.
- **BS10C:** any proposal, negotiation, approval, or transaction lifecycle, with separate explicit action seams for signing, trading, and cross-ecosystem transitions.

## 10. Findings

- **P0:** None found.
- **P1:** AI `OrganizationKnowledge` coverage can be sparse, so candidate lists may correctly report insufficient knowledge until existing scouting/observation paths provide estimates. The current knowledge model has no audited external medical-confidence dimension, so medical confidence remains explicitly missing. The existing general `getFreeAgents` query includes explicit Draft/Recruiting prospect records; BS10A filters these locally and does not change that existing query.
