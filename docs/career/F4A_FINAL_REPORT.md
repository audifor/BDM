# BDM Career · F4A Final Report

Estado: **PARTIAL**.

## Base y aislamiento

- Rama: `feature/career-f4a-ecosystem-routing`
- Worktree: `C:\BDM-worktrees\career-f4a-ecosystem-routing`
- Base: `bbf51a3a` (`chore: close career f3.1 integration`), ascendencia verificada.
- No se modificaron `main`, otros worktrees, la rama WorldDB activa ni `docs/playable/evidence/f3/ab-comparison.json`.

## Código modificado

- `src/ui/gameContext.ts`: capacidades y contexto derivados del club y sus temporadas activas.
- `src/ui/gameContext.test.ts`: regresiones NCAA, NBA y salario uncapped.
- `src/ui-ng/applications/recruiting/RecruitingWorkspace.tsx`: ciclo NCAA activo.
- `src/ui-ng/applications/talent/TransferPortalWorkspace.tsx`: temporada/ciclo Portal activos.
- `src/ui-ng/applications/talent/TalentOperationsWorkspace.tsx`: Draft y Talent del club, no del puntero global.
- `src/ui-ng/applications/market/marketViability.ts`: reglas salariales vigentes del club.
- `src/ui-ng/applications/contracts/ContractsWorkspace.tsx`: temporada y cap desde autoridades del club.
- `src/app/game/PlayableF4AEcosystemRouting.test.ts`: pilotos A/B/C y Save V4.

## Sistemas reutilizados

`SportsEcosystem`, temporadas activas, `TradeSeasonAuthority`, `TradeEngine`, `RecruitingEngine`, Eligibility/Transfer Portal, `salaryRulesInForce`, Market/Finance, New Game y Save V4. No se creó un engine paralelo.

## Defectos corregidos

1. Capacidades NCAA/Draft/Salariales dependientes por error de `world.currentSeasonId`.
2. Salary cap mostrado para reglas profesionales uncapped.
3. Recruiting, Portal, Talent, Market y Contracts leyendo temporada global en vez de la autoridad del club.
4. Riesgo de mostrar herramientas de otro ecosistema en el Start Menu o WorkspaceHost.

## Evidencia

- Pruebas focalizadas previas al commit: 6 archivos, 23 tests PASS.
- Pilotos F4A: 3 tests PASS.
- `npm run typecheck`: PASS.
- La suite `npm test` completa se inició en un worker, ejecutó los benchmarks WorldDB de 100 y 365 días y no mostró un fallo antes de ser interrumpida por la ventana operativa; queda **INCONCLUSIVE**, no PASS global.

## Limitaciones pendientes

- Windows native acceptance no ejecutada en esta fase.
- WorldDB no contiene todavía una ruta de producción única que exponga conjuntamente FIBA-like, NBA-like y NCAA-like.
- El piloto NBA usa un mundo Prototype generado; el NCAA usa un universo simulado marcado como test.
- La misma campaña WorldDB registró 248026.1 ms/100 días y 707299.8 ms/365 días en F4A frente a 292338.6 ms/100 días en F3.1; no se atribuye causalidad a este routing.
- La memoria máxima y el tiempo de Save/Load comparados por ecosistema siguen pendientes.
- Algunas vistas históricas siguen usando `currentSeasonId` para estadísticas/presentación, no para autorizar operaciones.

## Siguiente trabajo mínimo

1. Integrar una selección WorldDB común con fixtures NBA/NCAA válidos o declarar formalmente el catálogo disponible.
2. Ejecutar la campaña de rendimiento comparable con instrumentación de fases y memoria.
3. Repetir la aceptación Windows y el smoke test de New Game sobre las rutas reales.
