# BDM Product Manifestation Map

This inventory identifies where users encounter important canonical capabilities at audit HEAD `32493210db55a30a94a4cefb65bf2aadf5f4dd41`. Labels refer to the capability's principal surface, not whether every data point is visible.

| Capability | Current surface | Status | Canonical implementation evidence | User action / gap |
|---|---|---|---|---|
| Dashboard/current day | Home / calendar / system bar | VISIBLE AND CORRECT | GameWorld date, selected daily event summaries; shared SimulationBreakpoints | continue/simulate; selected high-priority actions stop, some IMPORTANT governance/market notices remain nonblocking |
| Player identity, truth ratings, tendencies, history | Player workspace; roster inspector | VISIBLE AND CORRECT | Player/Person Truth/history queries | no persisted overall; display interpretation and uncertainty can improve |
| Player contracts/medical/development | Player tabs/workspace; Medical and Training apps | VISIBLE BUT INCOMPLETE | Player contract, Injury, Development/Training domains | contract extensions absent at this HEAD; health and development contexts not fully converged |
| Roster membership and lineup | Roster app, match center, lineup/tactics | VISIBLE AND CORRECT | Team roster and canonical lineup/rotation engines | no configured general roster maximum |
| BS11A contract/roster horizon | Analysis / Club Strategy screen | VISIBLE BUT INCOMPLETE | derived ContractRosterPlanning attached to BS9 assessment | read-only projection, no review action in this HEAD |
| Club needs/strategy/GM plan | Analysis / Club Strategy, Market | VISIBLE BUT INCOMPLETE | BS9 domains/engines | decision and action paths spread across apps |
| Free agent market | Market workspace/inbox | VISIBLE BUT INCOMPLETE | BS10 market intelligence/negotiation/signing and market breakpoint candidates | clause depth and consistent user action semantics remain partial; shared breakpoint query exists |
| Trades | Trades workspace | VISIBLE BUT INCOMPLETE | Trade engine/app with validation and records | broad AI trade planning and breakpoint surfacing remain partial |
| Finance V2 | Finance workspace | VISIBLE BUT INCOMPLETE | CF1-CF12 canonical ledger/engines and CF12 integration report | advice and ledger visible; daily lifecycle/whole-club decisions not connected |
| Salary rules/payroll | Market/Finance context | VISIBLE BUT INCOMPLETE | Salary Engine and derived payroll | distinguish from Club Finance cash/budget; limited ecosystem rules |
| Facilities V2 | NO SURFACE | HIDDEN | persisted domain/engines and CFI certifications | canonical facilities app/action surface absent; old Facilities tab is legacy/local |
| Governance decisions/Board | Board workspace and governance flows | VISIBLE BUT INCOMPLETE | BG1-BG8, Governance app boundary and SimulationBreakpoints candidates | pending request/approval candidates are visible to breakpoint diagnostics as IMPORTANT, but no general action resolver and no automatic stop |
| Staff roster/roles/responsibilities | Staff app | VISIBLE AND CORRECT | Staff/Organization/Responsibility domains | integrations vary by role and responsibility |
| Staff Human State/culture/conflicts/politics | Staff Dynamics/Departments/Advisory | VISIBLE BUT INCOMPLETE | Staff Wave 5 engines and models | substantial dynamics visible; consequences/AI action loop not unified |
| Scouting/player intelligence | Scouting workspace; Market/Draft/Recruiting advisories | VISIBLE BUT INCOMPLETE | assignments/reports/OrganizationKnowledge | bounded knowledge is not surfaced/consumed uniformly |
| Training plan/session | Training workspace | VISIBLE AND CORRECT | Training V1 plan/session/stimulus flow | AI teams share defaults; facility consumer absent |
| Medical/injury | Medical app, Player medical view | VISIBLE BUT INCOMPLETE | canonical injury/availability/advisory queries | complete treatment/recovery/decision ownership should be audited in BS12 |
| Match live/instant/result | Match workspace, viewer, box score | VISIBLE AND CORRECT | V3 engine/application/result | match session transient; fatigue carry-over absent |
| Match Next experimentation | MatchNext debug route / historical branch UI | VISIBLE BUT LEGACY | separate Match Next kernel/Phaser studies | not canonical MatchEngine V3 result surface at audit HEAD |
| Competition/schedule/standings | Schedule and Competition apps | VISIBLE AND CORRECT | Competition/Season/Game and derived standings | NCAA future-season progression missing |
| Promotion/relegation | Competition/history context | VISIBLE BUT INCOMPLETE | persisted resolution and next edition participants | limited explicit presentation of consequences |
| NCAA Recruiting | Recruiting workspace | VISIBLE AND CORRECT | Recruiting Engine and persistent cycle | cycle initialization at later season lifecycle needs verification |
| NCAA Draft | Draft workspace | VISIBLE AND CORRECT | Draft engine, user/AI selection and shared `ACTION_REQUIRED` draft-pick breakpoint | breakpoint is active; AI/user selection flow exists |
| NCAA eligibility/academics | roster/squad inspector and competition gate | VISIBLE BUT INCOMPLETE | Eligibility/Academic/Enforcement engines | user consequences and next-season lifecycle need surfacing |
| NCAA NIL/collectives/boosters/enforcement | NCAA apps/workspaces | VISIBLE BUT INCOMPLETE | persisted engines and explicit action boundaries | meaningful but narrow, lifecycle and UI vary by layer |
| Coach RPG/career/personal finances | Coach and Career workspaces | VISIBLE BUT INCOMPLETE | CoachRpg, CoachCareer, CoachFinances | several broad human/narrative consequences remain sparse |
| Relationships/personality/memories | Coach/staff dynamics and Memories app | HIDDEN / VISIBLE BUT INCOMPLETE | canonical Relationship, Personality and Memory domains | only selected event histories shown; players/agents/owners poorly surfaced |
| News/media/narrative/inbox | Media/News/Inbox apps | VISIBLE BUT INCOMPLETE | canonical selected-event feeds | no universal event-to-story or action-required contract |
| World DB / RealWorldSpain | startup selection/catalog | VISIBLE AND CORRECT | explicit WorldDb bootstrap adapters | external session stays outside GameWorld |
| Entity actions/context menu | roster/player/staff/trade surfaces | VISIBLE BUT INCOMPLETE | Entity Action application and UI registries | action coverage varies; action semantics are reusable |
| Save/load | start/career flows | VISIBLE AND CORRECT | Save V4 + validated GameWorld reconstruction | many-year scale and histories need observability tests |

## Surface findings

- The UI NG application catalog already has workspaces for analysis, Board, boosters, club, coach and finances, competition, Draft, enforcement, Market, match, media/memories/narrative, NIL, player, recruiting, roster, scouting, staff, tactics, trades and training. There is no Facilities application directory.
- The old PCB generation remains useful evidence for visual and workflow behavior but has mixed state sources. Never infer current canonical truth solely from a visible legacy screen.
- For every roadmap feature, record both the screen where a user sees the data and the canonical application action that changes it. A read-only dashboard is not evidence of agency; an action menu is not evidence of canonical state.
