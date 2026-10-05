# ME-LOCK1 · Plan de retirada del motor legado

Desde ME-LOCK1, toda simulación normal de producción pasa por Match Next:

- avance de día, Simulate Day, Continue, simulación hasta una fecha y avance diario de World DB;
- Instant del usuario.

El motor legado (`src/engine/match/`) queda en **cuarentena**: no se borra en este hito, se acota y se vigila.

## 1. Guardián

`src/app/game/matchResolution.test.ts › production guard` recorre todo `src/`, salvo las pruebas, y falla si algún módulo fuera de la superficie de compatibilidad declarada usa una entrada de simulación del motor legado:

| Tipo | Entradas |
|---|---|
| Motor | `simulateMatchWithRotations`, `simulateMatch`, `createMatchSession`, `stepMatchSession` |
| Envoltorios de aplicación | `LegacyMatchEnginePort`, `LiveMatchController`, `createLiveUserMatch`, `prepareUserMatch`, `completeMatch` |

Además exige que `advanceGameDay.ts` y `matchResolution.ts` no mencionen ninguna, y que el avance de día importe la resolución de `./matchResolution`.

Para añadir un consumidor nuevo hay que tocar a propósito la lista del guardián y este documento.

## 2. Clasificación

| Camino legado | Clase | Consumidores | Plan |
|---|---|---|---|
| `src/engine/match/` (motor, rotación legada, `MatchResultApplication`, `applyMatchResult`) | **mixto** | `applyMatchResult` es la frontera canónica de resultado y la usa también `completeMatchNext`: **no es legado**. El resto (simulación, sesión, *spatial*, `MatchSimulation`) es legado | separar `applyMatchResult` y la validación del resultado en su propio módulo de dominio antes de borrar el motor |
| `prepareMatchOptions` (`app/game/playUserGame.ts`) | **producción compartida** | Match Next (`prepareMatchSetup`) y legado | queda; mover a un módulo neutro (`matchPreparation`) cuando se borre el legado. Sus tipos aún heredan `SimulateMatchWithRotationsOptions` |
| `prepareUserMatch`, `prepareMatch`, `completeMatch`, `createLiveUserMatch` (`playUserGame.ts`) | **compatibilidad** | interfaz legacy y pruebas | retirar con la interfaz legacy |
| `LiveMatchController` (`app/game`) | **compatibilidad** | visor de la interfaz legacy (`?ui=legacy`) y sus pruebas | retirar con la interfaz legacy |
| `gameStore`: `startLiveMatch`, `advanceLiveMatch`, `advanceLiveMatchPresentation`, `skipLiveMatch`, `applyLiveTactics`, `applyManualSubstitutions`, `completeMatch`, `getActiveMatchSession` | **compatibilidad** | `src/ui/App.tsx` (interfaz legacy) y `NgMatchViewer` | retirar con la interfaz legacy. MP2 traerá cambios y táctica en vivo a Match Next |
| `NgMatchViewer` (rama de `MatchWorkspace`) | **muerto en la interfaz NG** | solo se pinta si el store del visor tiene una `MatchSimulation` legacy, que la interfaz NG nunca crea | eliminable ya; se deja por prudencia (fuera del alcance de unificación) |
| `LegacyMatchEnginePort`, `createMatchEnginePort('legacy')` | **compatibilidad / pruebas** | pruebas del puerto | eliminable cuando se retire el legado |
| `src/ui/**` (interfaz legacy completa) | **compatibilidad** | `?ui=legacy` | decisión de producto: retirar la interfaz legacy |
| Pruebas que usan `prepareUserMatch` / `completeMatch` / `prepareMatch` como *fixture* de estadísticas (≈ 20 ficheros: interfaz, estadísticas de jugador, historial, competición) | **pruebas** | — | migrar a un *fixture* Match Next corto (`prepare` con periodos de 30–60 s + `simulate(…, 'FAST')`) cuando se borre el legado; hoy son baratas (15 ms por partido) y no afectan a producción |
| Pruebas del propio motor legado (`src/engine/match/**/*.test.ts`) | **pruebas** | — | se borran con el motor |

## 3. Qué falta para borrar el motor

1. Decidir la retirada de la interfaz legacy (`?ui=legacy`). Es lo único que lo ejecuta fuera de las pruebas.
2. Extraer `applyMatchResult` y la validación del resultado a un módulo de dominio propio, y mover `prepareMatchOptions` a un módulo neutro sin tipos `SimulateMatchWithRotationsOptions`.
3. Sustituir los *fixtures* de prueba legados por uno Match Next corto.
4. Borrar `src/engine/match/` salvo lo extraído, `LiveMatchController`, `LegacyMatchEnginePort` y la rama `NgMatchViewer`, y simplificar el guardián a «ninguna referencia».

No hace falta nada de esto para la unificación de autoridad de ME-LOCK1. Es arqueología de repositorio con riesgo propio, y se deja para un hito de limpieza.
