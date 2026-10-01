# BS10D-D2 Formal Offer Semantics and Commitment Authority Audit

## 1. Lifecycle semantics

`MarketEngine.openNegotiation` creates a round-zero `OPEN` record with annual salary, years, role, and agent fee. `agentCounter` is the only production transition found: it changes `OPEN` to `COUNTERED` and adjusts salary and agent fee. `ACCEPTED` and `REJECTED` exist as representable statuses, but there is no canonical response/acceptance/signing path. The Market UI and minimum-roster repair use a direct-sign service instead of this negotiation lifecycle.

For D2, `OPEN` means a club has submitted a nonbinding formal proposal in an ongoing negotiation. `COUNTERED` means the other side has countered the salary/terms; `ACCEPTED` can mean agreement on the terms that were actually proposed, but it does not create a contract. Only the later authorized signing transition may create `PlayerContract` or financial commitment.

## 2. Field-by-field semantics and Path B

**Path B is selected.** Repository consumers do not establish role and fee as mandatory first-offer terms. They are optional proposals/commitments that may remain absent while the salary and contract duration are negotiated.

- **Salary:** Required on `OPEN`. It is the club's annual salary proposal and is also the core expense consumed by payroll feasibility and eventually by `PlayerContract`.
- **Years:** Required on `OPEN`. It is the proposed contract duration and maps to the contract term dates.
- **Role:** Optional on `OPEN`. When present, `ContractNegotiation.role` is the club's role proposal; it is not a `PlayerContract` field. `RolePromise` is a distinct accepted promise (`acceptedOn`, `ACTIVE | FULFILLED | BROKEN`). The repository does not create it from `OPEN` or `ACCEPTED`; a future signing path should create it only when the parties have agreed to a role promise. No need-to-role selector exists, so this milestone does not propose one.
- **Agent fee:** Optional on `OPEN`. The current numeric field has no consumer outside `agentCounter`: it is not stored in `PlayerContract`, a payable, a salary schedule, or another signing record. It is an implementation convenience for the old counter formula, not evidence of an opening demand or a final cost. No zero, percentage, or agent-ability default is truthful. A real fee must be based on explicit information and, before commitment, gain a canonical payable/contract-cost representation.

`PlayerContract` requires player/team, start/expiry dates and positive annual salary. Its optional compensation schedule is salary-only. Years are expressed by contract dates. Role is not a signing prerequisite unless the club agrees to promise one. Agent fee is not a contract prerequisite when none is agreed; if a fee is agreed, signing must not proceed until that fee can be recorded and accounted for.

## 3. Counter semantics

`agentCounter` can continue to raise the salary for an `OPEN` offer with no agent fee. It must only adjust `agentFee` when an opening fee proposal already exists. If no fee was proposed, the agent counter leaves the fee absent; it does not synthesize an amount from agent ability. This preserves the existing salary counter mechanic without inventing fee authority.

## 4. Governance audit and boundary

Governance V2 authority is institution-specific: decision types are authorized through dated body grants and participation rights. `PLAYER_BUDGET` accepts only a `BUDGET` subject, so it represents a budget envelope and cannot approve one player's offer or signature. The configured player salary budget plus `canTeamAffordAdditionalSalary` supply the financial feasibility check; `submitPlayerContractOffer` supplies the operational executor. A nonbinding first offer within current payroll feasibility is operational and requires no separate Governance decision. This is the selected offer rule; `PLAYER_BUDGET` does not silently authorize overspending.

Final contract signing is a separate reusable institutional decision: it turns a negotiated proposal into the club's binding player contract and guaranteed payroll obligation. D2 adds the ecosystem-neutral `PLAYER_CONTRACT_SIGNING` Governance type with a generic per-negotiation subject. Authority remains institution-specific through existing explicit grants; no grant is created by defaults, so old saves acquire no signing permission. It is `EFFECT_REQUIRED`, reflecting that a signed decision must eventually have a canonical contract effect. The current D2 does not implement that effect.

No universal owner, president, GM, or board role is selected. NBA/WNBA, FIBA/pro clubs, NCAA programs, federations, and other institutions use the same decision key and their own grant graph. An absent or ambiguous Governance institution and a missing grant never become authorization.

## 5. Execution and attribution

The existing `submitPlayerContractOffer` responsibility has the proper global boundary, roster/cap-competent eligible roles, and `userControlled | delegated` modes. A user team's explicit action resolves a USER actor. AI execution requires a current, eligible delegated staff holder. Contact authority does not confer offer authority.

Negotiation identity already carries `responsibleActor` from contact. D2 makes `contactResponsibleActor` explicit and adds separate `offerResponsibleActor`. New contacts record the contact actor; opening preserves it and records the validated offer actor separately. The old `responsibleActor` remains optional for legacy save decoding: old CONTACTED records are interpreted as contact attribution, while old formal records retain only their ambiguous legacy `responsibleActor`. D2 does not infer historical offer attribution.

A formal transition must require the exact current `CONTACTED` record, positive `OPEN_TO_TALKS`, current free-agent status, exact team/organization/player/source plan/source proposal/action key/opening key, affordable salary, and a validated separate offer actor. It updates that record in place. The application caller remains responsible for rebuilding the current GM/BS10C route immediately before this engine operation.

## 6. Persistence and direct-sign findings

`GameWorldSaveV2` persists market negotiations as JSON objects and parses their contents as records; absent optional role/fee/actor fields remain absent. The actor additions are optional and require no version bump or invented migration. Focused save round-trip coverage is appropriate because the negotiation shape changes.

The direct Market UI signing path and `maintainAiTeamMinimumRosters` bypass `ContractNegotiation`, Governance signing authority, and the BS10D route. D2 does not change either signing path. This remains a P1 legacy acquisition/signing boundary to resolve in a separate authorized milestone.

## Findings

- **P0:** None in the read-only BS10D-D preparation path.
- **P1:** The current `OPEN` type overstates terms as mandatory and `agentCounter` assumes a fee; D2 will make role and fee optional and counter them only when present.
- **P1:** There is no canonical acceptance-to-signature path. D2 introduces a signing decision type, but a later milestone must enforce its explicit grant before any contract mutation and record an agreed agent fee as a real cost before signing.
- **P1:** Legacy direct signing for the Market UI and AI minimum-roster repair bypasses the formal negotiation and signing-authority boundary.
- **P1:** AI teams without explicit `submitPlayerContractOffer` delegation remain unable to submit, by design.
