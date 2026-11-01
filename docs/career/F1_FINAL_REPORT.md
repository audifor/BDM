# BDM Career · F1 · Informe final

## Estado

**PARTIAL**: llegada jugable integrada y certificada focalmente; la certificación completa de F1 queda pendiente de repetir la ventana F0B A/B/C y las gates globales de plataforma.

## Rama y worktree

- Rama: `feature/career-f1-arrival`
- Worktree: `C:\BDM-worktrees\career-f1-arrival`
- Base: `5a0afcfa` (`feature/career-f0b-autonomous-club`), dependencia imprescindible porque F1 integra F0B.
- No se modificó `feature/worlddb-global-playable-02` ni el worktree original.

## Código modificado

- `src/ui-ng/applications/home/careerArrivalModel.ts`: read-model derivado de GameWorld.
- `src/ui-ng/applications/home/CareerArrivalBriefing.tsx`: briefing contextual y acciones de la primera reunión.
- `src/ui-ng/applications/home/HomeWorkspace.tsx`: montaje temporal del briefing en Home.
- `src/ui-ng/applications/home/home-workspace.css`: layout Courtside responsive del briefing.
- `src/ui-ng/applications/home/CareerArrivalBriefing.test.tsx`: prueba UI de datos reales, decisión y Save V4.
- `src/app/game/CareerF1Arrival.test.ts`: prueba ACB/UCAM de identidad, puesto, decisión, continuidad y partido.
- `docs/career/F1_*.md`: auditoría, flujo, conexiones y certificación.

## Resultado funcional

Al crear una carrera UCAM Murcia ACB 2026/27, la identidad del coach y el puesto provienen de las autoridades de creación/appointment. Si existe assistant real elegible, Home muestra la llegada una sola vez con club, competición, Board, staff, responsabilidades, organización, próximo rival y acciones hacia las superficies F0B. `Ask for input` y `Set direction` ejecutan la reunión existente y generan consecuencias reales en relaciones, morale, memoria, Inbox y HRPG. Después de resolverla, el briefing desaparece y el jugador puede avanzar, preparar y disputar partidos normalmente.

## Sistemas reutilizados

`UserCoachCreator`, `WorldDbUserCoachAppointment`, `CoachCareerService`, `CoachEmployment`, `CareerHistory`, `CoachRpg`, `CoachReputation`, `CoachLife/StaffTrustMeeting`, HRPG, Board/Governance, StaffResponsibilities, StaffWorkspace, F0B Training/Scouting/TacticalPlanning, MatchEngine Next y Save V4.

## Defectos corregidos

La llegada canónica existía pero no tenía una presentación contextual en Courtside: la primera reunión quedaba limitada al Inbox/servicio y el jugador no recibía una visión compacta del club antes de dirigir. F1 añade esa conexión sin crear estado duplicado. También evita presentar ausencia de objetivos, scouting, finanzas o responsables como datos ficticios.

## Resultados A/B/C

Los resultados A/B/C de 30 días pertenecen al commit F0B base y están documentados en `F0B_FINAL_REPORT.md`. F1 conserva ese código y lo integra; no atribuye resultados deportivos a una decisión sin evidencia causal. En este run se validó el paso de llegada → decisión → Save V4 → siguiente partido sobre datos ACB reales.

## Pruebas

- Arrival UI: 2/2 PASS.
- ACB/UCAM arrival continuity: 2/2 PASS.
- Typecheck: PASS.
- Build Vite: PASS.
- `cargo fmt --check`: PASS.
- `cargo check`: PASS.
- F0B: evidencia base PASS; reejecución conjunta interrumpida por duración de `PlayableF0B.test.ts`.
- Prueba Windows de escritorio: pendiente por no disponer de un runner interactivo separado.

## Limitaciones pendientes

- No hay una vista nueva de Inbox: se usa la reunión Inbox/HRPG existente y el briefing temporal de Home.
- Sin assistant elegible no se inventa una reunión; el contexto sigue disponible en las superficies del club, pero la decisión profesional no aparece porque no existe una autoridad que la respalde.
- Los valores `MOCK` ya marcados en CoachCareer siguen siendo demostrativos y no se usan en el briefing.
- No se creó PR remota ni se hizo push porque `AGENTS.md` lo prohíbe. Debe revisarse el commit local antes de cualquier integración.
