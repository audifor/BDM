# CAREER-F2 · Auditoría de integración

## Base y alcance

F2 se ejecuta en `feature/career-f2-director-hub`, sobre `a6d8e7a7` (F1) y su antecesor `5a0afcfa` (F0B). No modifica `016B.1`, WorldDB ni la evidencia F3.

La revisión encontró que la autonomía, el entrenamiento, el scouting, la planificación táctica, MatchEngine Next, HRPG, Courtside y Save V4 ya tienen autoridades ejecutables. El hueco era de composición contextual en Home, no de otro motor.

## Autoridades reutilizadas

| Capacidad | Autoridad usada | Integración F2 |
| --- | --- | --- |
| Decisiones que detienen el tiempo | `evaluateSimulationBreakpoints` / `getContinueStopReason` | Tier A y navegación a la resolución real |
| Staff y recomendaciones | `getStaffRecommendationsForTeam`, `acceptStaffRecommendation`, `dismissStaffRecommendation` | Tier B, aceptar/ignorar o abrir profundidad |
| Entrenamiento ejecutado | `scheduledTrainingSessionsById` y su `execution` | Tier C, evidencia de trabajo real |
| Scouting rival | `oppositionScoutingReportsById` | Tier B, aplicar al `gamePlan` o revisar tácticas |
| MatchEngine Next | `acceptOppositionScoutingReport` → `gamePlansByKey` → preparación del partido | No se añade lógica al motor |
| Calendario | `ContinueFlow` y `SimulationBreakpoints` | Continue mantiene la interrupción canónica |
| Medical / riesgos | `injuryLifecycleStatus` + breakpoint de RTP | Contexto D; la resolución permanece en Medical |
| Persistencia | `GameWorld` y Save V4 existentes | El hub no añade estado persistido |

## Hallazgo F1.1

La auditoría ejecutable focal de F1 pasó: 5 archivos, 27 tests. La prueba pesada `PlayableF0B.test.ts` se reintentó en este worktree y se dejó completar; su resultado se consigna en el informe final. La suite global sigue siendo una validación de larga duración del repositorio y no se usa para ocultar fallos.

