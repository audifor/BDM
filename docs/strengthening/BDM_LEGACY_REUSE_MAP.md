# BDM Legacy Reuse Map

This map classifies reuse from historical code, screenshots, tests, branches, migration reports and prior specifications. “Direct” requires code still being the canonical authority at this HEAD; it is deliberately uncommon.

| Historical asset | Classification | Reuse value | Boundary / warning |
|---|---|---|---|
| Player 35-rating / early overall model | REFERENCE ONLY | historical migration and terminology; explains why current truth model has no persisted overall | superseded by Player Truth 80 ratings/40 tendencies; do not revive or dual-write |
| Old player model detail and intelligence UI | PORT UI | information hierarchy, evaluation panels, labels and visual references | rebind to canonical Player, knowledge, history and development sources; old model names are not truth |
| Old Player/Medical/Contract/History screenshots and test fixtures | PORT TEST | visual regression and realistic coverage of sparse/rich states | fixture truth must be canonical; keep user experience evidence, not state authority |
| PCB legacy Player/Roster workspaces | PORT UI | dense data presentation, side-by-side roster/player, filtering, contextual actions | migrate to `ui-ng` workspaces and application boundaries; avoid React-local gameplay state |
| PCB Club Facilities / budget local values | REFERENCE ONLY | interaction concepts and navigation | not Facilities V2 / Finance V2; do not treat as current domain truth |
| MatchEngine v0 / prototype TeamStrength | REFERENCE ONLY | early small-scope baseline and historical test behavior | superseded by MatchEngine V3 player-driven spatial simulation; no second engine path |
| MatchEngine V3 MG5/MG6/MG7 | REUSE DIRECTLY | active canonical match execution, tactics, movement and presentation seam | continue using shared MatchEngine V3; keep MatchViewer presentation-only |
| Match Next kernel and Phaser/Match presentation branches | PORT CONCEPT | event/frame state ideas, interaction rendering, perceptual timing, feature-parity tests | separate implementation generation at audit HEAD; do not treat as canonical match result authority |
| BS0/BS1-BS5/BS8-BS11 reviewed strengthening analyses | REUSE DIRECTLY | current loop, breakpoints, season lifecycle, repair, player state, coach/rotation, GM, market and contract boundaries | review exact snapshot and code: docs may predate later commits; not replacements for source inspection |
| BS9 planning and BS10 market test suites | PORT TEST | decision-boundary, lifecycle, safety, determinism and integration cases | preserve canonical ownership: BS9 assesses/selects, BS10 negotiates/executes, Governance authorizes |
| Staff System V2 specification and waves 1-5F4 | REUSE DIRECTLY | role catalog, Person-rooted staff, responsibilities, workload, human state, culture, conflicts, politics and user patterns | much of spec is implemented; unresolved `TO DECIDE` statements stay unresolved; inspect current code/Save before asserting exact phase parity |
| IndividualTrainingPlan and `trainingResponsibilitiesByTeamId` | DO NOT REUSE | document states legacy/non-auto-applied path and directs migration to general Responsibility | avoid second responsibility source; retain compatibility only where current Save/fixtures require |
| Training V1 plan/session/stimulus pipeline | REUSE DIRECTLY | persisted plans, deterministic sessions, Career Fatigue and annual development stimulus consumption | Match Fatigue remains separate; do not reapply stimulus or use it as immediate ratings |
| CFI1-CFI8 domain engines/certifications | REUSE DIRECTLY | canonical facility ownership/anatomy/condition/maintenance/projects/finance/sporting query | connect them; do not build new Facility model; daily activation and user surface are gaps |
| CF1-CF12 Finance V2 engines, tests and certification | REUSE DIRECTLY | ledger, treasury, recognition, finance schedule, forecasts, revenue/costs, debt, regulation, valuation and advice | do not duplicate finance truth in Salary Cap, Team, Facilities or UI; build activation/approved action path |
| BG1-BG8 Governance/ownership/structure work | REUSE DIRECTLY | rights, board objectives, requests/meetings/commitments, institutional structure, ownership and approval transaction | preserve explicit authorities; connect pending decisions to time breakpoints |
| OrganizationKnowledge / Player Intelligence waves | REUSE DIRECTLY | permissioned knowledge, report confidence, coverage, uncertainty, organization-bounded evaluation | never substitute true Player state into an information-limited actor decision |
| BS10D / BS10E market and trade work | REUSE DIRECTLY | explicit negotiation, validation, atomic transaction, salary matching, rights and governance handoff | no parallel roster/contract/trade authority; pending user work must be breakpoint-visible |
| Save V1-V4 migration history | PORT TEST | legacy fixtures, normalization cases, preservation contracts | always create current state through canonical validators; never persist derived values without decision |
| World DB/RealWorldSpain and PCB migration adapters | PORT DATA | real competition/team/player identity, provenance and fixture materialization | external session/data identity stays outside GameWorld; reuse explicit bootstrap adapters |
| UI design system and UI NG workspace shell | PORT UI | typography, grids, workspace shell, responsive interaction and navigation | use current application/domain boundaries; screenshots do not authorize product rules |
| Entity Actions and context menu experiments | PORT UI | contextual discovery and action phrasing | action availability must come from canonical actor/permission/application boundary |
| Coach RPG screens, Coach Career and personal finance | REUSE DIRECTLY | coach as Person/Staff-backed facade, career, finances, reputation, identity presentation | never duplicate Staff profile, employment transition or club finance |
| Memories and narrative Hito 063 foundation | REUSE DIRECTLY | observer perspective, semantic keys, dedupe, intensity decay and relationship consequence | events/history remain source truth; only selected event types currently create memories |

## Reuse order

Before creating a screen or state model, start from current `GameWorld` authority, then its Engine, Application boundary and current UI. Use old UI and tests for interaction and regression intent. Port historical calculations only after proving they are not superseded and not competing with the active authority.
