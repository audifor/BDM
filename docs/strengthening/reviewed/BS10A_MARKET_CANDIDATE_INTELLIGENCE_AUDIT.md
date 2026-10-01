# BS10A Market Candidate Intelligence Audit

## 1. Existing candidate-discovery paths

- `BasketballOperationsAdvisory` discovers external Players from the acting Organization's `OrganizationKnowledge` subjects. Its signing path additionally requires canonical free-agent status, club-specific market knowledge, expected salary, and remaining salary budget. Its shortlist path is broader, but still starts from organizational knowledge.
- The Market workspace exposes `getFreeAgents`, which derives the world-level free-agent list from roster membership and active/scheduled contracts. The current query does not itself filter Draft prospects or Recruiting profiles, so it is broader than a professional market universe. BS10A reuses its canonical free-agent status but excludes Players explicitly present in Draft/Recruiting pools and Players rostered by NCAA programs.
- Market signals are organization-specific. `receiveMarketSignal` updates `MarketKnowledge`; domain queries intentionally do not fall back to `MarketReality`.
- Draft and NCAA recruiting have separate candidate universes and valuation/advisory paths. They are not professional market discovery.

## 2. Existing exact-player advisory paths

- Basketball Operations records advisory `DelegationOutcome`s. Signing recommendations include salary affordability; trade recommendations validate a prospective trade. Those are broader advisory/action-adjacent boundaries and do not supply the pure need-to-candidate analysis BS10A needs.
- Draft prospect advice and Recruiting advice identify exact Players but use Draft/Recruiting eligibility and contexts.
- BS9E workflow inspection currently exposes `MARKET_INTELLIGENCE_REQUIRED`; it does not return candidates.

## 3. External knowledge authority

`GameWorld.organizationKnowledge` is the club-relative authority for external basketball estimates. Each sparse dimension carries coverage, confidence, assessment date, provenance, and optional estimate, uncertainty, evidence IDs, and report IDs. Scouting/report systems write or support this knowledge. `PlayerKnowledge` is a separate team-relative legacy/user-facing shape; it is migrated into sparse OrganizationKnowledge at the save boundary, not an alternate AI fallback.

`MarketKnowledge` is the authority for organization-relative market signals. `MarketReality` is world truth and is not a candidate-intelligence input. Missing club knowledge remains missing.

## 4. Public versus hidden information

The current product has no separate public-player-profile service. The following classification is therefore bounded to existing canonical, non-rating facts and current UI/query semantics:

| Field | BS10A treatment | Basis |
|---|---|---|
| Player identity/name | Public presentation fact | Market/player workspaces identify Players by name. |
| Date of birth / derived age | Public fact | Stored in the bio and used as ordinary player profile data. |
| Listed primary position | Public fact | Used by the Market workspace and existing evaluation APIs as `publicPosition`. |
| Secondary positions | Public only when explicitly populated | Canonical optional field; do not infer from ratings. |
| Current roster/team and contract state | Canonical status facts | Derived from roster membership and contract lifecycle; status says contracted, never willing/available. |
| Professional free-agent list membership | Public discoverability/status | `getFreeAgents` is the Market workspace's shared list. |
| Historical public statistics | Not currently used | No single audited public-stat authority was identified for this candidate projection. |
| Height/weight/physical measurements | Not used as public candidate evidence | Fields exist, but product semantics do not establish their general external visibility. |
| Current ratings, tendencies, potential/development truth | Hidden Player Truth | Read only through organization estimates when an explicit OrganizationKnowledge dimension exists. |
| Medical truth, personality, development future, contract intentions | Hidden/not available | No public authority supports these facts. |
| Market availability, interest, seller willingness, salary expectations | Club-known only when present in MarketKnowledge | Never read MarketReality. |

This is an application-level public-data policy for BS10A, not a claim that every GameWorld field is globally public.

## 5. Existing market availability truth

`MarketReality` contains actual availability and willingness values but is hidden world state. `MarketKnowledge` contains club-relative, signal-derived values. Only the latter may inform a club's candidate context. A missing availability signal is `UNKNOWN`; `OPEN`/`LISTENING`/`NOT_FOR_SALE` are kept as reported. A contracted Player is not thereby available for trade. No canonical trade block or universal transfer listing was found.

