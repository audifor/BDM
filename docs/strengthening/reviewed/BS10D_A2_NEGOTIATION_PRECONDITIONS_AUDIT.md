# BS10D-A2 Negotiation Preconditions Audit

**Audited base:** `54eee2749532999da71ca5be30620a22c6421c2e` (BS10D-A)
**Decision:** Path B — distinguish pre-offer contact from a formal offer.

## 1. Existing lifecycle and meaning of `openNegotiation`

`MarketEngine.openNegotiation` creates one `ContractNegotiation` in `OPEN`, at
round zero, with organization, player, salary, years, promised role and agent
fee already present. In basketball transaction terms, that is a submitted
formal first offer. It is not merely permission to call a player or agent.
The old API name is broad enough to obscure that boundary, but its fields and
status encode a formal offer.

There is no canonical pre-offer contact state or contact operation in the old
model. `OPEN` is not contact. The Market workspace signs a free agent directly
through `signFreeAgent`, while AI minimum-roster repair also signs directly via
that service. Neither path runs through ContractNegotiation.

The only negotiation response transition found is the pure `agentCounter`
function: it changes an `OPEN` offer into `COUNTERED`, using agent ability and
personality. No engine progression, club counter, acceptance/rejection action,
expiry, or accepted-offer-to-contract conversion exists. `ACCEPTED` and
`REJECTED` are representable statuses, but no canonical service creates those
transitions or a signing from acceptance. `RolePromise` is a separate persisted
record and is not created from acceptance here.

## 2. Fields by stage

| Stage | Truthful fields | Deferred fields |
|---|---|---|
| Contact | team, organization, player, start date, stable action key, source plan/proposal when known, responsible actor | salary, years, role, agent fee |
| Formal first offer (`OPEN`) | the same identity/provenance plus exact salary, years, role, agent fee, optional agent, round | acceptance, contract creation, transaction completion |
| Counter (`COUNTERED`) | changed formal offer terms and round | club response and signing |

All four offer terms are required only because `ContractNegotiation` was
modeled as starting at the formal-offer stage. They are not contact
preconditions. `MarketKnowledge.expectedYears` is an observation, not a term
selection. `PlayerRepresentation` identifies an agent, not an opening fee.

## 3. Field authorities

- **Salary:** BS10C's organization-scoped `expectedSalary` is a market signal.
  It may be displayed with provenance and rechecked against current payroll;
  it is not an actual submitted salary. No fallback uses ratings or
  `MarketReality`.
- **Term:** no club term-selection policy was found. `expectedYears` remains a
  signal and the selected offer term is unknown.
- **Role:** `STAR | STARTER | ROTATION | DEPTH` exist on offers and role
  promises, but neither ClubNeed nor current role/retention advisories define a
  supported incoming-player mapping. Incoming role remains unknown.
- **Agent fee:** representation identifies an agent, but there is no opening
  fee schedule on Agent, Agency, PlayerRepresentation or MarketKnowledge.
  `agentCounter` only modifies a submitted offer. Opening fee remains unknown.

## 4. Consumers and persistence

`GameWorld.negotiationsById` is the canonical collection. Save V1/V2 already
serialize it as market runtime; the V2 market parser treats entries as typed
records without a closed field whitelist. Simulation breakpoints observe
`OPEN` and `COUNTERED`. BS10D-A intelligence and Analysis consume negotiation
records read-only. The old `openNegotiation` function has no production caller.
No canonical accept/reject/signing UI or workflow was found. The Market UI's
direct-sign shortcut and AI minimum-roster repair are separate legacy paths and
do not demonstrate negotiation authority.

## 5. Responsibility, Governance, and Finance

`recommendSignings` is the closest incoming-player responsibility. It supports
`userControlled`, `advisory`, and `organizational`, but not `delegated`. A live
holder can be resolved only from the responsibility row, StaffPerson, valid
role, and current team assignment. This assigns recommendation responsibility;
it is not execution permission. `contractRecommendation` concerns current
contract retention, and `shortlistPlayers` is candidate curation. There is no
canonical staff responsibility for executing a player negotiation.

Governance V2 has `PLAYER_BUDGET` and `BUDGET`, but no signing, contract offer,
or player-acquisition decision type. Neither broad `EXTERNAL_ACQUISITION` plan
selection nor budget authority establishes authority to contact, offer, or
sign. Signing Governance remains unknown; no new decision type is justified by
this audit alone.

`canTeamAffordAdditionalSalary` checks current player payroll and the current
player salary budget. This is economic feasibility only. Finance V2 remains
organizational financial context; no rule makes `STRESSED` or `CONSTRAINED`
an automatic prohibition. Affordability, Governance, and performance authority
remain separate checks.

