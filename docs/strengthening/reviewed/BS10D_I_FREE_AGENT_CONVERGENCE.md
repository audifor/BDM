# BS10D-I Free-Agent Convergence

## Operational reachability

The initialized world has no free agents at its starting date, so Market has no
available target immediately after `createNewGame()`. Once the user creates a
free agent through the normal roster release operation, the Market now builds a
target-specific intent from the current selectable BS9 `EXTERNAL_ACQUISITION`
need and that player's exact BS10 candidate-feasibility row. A focused test
starts from an unmodified `createNewGame()`, releases a real roster player with
the application operation, and creates a contact with `contactResponsibleActor:
USER`. Contact records contain no salary, term, contract, or transaction.

The user's explicit Market choice supplies the acquisition intent; it does not
pretend an AI GM selected that target. The stable `user-market-intent` plan ID
and BS10C proposal ID are derived from the current need and selected player.
After contact, the same canonical proposal identity is re-derived from the
stored negotiation identity and all later operations revalidate the player,
need, feasibility, and current state.

## User acquisition path

The current normal user route is:

1. Release a roster player, or wait until a player otherwise becomes available.
2. Select a free agent in Market. Market shows current contact readiness from
   BS9/BS10. A player without a supported current candidate remains blocked.
3. Contact through `initiatePreferredFreeAgentContact`.
4. Wait for the real contact response. No action is offered while it is pending.
5. After `OPEN_TO_TALKS`, Market assesses exact formal-offer preparation. It
   enables `Submit prepared offer` only at `READY_TO_SUBMIT_OFFER`; missing
   club-known salary/term and other blockers are displayed without generated
   terms.
6. For a counter, Market exposes accept, explicit revised salary/years, or
   decline through `respondToNegotiationCounter`.
7. On `ACCEPTED`, Market shows agreement terms and signing Governance status.
   `Start signing approval` appears only for the user coach's active appointment
   to a body with the current `PLAYER_CONTRACT_SIGNING` PROPOSE right.
8. Approval actions appear only for a body with a current APPROVE right and an
   active user-coach appointment. Required and pending bodies are named.
9. Once approved, `Complete signing` calls the canonical
   `completeAcceptedFreeAgentSigning` operation. Market displays the signed
   contract ID.

The user team's Application authority resolves to USER directly for contact,
offer, counter, and execution operations. No fake staff delegation is required.
Market components call Zustand/Application commands and do not mutate
`GameWorld` transaction state directly. The old desktop Market screen was
removed; desktop Market now uses the same workspace as the main workspace.

## AI acquisition path and responsibilities

AI planning continues through its current BS9 plan, BS10 candidate and
feasibility selection, contact, response, offer, counter, acceptance,
Governance, and atomic signing checkpoints. Focused service tests cover
delegated AI contact/offer and configured signing authority, including a real
final approval before the signing retry.

Fresh `createNewGame()` worlds create responsibility rows using each kind's
declared default mode. The new contact, offer, and signing kinds default to
vacant `userControlled` rows. There is no canonical auto-delegation enrichment
policy for these responsibilities and the generated professional staff has no
GM appointment. The milestone therefore adds no arbitrary staff delegation.
An AI club without a current eligible delegated owner fails closed.

## Governance initialization and controls

The new-game path initializes Board state only for the user's team. It does not
initialize professional-club Governance institutions, bodies, appointments,
authority grants, or `PLAYER_CONTRACT_SIGNING` decision-participation grants.
There is no existing organization-based club Governance initialization policy
to extend. The milestone does not invent actors, grant universal rights, or
approve decisions automatically.

Accordingly, default worlds have no signing Governance proposer, approver, or
executor. Market reports this as a real blocker and presents no user action
that impersonates another body. Configured clubs can use the existing
Governance Application service. Independent approvals remain pending until
each legitimately appointed actor records them. Generic AI Governance
approval behavior remains deferred to Governance Gameplay (BS18).

## Legacy signing and world repair

`signFreeAgent()` no longer has any ordinary user or ordinary AI Market
production caller. The old generated asking salary and term are absent from
both Market interfaces. Its only production caller is
`maintainAiTeamMinimumRosters()`, reachable through
`repairWorldAtLifecycleBoundary()` during match, transition, and new-season
integrity boundaries. The helper requires explicit `WORLD_REPAIR` context,
skips the user team, does nothing at or above five rostered players, selects
deterministically, and stops at the five-player floor. Its transaction now
records `provenance: WORLD_REPAIR`. Tests continue to use the low-level helper
for roster/contract invariants.

This is emergency WORLD_REPAIR, not ordinary AI acquisition. The call boundary
remains outside Market UI and GM acquisition planning; repair reports use
`sourceDomain: WORLD_REPAIR`. This preserves playable-world repair without
letting ordinary AI Market work bypass contact, negotiation, or Governance.

## Observability

Market now exposes player identity, contact state and response, offer
preparation readiness and blockers, open/counter/agreed terms, signing
Governance status, approved and pending bodies, final signed status, and the
contract ID. It does not display `marketRealityByPlayerId` or generated legacy
market terms.

## Findings and remaining work

- **P0 resolved:** ordinary Market no longer converts a Sign click into hidden
  terms and an instant contract.
- **P0 resolved:** a user-selected feasible target enters the canonical
  BS9/BS10 identity and contact path under USER authority.
- **P1 remains:** default initialized worlds do not contain free agents at
  their opening date; until a player becomes available, Market correctly has
  no target to contact.
- **P1 remains:** default AI clubs have no delegated free-agent execution
  owners or club signing Governance configuration. AI execution is available
  only in truthfully configured clubs; default behavior fails closed.
- **P1 remains:** default user clubs also have no institutional signing
  authority, so acceptance can reach a visible Governance blocker but cannot
  complete a signing until a real institution and its appointments/rights are
  configured. No such default authority pattern exists to extend here.
- **Deferred:** generic autonomous approval of independent Governance bodies
  remains BS18 Governance Gameplay.

Free-agent **Market bypass convergence is complete**. Full contract acquisition
is operational for clubs with real execution responsibilities and Governance
configuration; it is not universally reachable in a fresh default world while
that configuration is absent.

## Focused validation

- Focused Market contact/offer, minimum-roster repair, player-contract signing Governance, simulation breakpoint, staff initialization, and responsibility initialization tests — 52 tests passed; a separate focused signing-service run passed 13 tests (65 total).
- `npm run typecheck` — passed.
- `npm run build` — passed. Vite reported its existing large-chunk advisory.
- `src/ui/desktop/DesktopAppHost.test.ts` focused Market-host assertion — 1 passed.
- Full suite and long-horizon simulation were not run, per milestone test policy.