The existing Market screen also shows a generated asking salary/term through `getFreeAgentMarketTerms`; that calculation uses Player ratings as an ability proxy. BS10A does not call it or surface its price output.

## 6. Existing roster/contract status truth

Roster membership is canonical on `Team.rosterPlayerIds`; current/scheduled/expired status derives from `PlayerContract` and the queried date. `isPlayerFreeAgent` combines these authorities. Trade legality belongs to the ecosystem/season-scoped TradeEngine. Contract status is usable as factual acquisition context, but does not authorize or predict a trade.

## 7. Existing valuation systems

`deriveOrganizationPlayerValuation` is an organization-knowledge-aware valuation/priority projection used by Draft, Recruiting, and Basketball Operations. It includes policy adjustments and a synthesized neutral value when dimensions are unknown; it is not a need-specific fit model and must not become BS10A's ranking authority. BS10A will not call it or surface its value.

## 8. Existing affordability systems

`getTeamFinancialSnapshot` and `canTeamAffordAdditionalSalary` provide canonical budget/payroll checks. Basketball Operations applies them to a signing recommendation. BS10A does not estimate candidate cost, calculate affordability, or call these APIs for candidate fit; it can expose the club-level financial posture already on the BS9 need/context.

## 9. Existing fit/ranking logic

Club Needs defines need kinds, target positions/roles, temporal scope, urgency, severity, strategy alignment and evidence. Role-gap detection uses own-player truth only for the club's roster. Basketball Operations ranks known Players by primary-position need and OrganizationPlayerValuation, which is not suitable for this need-specific, non-valuation projection. OrganizationPlayerEvaluation respects estimates for display but its valuation function intentionally synthesizes unknown neutral inputs; BS10A instead preserves `UNKNOWN` per dimension.

The existing function-role vocabulary is `PRIMARY_HANDLING`, `SPACING`, and `RIM_PROTECTION`, with detailed role-rating keys. No canonical OrganizationKnowledge-to-function mapping exists. BS10A can make only narrow, inspectable mappings from known dimensions: `creation` to primary handling, `shooting` to spacing, and `interiorDefense` to rim protection. Other role evidence remains unknown rather than borrowing hidden ratings or unrelated dimensions.

## 10. Duplicate-authority risks

- Reusing Basketball Operations ranking would introduce valuation, affordability, salary expectations, and trade validation into a projection that must not answer those questions.
- Scanning all Player Truth would reveal hidden ratings and include undiscoverable subjects.
- Reusing `PlayerKnowledge` as an AI fallback would cross observer perspectives and duplicate `OrganizationKnowledge` authority.
- Writing a persisted candidate shortlist would duplicate existing scouting, market-knowledge, and advisory records.
- Treating a contracted Player as available would invent seller willingness or trade-block status.
- Treating every row returned by `getFreeAgents` as a professional free agent would mix in explicit Draft prospects and Recruiting profiles.

## 11. Ecosystem-specific differences

NBA-like TradeEngine legality is season/rules scoped; FIBA-like leagues do not inherit NBA trade rules. Free-agent status can be shown as a fact independent of signing eligibility. Contracted Players may be shown as `TRADE_CONTEXT` only when the candidate is discoverable through OrganizationKnowledge or a club MarketKnowledge signal; their availability remains `UNKNOWN` absent a market signal. NCAA Recruiting and Draft prospect paths keep their own eligibility and action boundaries; BS10A does not mix them into professional candidate discovery.

## 12. Actual gap BS10A must fill

There is no pure Application/Engine query that takes a current BS9 external-acquisition plan and its exact ClubNeed, joins only legitimate discovery sources with OrganizationKnowledge and club MarketKnowledge, then returns an explainable deterministic fit projection without valuation, affordability, action, or persistence. BS10A should provide that derived projection and expose it through the existing BS9E `MARKET_INTELLIGENCE_REQUIRED` route, with an empty/insufficient-knowledge result when evidence is weak. AI OrganizationKnowledge coverage is currently sparse, so a truthful result may often request more market knowledge without assigning a scout.