User-controlled Market UI can currently invoke a direct signing operation;
that legacy operation is an application authority path separate from
negotiation. It does not resolve the formal-offer or signing Governance gap for
the BS10D workflow. AI staff recommendation must not be treated as execution
authority. AI minimum-roster repair is a separate automatic repair path and is
listed as a remaining finding below.

## 6. Path decision and smallest correction

**Path B is selected.** Basketball clubs can make non-binding contact to learn
whether a player is interested and to clarify expectations before selecting a
term, role promise, or fee. Those unknowns make it false to model contact as an
already complete formal offer. Path A would force unsupported club intent into
the initial action.

The existing `ContractNegotiation` collection is retained; a second acquisition
workflow is not introduced. `CONTACTED` is the term-free pre-offer state and
`OPEN` explicitly means a formal first offer. The formal-offer transition
updates the same contact record when its stable key and provenance match.
Existing status and offer fields remain intact for legacy saves. A pure contact
constructor defines the truthful shape; production BS10D-A2 assessment does
not create a contact or negotiation record.

## 7. Identity, uniqueness, and idempotency

The former ID used organization + player + current date. A rejected same-day
record therefore collided with a later valid attempt. New IDs use the encoded
organization, team, player, and stable caller-supplied `actionKey`. The key identifies
one intended attempt, normally grounded in its source plan/proposal and attempt
lifecycle. Replaying an identical formal-offer command returns the same world;
reusing its key with changed terms is rejected. A new legitimate attempt needs
a distinct action key. This key is carried on the negotiation itself rather
than in a second persisted intent index.

At most one active record per team/player is supported: `CONTACTED`, `OPEN`, or
`COUNTERED`. Historical offers remain addressable. A closed record with its
own old key does not block a different later key. Legacy offers without
`teamId` conservatively block a matching organization/player pair. Parallel
negotiations for one team/player are not supported; GameWorld construction
rejects duplicate active records, and the formal-offer engine boundary also
checks before adding or advancing an attempt.

The BS10D-B caller must keep one stable key across retries and must supply a new
key only after a new attempt has actually been initiated. BS10D-A2 does not
invent or persist that action lifecycle. A caller that cannot identify the
same intent across retries must not mutate.

## 8. Current-state checks and offer preparation

Formal offer creation rechecks that the player is currently a free agent and
that the team belongs to the specified organization. The BS10D-A2 assessment
separates `contactReadiness` from formal offer `readiness`: contact readiness
does not require salary, term, role, or fee; it still reports contact authority
as unknown. Current proposal routing recomputes BS10C from the live world, and
an assessment whose referenced plan is missing, belongs to another team/need,
or no longer selects external acquisition is marked stale.

Before mutation, BS10D-B must recompute the current GM workflow, BS10C proposal
and candidate from the live world, confirm the exact proposal remains selected
and eligible, recheck free-agent status, read current salary/market signals
according to their existing date semantics, check payroll, and recheck active
attempts and the stable opening key. A historical BS10C result is not authority
to mutate. No market-signal freshness threshold currently exists, so one is not
invented here.

## 9. Required BS10D-B boundary

BS10D-B is not safe yet. It must remain blocked until it can resolve a truthful
performer path and contract-signing Governance authority, plus selected term,
incoming role, and opening agent fee. It must distinguish user-controlled
application authority from AI execution authority. It must revalidate current
proposal/free-agent/payroll state immediately before mutation, use a stable
action key, enforce active team/player uniqueness, and create only the stage
actually authorized: contact without offer terms, or a formal offer with exact
known terms. Acceptance must not silently create a contract until a canonical
signing conversion is specified and authorized.

No contact, offer, negotiation, contract, signing, Finance proposal, Governance
request, or trade is created by this milestone. Trade and transfer paths remain
deferred.

## 10. Findings

### P0

- None in the read-only BS10D-A2 path; unknown terms and authorities remain
  explicit, and no contact or offer is executed.

### P1

- No club authority selects offer term, incoming contract role, or initial
  agent fee.
- Governance V2 has no signing-specific decision domain; recommendation and
  budget grants do not fill it.
- No staff responsibility grants AI negotiation execution.
- The existing AI minimum-roster repair can directly sign through the separate
  legacy Market service based on payroll and deterministic bootstrap terms; it
  does not use BS10D offer intelligence or a signing-specific authority check.
  That repair path needs a separate product/architecture decision before it is
  treated as ordinary AI acquisition.
- No canonical response/expiry/acceptance-to-signing workflow exists, and there
  is no market signal freshness policy.
- Stable idempotency depends on the future caller supplying the same action key
  on retry and a new key only for a genuinely new attempt.
