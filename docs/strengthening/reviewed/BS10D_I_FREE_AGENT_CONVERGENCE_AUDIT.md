# BS10D-I Free-Agent Convergence Audit

## Scope and baseline

Audited on branch `bdm-stage2-bs10d-i-free-agent-convergence`, starting at
`383d7e8` (the separate BS10D-H archive commit). The reviewed code baseline is
BS10D-G through BS10D-H. This is a pre-implementation audit of the actual
`createNewGame()` world and production callers, not a synthetic service fixture.

## Default initialized state

`createNewGame()` calls `ensureResponsibilityStructure()` for generated teams.
That helper creates one row per responsibility kind using each kind's declared
`defaultMode`. It does not assign staff. The three new free-agent execution
responsibilities are `userControlled` by default, and no canonical enrichment
policy assigns a GM or other eligible staff member to them. The base
professional staff roster itself contains no GM role. This preserves the
existing no-arbitrary-delegation rule but means ordinary AI teams have no
contact, offer, or signing executor unless a real eligible staff appointment
and delegation are configured.

`createNewGame()` initializes board state only for the user's team. The
generated/merged world has no professional-club Governance institutions,
bodies, appointments, authority grants, or decision-participation grants.
Therefore, an initialized club has no `PLAYER_CONTRACT_SIGNING` proposal,
approval, or execution authority by default. No existing club-governance
initialization pattern is available to extend for this decision type. User
authority is separately and truthfully resolved from `userCoachId`; a user does
not need a fabricated staff delegation to contact, submit an offer, respond to
a counter, initiate Governance when an appointed proposer right exists, or
complete the signing when all checks pass.

## Reachability answers before convergence

| Question | Initialized user club | Initialized AI club |
| --- | --- | --- |
| Initiate contact | Contact authority recognizes USER, but the service only accepts a currently routed BS10C proposal. User planning emits recommendations without persisting plans, and Market has no target-specific bridge. | Blocked: no delegated contact owner is initialized. |
| Submit a formal offer | User authority exists, but Market has no lifecycle action or preparation view. | Blocked: no delegated offer owner is initialized. |
| Respond to a counter | The Application service can attribute the user actor, but Market exposes no action. | Blocked unless delegated offer responsibility is configured. |
| Start signing Governance | User actor is accepted only with an active Governance appointment and current `PLAYER_CONTRACT_SIGNING` PROPOSE right. The base world has neither. | Requires a real delegated signing workflow and configured institutional proposal rights; none are initialized. |
| Approve | Only a genuinely appointed actor/body with current APPROVE authority can approve. No such base-world signing configuration exists. | Same; no configured institution, approver, or autonomous AI approval policy exists. |
| Complete signing | The canonical G service requires accepted terms, real Governance approval/execution rights, and USER signing authority; base world has no signing Governance. | Canonical service requires real execution responsibility plus approved Governance; missing by default. |

These gaps are configuration and product-access gaps, not missing domain
capability. The Application lifecycle operations and domain authority checks
already exist. There is intentionally no generic AI Governance approval policy;
multiple independent approvals cannot be fabricated.

## Existing product and simulation paths

Both `src/ui/screens/MarketScreen.tsx` and
`src/ui-ng/applications/market/MarketWorkspace.tsx` display generated legacy
asking terms and call the Zustand `signFreeAgent` action directly. The store
delegates to `src/app/market/MarketService.ts`, which generates a salary and
term and immediately creates the contract and `signedFreeAgent` transaction.
This is an ordinary user-market bypass and makes generated terms appear
authoritative.

Canonical operations already exist for preferred contact, prepared offer,
counter response, signing Governance, and atomic completion. But
`assessRoutedAcquisitionProposalIntelligence()` only produces candidates for a
current routed plan; the user plan service deliberately does not persist
autonomous plans. Consequently a manually selected Market free agent cannot
currently acquire a BS10C proposal identity. The smallest convergence bridge
must keep selection inside BS10A/BS10B feasibility and BS10C proposal identity,
while creating a stable user-directed plan identity for this selected target;
contact and all later actions must still revalidate that identity.

