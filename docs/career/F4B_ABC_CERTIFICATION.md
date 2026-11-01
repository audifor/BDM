# F4B - Certificacion A/B/C

## A - FIBA-like

Fixture: `createAcbTestGame({ playableMarket: true })`. La entrada contextual se certifica con un agente libre real producido al ejecutar `releasePlayer`; la navegacion y el Market usan el flujo directo F3. Los escenarios de respuesta, firma, rechazo e idempotencia pertenecen a `PlayableF3DirectApproach`, `PlayableF3Transfer` y `DirectFreeAgentApproachService.test.ts`.

Estado F4B: **PARTIAL**. La integracion de entrada es jugable; no se reclama aqui un nuevo piloto de 30 dias completo desde New Game.

## B - NBA-like

Fixture: `createNewGame`, seleccionando la temporada con `TradeRules` y `SalaryRules`, y reasignando el coach a una franquicia NBA-like. La prueba F4B confirma un objetivo de otra franquicia y la accion Trade. `TradesWorkspace` carga el paquete con `playerId`; TradeEngine y las pruebas de negociacion existentes mantienen la validacion y ejecucion.

Estado F4B: **PARTIAL**. La interfaz de dos equipos queda conectada; la certificacion completa desde un New Game comun requiere el universo WorldDB/F4C.

## C - NCAA-like

Fixture: `createNcaaSimulatedGame`; el candidato se crea mediante `discoverRecruitingTalentCandidate`. La ficha lleva a Recruiting/Portal sin habilitar Market profesional. Recruiting, Portal y Eligibility conservan sus pruebas y comandos existentes.

Estado F4B: **PARTIAL**. El recorrido contextual NCAA esta conectado a fixtures jugables, pero no se declara produccion comun multi-ecosistema mientras WorldDB siga pendiente.

## Persistencia

Save V4 ya serializa las colecciones canonicas de negociaciones, operaciones, contratos, trades, recruiting, portal y consecuencias. Los nuevos query params son UI context y no sustituyen datos del save.

## Validacion tecnica

- Suites focalizadas F4B/F3/F4A: PASS, 44 tests de UI y 66 tests de motores/persistencia.
- Typecheck, build, cargo fmt y cargo check: PASS.
- Windows CLI: PASS. La aceptacion GUI manual no se ejecuta en esta fase.
