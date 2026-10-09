# BS15H Talent Operations Gameplay UX

## Screen inventory and information architecture

Talent Operations is the attention-oriented entry point. It links to the existing Scouting, Recruiting and Draft workspaces, the new Transfer Portal workspace, and the existing Player profile. The shared compact navigation is embedded in each talent workspace; there is no permanent sidebar.

Performance sample: the existing Scouting workspace read model constructed a 280-player addressable list in 12.8 ms in the focused Vitest run. The sample uses known/rostered and public opponent Players; it does not enumerate latent TalentCohort candidates.

| Screen / route | Purpose | Canonical reads and actions |
|---|---|---|
| Talent Operations (`app=talent`) | Active scouting queue, recently discovered but unevaluated Players, recruiting target count, authorized Portal count and configured upcoming deadlines | Existing awareness, knowledge, assignment, board, Portal and Draft records; actions navigate to existing workspaces or the same Player profile. |
| Scouting (`app=scouting`) | Discovery, knowledge, assignment, report, focus and territory operations | Existing Scouting workspace model and commands. Discovery remains distinct from completed reports. |
| Recruiting (`app=recruiting`) | Initial and transfer recruiting, known priorities, relationships, actions, concerns, promises and signing | Existing Recruiting profile and commands. Portal deep links focus the same Player in the active Recruiting profile list. |
| Transfer Portal (`app=portal`) | Authorized external transfer candidates and own roster Portal retention steps | Canonical Portal entries, effective ruleset provenance, destination-specific eligibility assessment, transfer authorization and Portal lifecycle commands. |
| Draft (`app=draft`) | Player career decisions, Draft board, deadlines, results, rights and contract separation | Existing Draft, organization knowledge, career decision, rights and contract authorities. |
| Player (`app=player&playerId=…`) | Shared identity, scouting knowledge, recruiting, Portal, Draft and eligibility snapshot, contract and pathway history | `buildTalentPlayerViewModel` projects one PlayerId from organization knowledge and canonical pathway records; existing Player models supply performance and history. |

## Common navigation and status language

`TalentOperationsNav` gives direct top-level movement between the applicable talent workspaces. Recruiting and Portal links appear for NCAA-like careers; Draft appears where the game supports Draft. Player links preserve the selected PlayerId.

Portal list states use the canonical `noticePending` / `authorized` lifecycle, show the notification date, source institution and exception when present, and label destination eligibility `Unknown` when no program-specific assessment exists. The derived Portal Player projection adds the current-season public stat line, current pathway, position, roster role, and a Place region only when a materialized Player has a canonical `COUNTRY_REGION` Place. The list does not display source-program relationships or motivations. Simulated future rules retain the domain ruleset provenance and are not described as official policy.

Knowledge and confidence remain organization-scoped. The Talent Operations overview only lists discovered Players with no known organization-knowledge domains as “not a completed Scouting report.” It does not read or scan latent TalentCohort candidates.

## Action mapping

| User action | Command / destination | Visible result |
|---|---|---|
| Open a Scouting assignment or discovery | Existing Player profile or Scouting workspace | Same PlayerId; discovery remains separate from an evaluator report. |
| Add an authorized transfer Player | `gameStore.addTransferRecruitToCycle` | Success adds the canonical transfer RecruitProfile, then opens that Player focused in Recruiting; returned reasons appear as feedback. |
| Complete own Player's education module | `gameStore.completeTransferEducationModule` | Canonical module date and processing due date appear on the same Portal entry. |
| Process own Player's notice | `gameStore.processTransferPortalEntry` | Portal status changes to authorized when the canonical lifecycle accepts it. |
| Withdraw own authorized Portal entry | `gameStore.withdrawTransferPortalEntry` | Canonical withdrawal is recorded; corresponding open/committed transfer profile is closed by its authority. |
| Recruiting and Draft actions | Existing Recruiting and Draft store gateways | Existing workspaces own action availability and consequences. |

## Uncertainty and provenance

- Missing program eligibility assessment is shown as unknown; it is not inferred from the source institution's assessment.
- The UI does not surface universal interest or transfer-probability percentages.
- Transfer records shown as candidates must be authorized and belong to the user's college ecosystem. Own notice-pending entries remain visible for retention actions.
- The Portal list does not read private RecruitingIntel from the source program.
- Existing Scouting and Draft boards continue to consume organization-specific knowledge rather than hidden Player Truth.

## Blocked action patterns

- A transfer candidate is actionable only when the canonical destination authorization check passes, an open Recruiting cycle exists, and the player is not the user's own Portal record.
- Missing open cycles and failed destination eligibility/authorization receive visible explanations in the Portal list.
- Education-module and notice-processing controls are shown only for the user's own pending Portal entry and only when the canonical prerequisites/date allow the next action.
- Existing Draft read-model reasons remain in `DraftPlayerStatus`; Recruiting result codes are translated to explanatory text, with unrecognized codes rendered as readable words.

## Navigation map and end-to-end flow

```text
Talent Operations → Scouting → same Player profile → Recruiting
Talent Operations → Transfer Portal → add to Recruiting → same Player focused in Recruiting
Talent Operations → Draft → same Player profile → pathway/history tab
Own roster Player → Transfer Portal notice → education module → processing → stay or Portal withdrawal
```

The existing Player history model remains the transition record for recruitment, enrollment, transfer movement, Draft, rights and professional contract. BS15H adds workspace navigation and views; it does not add a second event log.

## Closure additions

- Talent Operations now renders derived attention and deadline projections from canonical Scouting reports/awareness, Recruiting concerns, Portal lifecycle, eligibility assessments, and Draft decision dates. The existing persistent Inbox has no generic application-item contract, so the feed stays derived in Talent Operations.
- Player history adds workspace links for stable Draft, Portal, Recruiting/enrollment, professional contract, and pathway destinations. Each link preserves PlayerId and uses focused workspace context when available; ordinary medical/history rows remain informational.
- Portal filters cover Player/institution, position, eligibility, current pathway level, materialized Place region, roster-derived positional need, and known compensation context. Region remains unavailable for Players without a canonical materialized Place; there is no universal Place fact on the Player profile. Positional need uses the existing Recruiting roster projection. Compensation context is shown only for the user's own roster Player, because private rival compensation/relationship facts are not visible to the user's program.
- Portal public production is projected from canonical current-season Player stats into the table; no Portal state duplicates those statistics.
- Own-Player retention context uses the canonical continuation assessment and shows stay/leave reasons, unresolved concerns, measured promise fulfillment, actual role/minutes, Head Coach, separate Athletics Aid / Institutional Benefits / third-party NIL contexts, and Portal lifecycle. The Portal action buttons still use canonical store commands.
- No separate Talent inbox authority, new event log, or persisted application state was introduced.

## Remaining data limits

- The baseline does not store a universal Portal window deadline for every possible Player, nor does it store eligibility-specific deadline dates. Deadline cards only use the per-entry institutional processing deadline and other configured Recruiting/Draft dates.
- Compensation filters only use compensation records the user's program can legitimately inspect. Rival private aid/benefits/NIL and recruiting relationships are not projected.
- Staff capacity remains owned by Scouting and Recruiting workspaces; Talent Operations routes the user into those canonical screens.
- No academy workspace is added because youth/academy has no existing end-user route or supported dedicated command surface in the baseline.
- Long-horizon population, save growth, and future ruleset certification remain BS15I.
- The Tauri development binary compiled and launched, but the desktop automation connector returned no available apps/windows. Visual inspection of the live desktop window was unavailable; automated UI integration coverage is used for the product smoke fallback.
