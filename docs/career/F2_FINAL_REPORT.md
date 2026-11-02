# BDM Career · F2 · Informe final

## Estado

**PARTIAL** — la primera integración jugable del Centro de Dirección está implementada y validada focalmente sobre F1/F0B. La prueba A/B/C de 30 días y las gates de código/plataforma pasan; `npm test` global fue interrumpido después de aproximadamente 16 minutos sin resumen, por lo que no se declara PASS global.

## Rama y base

- Rama: `feature/career-f2-director-hub`
- Worktree: `C:\BDM-worktrees\career-f2-director-hub`
- Base: `a6d8e7a7` (`feature/career-f1-arrival`), con F0B `5a0afcfa` como ancestro imprescindible.
- No se modificaron `016B.1`, `feature/worlddb-global-playable-02` ni `docs/playable/evidence/f3/ab-comparison.json`.

## Código modificado

- `src/ui-ng/applications/home/directorHubModel.ts`: read-model A/B/C/D de estado canónico.
- `src/ui-ng/applications/home/DirectorHubPanel.tsx`: presentación y acciones reales.
- `src/ui-ng/applications/home/director-hub.css`: zona contextual responsive.
- `src/ui-ng/applications/home/HomeWorkspace.tsx`: montaje en Home.
- `src/ui-ng/applications/home/directorHubModel.test.ts`: quiet state, sin partido y ausencia de cola duplicada.
- `docs/career/F2_*.md`: auditoría, diseño, trazabilidad, certificación y aceptación.

## Sistemas reutilizados

`SimulationBreakpoints`, `ContinueFlow`, `StaffResponsibilities`, `StaffRecommendationService`, `StaffRecommendationPresentation`, `ScheduledTrainingSession`, `OppositionScoutingReportEngine`, `TacticalPlanning`, MatchEngine Next, Medical lifecycle, Courtside/Home y Save V4. No se añadió motor, calendario, cola, recomendación ni estado persistido paralelo.

## Defectos corregidos

F2 corrige la discontinuidad de dirección entre el trabajo real de F0B/F1 y Home: el entrenador podía llegar al partido y a las superficies especializadas, pero no tenía una composición contextual de decisiones, recomendaciones, trabajo ejecutado y riesgos. También evita presentar una aplicación ficticia del scouting cuando el plan ya tiene override.

## Evidencia

- F1.1 focal: 5 archivos, 27 tests PASS.
- F2/Home + autoridades de Continue/Staff/Tactics: 6 archivos, 60 tests PASS.
- Read-model F2 + Save V4: 4/4 tests PASS.
- `PlayableF0B.test.ts`: 4/4 PASS; tres carreras A/B/C de 30 días, con MatchEngine y persistencia.
- Typecheck: PASS.
- Build Vite: PASS; conserva solo warnings previos de chunks/circularidad.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: PASS.
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS.
- `npm test -- --reporter=dot`: iniciado, observó fallos durante la ejecución amplia y fue interrumpido sin resumen final; no se atribuyen a F2 ni se ocultan.
- `Math.random(` en `src`: 0; no se introdujeron imports React/Zustand/Tauri en Domain/Engine.
- Prueba Windows interactiva: no disponible en este entorno.

## Limitaciones

- El panel no reemplaza Staff, Training, Tactics, Medical, Board ni Courtside Match; navega a ellos.
- La ruta de “modificar/delegar” es la superficie propietaria porque no existe un comando contextual único autorizado para mutar esas responsabilidades desde Home.
- No se crea PR remota ni se hace push: `AGENTS.md` lo prohíbe. Se deja commit local limpio para revisión.

