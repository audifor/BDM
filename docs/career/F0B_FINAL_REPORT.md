# BDM Career · F0B · Informe final

## Estado

**PASS — F0B certificada en la rama `feature/career-f0b-autonomous-club`.**

La certificación jugable ejecuta tres carreras A/B/C de 30 días sobre copias Save V4 del mismo estado inicial y con la misma semilla derivada por partido.

## Código modificado

- `src/engine/training/TrainingPlanning.ts`: el planificador semanal existente incluye el equipo del entrenador solo cuando `createTeamTrainingPlan` está delegada; `userControlled` permanece manual. El ejecutor delegado se resuelve con el Staff real y la ejecución deja evidencia canónica.
- `src/stores/gameStore.ts`: nueva acción de Store para aceptar un `OppositionScoutingReport` mediante la autoridad existente.
- `src/ui-ng/applications/tactics/CourtsideTacticsPanels.tsx`: acción visible `ACEPTAR RECOMENDACIÓN`; el plan A/B sigue siendo editable y `APLICAR AL PARTIDO` conserva el override.
- `src/engine/training/TrainingPlanning.test.ts`: regresión de equipo de usuario delegado, Staff asignado y preservación del caso manual.
- `src/app/game/PlayableF0B.test.ts`: certificación ejecutable A/B/C de 30 días, persistencia, scouting, tácticas y consumo por MatchEngine.
- `docs/career/`: auditoría, autonomía, preparación de partido, revisión UI y este informe.

## Sistemas reutilizados

`StaffResponsibilityService`, `progressAiTrainingPlanning`, `ScheduledTrainingEngine`, `DelegatedScouting`, `ScoutingEngine`, `AdvisoryScoutingReports`, `OppositionScoutingReportEngine`, `acceptOppositionScoutingReport`, `prepareMatchOptions`, `prepareMatchSetup`, `CourtsideTacticsPanels`, `StaffWorkspace` y Save V4. No se creó un segundo motor de entrenamiento, scouting, calendario o recomendaciones.

## Resultados A/B/C

| Brazo | Gestión | Resultado observado |
| --- | --- | --- |
| A | Responsabilidades iniciales, sin intervención | 0 sesiones completadas del club del usuario; no se inventa trabajo. |
| B | Delegación explícita de entrenamiento, desarrollo y scouting; aceptación del informe | Sesiones autónomas completadas, ejecución con `executingStaffPersonIds`, estímulo de desarrollo, carga/fatiga, outcomes de Staff, scouting del próximo rival y plan persistido. |
| C | Entrenamiento y rotación manuales, plan táctico del entrenador | Decisiones manuales registradas, plan táctico guardado y consumido por la misma preparación de partido. |

La ventana conserva el mismo calendario y los mismos partidos en los tres brazos. La cohesión se compara como estado canónico; en esta ventana los módulos autónomos elegidos dejan el valor en 50, por lo que el informe no atribuye un cambio inexistente. Las diferencias de marcador no se presentan como causalidad probada.

## Conexión con MatchEngine

La secuencia certificada es `acceptOppositionScoutingReport` → `gamePlansByKey` → `prepareMatchOptions`/`prepareMatchSetup` → planes tácticos y rotación entregados al motor. La prueba C verifica el override manual; la prueba B verifica que aceptar el informe crea el plan del próximo `gameId` sin fabricar emparejamientos ni titulares.

## Pruebas realizadas

- `PlayableF0B.test.ts`: 4/4 verdes; tres carreras A/B/C de 30 días.
- `TrainingPlanning.test.ts`: 11/11 verdes.
- Grupo de entrenamiento, tácticas, Staff, scouting y Save V4: 82/82 verdes.
- Regresiones F1/F2/F3: 51/52 verdes en la primera corrida; el único caso fue timeout de 5 s de un round-trip F3AB grande. Reejecutado con `--testTimeout=120000`: `PlayableF3AB.test.ts` 8/8 verdes.
- `npm run typecheck`: verde.
- `npm run build`: verde; quedan warnings de chunks/circularidad ya existentes.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: verde.
- `cargo check --manifest-path src-tauri/Cargo.toml`: verde.
- La suite global `npm test -- --run` se intentó con un worker único para evitar la presión de memoria de esta base; quedó interrumpida por duración del entorno. No se usa como evidencia de PASS: la evidencia entregada es la cobertura focalizada anterior.

## Limitaciones pendientes

- El contrato profesional visual de CoachCareer conserva datos demo explícitamente marcados `MOCK`; no participa en la simulación F0B.
- Un informe de oposición sin conocimiento suficiente permanece neutral y Courtside lo muestra como tal; no se fabrican recomendaciones.
- La PR remota no se creó porque las instrucciones del repositorio prohíben hacer push. Se deja un commit local y la rama lista para revisión.
