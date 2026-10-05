# ME-LOCK1 · Auditoría de rutas de simulación

Rama `match-next-me-lock1-fast-simulation`, desde `3408a4e` (BT7).

La auditoría se hizo con búsqueda estructural de todos los puntos de entrada de los dos motores fuera de sus módulos y de todos los sitios que completan un `Game`:

- `applyMatchResult`;
- `MatchStatLog`;
- `status: 'completed'`.

El guardián `src/app/game/matchResolution.test.ts › production guard` repite la búsqueda en cada ejecución.

## 1. Puntos de entrada

| Motor | Simulación | Aplicación del resultado |
|---|---|---|
| **Legado** (`@/engine/match`) | `simulateMatchWithRotations`, `createMatchSession`/`stepMatchSession` (vía `LiveMatchController`), `LegacyMatchEnginePort` | `completeMatch` = `applyCompletedMatch` + `applyPlayerMatchConsequences` + `applyPostMatchInjuries` |
| **Match Next** | `MatchEnginePort.prepare` → `MatchNextLiveController` (`simulate(setup, 'FULL' \| 'FAST')`, `runInstant`, `createLiveSession`) | `completeMatchNext` |

### Preparación

Es compartida y única: `prepareMatchOptions`, que resuelve disponibilidad, plan del entrenador, quinteto, tácticas, emparejamientos, fatiga previa y semilla. Match Next la proyecta en `MatchSetup` mediante `prepareMatchSetup` / `prepareMatchSetupWithReports`.

### Aplicación

En los dos caminos termina en `applyMatchResult`, con idempotencia que falla cerrada si ya existe un `MatchStatLog`. No hay ningún otro sitio de producción que complete un `Game`.

## 2. Rutas

| Ruta | Motor antes de ME-LOCK1 | Consumidor | Modo requerido | Motor después de ME-LOCK1 |
|---|---|---|---|---|
| Partido del usuario en Live (interfaz NG) | Match Next (`MatchWorkspace` → `NgMatchNextViewer`) | jugador | FULL (Live) | Match Next FULL (sin cambios) |
| Instant del usuario (interfaz NG, botón Instant de `MatchWorkspace`) | Match Next (`advanceTicks(200)` + `port.complete`) | jugador | FAST (ver §3) | Match Next; mismo resultado que FAST, porque los frames son de solo lectura |
| Instant del usuario (store `instantResult` / `playUserGame`; acciones de la interfaz legacy y del escritorio) | **Legado** (`completeMatch(prepareUserMatch)`) | jugador | FAST | **Match Next FAST** (`matchResolution.instantResult`) |
| Partido del usuario resuelto al avanzar el día sin jugarlo (`allowedRequiredReasons: ['userGame']`) | **Legado** (`simulateAndApplyGame`) | calendario | FAST | **Match Next FAST** |
| IA contra IA del día | **Legado** (`simulateRemainingGamesToday` → `simulateAndApplyGame`) | calendario | FAST | **Match Next FAST** |
| Simulate Day (`MatchWorkspace` → `simulateRemainingGamesToday`) | **Legado** | jugador | FAST | **Match Next FAST** |
| Advance Day (`advanceGameDay` / `advanceGameDayWithResult`, fase `MATCH_RESOLUTION`) | **Legado** | calendario | FAST | **Match Next FAST** |
| Continue (`ContinueFlow.continueGame`, barra del sistema NG) | **Legado** (vía `advanceGameDay`) | calendario | FAST | **Match Next FAST** |
| Simulate until date (`simulateUntilDate`) | **Legado** (vía `advanceGameDay`) | calendario | FAST | **Match Next FAST** |
| Avance diario de World DB (`WorldDbDailyAdvance` → `advanceGameDayWithResult`) | **Legado** | calendario | FAST | **Match Next FAST** |
| Ciclo de competición y temporada (`finalizeCompletedSeason`, `startNextSeason`) | no resuelve partidos: usa los ya resueltos | temporada | — | — |
| Playoffs | **no existen** como ruta propia; el formato es `leagueRoundRobin` y sus partidos pasan por el avance de día | calendario | FAST | Match Next FAST |
| NCAA, NBA y FIBA, femenino y masculino | no hay ruta propia: misma `simulateAndApplyGame`; las reglas salen de `Competition.rules.gameFormat` | calendario | FAST | Match Next FAST |
| Mundo generado (`createNewGame`), universo ACB y World DB Spain | misma ruta de avance | calendario | FAST | Match Next FAST |
| Interfaz legacy (`?ui=legacy`): visor Live (`startLiveMatch` → `createLiveUserMatch` → `LiveMatchController`; `completeMatch`) | Legado | jugador (interfaz retirada de la navegación normal) | — | **Legado (compatibilidad)**: su visor consume el formato `MatchSimulation` del motor legado |
| Rama `NgMatchViewer` de `MatchWorkspace` | Legado | se muestra solo si hay una `MatchSimulation` legacy en el store del visor, que la interfaz NG nunca crea | — | **Legado (resto de compatibilidad)** |
| `LegacyMatchEnginePort` (`createMatchEnginePort('legacy')`) | Legado | ninguno de producción | — | compatibilidad y pruebas |
| Pruebas y *fixtures* (`prepareUserMatch`, `completeMatch` y `prepareMatch` en pruebas de estadísticas, de interfaz y del motor legado) | Legado | pruebas | — | sin cambios (§4) |
| Herramientas de auditoría (`src/presentation/match-next/audit/*`) | Match Next | desarrollo | FULL/FAST | Match Next |

No queda ninguna ruta desconocida. Las únicas rutas que pueden resolver un partido son las de la tabla:

- `simulateAndApplyGame`;
- `instantResult`;
- `playUserGame`;
- el Live NG;
- el visor legacy.

Todas convergen en `applyMatchResult`.

## 3. Instant del usuario

**Decisión: Instant = FAST.**

Es la opción A del enunciado («FULL sin presentación») y coincide con FAST: FAST es exactamente FULL sin presentación, porque el `MatchFrame` es una proyección de solo lectura del estado. La prueba «FULL (a frame every tick) and FAST produce the identical result» lo comprueba, igual que la certificación Live = Instant de BT7.

Por tanto no hay pérdida de fidelidad entre Instant y Live. Instant elige FAST porque no tiene ningún consumidor de frames. El botón Instant de la interfaz NG avanza en bloques de 200 ticks para mostrar progreso, y su resultado es el mismo.

## 4. Lo que sigue usando el motor legado

Detalle y clasificación en `ME_LOCK1_LEGACY_ENGINE_RETIREMENT.md`. Ninguna simulación normal de producción lo usa:

1. La interfaz legacy (`?ui=legacy`) y su visor Live.
2. La rama residual `NgMatchViewer`.
3. `LegacyMatchEnginePort`.
4. Las pruebas que usan el motor legado como *fixture* rápido para generar estadísticas.
