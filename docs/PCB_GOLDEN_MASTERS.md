# PCB Golden Masters

## Pass 01B authority update

User-supplied PCB screenshots are authoritative Golden Master evidence for this
pass. They supersede source-route omissions for presentation, tab count,
composition and interaction affordances. The locked product inventory is now:

- Plantilla, including the `Psico` factory view shown in the screenshot.
- Entrenamiento: Equipo, Individual, Carga, Staff and Módulos.
- Tácticas: Pizarra, Diseñador, Emparejamientos, Rotaciones, Jugadas and Partido.
- Club: Visión General, Instalaciones, Staff & Roles, Junta Directiva, Finanzas,
  Analítica and Historia.
- Medical: Resumen, Lesionados, Historial, Instalaciones, Staff and Prevención.
- Competición: Calendario, Próximos, Clasificación, Resultados, Estadísticas and
  Copas.

Source provenance is therefore `CODE + SCREENSHOT` where an existing PCB view was
found, and `SCREENSHOT/FAMILY RECONSTRUCTION` for approved subsections absent from
the supplied PCB router. Missing source routes must not be presented as unavailable.

The initial BDM port uses one shared `GoldenManagerWorkspace` client-area shell:
dark narrow navigation rail, context header, compact tab strip, dense panels and
scrollable table frames. Its data continues to come from GameWorld, training,
tactical plan, health/injury, staff, finance and competition projections.

## Pass 01 source manifest

PCB is the visual, UX and workflow reference for the selected surfaces. BDM
remains the authority for all state, engines, persistence and deterministic
behavior. This manifest records the physical source audit completed against
`PCB/bu/frontend/renderer/src` on 2026-08-28.

## Source topology

- Router: `pages/SectionRouter.jsx`.
- Route-owned page wrappers: `pages/PlantillaPage.jsx`,
  `pages/EntrenamientoPage.jsx`, `pages/TacticasPage.jsx`,
  `pages/ClubPage.jsx`, and `pages/MedicalPage.jsx`.
- Most actual view markup and local state: `App.jsx`.
- Shared visual language: `index.css`, especially `.subnav`,
  `.roster-toolbar`, `.roster-view-tabs`, and `.table.roster-table`.
- There is no `CompeticionPage.jsx`, competition route, or competition
  sub-navigation in this PCB snapshot.

## Golden Master #01 — Plantilla

- PCB paths: `pages/PlantillaPage.jsx`; `App.jsx` `renderEquipo`; `index.css`
  roster classes.
- PCB hierarchy: roster view tabs, compact icon/title/team toolbar, search and
  column action, view presets, dense scrollable table, sortable headers,
  contextual player actions.
- PCB views: `Resumen General` plus one preset for every
  `ATTRIBUTE_SECTIONS` entry. The exact runtime list is data-driven in
  `App.jsx` (`ROSTER_VIEWS`), not a fixed literal list.
- BDM target: `src/ui/screens/SquadScreen.tsx`,
  `src/ui/screens/RosterSquadTable.tsx`, `RosterSquadTable.css`.
- Canonical data: `GameWorld`, team roster, contracts, injury/fatigue state and
  organization-aware Player Intelligence evaluations. BDM Data Grid remains the
  table engine.
- Status: partial port already existed; this pass retains the PCB composition
  and confirms all displayed subjective ratings pass through organization
  knowledge.

## Golden Master #02 — Entrenamiento

PCB paths: `pages/EntrenamientoPage.jsx` and the five `render*` functions in
`App.jsx`.

1. Team Training
2. Personal Train
3. Load Management
4. Staff Assignments
5. Training Module

BDM target: `src/ui/screens/TrainingScreen.tsx` and Training Engine queries.
Only the team plan/runtime currently has a direct canonical BDM equivalent.
Personal plans, staff assignment, and PCB's locally generated calendar/modules
need canonical product/runtime decisions before they can be honestly connected.

## Golden Master #03 — Tácticas

PCB paths: `pages/TacticasPage.jsx` plus `renderTacticsBoard`,
`renderTacticsCreator`, `renderDefensiveMatchups`, `renderRotationMatrix`, and
`renderSpecialPlays` in `App.jsx`.

1. Pizarra
2. Creator
3. Matchups
4. Rotaciones
5. Specials

The audited PCB source provides five sections, not six. BDM target:
`src/ui/screens/TacticsScreen.tsx` and canonical match tactical plan actions.
BDM now persists neutral-default base team tactical instructions and rotation
intent, plus sparse per-game tactical, matchup and rotation overrides. Match
preparation resolves the effective tactic and the MatchEngine consumes legal
on-court defensive matchup overrides. PCB remains presentation only; it must use
the application tactical-planning actions and never own a second tactical state.

## Golden Master #04 — Club

PCB paths: `pages/ClubPage.jsx`, `renderClubProfile`, `renderStaff`,
`renderDirectiva`, and `renderClubEconomy` in `App.jsx`.

1. Visión general
2. Staff
3. Directiva
4. Economía

The audited PCB source provides four sections, not seven. BDM targets are the
existing Club/Coach, Staff, Board and Finance applications. Canonical sources
are organization, staff, board, coach-finance and history state.

## Golden Master #05 — Medical

PCB paths: `pages/MedicalPage.jsx`, `renderMedicalOverview`,
`renderMedicalInjuredList`, `renderMedicalHistory`,
`renderMedicalFacilities`, `renderMedicalStaff`, and `renderPreventionCenter`
in `App.jsx`.

1. Overview
2. Injured List
3. Injury History
4. Facilities
5. Staff
6. Prevention

BDM source: canonical injury, availability and career-fatigue state. The PCB
history/risk/facility values contain local estimates or fabricated constants and
cannot be adopted as BDM medical authority. BDM exposes deterministic history and
prevention queries; medical-facility projection is derived from the same canonical
staff/training capabilities as the Club facilities projection.

## Golden Master #06 — Competition

No PCB component, route, section router branch, or `renderCompetition*`
function was found in the supplied PCB renderer. The claimed six sections cannot
be enumerated from this source without inventing product behavior. Existing BDM
targets are `ScheduleScreen.tsx`, `StandingsScreen.tsx`, match center and entity
competition navigation; all consume canonical multi-competition data. Leader and
team-stat queries are MatchStatLog/Game-derived and competition-scoped. Current
CompetitionRules only supports `leagueRoundRobin`, so Cups exposes the explicit
`NO_CUP_STRUCTURE` semantic rather than fabricating a bracket.

## Component decision record

- Lift + reconnect: dense roster toolbar/table composition, scoped to BDM's
  Data Grid implementation.
- Adapt: sub-navigation, card/table visual tokens and entity links.
- Reimplement: all data reads and mutations, through BDM view models/actions.
- Reject as authority: PCB `localStorage`, `Date`, random/local generated
  training, tactical plays, medical estimates, static metrics and competition
  assumptions.

## Certification status

No controllable browser was available during this pass, so runtime screenshot
comparison is not certified. Source-level visual verification must not be
reported as a pixel-level pass.
