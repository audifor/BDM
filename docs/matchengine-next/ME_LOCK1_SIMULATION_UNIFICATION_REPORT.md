# ME-LOCK1 · Unificación de la simulación y modo FAST — informe

Rama `match-next-me-lock1-fast-simulation`, desde `3408a4e` (BT7). No se ha hecho merge ni push.

## 0. Resumen

BDM ya no tiene dos verdades de baloncesto en producción. Todos los partidos que se resuelven sin visor pasan por Match Next en modo FAST, la misma autoridad que el partido en vivo del usuario:

- avance de día;
- Simulate Day;
- Continue;
- simulación hasta una fecha;
- avance diario de World DB;
- Instant del usuario.

El motor legado queda en cuarentena, vigilado por un guardián estructural.

| Hallazgo | Detalle |
|---|---|
| **Coste real del partido** | El perfil desmintió la idea de «~1 minuto de baloncesto». Instant costaba 22,6 s, y ~75 % de eso era contabilidad cuadrática de historiales: recorrer todas las acciones y eventos del partido en cada tick. El «minuto» era Live: ~30 s más de frames que copian todo el historial en cada tick |
| **Optimización** | Corregida con transformaciones de **igualdad exacta**, verificadas con *hash* del estado final en 6 semillas en cada paso: Instant ×7,9 (2,8 s por partido). Beneficia por igual a FULL, Live y FAST |
| **FAST** | El motor exacto sin presentación. FULL = FAST bit a bit, comprobado en 10 partidos completos y 4 emparejamientos. Las equivalencias estadística, táctica, de jugador, de rotación y de consecuencias son **exactas**, no aproximadas |
| **Rendimiento** | Lo que queda es el baloncesto en vivo, ~0,1–0,16 ms por tick. FAST es ~11 veces más lento que el legado: día ACB ~30 s, temporada ~17 min. Production Lock: **NO** por rendimiento. Basketball Core Lock: **YES** |
| **Datos del mundo** | Las ligas NBA y NCAA generadas ya usan su formato. El eliminado sin banquillo se anuncia explícitamente |

## 1. Rama y punto de partida

| | |
|---|---|
| Rama | `match-next-me-lock1-fast-simulation` |
| Inicio | `3408a4e` |
| Estado inicial | limpio, salvo `docs/matchengine-next/FM_LEVEL_ENGINE_AUDIT.md` (sin seguimiento, ajeno; se conserva) |

Antes de empezar se restauró el `node_modules` compartido (`C:\BDM-MATCH-PHASER`), dañado al cerrar BT7: `npm ci` desde el lockfile, sin cambios rastreados.

| Motor | Entradas de producción |
|---|---|
| Legado (antes de ME-LOCK1) | `simulateAndApplyGame` (avance de día y todo lo que cuelga de él), `instantResult` y `playUserGame`, y el visor de la interfaz legacy |
| Match Next | `MatchWorkspace` (Live e Instant del usuario en la interfaz NG) y `MatchEnginePort` |

## 2. Auditoría de rutas

En `ME_LOCK1_SIMULATION_ROUTE_AUDIT.md`. No queda ninguna ruta desconocida. Todas las resoluciones convergen en `applyMatchResult`, con idempotencia que falla cerrada.

No existen rutas propias de playoffs, NCAA, NBA, FIBA ni competiciones femeninas: todas pasan por el avance de día, y sus reglas salen de `Competition.rules.gameFormat`.

## 3. Perfil

En `ME_LOCK1_PERFORMANCE_PROFILE.md`.

**Método:** muestreo de V8 sobre un *bundle* esbuild con *source map* traducido a líneas TypeScript, curva de coste por 1.000 ticks e instrumentación solo en copias del *bundle*.

| Medida (un partido, solo) | Antes |
|---|---:|
| Live (frame por tick) | ≈ 53 s |
| Frames | ≈ 32 s |
| Núcleo | ≈ 21 s |
| Instant | 21–23,8 s, sin frames |
| Coste por posesión | 133 ms |
| Coste por tick | de 0,20 ms al principio a 1,54 ms al final |
| `prepare` | 0,26 s |
| `complete` | 0,05 s |

Dentro del núcleo:

- `reconcileStructures`: 75 % inclusivo, 3 llamadas por tick;
- `reconcileActions`: 34 %;
- `reconcileTransition`: 27 %;
- decisiones: 2,7 %;
- movimiento: 1,9 %;
- geometría: 0,3 %;
- tácticas: 3,7 %, con 26 llamadas por tick.

**Causa:** 31 recorridos de `actions` (1.359 al final del partido, 0 activas) y recorridos de los 12.563 eventos en cada tick.

## 4. Arquitectura FAST

```text
                      MATCH NEXT (una autoridad)
     prepareMatchOptions → MatchSetup → MatchNextLiveController → completeMatchNext
                                   │
               simulate(setup, 'FULL')   simulate(setup, 'FAST')
               frame en cada tick         sin presentación (skipToEnd)
               (Live del usuario)         (IA, mundo, Instant)
                                   │
                       MatchNextResult (mismo contrato)
```

### Código nuevo

