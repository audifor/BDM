# Draft Integration Audit · BS15G

Audit baseline: `2642a206add2eaba5b65c5e24db9f845dcc49e17` (BS15F)

## Existing authorities and findings

| Area | Existing implementation | Integration finding |
|---|---|---|
| Draft class generation | `engine/season/SeasonContentLifecycle.ts` creates a completed-season Draft with an empty pool and calls `generateDraftProspects` when that pool is empty. `engine/draft/DraftEngine.ts` materializes deterministic `draft-prospect:*` Players using a template player. | Production lifecycle currently relies on Draft-only synthetic Players. Keep the generator available for legacy tests/fixtures; new canonical pool population must select already-present PlayerIds. |
| Candidate identity | `Draft.prospectPlayerIds` is a PlayerId list. Player instances carry canonical `PersonId`; College enrollment and registration also point to PlayerId. | The shape can hold NCAA and international pathway Players without creating a new identity type. Pool construction and eligibility are missing. |
| Ranking and AI | `chooseAiDraftProspect` calls `deriveOrganizationPlayerValuation` with the selecting organization, its evaluation policy, current `OrganizationKnowledge`, and public position. The valuation authority consumes knowledge rather than reading hidden ratings. | Retain this team-specific knowledge-driven path. It is already compatible with existing candidate PlayerIds. |
| Pick ownership/order | `DraftPick` stores original and current owner. Current-pick resolution and ordering read the canonical pick list; future-pick ownership is materialized by the trade authority. | Reuse the pick inventory and selection order unchanged. |
| Selection | `makeDraftSelection` checks current pick owner, pool availability, gender, roster and active contract, marks the pick and adds the PlayerId to the selecting team's roster. | Selection does not clone a Player, but currently conflates being drafted with roster arrival and may conflate selection with signing. It does not create draft rights or a transition record. |
| Rookie contract | `createRookieContract` reads the source-season salary rules and rookie-scale entry by pick order. `makeDraftSelection` may create it on selection. | First-round scale support exists; Draft selection should be separated from professional signing/roster movement. Missing scale entries already produce no contract. |
| Player rights | `PlayerRights` exists as a tradeable asset (`draft` / `international`) with player, ecosystem, owner, and acquisition date. | Reuse this model for unsigned selections; no Draft selection path currently creates rights. |
| Career movement | `EcosystemTransitions.ts` has explicit NCAA→NBA-Draft, NCAA→FIBA, FIBA→NBA, and NBA→FIBA gateways. NCAA→Draft delegates to selection; generic professional transitions create contracts, update rosters, clear lineups, and record transitions. | NCAA→FIBA and international pro routes are supported. NCAA→NBA Draft presently lacks a single operation that coordinates selection, contract/signing, active enrollment closure, rights, registration, and transition provenance. No international→Draft gateway or undrafted free-agent route was found. |
| College lifecycle | `PlayerEnrollment` has active/ended state; `endPlayerEnrollment` preserves the record with an end date. `PlayerRegistration` separately records pathway participation. | These authorities can preserve history on actual professional entry; Draft code currently does not close enrollment. |
| World/save | Drafts, picks, contracts, rights, and ecosystem transitions are indexed in `GameWorld` and included in Save V4 payload migration. | New durable Draft lifecycle fields must be integrated with `GameWorld` validation and save serialization/migration. Existing V4 compatibility needs an explicit round-trip check. |

## Required rewiring

1. Version Draft rules and add a DraftEntry record keyed to the existing PlayerId and Draft cycle.
2. Build the production candidate pool from eligible existing Players and DraftEntry state; leave `generateDraftProspects` available only for fixture/legacy fallback.
3. Separate selection/rights from professional contract and roster entry.
4. Route professional entry through shared career and college authorities, preserving identity and pathway history.
5. Record Draft history with pick, year, team, ruleset, entry route, and source pathway.
6. Add source-backed 2026 rules/data and mark future dates as configured carry-forward rather than official.

## Audit limits

This is a code-path audit, not a claim that every route, UI action, save migration, or CBA detail passes certification. In particular, the repository has no Draft declaration/withdrawal authority, Draft-specific eligibility evaluator, NCAA testing-the-waters flow, or international CBA payment model at this baseline.
