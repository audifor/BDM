# BS11C0 · Roster / Active Contract Integrity

## Certification scope

This milestone establishes the roster/active-contract precondition for future contract extension execution. It does not implement extensions. Canonical authorities remain separate:

- `Team.rosterPlayerIds`: current sporting membership.
- `PlayerContract.teamId`: contractual party.

For a player with one active playing contract who is rostered, their unique roster team must equal that contract's `teamId`. A scheduled contract is not current roster membership. No active contract means there is no active contract relationship to validate; NCAA participation and World DB roster-only materialization are preserved without synthetic terms.

## Valid, invalid and unknown states

The detailed per-state classification and mutator mapping are in [the audit matrix](BS11C0_ROSTER_CONTRACT_INTEGRITY_AUDIT.md#state-matrix). Valid states include exact active agreement, an unarrived scheduled commitment, NCAA roster membership, no-contract-history imported rosters, and ended contracts retained as history after roster departure. Invalid states include active contract with missing/different roster, multiple active contracts, multiple roster teams, and a roster left behind by its only expired or terminated same-team contract. A scheduled commitment at a different current roster team and professional roster membership with no contract record are not silently reconciled; the repair layer does not invent a relationship.

## Canonical query and validation

`assessActiveContractRosterIntegrity(world, playerId, onDate)` in `src/engine/market/RosterContractIntegrity.ts` returns:

- `VALID`: exactly one active contract and exactly one roster team, the same team.
- `INVALID`: exactly one active contract but roster membership is absent or differs.
- `AMBIGUOUS`: multiple active contracts or multiple roster teams.
- `UNKNOWN`: no active contract.

Use `VALID` as the required BS11C extension precondition, then revalidate the exact ContractId at execution. The query is derived and creates no second roster authority.

`GameWorld` validates references and unique roster membership but does not reject this relational inconsistency at construction time. This leaves imported/persisted states available to the single existing repair authority. Canonical actions now prevent known bad states from being acted on: review eligibility requires `VALID`; trade validation requires a unique matching active contract; release refuses to select one from an invalid or ambiguous state; explicit professional ecosystem transitions verify the source contract relationship; and the roster-only legacy transition refuses active contracts.

## Action and lifecycle behavior

- **Signing:** canonical free-agent signing atomically writes contract, roster, transaction, Governance and negotiated effects; stable identity preserves idempotency. AI emergency `signFreeAgent` writes contract, roster and `WORLD_REPAIR` transaction together.
- **Trade:** moves roster and `teamId` on the existing contract in one world update, preserves ContractId and terms, writes one traded PlayerTransaction and TradeRecord, and keeps retained salary separately.
- **Release:** removes roster, terminates the active contract, clears lineup assignments and records release together. It does not create a replacement contract.
- **Expiry:** date-based status is expired at `expiresOn`; daily reconciliation retains the historical contract, removes roster/lineup membership, and writes a deterministic transaction once.
- **Scheduled contracts:** status becomes active at `startsOn`, inclusive. There is no general automatic roster arrival or transaction. Repair only restores/moves roster membership from existing exact evidence. No hidden arrival or extension semantics were added.
- **Draft:** destination roster arrival uses the draft authority; rookie contract creation depends on configured salary rules. NCAA source roster is detached by the ecosystem gateway. No PlayerTransaction is invented.
- **Recruiting:** arrival adds NCAA roster membership at its configured season boundary without a professional contract.
- **World generation / World DB:** world generation creates professional contracts; NCAA rosters are contractless. World DB bootstrap imports roster assignments without contract terms and stays valid as a roster-only imported context.

## Repair and persistence

`RosterContractIntegrity` remains the only roster/contract repair authority. It can restore missing roster membership only from an exact `signedFreeAgent` transaction. It can move stale membership only from a unique matching release/expiry and signing trail. It never rewrites the contract's team, fabricates history, or chooses between ambiguous claims. Expired/terminated history left on the roster is unresolved.

PlayerTransaction and TradeRecord describe historical events; neither replaces current Team roster state or contract affiliation. The repair logic checks the transaction against its referenced contract and event date before using it.

Save V4's codec continues to reconstruct structural data. At the application boundary, `saveCurrentGame` refuses worlds that would need repair or remain unresolved. `loadSavedGame` invokes existing evidence-based repair and rejects unresolved reports with an explicit error. Valid Save V4 round-trip remains supported.

## BS11B behavior

BS11B review decisions remain nonbinding intent. Review outlook excludes a player whose current relationship is invalid, ambiguous, or unknown. A valid active roster/contract pair retains the existing review behavior. Review intent does not mutate roster, contract, market, or signing Governance state.

## Reuse and changes

- **Connected:** reused `RosterContractIntegrity`, current contract status semantics, canonical market signing, trade execution, release, expiry reconciliation, and ecosystem gateways.
- **Surfaced:** existing structured repair diagnostics now govern persistence and selected action boundaries; duplicate same-team active contracts no longer pass review/release/trade eligibility.
- **Actually new:** derived status query, action preconditions, application Save V4 integrity gate, and this policy documentation. No new roster authority or repair engine.

## P0 and P1 findings

**P0 addressed:** contract-review eligibility and action boundaries could act on ambiguous active contract state; Save V4 application loading did not diagnose relational drift. The new query suppresses/rejects those paths, and persistence uses the existing repair authority.

**P1 remains:** scheduled contracts become active by date, but no general arrival event exists. Without exact signing evidence, repair fails closed rather than adding the player to a roster. Generic direct world updates can still create semantic drift; they are not action boundaries and are covered by the precondition and repair layers.

## Focused validation record

`npm ci` was explicitly authorized for this isolated checkout. The locked dependency install succeeded; `package.json` and `package-lock.json` remained unchanged. No dependency updates or audit fixes were run.

The exact focused files were `src/engine/market/RosterContractIntegrity.test.ts`, `src/app/contractReview/ContractReviewService.test.ts`, `src/engine/trade/TradeEngine.test.ts`, `src/engine/market/ContractLifecycle.test.ts`, `src/engine/draft/DraftEngine.test.ts`, `src/engine/career/EcosystemTransitions.test.ts`, `src/engine/recruiting/RecruitingLifecycle.test.ts`, `src/save/GameWorldSaveV4.test.ts`, and `src/app/save/GameSaveService.test.ts`. Across the nine-file run and the targeted rerun after correcting two test setup/assertion issues: **61 passed, 0 failed, 0 skipped**. Initial nine-file execution took 108.42 seconds; targeted rerun of Save, Draft and RosterIntegrity took 17.35 seconds. The initial DraftEngine run had one existing 5-second timeout while parallel files were busy; the directly rerun DraftEngine file passed all six tests.

`npm run typecheck`: **PASS**. `npm run build`: **PASS**; it ran because the new structured trade reason required a presentation mapping. No full suite ran.

**Execution status: BS11C0 PASS.**

## BS11C readiness

Use `assessActiveContractRosterIntegrity(...) === 'VALID'` as a mandatory execution precondition, AND verify that the exact ContractId selected for extension is still the unique active contract at execution time. **BS11C may begin.** The scheduled-contract P1 is an explicit handoff: BS11C must define successor activation semantics atomically and must not rely on hidden roster repair as ordinary business logic. Repair remains recovery. No extension functionality is present in this milestone.