AI planning routes through GM workflow, candidate feasibility, contact,
response, formal offer, counter response, accepted signing Governance, and G.
The bounded post-response and accepted-decision checkpoints do not authorize
themselves. An AI acquisition path can proceed only when eligible staff have
real delegated contact/offer/signing responsibilities and the institution has
the required rights. The checkpoint does not supply approval behavior.

## Minimum-roster repair classification

`maintainAiTeamMinimumRosters()` is called in production only through
`repairWorldAtLifecycleBoundary()`, at pre-match, post-transition, and new
season repair boundaries. Its target is the canonical five-player playable
minimum, it skips the user team, and it buys only enough affordable
same-gender free agents to restore that floor. BS4 self-healing intent and
these call sites classify this as exceptional WORLD_REPAIR, not ordinary GM
roster improvement. It must remain outside Market and AI acquisition planning.

Before convergence, the repair calls `signFreeAgent()` and the transaction has
no explicit repair provenance. Its call is necessary to prevent a structurally
unplayable save from deadlocking on ordinary Governance. The repair may retain
that primitive only if the boundary is made explicit, deterministic, restricted
to deficient AI teams and the exact shortfall, and surfaced as repair
provenance. Above-minimum teams and the user team must never be signed by this
repair.

## Production `signFreeAgent()` consumers before convergence

1. `src/ui-ng/applications/market/MarketWorkspace.tsx`: ordinary user Market
   bypass; remove.
2. `src/ui/screens/MarketScreen.tsx` via its `onSign` callback/store action:
   ordinary user Market bypass; remove.
3. `src/app/market/AiRosterMaintenance.ts`: emergency minimum-roster repair;
   retain only as the explicitly scoped world-integrity exception.
4. Tests under `src/app/market`, `src/engine/market`, and market-intelligence
   tests: fixtures/invariant checks; not production acquisition paths.

## Findings

- **P0:** Ordinary user Market signing directly creates contracts with hidden
  generated salary/term instead of the canonical lifecycle.
- **P0:** The Market cannot start canonical contact for a manually selected
  player because it has no target-specific user plan/proposal bridge.
- **P1:** Lifecycle state and user actions are not surfaced in Market.
- **P1:** Fresh AI clubs lack truthful staff execution assignments and signing
  Governance configuration, so canonical autonomous acquisition is not
  reachable in the default world. Fail-closed behavior is intentional until
  real responsibilities and institutional authority exist.
- **P1:** Emergency roster repair is correctly separated by call-site purpose
  but its use of the general-market signer is not tagged as repair provenance.

## Post-implementation verification

The normal initialized user club starts with zero free agents (12 rostered
players in the audited prototype world). Releasing one player through the
normal Application operation makes that real player selectable through the
Market intent bridge; the user Application operation creates a term-free
`CONTACTED` negotiation with USER actor attribution. No salary, term, contract,
or transaction is generated at this contact boundary.

Both Market entry points now render the same canonical workspace. The old
Market sign action and legacy terms are gone from product UI. The workspace
exposes contact, prepared offer, counter, Governance status and real user
Governance actions, approved completion, and signed status. The direct
`signFreeAgent()` production callers are now classified as:

1. `src/app/market/AiRosterMaintenance.ts`: WORLD_REPAIR only, via
   `repairWorldAtLifecycleBoundary()` and explicit repair context.
2. Tests: bootstrap/invariant coverage in the Market and engine test files.

Emergency transactions record `provenance: WORLD_REPAIR`, and repair reports
identify `sourceDomain: WORLD_REPAIR`. The repair stays bounded to deficient
non-user clubs and exactly the number needed to reach five.

The initial P0 Market bypass and missing user target bridge findings are
resolved. The P1 configuration findings remain: fresh worlds have no initial
free agents, no AI delegated execution responsibilities, and no professional
club signing Governance configuration. Those gaps remain fail-closed and
visible; no arbitrary delegation or automatic Governance approval was added.

Focused tests: 52 passed across Market contact/offer, minimum-roster repair,
player-contract signing Governance, simulation breakpoints, staff and
responsibility initialization; 13 focused signing-service tests also passed,
for 65 focused service/domain tests total. The focused Market-host test passed
separately (1 test). Typecheck and UI build passed.
