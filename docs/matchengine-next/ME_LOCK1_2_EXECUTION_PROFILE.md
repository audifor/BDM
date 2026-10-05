# ME-LOCK1.2 · Perfil de arquitectura de ejecución

Rama `match-next-me-lock1-2-exact-execution`, desde `6492794` (ME-LOCK1.1).

ME-LOCK1.1 dejó un perfil plano (ninguna función por encima del 6,2 %). Este perfil busca el coste repartido: asignaciones, copias, recolector, propagación inmutable, reconciliación repetida, búsquedas y estado derivado reconstruido.

## Entorno

| | |
|---|---|
| Máquina | Windows 11, Intel i5-12400F: 6 núcleos físicos, 12 hilos |
| Runtime | node 24.12.0; Chrome (headless) para las medidas de navegador |
| Código | *bundle* esbuild (`scripts/next/melock1Build.mjs`, `import.meta.env.DEV = false`), el mismo para base y rama |
| Partido de referencia | prototipo, semilla `3498342002`: 26.466 ticks y 12.563 eventos |

## Herramientas nuevas

| Herramienta | Qué mide |
|---|---|
| `scripts/next/melock12AllocProfile.ts` + `melock12HeapSum.mjs` | asignación total de la simulación (muestreo del inspector, **incluidos** los objetos que recoge el *scavenger*), por fichero y función |
| `node --trace-gc-nvp` | volumen de asignación, pausas y memoria promovida |
| Contadores insertados en copias del *bundle* | llamadas por tick y copias de `MatchState` (`melock12SpreadCount.mjs` + `melock12SpreadRun.ts`: plugin esbuild que envuelve cada `{ ...state, … }`) |
| `node --no-turbo-inlining --cpu-prof` | tiempo propio sin *inlining*, para atribuir bien las funciones grandes |
| `scripts/next/melock12Ab.mjs` | A/B base-rama alternando procesos, para cada paso |

## 1. Asignación y recolector (base `6492794`)

| Medida | Valor |
|---|---|
| Asignación total por partido | **6,9 GB** (~260 KB por tick) |
| Ritmo de asignación | ~1,5 GB/s |
| Promovido a la generación vieja | 27 MB |
| Recolecciones | ~200 *scavenges* y 3 *mark-compact* por partido; pausas 135–220 ms |
| Recolector, peso en CPU | **3,5 %** |

Casi todo muere joven: el recolector es barato. El coste está en construir y rellenar esa memoria, y sobre todo en la contención con varios *workers* en paralelo (§6).

### Asignación por origen (base)

| Origen | Asignación | Peso |
|---|---:|---:|
| `emitEvent`: copia el historial entero de eventos en cada evento | 1.552 MB | 22,5 % |
| `ReboundTransition` (roles, responsabilidades e intenciones de transición) | 824 MB | 12,0 % |
| `ManDefense` (asignaciones, responsabilidades, intenciones, `guardPosition`) | 720 MB | 10,4 % |
| `PlayerKinematics` (resultado de integración por jugador) | 601 MB | 8,7 % |
| `OffensiveStructure` | 384 MB | 5,6 % |
| `ActionCore` + `ActionIndex` (copias del historial de acciones) | 340 MB | 4,9 % |
| `OffensiveRoles` + `TacticalIdentity` (clave de memo, ordenaciones) | 353 MB | 5,1 % |
| `playerDynamicState` (fatiga: 24 jugadores nuevos por tick) | 157 MB | 2,3 % |

## 2. Copia del estado: la hipótesis de partida

La hipótesis del enunciado (y la recomendación de ME-LOCK1.1) era que las copias inmutables del estado de ~49 campos en cada micro-paso dominaban. **Medido, no es así.**

| Medida | Valor |
|---|---|
| Copias `{ ...state, … }` de `MatchState` por tick | **10,3** (272.244 en el partido) |
| Coste de una copia (estado de mitad de partido, 49 claves) | ~54 ns |
| Coste total | ~0,55 µs por tick, ~15 ms por partido: **~0,6 %** |

Hacer mutable el estado de primer nivel ahorraría como mucho ese 0,6 %. Lo caro es lo que cada pase reconstruye dentro: arrays de responsabilidades, decisiones e intenciones, mapas, ordenaciones, búsquedas y claves de texto.

## 3. Reconciliación repetida

| Medida | Valor |
|---|---|
| Llamadas a `reconcileStructures` | 79.594: **3,0 por tick** |
| Devuelven el mismo estado (punto fijo) | 13.710 (17 %) |
| Reciben exactamente el estado de la llamada anterior | 4.558 (5,7 %) |

Los tres pases por tick **hacen avanzar** el partido: el 83 % de las llamadas produce un estado distinto. Memorizar los pases por referencia ahorraría ≤ 6 %, y fusionarlos cambiaría el baloncesto, así que siguen congelados (como en ME-LOCK1.1).

### Tiempo inclusivo por etapa (base)

