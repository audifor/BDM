# BS17E-P2 · Governance bootstrap contract proposal

**Status:** GOV-01–GOV-04 principles are `APPROVED_PRINCIPLE`; concrete templates, competencies, rights, appointments, grants, and bootstrap behavior remain `DETAIL_PENDING`. No grants or organizations are initialized here.
**Baseline:** BS17E-P V1 `9469478380f84a4e10432ba2d662a92204f987b6`.
**Execution:** `BLOCKED_BY_BS16_COMPLETE` for Facilities economic operations.

## Ratified principles and limits

V1 approved operational, institutional, and strategic authority levels and explicit, effective, traceable grants. P2 V1 additionally approved (GOV-01) differentiated templates by actual domain-supported archetype without approving any organigram; (GOV-02) all authority must trace to a legitimate body, identified actor, valid appointment, effective grant, concrete right, applicable scope/date, and verifiable provenance; (GOV-03) user and AI parity; and (GOV-04) the option of a simulated administrative structure for a real organization whose institutional data is insufficient, visibly distinguished from documented fact and without creating people/grants absent a detailed bootstrap policy.

No specific archetype-to-organigram mapping, authority competence, role-right assignment, generated person, grant, validity period, or revocation date is approved. This proposal offers candidate designs only and is not permission to write a grant or appoint a person.

Governance remains the sole authority for institutional decisions. Finance remains sole authority for financial eligibility, reservations, commitments, recognition, payables, settlement, and ledger. Facilities owns physical need and work. The existing Governance structure initializer is structural only: `planGovernanceStructureInstantiation` uses caller-supplied IDs and creates missing bodies; it does not create appointments, actors, or authority grants. Its comments explicitly prohibit fabricating people or authority. There is no production bootstrap caller for Facilities grants identified at this base; test fixtures do create grants for tests.

## Supported institutional archetypes found — structures are descriptive, not approved organigrams

`GovernanceUniverseProfile` supports the following structural profiles and ownership models. These are code-supported profile kinds, not a guarantee that every production organization has a profile, verified governing documents, or usable grant.

| Profile kind | Existing ownership model(s) | Existing expected body structure | Authority caveat |
|---|---|---|---|
| `PROFESSIONAL_CLUB` | `PRIVATE`, `OWNERSHIP_GROUP`, `MEMBER_OWNED`, `MULTISPORT_SECTION` | Usually `OWNERSHIP` → `BOARD` → `EXECUTIVE`; multisport section uses `BOARD` → `EXECUTIVE`, with `ATHLETIC_DEPARTMENT` optional. | Current member-owned profile has no dedicated member assembly body. Do not invent one; authority remains unverified unless source data maps the real structure. |
| `NBA_FRANCHISE`, `WNBA_FRANCHISE` | `PRIVATE`, `OWNERSHIP_GROUP` | `OWNERSHIP` → `BOARD` → `EXECUTIVE`. | Shared men/women teams may belong to one institution; grants currently resolve at institution + decision type, not team section. |
| `NCAA_PROGRAM`, `NCAAW_PROGRAM` | `UNIVERSITY` | `BOARD` → `EXECUTIVE` → `ATHLETIC_DEPARTMENT`; `COMPLIANCE` optional. | These profiles map to the `NCAA` Governance universe. A profile does not prove a university parent, appointment, or spending authority. |
| `FEDERATION` | `FEDERATION` | `BOARD` → `EXECUTIVE`; `COMPLIANCE` optional. | A federation structure is not evidence of authority over a club or facility unless explicit institutional relationships/grants establish it. |
| Unsupported or insufficiently identified organization | None established by the profile enum | No approved structural template. A simulated administrative structure is an approved possibility under GOV-04 but has no detailed bootstrap policy yet. | Mark `SIMULATED_INSTITUTIONAL_STRUCTURE` if a future approved policy creates one; keep authority `INSTITUTIONAL_AUTHORITY_UNVERIFIED` until valid grant and appointment facts exist. |

The underlying `Organization` is intentionally generic. Governance institutions separately identify their universe and linked `teamIds`, with an optional `parentInstitutionId`. The profile/structure resolver can recognize shared parent-body reuse, but it does not itself decide which shared parent may authorize Facility spending. Existing body structures in the table describe current domain code only; GOV-01 explicitly leaves all specific organizational templates pending product policy.

## Recommended topology by archetype — proposal only

Use actual linked institutional facts first. The table proposes candidate routing for later approval; **it grants no `PROPOSE`, `REVIEW`, `APPROVE`, `VETO`, or `EXECUTE` rights**.

