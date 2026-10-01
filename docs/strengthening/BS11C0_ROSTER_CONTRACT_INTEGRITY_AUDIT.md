# BS11C0 Roster / Active Contract Integrity Audit

**Base:** `5c76568b01c86051c9e1af90d41f8db9eb4b5c27`
**Branch:** `bdm-stage2-bs11c0-roster-contract-integrity`

## Master capability reuse check

Reviewed the Master Capability Audit at `67811994e48137ec77579ae3dcaa273e8a680c37`: the registry, audit, authority-conflicts report, contract deep audit, and reuse-first directive. Also read the BS11A archive and BS11B PASS certification in this checkout.

- **CONNECTED:** `RosterContractIntegrity` is the one canonical evidence-based repair authority. `PlayerTransaction` signing/departure evidence is used only to repair roster drift. The action paths continue to own their atomic mutations.
- **SURFACED:** existing repair reports `ROSTER_CONTRACT_TEAM_MISMATCH`, `ACTIVE_CONTRACT_WITHOUT_ROSTER_EVIDENCE`, `MULTIPLE_ACTIVE_PLAYER_CONTRACTS`, and multiple-team authority conflicts. Save V4 itself did not apply this diagnosis; the application save/load boundary now uses the same repair authority.
- **ACTUALLY NEW:** a read-only derived query, `assessActiveContractRosterIntegrity`, gives contract actions and BS11B one safe answer (`VALID`, `INVALID`, `AMBIGUOUS`, `UNKNOWN`). It does not store or replace either authority.

## Canonical authorities and relationship

`Team.rosterPlayerIds` is current sporting membership. `PlayerContract.teamId` identifies the contractual party. The relationship is required for a player with exactly one active playing contract who is rostered: the unique roster team must equal the active contract team. An active contract with no roster, a conflicting roster team, duplicate active contracts, or multiple roster teams is unsafe. The relationship is not inferred in either direction when no active contract exists.

## State matrix

| State | Classification | Canonical boundary / outcome |
|---|---|---|
| Active contract + rostered at same team, unique | VALID | Market/review/trade paths; query returns `VALID`. |
| Active contract + rostered at different team | INVALID | Repair diagnoses; only exact departure plus signing evidence can move roster. |
| Active contract + no roster | INVALID | Repair restores only from exact matching signing transaction; otherwise fails closed. |
| Scheduled contract + no current roster | VALID | Future commitment only; no roster arrival is inferred. |
| Scheduled contract + rostered same team | TRANSITIONALLY_VALID | Existing repair treats same-team scheduled relationship as valid; status is still date-derived. |
| Scheduled contract + rostered different team | UNKNOWN | No transition authority follows from the future contract alone. Existing active contract/lifecycle evidence must explain current membership. |
| Expired contract + roster membership | INVALID when that is the only same-team contract evidence | Daily expiry reconciliation removes roster membership and writes one `contractExpired` transaction. Repair leaves unresolved lifecycle drift unchanged. Historical expired contract without roster is valid. |
| Terminated contract + roster membership | INVALID when that is the only same-team contract evidence | Release removes roster and terminates contract atomically. Repair will not let the ended contract justify current membership. |
| No active contract + roster membership | UNKNOWN without contract history; VALID for NCAA roster participation | No contract is fabricated. An ended same-team contract still on the roster is diagnosed. |
| Trade transition | VALID after atomic completion | Roster and active contract affiliation move together; same ContractId and terms retained, one traded transaction written; retained salary separate. |
| Signed free-agent transition | VALID after atomic completion | Contract, roster, transaction, Governance/negotiation evidence, and negotiated effects are published together. Exact retry is idempotent. Legacy AI emergency signing also writes roster, contract and transaction in one world update. |
| Released player transition | VALID after atomic completion | Roster removal, termination, lineup clearing and release transaction are one update; duplicate/ambiguous active contracts now fail before mutation. |
| Natural contract expiry | VALID after reconciliation | Expired history remains; roster and lineup are cleared; stable transaction ID prevents duplicate history. |
| Draft arrival | VALID/UNKNOWN by contract configuration | NCAA source roster is detached; draft selection adds NBA roster and creates a rookie contract only when salary rules exist. No PlayerTransaction; ecosystem transition record is used. |
| Recruiting arrival | VALID NCAA exception | Recruit signing/arrival records and NCAA roster update; no professional PlayerContract or PlayerTransaction is created. |
| WORLD_REPAIR emergency signing | VALID after atomic completion | Existing market signing authority records contract, roster and transaction with `WORLD_REPAIR` provenance. |
| Future scheduled arrival | TRANSITIONALLY_VALID before start; UNKNOWN at activation without arrival evidence | Status changes by date. There is no automatic roster addition or PlayerTransaction at start. Repair can restore only from exact signing evidence; no hidden arrival is added here. |

## Action boundary audit

