# BS14H FM Scouting Gap Audit

## Answer first

**What can the user do in FM-like scouting that they cannot do in BDM today?**

FM lets the user describe a recruitment need without selecting a player first, assign one or more Scouts to investigate that brief, and receive progressively discovered matching and near-matching candidates as time and staff workload advance. The user can inspect active and completed focuses, see who is assigned to each Scout's work, and move from a candidate to a deeper report or shortlist/search decision. FM also exposes a broad player search that can later become a recruitment focus. BDM's current Scouting workspace starts from known Player identities: its player report command needs a `PlayerId`; its country/competition coverage independently discovers identities, but cannot carry a recruitment brief, position/age/knowledge criteria, multiple Scout focus ownership, candidate fit, or focus history. There is no broad Player Search or Scouting Centre summary that connects these steps.

## Reference material inspected

The supplied audit is at `C:\Users\jorge\Documents\FM24-auditoria`. This review used:

- `flujos_fm24.md`: Recruitment Overview, Player Search, Shortlist, Scouting Assignments, Scouting Centre and Scouting Responsibilities flows.
- `datos_extraidos/actions_tutorial_hints_templates/tutorial/inductions/scouting assignments.xml`, `scouting centre.xml`, `recruitment player search.xml`, and `onboarding recruitment focus induction.xml`.
- `datos_extraidos/interfaz_panels_menus_shortcuts/panels/club/active recruitment focuses panel.xml`, `scouting assignments.xml` and `scouting assignments manager home.xml`.
- `.../panels/human/recruitment focus popup.xml`, `.../panels/widgets/scouting centre focus review card.xml`, and `.../panels/widgets/scouting centre recommendation card.xml`.

These sources describe the user-facing FM24 workflow and labels, not authority that should be copied literally.

## FM gameplay loop extracted

1. **Set a need.** Create a Recruitment Focus independently of any Player. Criteria can include position/role, age, locations and quality/status filters. Priorities and a duration, including Ongoing, shape the request.
2. **Put Staff on it.** A focus can have a specific Scout or multiple Scouts; “Any” allows staff selection. When a Scout is shared among focuses, work takes longer. Scout Assignments and the Scouting Centre show current work and report throughput.
3. **Explore and surface results.** A focus searches its configured areas over time. Its workspace separates matching players from near matches and shows active/completed focus history. The centre surfaces recommendations and updates.
4. **Inspect and progress candidates.** A user can search the player database, request a report for an unscouted player, inspect reports/candidate cards, and add or remove a Player from the shortlist. A search can refine known targets; it is not the same object as the recruitment brief.
5. **Respect responsibility.** Scouting responsibilities let the user retain control or rely on suitable Staff, and determine what happens to reported players.

## Current BDM capability and gap

| Need | BDM today | FM-like gap |
|---|---|---|
| Define who the organization wants | No focus/brief entity in `GameWorld`; report request requires a Player ID. | No target-independent recruitment request. |
| Discover without knowing a Player | `ScoutingTerritoryAssignment` discovers bounded current competition/country membership into `OrganizationPlayerAwareness`. | Discovery has no filters or link to a recruitment need; candidates appear only in the general workspace. |
| Evaluate criteria | Position is public; age and team/country are available; rating/potential estimates are in `organizationKnowledge`. | No combined focus fit, no inspectable reasons, no unknown-aware confidence. |
| Scout multiple areas/Staff for one need | A territory operation has one Scout and one territory; independent operations can exist. | No Focus-level assignment to multiple Scouts or Auto selection. |
| Make priority change resource allocation | Player assignment priority sorts the existing progress queue. Territory discovery is deterministic ID ordering and does not consume assignment queue priority. | No priority among recruitment briefs or candidate funnel work. |
| Make duration/lifecycle visible | Player assignments are queued/active/completed/cancelled; territory operations are active/ended. | No active/paused/completed/cancelled Focus lifecycle or focus result history. |
| Search Players first | Market search is limited to free agents; draft/recruiting/scouting lists are domain-scoped. No general Player Search workspace. | No permitted-information search across public/addressable Players and no search-to-focus handoff. |
| Understand Scout's work | Request UI shows available evaluator suitability/workload; territory form shows one Scout and workload. | No Scout-centric combined view of focus, player reports, territory work and recent reports. |
| Scouting Centre | Workspace has Players/Knowledge, Assignments, Reports, Coverage and Opposition. | No summary of discoveries, focus progress/matches, recommendations, stale information or workload problems. |
| Responsibilities | Existing registry supports user-controlled, delegated and advisory scouting operations. AI planning excludes the human team. | No focus workload abstraction to honor those modes; do not add UI-only rules or rebuild AI. |
| Shortlist/decision | No canonical player shortlist authority was found for this workflow. | Candidate removal/shortlisting must wait on or reuse an existing acquisition authority, not invent a duplicate list. |

## Safe BDM vocabulary and criteria

- **Position:** existing basketball `PG`, `SG`, `SF`, `PF`, `C` primary position; safe public filter.
- **Age:** derive from Player birth date and the current game date; do not persist a redundant age.
- **Country/competition:** reuse `ScoutingTerritory` and current-membership helpers. Country means where a Player's team plays, not nationality, consistent with BS14E.
- **Player scope/status:** derive active roster, free-agent and other available public/contextual eligibility from their owning domain. Never duplicate contract or market state in the Focus.
- **Current ability/potential:** evaluate only via the viewer organization's `OrganizationKnowledge` and existing `getOrganizationRatingEvaluation`. An unknown result is UNKNOWN; never filter using hidden PlayerTruth.
- **Basketball profile:** the canonical public position and existing rating families (`finishing`, `shooting`, `creation`, defense, rebounding and physical) can support knowledge-aware descriptive criteria. The source review found no canonical player role/archetype/tendency catalogue suitable for focus criteria. Do not introduce football roles or a new role taxonomy for this milestone.

## Architecture direction

Introduce a canonical Focus that stores the organization's intent and lifecycle, not discovered results. Build its candidate list and fit projection from existing territory membership, awareness and OrganizationKnowledge. Connect Scout work to existing territory operations and player assignments, so those systems remain the authorities for discovery and report completion. Workload must be charged to actual assigned Scouts. A candidate's fit is UNKNOWN until sufficient dimensions are known, then ESTIMATED from known evidence with reasons and reduced confidence for unknown criteria.

The same Focus engine/service should be callable from UI and bounded AI planning, subject to the existing Staff responsibility authority and human-team autonomy guard. First implementation scope should prioritize the user loop (create brief → assign Scout(s) → progress time → discover candidates → request deeper report) and the broad fog-safe Player Search needed to seed that brief. FM-specific analysts, inbox/news, transfer-status filters without a canonical public source, Near Matches rules based on hidden ability, and a separate shortlist store are not justified by BDM authority and remain out of scope.

## Implementation acceptance anchor

The minimum useful proof is “Find a young PG creator in Spain” without a Player ID: create a focus with PG, age and Spain constraints; allocate real Scout workload; progress days; show newly discovered, external Players with permitted identity/public fields; derive any fit only from OrganizationKnowledge; request the existing Quick Look or deeper mission and observe canonical knowledge improve. A second center/European-competition focus must produce a distinct bounded pool. Search must use only public data and current organization knowledge.
