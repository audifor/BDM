# CAREER-F1 · Certification

## Estado

**PARTIAL**.

La experiencia de llegada, la decisión profesional, la continuidad Save V4 y la entrada a un partido real están certificadas. F1 no se declara PASS porque la ejecución completa A/B/C de 30 días y la suite global no se volvieron a ejecutar dentro de este run: `PlayableF0B.test.ts` tiene una ventana larga y fue interrumpida en la ejecución conjunta. Su PASS anterior y su commit base se conservan sin cambios.

## Pruebas ejecutadas en este worktree

- `src/ui-ng/applications/home/CareerArrivalBriefing.test.tsx`: **2/2 PASS**.
  - Datos reales de UCAM Murcia, competición, Board, staff, objetivo y próximo partido.
  - Decisión `seekInput` por el comando canónico, memoria persistida, reunión ausente tras Save V4.
- `src/app/game/CareerF1Arrival.test.ts`: **2/2 PASS**.
  - Bootstrap ACB 2026/27 con UCAM Murcia y coach creado.
  - Puesto laboral e historial de appointment.
  - Decisión de primera reunión, Save V4 schema 4, carga, no repetición, avance hasta el partido y resultado completado.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS** (warnings de chunks/circularidad ya existentes).
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: **PASS**.
- `cargo check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- La regresión F0B se intentó en conjunto; se detuvo por duración operativa conocida, no por fallo observado.

## Evidencia de F0B conservada

El commit base `5a0afcfa` incluye `PlayableF0B.test.ts` y `F0B_FINAL_REPORT.md`, con A/B/C de 30 días y la conexión:

`acceptOppositionScoutingReport` → `gamePlansByKey` → `prepareMatchOptions`/`prepareMatchSetup` → MatchEngine.

El informe F0B registra A sin sesiones inventadas, B con entrenamiento delegado real, Staff executor, scouting y plan, y C con gestión táctica manual. Las diferencias de marcador no se interpretan como causalidad sin evidencia.

## Pendiente para PASS completo

- Reejecutar la ventana A/B/C de 30 días con la nueva rama, además de la certificación F0B base.
- Reejecutar regresiones F1/F2/F3 y suite de tests afectada completa.
- Ejecutar prueba Windows de la aplicación cuando exista un runner de escritorio disponible.
- Añadir/ejecutar escenarios explícitos de cambio de club posterior e incorporación con staff incompleto en esta certificación, aunque sus autoridades existentes ya tienen cobertura propia.