| Archetype | Operational candidate | Institutional candidate | Strategic candidate | Required unknown behavior |
|---|---|---|---|---|
| Private / ownership-group professional club or franchise | `EXECUTIVE`; source-backed `ATHLETIC_DEPARTMENT` may handle physical coordination but not by sport role alone | `BOARD` | `OWNERSHIP` when a valid body and actual authority link exist | Missing body, ownership record, appointment, or grant blocks the relevant decision as unverified. |
| Member-owned professional club | `EXECUTIVE` only if supported by actual appointment/grant | `BOARD` only if source-backed | Membership apex is unresolved in the current body kinds | Keep strategic permission unverified; do not convert `OWNERSHIP` into a member assembly by assumption. |
| Multisport club / section | `EXECUTIVE`; optional athletic department only when source-backed | `BOARD` | Source-backed apex body, otherwise unverified | Do not treat basketball-section responsibility as spending authority. |
| University program (NCAA/NCAAW) | `ATHLETIC_DEPARTMENT` as operational candidate, only via grants | `EXECUTIVE` or governing `BOARD` as an institution-specific approved route | Parent university institution/body when linked and explicitly authorized | If parent/charter or body relation is absent, no guessed university override; authority is unverified. |
| Federation | `EXECUTIVE` as operational candidate | `EXECUTIVE` or `BOARD` under approved federation charter | `BOARD` as candidate only where charter/grants support it | No inferred control over member clubs or external facilities. |
| Unknown real-world institution | None | None | None | No bootstrap; retain `INSTITUTIONAL_AUTHORITY_UNVERIFIED`. |

**Recommended principle:** select the authority level from the approved scope classification and source-backed institution profile, then resolve actual participating bodies through existing grants. Do not add a `level` field as a parallel authority. If the existing decision type/subject/grant graph cannot express a required distinction, stop for an approved adapter or contract change.

## Candidate rights flow — no grants assigned

Existing rights are `PROPOSE`, `REVIEW`, `APPROVE`, `VETO`, and `EXECUTE`. Existing `GovernanceAuthorityGrant` is an effective-dated edge between bodies for a decision type; `GovernanceDecisionParticipationGrant` associates that edge with a body and right. The canonical resolver evaluates institution, decision type, grant dates/revocation, and participation. It does not take a team/Facility scope, and the grant itself does not establish that a human or AI actor currently holds an appointment in the authorized body.

Proposed rights matrix for product approval:

| Level | `PROPOSE` | `REVIEW` | `APPROVE` / `VETO` | `EXECUTE` |
|---|---|---|---|---|
| Operational | Source-appointed operations/executive actor, if an explicit grant exists | Optional second operations body only if approved separation policy says so | An explicitly authorized operations body only for the operation set product approves; no automatic manager right | Authorized operations actor after Governance and applicable Finance gates |
| Institutional | An organization-appointed sponsor/body with `PROPOSE` right | Institutionally authorized board/executive body according to actual charter/grants | Explicit decision body/grant; exact requirements and veto stages require ratification | Body/actor authorized for that decision; never implied by being a proposer |
| Strategic | Explicitly authorized institutional apex body | Review by any approved intermediate body | Explicit strategic approval/veto grant; no monetary threshold is inferred | Authorized executor only after Finance permission and other approved gates |

This is intentionally not a completed grant table: assigning a right to every archetype now would invent the very topology still pending. A later contract must map each Facilities operation class to (a) level, (b) existing Governance decision type/subject, (c) source body/target body edge, (d) participation rights, (e) required current appointment/actor, and (f) event transitions. An approval event does not establish economic authorization or physical completion.

**Candidate operation-level mapping for approval:** routine maintenance and restorative repairs whose scope preserves existing function → operational; extraordinary repairs and structural renovations → institutional; expansion, construction, and structural investment → strategic. Replacement and mixed-scope actions follow E-P01's evidenced nature/breakdown and remain unclassified if scope is unclear. “Extraordinary” must be defined by factual scope/authority policy, not an invented monetary threshold. This mapping does not grant any level's bodies rights.

## GOV-04 · Simulated administrative structure for real organizations

**Status:** possibility `APPROVED_PRINCIPLE`; bootstrap details `DETAIL_PENDING`.

When authentic organizational information is insufficient, a later approved bootstrap policy may provide a simulated administrative structure. This possibility is approved; its eligibility, templates, source and lifecycle are not. It must remain labeled `SIMULATED_INSTITUTIONAL_STRUCTURE`, never replace known `DOCUMENTED_INSTITUTIONAL_FACT`, and must not by itself establish a decision right. If no valid appointment/grant follows, the affected authority remains `INSTITUTIONAL_AUTHORITY_UNVERIFIED` and the economic action stays blocked. The three labels are conceptual and should map to an existing canonical taxonomy if available.

## Bootstrap proposal — details pending

### Imported / authentic organizations

1. Link an organization to an institution only through a canonical source identity or an explicit reviewed mapping. Preserve imported bodies, appointments, grants, IDs, source facts, and dates exactly.
2. A future approved policy may add a clearly labeled simulated structural template where authentic institutional facts are insufficient. It must never overwrite documented facts or imply an authentic organigram.
3. Never synthesize a director, owner, trustee, board member, appointment, or grant to fill a missing source fact under this ratification. Without an actual authorized actor, appointment, and effective grant, authority remains `INSTITUTIONAL_AUTHORITY_UNVERIFIED` and the affected economic command is unavailable.
4. Structural discrepancies may be reported using the current structure resolver; do not “repair” them by overwriting an authentic record.

### Fictional organizations generated by BDM