| Etapa | Peso |
|---|---:|
| `reconcileStructures` (3 por tick) | 75 % |
| `reconcileActions` | 29,5 % |
| `reconcileManDefense` | 15,2 % |
| `reconcileOffensiveStructure` | 15,0 % |
| `reconcileReboundTransition` | 10,7 % |
| `readDecision` | 7,2 % |
| `integrateMatchPlayers` | 6,3 % |
| `tacticalIntent` | 5,8 % |
| `lineupRoles` | 5,1 % |
| `emitEvent` | 3,8 % |

## 4. «Muerte por mil cortes»: lo encontrado

| Patrón | Dónde | Coste medido (base) | Destino |
|---|---|---|---|
| Resumen ofensivo del equipo recalculado recorriendo **todo** el historial de acciones en cada array nuevo (uno por tick) | `teamOffensiveActions` (desde `OffenseFlow.ts:83`) | ~7 % (4,4 % en una sola línea) | **Paso 1**: resumen arrastrado |
| Clave de memo de la intención táctica reconstruida (filter, join, plantilla) en cada array de jugadores nuevo | `memoizedTacticalIntent` | 3,3 % propio | **Paso 2** |
| Roles del quinteto reordenados (sort + `localeCompare`) varias veces por tick con los mismos datos | `lineupRoles` | 2,5 % propio + `byId` 0,8 % | **Paso 2** |
| `JSON.stringify` de la decisión de ayuda, dos veces por pase defensivo | `ManDefense.ts:266` | ~1–2 % | **Paso 2** |
| Copia del historial entero en cada evento | `emitEvent` | 2,9–3,7 % + 1,55 GB/partido | **Paso 3**: registro de eventos de la sesión |
| Vectores temporales en la integración; lista de «otros» por jugador | `integrateMatchPlayers` | 8,7 % de la asignación | **Paso 4**: sin ganancia (V8 ya los elimina por *escape analysis*); revertido |
| `players.find` y un `Map` de jugadores por pase | 67 sitios; `ManDefense`, `ReboundTransition`, `OffenseFlow` | ~2–3 % | **Paso 5**: índice por versión del array, **más lento** con 24 jugadores; revertido |
| Barridos del historial acotados por `resolvedT`/`startedT` | `EpisodeContact`, `OffenseFlow:76`, `DecisionCore`, `ShotEcology` | ~2 % en total | pendientes (§7) |
| Diccionarios de tiempo en pista copiados por tick | `addActualCourtTime` | 0,6 % | sin tocar |

## 5. Validación y reconciliación por frecuencia (§15)

| Frecuencia | Qué corre | Comentario |
|---|---|---|
| HOT (tick) | ninguna validación | Los `reconcile*` no son validaciones: son pases de simulación que avanzan el partido (congelados). Las guardas de transición (`BallTransitions`: dueño del balón, equipo de la posesión, distancias) son O(1) y solo corren cuando ocurre la transición: ya son las «aserciones internas rápidas» del §16 |
| POSESIÓN | ninguna | |
| PERIODO | reinicio de faltas de equipo (estado, no validación) | |
| PARTIDO | `validateMatchSetup` al empezar; invariantes de `createMatchNextResult`; puntos = marcador en `createMatchStatLogFromMatchNext`; `validateWorld` una vez por aplicación (`withSingleWorldValidation`, ME-LOCK1.1) | |
| Diagnóstico (nuevo) | `execution/Diagnostics.ts` a nivel `FULL`: cada proyección incremental se compara con la definición que sustituye | solo pruebas y certificación |

No había validación cara dentro del tick que bajar de frecuencia.

## 6. Paralelismo: contención

Con varios procesos simulando a la vez, cada partido se ralentiza mucho más que la pérdida de turbo:

| Procesos simultáneos | Base, ms por partido | Rama, ms por partido |
|---:|---:|---:|
| 1 | 3.051 | 2.466 |
| 6 | 5.432 (×1,78) | 3.828 (×1,55) |
| 12 | 10.113 (×3,31) | 6.923 (×2,81) |

(`scripts/next/melock12Scaling.mjs`, 4 partidos por proceso.)

Reducir asignación ayuda más en paralelo que en serie: −19 % en serie y −30 % por partido con 6 procesos. La saturación está en los 6 núcleos físicos (§ certificación).

Un semiespacio joven mayor (`--max-semi-space-size=32/64`) da 0–7 % con mucho ruido. Se anota como opción, sin cambiar la configuración de producción.

## 7. Perfil después (rama)

| Medida | Base | Rama |
|---|---:|---:|
| Asignación por partido | 6,9 GB | 5,0 GB |
| `emitEvent` | 1.552 MB | ~0 (anexado en sitio) |
| Tiempo propio máximo de una función | 8,1 % | 6,6 % (`reconcileManDefense`) |

Lo que queda es el cálculo de baloncesto de cada pase, sin un dominante:

- defensa ~16 %;
- estructura ofensiva ~13 %;
- transición y rebote ~13 %;
- decisión ~9 %;
- integración ~8 %.

Cada mejora exacta adicional identificada vale un 1–3 %: los barridos de historial acotados por tiempo, la parte de los roles que no depende de la fatiga y los diccionarios de tiempo en pista.

Un orden de magnitud más exigiría cambiar **qué** calcula cada pase (algoritmos incrementales de defensa y estructura), no **cómo** se guarda el estado. Eso ya no es una refactorización exacta de ejecución.
