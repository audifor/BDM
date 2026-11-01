# F4A · Certificación comparativa de tres pilotos

Resultado: **PARTIAL, con las rutas disponibles verificadas**.

La prueba `src/app/game/PlayableF4AEcosystemRouting.test.ts` usa tres configuraciones existentes y guarda/carga cada mundo con Save V4.

## A · Profesional FIBA-like

- Fuente: `createAcbTestGame({ playableMarket: true })`, universo de prueba ACB 2026/27.
- Autoridad: `SportsEcosystem` FIBA-like, Market/Finance y SalaryRules ACB demo.
- Resultado: Market disponible; Trade, Draft, Recruiting y Portal no aplican.
- Regla salarial: uncapped; no se etiqueta como salary cap.
- Persistencia: `userCoachId` conservado en Save V4.
- Alcance: los datos de jugadores, ratings, contratos y finanzas del ACB test universe son datos generados de prueba, no una certificación de producción WorldDB.

## B · NBA-like

- Fuente: `createNewGame()`, ecosistema NBA-like generado dentro del mundo determinista de prototipo.
- Preparación: se dirige un club NBA-like y se mantiene el `currentSeasonId` apuntando a otra temporada para probar la regresión.
- Autoridad: `TradeSeasonAuthority`, `TradeRules`, `SalaryRules` y `TradeEngine` existentes.
- Resultado: Trades y salary cap aparecen para el club NBA-like; Recruiting no aparece; la autoridad de Trade se resuelve desde el club.
- Persistencia: el club controlado y `userCoachId` sobreviven a Save V4.
- Limitación: el selector New Game no ofrece todavía una opción NBA-like de datos fuente independiente; el piloto es un fixture generado del universo Prototype.

## C · NCAA-like

- Fuente: `createNcaaSimulatedGame()`, opción `NCAA DEVELOPMENT · SIMULATED`.
- Autoridad: RecruitingCycle, RecruitingEngine, Transfer Portal y Eligibility existentes.
- Resultado: Recruiting y Portal aparecen para el programa activo; Trades no aparece.
- Persistencia: `userCoachId` conservado en Save V4.
- Limitación: el catálogo marca esta opción como `isTest: true`; no es una base NCAA oficial.

## Pruebas negativas

- Un club FIBA-like no obtiene Trade por el nombre del país o de la competición.
- Un club NBA-like no obtiene Recruiting por compartir el mismo GameWorld.
- Un programa NCAA no obtiene Trades ni salary cap NBA por existir `TradeRules` en otra competición.
- Las decisiones ilegales siguen siendo rechazadas por el motor canónico, aunque una pantalla se abra accidentalmente.