1. Bootstrap only after product approves the organization archetype-to-structure and grant policy and the generator has an explicit source for its institution identity, parent links, and any appointed actors.
2. Use stable deterministic IDs derived from the generated organization identity, archetype, and approved bootstrap-policy version. Re-running bootstrap must be idempotent. Existing source-authentic IDs win; collisions or incompatible structures block atomically.
3. Create only the approved structural bodies. Create an appointment only for an actual generated/known actor with an approved role and source; no synthetic leader may be invented by this proposal.
4. Create authority and participation grants only from a separately approved policy with explicit grantor/grantee bodies, decision type, rights, effective date, and source/version provenance. No universal default manager grant and no inferred grant from ownership.
5. Record explicit provenance. Current `GovernanceAuthorityGrant` does not carry a source/policy reference; if the future bootstrap needs durable provenance beyond stable IDs and decision-event grant references, define a narrow Governance-owned reference/metadata contract first. Do not write provenance into a parallel Facilities field and call it Governance authority.

### Missing or ambiguous institutions

If the universe/profile, parent, governing body, appointment, grant, actor identity, or effective date needed for an action is missing/ambiguous, return `INSTITUTIONAL_AUTHORITY_UNVERIFIED`. A future simulated structure may clarify structural presentation but does not clear missing actor/grant authority. The game may still show the physical need and allow non-authoritative inspection. No approval, finance reservation, binding obligation, or economic work starts through that route.

## Effective dates, appointments, revocation, and continuity

- Authority grants and appointments are date-effective; a new command/event must resolve rights on its effective date and retain the supporting grant IDs. Never backdate or silently extend a mandate.
- A manager change updates/end-dates the relevant appointment from its sourced effective date. It does not create a new body grant or transfer approval power just because the user controls the team.
- Revocation takes effect only at an explicit policy/source date. Do not invent term lengths or expiry. A grant with no end date remains active until a valid revocation event or source record; a missing renewal source must not be interpreted as renewal.
- Preserve prior decision events and their historical grant IDs. A pending proposal remains pending; for a later approval/execution event, re-resolve current actor appointment and right. If authority changed, block or route to a currently authorized body under an approved transition policy; do not reattribute the old event.
- Conflicting active grants, invalid hierarchy, or disputed competence produce a blocked/unverified result until an authorized resolution. No “highest body wins” fallback is assumed.
- Save/reload preserves institution/body/appointment/grant identities, effective dates, revocations, and decision-event references. Legacy saves with absent structures/grants remain unverified; migration must not seed grants.

## Shared organizations and AI parity

Where men’s and women’s teams share one organization/institution, retain one canonical governance institution and its authentic parent/body graph. Current rights resolution is institution-scoped, so any approved grant can apply across that institution's supported decision types; current model does not provide team-specific Facilities rights. Product must choose either common institution-wide authority or approve a narrower scoped-decision contract. Do not clone Boards or grants per team to simulate a scope the resolver does not have.

User and AI operations use the same proposal, rights resolution, Finance gates, and event commands. AI is not an authority body or grant. An AI proposal/approval must identify a real source-backed actor appointment and an explicit grant. If the AI has no such actor/right, the operation stays unapproved; no automatic investment or human-manager proxy is allowed.

## Decisions and alternatives requiring ratification

- Approve or replace each archetype candidate topology in the table, particularly member-owned, university parent, federation, and shared-team cases.
- Map operation nature/scope to operational, institutional, or strategic level without inventing numeric thresholds; define the factual criteria separating “routine” from “extraordinary.”
- Decide whether a single explicit role/grant can propose and approve or whether review/separation is required at each level.
- Approve who may execute physical work after approval and the order relative to Finance gates; execution is not payment.
- Define source-backed bootstrap eligibility and deterministic identity/version rules for fictional BDM organizations; decide behavior for a profile with missing source institution data.
- Decide whether grant provenance requires a Governance model extension; preserve Save V4 validation and older saves.
- Choose institution-wide or finer-than-institution rights for shared organizations. Current resolver offers only institution + decision type + date.
- Decide how pending proposals are handled after the approving actor's appointment ends or grant is revoked.

## Future causal tests (not run in this documentary phase)

- Enumerate each supported profile and show that structure-only planning creates bodies only; it never creates a person, appointment, or grant.
- Imported organization with complete source records preserves all IDs; incomplete/unknown records produce `INSTITUTIONAL_AUTHORITY_UNVERIFIED` without mutation.
- Approved simulated bootstrap is stable/idempotent across new-game retries and conflicts atomically with existing IDs; no authentic data is overwritten.
- Each decision right succeeds only with the matching effective grant, body, appointment/actor, decision type, and date; expired/revoked/wrong-type/wrong-institution edges fail.
- Manager replacement and grant revocation preserve historical events and require current authority for later events.
- Shared institution behavior proves chosen scope; absent narrower scope cannot leak a grant into an unintended team action.
- User and AI use identical commands and denial conditions; AI without grant cannot approve or execute.
- Save/reload and old-save migration preserve facts and never initialize grants; replay creates no duplicate bodies, appointments, or grants.
- Governance approval alone changes neither Finance nor physical state; insufficient Finance authorization blocks the contract/work step.
