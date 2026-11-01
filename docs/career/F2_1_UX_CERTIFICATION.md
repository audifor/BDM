# CAREER-F2.1 - Director Hub UX certification

Estado: **PARTIAL**.

## Evidencia funcional

- `DirectorHubPanel` sigue siendo una proyeccion de `GameWorld`; no crea una segunda cola.
- Las prioridades A/B/C/D proceden de breakpoints, recomendaciones, scouting, training, delegation outcomes y contexto real.
- Las recomendaciones informativas siguen sin accion de aceptacion; solo pueden abrir detalle o ignorarse.
- Las acciones se ejecutan mediante los comandos existentes del store.
- Las situaciones humanas nuevas tambien se proyectan desde `getUserHumanSituations` y sus botones llaman `decideUserHumanSituation`.
- El estado vacio permanece silencioso cuando no hay actividad.
- El panel no sustituye Staff, Training, Tactics, Medical, Match, Board o Inbox.

## Pruebas

- `directorHubModel.test.ts`: estado vacio, calendario ausente, ausencia de cola duplicada, Save V4 y situaciones HRPG reales.
- `DirectorHubPanel.test.tsx`: click de una opcion HRPG real, cambio canonico de estado y round-trip Save V4.
- `HumanSimulation.test.ts`: 24 tests PASS en la ejecucion focalizada.
- Regresion Home/F1/HRPG/Staff/CoachCareer: 7 archivos, 56 tests PASS.
- `npm run typecheck`: PASS.

## Aceptacion visual

La aceptacion visual nativa de Windows queda **PENDING**: Computer Use no pudo conectar la tuberia nativa (`native pipe unavailable`). No se declara PASS visual. La cobertura jsdom de interfaz y la inspeccion de layout responsive en CSS quedan como evidencia parcial.

## Limitaciones

La suite global y la inspeccion visual nativa deben repetirse en un entorno con el helper Windows disponible. No se anade una bandeja Inbox paralela ni se inventan conversaciones para cubrir ese hueco.
