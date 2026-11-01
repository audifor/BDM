# CAREER-F1 · Integration audit

## Estado de la auditoría

F0B es compatible y se toma como base funcional en `5a0afcfa` (`feat: certify career f0b autonomous club`). La restricción que bloqueó la ejecución anterior no era técnica: el run anterior estaba limitado al milestone `016B.1`. Esta ejecución tiene autorización explícita para `CAREER-F1` y trabaja en el worktree independiente `C:\BDM-worktrees\career-f1-arrival`, rama `feature/career-f1-arrival`.

La instrucción superior del repositorio que sigue vigente es el contrato de `AGENTS.md`: un solo milestone por run, no push, no dependencias nuevas, cambios estrechos, y validación antes del commit. No impide F1; sí impide crear una PR remota. El worktree original y `feature/worlddb-global-playable-02` no se modificaron. `docs/playable/evidence/f3/ab-comparison.json` se preservó.

## Autoridades inspeccionadas

| Necesidad | Autoridad reutilizada | Resultado |
| --- | --- | --- |
| Identidad | `UserCoachCreator`, `WorldDbUserCoachAppointment`, `Person`, `StaffProfile`, `Coach` | Nombre, datos personales, origen y referencias persistentes. |
| Contratación | `CoachCareerService`, `CoachEmployment`, `CareerHistory` | El puesto y la trayectoria salen de los registros de empleo. |
| Reputación/relaciones | `CoachReputation`, `RelationshipEvents`, `MemoryEngine` | La llegada no duplica relaciones ni reputación. |
| Primera decisión | `StaffTrustMeeting`, `CoachLifeDecision`, `HumanSimulationService` | La reunión y sus consecuencias son comandos existentes. |
| Staff | `StaffResponsibilities`, `StaffWorkspace`, `StaffCareerService` | Delegación, titulares, vacantes y carga se leen del mundo. |
| Board | `getBoardSummary`, `BoardWorkspace`, Governance | Los objetivos mostrados son los objetivos Board existentes. |
| Entrenamiento | `TrainingPlanning`, `ScheduledTrainingEngine`, `TrainingStudioWorkspace` | Las sesiones y la autonomía siguen siendo F0B. |
| Scouting/tácticas | `OppositionScoutingReportEngine`, `TacticalPlanning`, `TacticsWorkspace` | El informe y su aceptación permanecen en el flujo F0B. |
| Partido | `prepareMatchOptions`/`prepareMatchSetup`, MatchEngine Next | El plan aplicado llega al motor sin adaptador paralelo. |
| Persistencia | Save V4 / `GameSaveService` | Identidad, reunión resuelta, memorias y relaciones sobreviven a cargar. |

## Cambio F1

F1 añade únicamente un read-model de llegada y una vista contextual dentro de Home Courtside:

- `careerArrivalModel.ts` compone club, puesto, competición, Board, responsabilidades, instalaciones, finanzas derivadas, vacantes, próximo partido, sesiones y scouting desde `GameWorld`.
- `CareerArrivalBriefing.tsx` expone el contexto y llama a `decideUserCoachStaffMeeting` para las dos decisiones canónicas.
- El briefing solo se muestra mientras existe la reunión inicial pendiente. Al resolverla desaparece; no se crea un flag paralelo ni se persiste estado de UI.
- Los enlaces abren Home, Board, Staff, Scouting, Tactics y Training existentes.

No se modificaron WorldDB, NCAA, NBA, formatos, desempates, calendarios, motores de Staff, finanzas, HRPG, MatchEngine ni Save V4.