| Pieza | Qué es |
|---|---|
| `MatchNextEnginePort.simulate(setup, mode)` y `MatchExecutionMode` | modos explícitos; `runInstant` = FAST |
| `src/app/game/matchResolution.ts` | `simulateAndApplyGame`, `instantResult` y `playUserGame` sobre Match Next FAST |
| `prepareMatchSetupWithReports` | conserva los informes de reparación de quinteto que registraba la ruta legada |
| `src/engine/match-next/actions/ActionIndex.ts` | vistas exactas sobre el historial de acciones: `activeActions`, `teamOffensiveActions`, `actionById`, `actionIndexById`, `findLastAction`, `someActionAfter` |
| `events.ts` | `someEventSince`, `countEventsSince`, `findLastEvent` |
| `state.activePossession`, `ActionCore.updateAction/resolveAction` y `TacticalIdentity.tacticalIntent` | reescritos con igualdad exacta (§3 del perfil) |

### Lo que no se hizo

- No hay fórmulas de marcador.
- No hay tablas de PPP.
- No hay multiplicadores de modo.
- No se reduce la cadencia de decisiones ni de movimiento.

## 5. Rendimiento antes y después

En `ME_LOCK1_FASTSIM_CERTIFICATION.md` §3.

| Ruta | Legado | FULL | FAST |
|---|---:|---:|---:|
| Un partido | 0,29 s | 32 s | 2,8–3,7 s |
| 10 partidos | 2,9 s | — | 29,4 s |
| 100 partidos | — | — | 278 s |
| Día típico (4 partidos) | 1,05 s | — | 12,6 s |
| Día pesado (ACB, 9 partidos) | 6,5 s | — | 30,4 s |

| Antes de ME-LOCK1 | Antes | Después |
|---|---:|---:|
| Instant | 22,6 s | 2,9–3,7 s |
| Live con frames | ~53 s | ~32 s |
| Arnés BT7 A (Live) | 143 s | 32 s |

Memoria plana: ~14 MB retenidos tras 20 partidos, sin fugas.

## 6. Comparación estadística FULL frente a FAST

Igualdad exacta: 10 de 10 partidos completos con *hash* idéntico de resultado y estado final. Todos los deltas son 0 (PASS):

- ritmo, PPP, TOV, STL, AST, ORB y FTr;
- aro y 3PA;
- faltas, rotaciones y minutos;
- huellas tácticas;
- identidad de jugador.

El orden de fuerza, la identidad táctica y la de jugador son las de Match Next, auditadas en BT5–BT7. Un mundo con partidos FULL y FAST no tiene discontinuidad estadística (prueba de día mixto).

## 7. Rutas migradas

| Ruta | Después |
|---|---|
| `advanceGameDay` / `advanceGameDayWithResult` (fase `MATCH_RESOLUTION`) | Match Next FAST |
| `simulateRemainingGamesToday` (Simulate Day) | Match Next FAST |
| `continueGame` y `simulateUntilDate` | vía avance de día |
| `WorldDbDailyAdvance` | vía avance de día |
| Partido del usuario resuelto al avanzar el día | Match Next FAST |
| `instantResult` / `playUserGame` (store; acciones de la interfaz legacy y del escritorio) | Match Next FAST |

**Instant del usuario: FAST.** Es la opción A («FULL sin presentación»), que coincide con FAST: no hay pérdida de fidelidad porque FULL = FAST.

## 8. Consumidores legados restantes

En `ME_LOCK1_LEGACY_ENGINE_RETIREMENT.md`. Ninguno es simulación normal de producción:

1. La interfaz legacy (`?ui=legacy`) y su visor Live.
2. La rama residual `NgMatchViewer`.
3. `LegacyMatchEnginePort`.
4. Los *fixtures* de prueba.

**Guardián:** `matchResolution.test.ts › production guard`. `applyMatchResult` y `prepareMatchOptions` son producción compartida, no legado: hay que extraerlos antes de borrar el motor.

## 9. Datos del mundo y política de eliminación

### Formatos del mundo generado

Era el P1-2 de BT7. La causa estaba en `WorldGenerator`: creaba las ligas NBA y NCAA sin `rules`, así que recibían FIBA.

**Arreglado en su dominio.** NBA → `NBA_GAME_FORMAT` (WNBA en femenino); NCAA → `NCAA_MEN/WOMEN_GAME_FORMAT`. Prueba: `src/engine/world/WorldGeneratorFormats.test.ts`. No hay ningún ajuste en el motor que dependa del nombre de la liga.

### Eliminado sin banquillo

Era el P1-1 de BT7.

**Política explícita.** El motor mantiene cinco en pista (no modela jugar con menos) y emite `foulOutNoReplacement` en el momento de la eliminación cuando no queda ningún sustituto elegible. Nunca ocurre en silencio. Prueba: «foul-out with no eligible substitute».

La preparación sigue exigiendo 5 disponibles (`MINIMUM_MATCH_SQUAD_SIZE`): falla cerrada con 4. Jugar con menos de cinco queda en la lista MP2.

### Lesiones

Siguen siendo externas (`applyPostMatchInjuries` en `completeMatchNext`), iguales en los dos modos.