| Boundary | Roster | Contract | PlayerTransaction / other evidence | Consistency / atomicity |
|---|---|---|---|---|
| Canonical accepted free-agent signing | Adds | Adds | Signing transaction, Governance and negotiation records | Atomic world publication; stable retry identity. |
| Legacy market / AI `signFreeAgent` | Adds | Adds | `signedFreeAgent`, including provenance | One rebuild/update; exact transaction identity. |
| Trade execution | Moves | Changes `teamId` on same active contract | One `traded` transaction and TradeRecord | Validation precedes one atomic world update. Now rejects non-VALID active-contract roster state. |
| Release | Removes and clears lineup | Terminates | `released` transaction | One atomic update. Now rejects non-VALID state before selecting a contract. |
| Expiry reconciliation | Removes and clears lineup | Keeps expired history | One stable `contractExpired` transaction | Idempotent reconciliation. |
| Draft | Destination add; source detached by ecosystem gateway | Rookie contract when salary rules exist | EcosystemTransition; no PlayerTransaction | Gateway sequences detached source and selection. |
| Recruiting | Adds at season arrival | None for NCAA | RecruitSignings / arrival state; no PlayerTransaction | Existing arrival helper is idempotent. |
| World generation | Creates initial memberships | Creates professional contracts; NCAA roster has no contract | No player transaction | Bootstrap construction; no inferred transaction history. |
| Professional ecosystem gateways | Moves source/destination membership | Ends source contract where applicable and creates destination contract | EcosystemTransition | Atomic world-level transition. Now rejects missing/duplicate/mismatched professional source contracts and NCAA active-contract contamination. |
| Legacy `movePlayerAcrossEcosystems` | Moves only roster | Does not update contract | EcosystemTransition | No production caller found; now refuses while any active PlayerContract exists. |
| Roster repair | Changes only roster | Never rewrites or creates contract | Reads exact transaction evidence | One canonical repair authority; ambiguity remains unchanged. |
| Save V4 application boundary | Preserved/repaired on load | Preserved | Reads existing evidence | Saves reject unresolved or repairable drift; loads apply existing repair and reject unresolved states. Codec remains structural. |
| Direct `GameWorld` update | Caller-defined | Caller-defined | None by itself | Structural world validation enforces unique roster membership and references, not this cross-record invariant, so tests/imports can be diagnosed by repair. |

## Ecosystem and scheduled semantics

- NCAA athletes and recruited amateurs may be rostered without PlayerContract. Recruiting arrival does not create one.
- Imported World DB teams materialize roster assignments but provide no PlayerContract terms. Absence of contract history is not treated as proof of a broken contract; no synthetic contracts are created.
- Draft rights are separate from roster membership and PlayerContract. No loan or temporary-registration model was found.
- For an active contract, a unique roster at its team is required for a safe contract action. Future scheduled contracts are not current roster authority.
- PlayerContract status is active from `startsOn` inclusive through `expiresOn` exclusive; termination takes effect on `terminatedOn`. Calendar reconciliation handles expiry, not scheduled arrivals.

## Validation, repair and evidence

`assessActiveContractRosterIntegrity` is derived from current Team memberships and date-filtered contracts. It returns `AMBIGUOUS` for multiple roster teams or more than one active contract, `INVALID` for one active contract without its matching unique roster, `VALID` for exact agreement, and `UNKNOWN` when no active contract exists. It is the BS11C precondition and is used to suppress BS11B review eligibility, block player trades, and guard releases.

`GameWorld` structural validation intentionally does not reject semantic cross-record drift before the repair authority can inspect it. Existing repair uses exact signing evidence to restore a missing roster, or a unique earlier release/expiry plus matching signing to move stale membership. It never changes `PlayerContract.teamId`, fabricates a transaction, or selects an authority when multiple claims exist.

PlayerTransaction and TradeRecord are history, not current roster authority. Trade execution itself is atomic and does not need repair inference. TradeRecord does not supersede current Team/contract state.

Save codec round-trip is structural. `saveCurrentGame` now rejects worlds that need repair or contain unresolved findings. `loadSavedGame` applies evidence-backed repair and throws an explicit error when repair reports an unresolved state. World DB materialization remains roster-driven and no external contract table is required.

## BS11B and BS11C boundary

BS11B decisions remain intent-only. `ContractReviewEngine` now returns no actionable candidate when current active contract/roster integrity is not `VALID`, including duplicate same-team active contracts. Valid review candidate behavior is unchanged. The canonical extension precondition for BS11C is `assessActiveContractRosterIntegrity(world, playerId, onDate) === 'VALID'` and the selected ContractId must still be that unique active contract at execution time. No extension, successor contract, salary, terms, option, bonus, RolePromise, Governance signing event, or expiry change is implemented here.

## Findings

### P0

- Before this change, review and release selected a first matching contract, trade accepted any matching active source contract, and Save V4 application loading did not run roster/contract repair. Those boundaries could proceed or expose intent against ambiguous persisted state. They now fail closed or suppress the review candidate.

### P1

- Scheduled contract activation is date-derived, while arrival is separate and currently has no general automatic event. An active scheduled contract without current roster/evidence is not auto-arrived; the next repair boundary diagnoses it and cannot infer a move. No new arrival behavior was added.
- Generic direct world updates remain capable of constructing relationally inconsistent states. They are required for reconstruction/diagnosis and are not treated as an action boundary; use the safe query before contract actions and repair at lifecycle/persistence boundaries.

## Focused validation and handoff

`npm ci` was authorized in this isolated worktree; it succeeded and `package.json` / `package-lock.json` remained unchanged. The nine selected focused files are listed in `BS11C0_ROSTER_CONTRACT_INTEGRITY.md`; combined original run plus targeted rerun: **61 passed, 0 failed, 0 skipped**. Initial nine-file duration was 108.42 seconds; the targeted rerun of the affected Save, Draft and RosterIntegrity files took 17.35 seconds. `npm run typecheck`: **PASS**. `npm run build`: **PASS** because the structured trade reason added a required presentation label. No full suite ran.

**BS11C0 status: PASS. BS11C may begin.** At extension execution, require `assessActiveContractRosterIntegrity(...) === 'VALID'` AND revalidate that the exact selected ContractId is still the unique active contract. Scheduled-contract activation remains a P1 handoff: BS11C must define successor activation atomically. It must not rely on hidden roster repair for ordinary extension behavior; repair remains recovery, not business logic.
