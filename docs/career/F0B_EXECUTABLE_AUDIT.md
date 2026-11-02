# CAREER-F0B · Auditoría ejecutable

## Alcance

La auditoría usa la carrera ACB 2026/27 de UCAM Murcia, el estado de día 0 producido por la creación de carrera y el primer partido, y tres copias Save V4 del mismo estado. La ventana es de 30 días, con semilla de partido derivada de `f2-match:7:<gameId>`.

| Acción jugable | Autoridad reutilizada | Hecho persistente | Evidencia |
| --- | --- | --- | --- |
| Delegar la planificación de entrenamiento | `StaffResponsibilityService.setTeamResponsibility` | responsabilidad `createTeamTrainingPlan` | `PlayableF0B.test.ts` / `DelegationOutcome` |
| Planificar y ejecutar entrenamiento | `progressAiTrainingPlanning` → `scheduleTrainingSessionsBatch` → `executeScheduledTrainingSessionsWithEvidence` | sesiones, ejecución, estímulos, fatiga y cohesión | `PlayableF0B.test.ts` |
| Delegar scouting | `progressDelegatedScouting` → `requestScouting` → `progressScoutingAssignments` | assignment, evidence, evaluator report y `organizationKnowledge` | `PlayableF0B.test.ts` |
| Preparar el próximo rival | `progressOppositionScoutingReports` | `OppositionScoutingReport` ligado a `gameId` | `PlayableF0B.test.ts` |
| Aceptar una recomendación | `acceptOppositionScoutingReport` | `TeamGamePlan.tacticalOverride` | acción de Store y Courtside |
| Consumir el plan | `prepareMatchOptions` / `prepareMatchSetup` | tácticas y rotación entregadas al MatchEngine | prueba MatchNext/F0B |
| Guardar y continuar | `GameSaveService` / Save V4 | round-trip sin perder sesiones, reports, fatiga ni cohesión | `PlayableF0B.test.ts` |

## Límites de evidencia

Los informes de oposición no inventan recomendaciones cuando `organizationKnowledge` es insuficiente. En ese caso Courtside muestra explícitamente la ausencia de énfasis y el entrenador puede modificar el plan manualmente.