## 10. Pruebas

### Nuevas

**`src/app/game/matchResolution.test.ts`:**

- FAST determinista;
- FULL = FAST;
- día completo con clasificación, estado del jugador, guardado/recarga y reaplicación que falla cerrada;
- día mixto Live + FAST;
- Instant del usuario = Match Next FAST;
- fallo sin aplicación parcial;
- eliminado sin banquillo;
- guardián de producción.

**`src/engine/world/WorldGeneratorFormats.test.ts`.**

### Actualizadas, con su razón

| Prueba | Cambio |
|---|---|
| `GameApplication` «Instant Result = viewer» | reexpresada con Match Next: el visor es la sesión Live de Match Next |
| Pruebas de ciclo de vida (calendario, temporada, staff, barra del sistema): `simulateUntilDate`, `startNextSeason`, `SeasonProgression`, `ContinueFlow`, `StaffScreen.test.ts`, `StaffHumanState.integration`, `SimulationBreakpoints`, `createAcbTestGame.test`, `SystemBar` | `withShortGameFormat` (`src/app/game/testFixtures.ts`): sus partidos siguen yendo por Match Next FAST, con periodos de 1 minuto definidos en los datos de la competición. No son pruebas de baloncesto |
| Prueba de 306 partidos ACB + 400 días | *timeout* 20 min |
| Imports de las funciones movidas | apuntan a `./matchResolution` |

### Resultados

| Bloque | Resultado |
|---|---|
| Nuevas pruebas ME-LOCK1 | 9/9 |
| `engine/match-next`, `app/matchNext`, `engine/world`, `engine/tactics` y el resto de `app/game` | **353/353** |
| 18 ficheros de ciclo de vida | 15 fallos, **todos previos**: comprobados uno a uno contra `3408a4e` en un worktree temporal (o en la comparación de BT7). Ver tabla |
| Arnés BT7 sobre el código nuevo | A 46/46 (Live 32 s); F 44/44; R:NBA 44/44; C2 42/44 (los dos invariantes del caso documentado, eliminado sin banquillo) |
| Determinismo / igualdad | *hashes* golden de 6 semillas idénticos tras todos los cambios del motor y del generador |

Detalle de los 15 fallos previos:

| Fichero | Fallos |
|---|---:|
| `startNextSeason` | 8 |
| `StaffHumanState` CASO 7 | 1 |
| SystemBar «holidaying» | 1 |
| `gameStore` «simulate-until-date» (para en el partido del usuario) | 1 |
| draft NBA | 1 |
| `SeasonProgression` round-trip | 1 |
| `ContinueFlow` «keeps advancing» | 1 |
| la prueba de 306 partidos | 1, solo por *timeout* bajo carga: pasa sola en 527 s |

### Comprobaciones finales

Typecheck, build y *diff check*: ver §12.

## 11. Pendientes

| Prioridad | Pendiente |
|---|---|
| **P0** | Ninguno de baloncesto. Para el Production Lock falta rendimiento de FAST (~2,8 s por partido) |
| P1 | Rendimiento: lote paralelo del día en *workers* con avance de día asíncrono; después, micro-optimización del perfil plano (`ManDefense`, `OffensiveStructure`, cinemática) |
| P1 | Frames de Live incrementales (~32 s de copia de historial) |
| P1 | El coste de las pruebas: las de ciclo de vida usan formato corto y las de un día tardan 25–30 s |
| P1 | Retirada del legado: interfaz legacy, extracción de `applyMatchResult` y `prepareMatchOptions`, *fixtures* |
| P1 de BT7 | Clase B de baloncesto: FTr, aro, creación secundaria, presión |
| P1 de BT7 | Salidas tardías por falta de ventana de cambio |
| P1 de BT7 | Escala de fatiga |
| MP2 | Cambios y táctica del usuario en vivo, tiempos muertos, jugar con menos de cinco, guardado durante el partido, lesión en el partido |

## 12. Veredictos

| Área | Veredicto | Motivo |
|---|---|---|
| TECHNICAL | **PASS** | typecheck y build limpios; regresión enfocada verde; fallos restantes previos y comprobados |
| FAST PERFORMANCE | **PARTIAL** | ×7,9 exacto; aún ×11 más lento que el legado (día ACB ~30 s) |
| FAST BASKETBALL EQUIVALENCE | **PASS** | FULL = FAST exacto (10/10 partidos completos) |
| TACTICAL EQUIVALENCE | **PASS** | exacta |
| PLAYER / ROTATION EQUIVALENCE | **PASS** | misma autoridad, mismo resultado |
| POST-MATCH CONSEQUENCES | **PASS** | mismo `completeMatchNext`; guardado y recarga; falla cerrada |
| WORLD SIMULATION | **PASS** | Simulate Day, día mixto, temporada (ACB completa y paso de temporada), guardado y recarga |
| LEGACY ENGINE REMOVAL FROM PRODUCTION | **PASS** | cero rutas normales; guardián; cuarentena documentada |
| BASKETBALL CORE LOCK | **YES** | |
| PRODUCTION MATCHENGINE LOCK | **NO** | solo por el rendimiento de FAST |
