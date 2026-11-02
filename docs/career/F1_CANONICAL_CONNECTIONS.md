# CAREER-F1 · Canonical connections

| Superficie F1 | Fuente canónica | Lectura/acción |
| --- | --- | --- |
| Identidad | `world.coaches`, `world.personsById`, `world.staffPeopleById`, `world.coachRpgProfilesByCoachId` | Solo lectura en el briefing; creación por `UserCoachCreator`/WorldDB appointment. |
| Puesto | `world.teams[team].coachId`, `coachEmploymentByCoachId`, `teamStaffAssignmentsById` | Se deriva el cargo real de Head Coach y su estado laboral. |
| Objetivos | `getBoardSummary(world, teamId)` | Se muestran solo objetivos `inProgress`; no se crean promesas. |
| Responsabilidades | `getTeamResponsibilities` + `responsibilityDefinition` | Modo y titular se leen del registro común; las vacantes se mantienen visibles. |
| Organización | `facilitiesUsedByTeamAt`, `getTeamFinancialSnapshot`, `staffJobOpeningsById` | Instalaciones, estado financiero derivado y vacantes actuales. |
| Próximo partido | `getNextUserGame` | Fecha, rival y competición reales. |
| Scouting | `oppositionScoutingReportsById` | Se informa si hay reporte del `gameId`; no se fabrica contenido. |
| Plan | `getGamePlan` | Se informa si existe override aplicado; la edición sigue en Tactics. |
| Primera reunión | `getPendingFirstStaffMeeting` / `decideFirstStaffMeeting` | La única decisión de llegada y sus consecuencias. |
| Persistencia | `serializeGameWorldV4` / `deserializeGameWorldV4` | Verificación de no repetición y conservación de memoria/relaciones. |
| F0B MatchEngine | `acceptOppositionScoutingReport` → `gamePlansByKey` → `prepareMatchSetup` | No hay copia de recomendaciones ni segundo plan. |

## Límites respetados

El adaptador es UI-only/read-model. No añade campos a `GameWorld`, no añade calendario, no duplica Inbox, no convierte datos MOCK de CoachCareer en hechos, no crea objetivos y no cambia reglas de WorldDB o competición.
