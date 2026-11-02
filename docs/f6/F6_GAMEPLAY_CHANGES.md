# F6 Gameplay Changes

## Player contract response

Changed `derivePlayerTermsResponse` in `src/engine/market/MarketEngine.ts` to evaluate the total guaranteed package (`annual salary × contract years`) against the player’s canonical expected package. When another organization has a real OPEN or ACCEPTED offer for the player, its guarantee can raise the required package. This does not reveal the competing club or its offer: the player-side response uses market reality, while club decision-making continues to use organization-scoped `MarketKnowledge`.

A represented player can counter with enough years and a salary rounded up to cover the required guarantee; agent negotiation traits add pressure to the counter. An unrepresented player rejects an under-guarantee offer. Due offers are evaluated strongest package first, so a later lower offer cannot erase an already accepted stronger offer. Counter signals disclose the countered salary and years as terms communicated to that organization.

`TransferEngine` supplies the buyer organization to the shared response model. This enables organization-scoped offer context on that path. Active competing transfer negotiations are not included in the competing-offer scan, which currently covers `world.negotiationsById`.

## Demonstrated effects

Focused tests cover salary/term package differences, competition from a real open offer, represented-agent counter behavior, and shared response paths. They test the canonical market response function and adjacent flows; they do not certify a complete GUI signing workflow or persistence round-trip.

Role remains excluded from acceptance valuation because the current role-promise data has no established consumer that enforces an offered role. No hidden player truth was added to club-side recommendation or exposed through market knowledge.

## Known remaining gap

Trade rival readiness still returns `MORE_INFORMATION_REQUIRED`. F6 did not add an autonomous trade policy because the existing code explicitly lacks a defensible organization-knowledge-bounded response rule. See `F6_GAMEPLAY_AUDIT.md`.

## Consolidation update (2026-11-02)

No new player-facing market behavior was added during repository consolidation. The integration candidate adds a separate read-only DB-04 catalog adapter and validates its data projection; it does not change the contract-response behavior described above. The requested immersive contact, people, decision, and consequence presentation is implemented in the review branch documented below; it is not yet part of the integration candidate.

## Immersive Market Operations (2026-11-02 review branch)

The existing Market Operations workspace now presents one selected negotiation as an operation room: the player and known representative, the recorded contact/offer actors, the current situation, conditions known by the club, the decision currently available, and a dated history made only from persisted market events. Search, contact, calendar progression, counter decisions, Finance/Governance authorization, signing, and Save V4 still use the existing services and GameWorld state.

The contact response is passive: after the user starts a contact, CalendarEngine resolves it on a later date without a Market confirmation action. Contact and offer replies are described only from recorded outcomes and origin. The interface does not expose MarketReality, rival offers, or a reason the engine did not record. Closed negotiations are grouped by their real closed statuses.

Salary and term remain the factors in the free-agent response model. The model has no canonical expectation for a free agent's proposed role, so that promise is shown as a commitment and does not change acceptance valuation. If signed, the RolePromise is persisted and is considered by the existing retention response engine; the current career has no automatic in-season fulfilment evaluator, so the Market screen does not invent one. Contact/offer/decision actors are shown from persisted responsibility records. No new autonomous staff behavior was added.

| Comparison | Before this change | This review branch |
|---|---|---|
| Contact | One direct contact command after opening the player dossier | Same command count; the operation stays in a selectable follow-up queue and explains that the calendar will resolve the response |
| Waiting | The user had to infer from CONTACTED/pending status that time would resolve it | No new action is required; the next calendar step and lack of a promised response date are stated explicitly |
| Formal offer | Salary, years and optional role could be submitted | Same submit action; the operation also identifies known versus unknown terms and records what was communicated |
| Counteroffer | Salary and term were visible among the same administrative statuses | Our terms and the received terms are compared; salary, duration and the recorded role commitment can be revised in place |
| Signing | Finance/Governance buttons and blockers sat in the negotiation detail | Existing approvals and execution remain; the panel explains the difference between agreement and a signed contract |
| Staff | Responsible actor appeared as a label | Contact and offer actors are placed beside the operation history; no unsupported delegation is claimed |

These counts describe the source/UI actions and tests, not a completed Windows user study. The existing required action count has not been reduced; the change adds contextual information and in-place comparison without an extra confirmation step while waiting.

The three Market workspace UI files passed 26/26 tests. They cover passive contact response, a positive response, a real counteroffer and revision, known rejection, and existing transfer/Market screens. Focused Market, free-agent contact/signing, Finance/Governance, role-retention, calendar, contract-release, and Save V4 suites passed 148/148 tests across nine files. `npm run typecheck -- --pretty false`, `npm run build`, `cargo fmt --check --manifest-path src-tauri/Cargo.toml`, and `cargo check --manifest-path src-tauri/Cargo.toml` passed. Architecture scans found no `Math.random(` in `src/` and no React/Zustand/Tauri imports in Domain or Engine. The full repository test suite and GUI acceptance have not been run; this is not a global PASS.

The native Windows GUI route was not performed. Computer Use could not connect to its native pipe (`Computer Use native pipe is unavailable: failed to connect native pipe`), including after one reset/retry. Screenshots and GUI accessibility/resolution acceptance therefore remain pending. F6 remains PARTIAL.
