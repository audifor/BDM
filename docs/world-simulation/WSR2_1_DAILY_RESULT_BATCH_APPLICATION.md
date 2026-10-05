# WSR2.1 · Aplicación de resultados en lote diario

Rama `world-sim-wsr2-1-daily-result-batching`, desde `5915331` (WSR2).

## 1. Línea base (`5915331`)

Medida con `scripts/world-sim/wsr21Apply.ts`: aplica los partidos BACKGROUND de un día del mundo de escala (todos menos el del usuario) con `applyDayOutcomes`. Es el mejor de 3 repeticiones.

| Equipos | Resultados | Aplicación | ms/resultado |
|---:|---:|---:|---:|
| 528 | 241 | 1.548 ms | 6,42 |
| 1.008 | 461 | 6.557 ms | 14,22 |
| 2.016 | 923 | 29.776 ms | 32,26 |

**Perfil a 1.008 equipos** (tiempo inclusivo, 420 resultados, 7,0 s de aplicación):

| Paso de la cadena | Tiempo | Estructura de tamaño mundo que toca, por resultado |
|---|---:|---|
| `applyDynamicConsequences` | 2,71 s | copia entera de `careerFatigueByPlayerId` y de `developmentStimulusByPlayerId` |
| `applyMatchMorale` | 2,05 s | copia entera de `moraleByPersonId` |
| `updateGameWorld` (todas las llamadas) | 0,81 s | nuevo objeto mundo; reindexado de las colecciones pasadas como lista |
| `finalizeCompletedSeason` / `isCompetitionComplete` | 0,43 s | recorrido de todos los partidos |
| `processNarrativeMatch` | 0,34 s | recorrido de todos los partidos (rivalidades) |
| `recordEligibilityParticipation` | 0,33 s | todos los perfiles × todas las líneas del partido |
| validación del mundo | 0,51 s | **una** vez por día (ya desde ME-LOCK1.1) |

**Copias de mapas compartidos por día:** 3 por resultado (moral, fatiga, estímulo). Son 723 copias a 528 equipos y 1.383 a 1.008 equipos.

**Causa raíz:** cada resultado copiaba enteros tres mapas del tamaño del mundo, así que el coste del día crecía como resultados × tamaño del mundo.

## 2. Arquitectura

### Antes

Para cada resultado, en el orden del calendario: `completeResolvedMatch` → cadena canónica → copia entera de moral, fatiga y estímulo → mundo nuevo.

### Ahora

Todos los resultados del día se aplican en el orden del calendario dentro de **un lote** (`withDailyResultBatch`, en `src/domain/world/dailyResultBatch.ts`):

- Cada resultado sigue pasando por **la misma cadena canónica** (`completeResolvedMatch`), sobre el mundo que dejó el anterior: resultado, clasificación, moral, narrativa, estadística, fatiga y desarrollo, elegibilidad, fin de temporada y lesiones.
- No hay una cadena paralela para BACKGROUND: FAST y BACKGROUND entran igual.
- Solo cambia el almacenamiento. El primer escritor de moral, fatiga o estímulo en el lote copia el mapa; los resultados siguientes escriben en esa copia del lote (`writableResultRecord`).
- La copia conserva el orden de claves. Una clave existente se reescribe en su sitio y una nueva se añade al final, igual que en una copia fresca.

**Contexto efímero:**

- El lote es un conjunto de registros propios (`WeakSet`) que vive mientras dura `applyDayOutcomes`.
- No se guarda ni es estado de dominio.
- Al terminar, sus copias quedan selladas: ningún escritor posterior puede modificarlas, y la siguiente escritura vuelve a copiar.
- Un registro congelado nunca se reutiliza.

**Copias por día:** 3 en total (una por mapa), a cualquier tamaño de mundo.

**Otros cambios exactos en la misma ruta:**

| Cambio | Detalle |
|---|---|
| `getActiveInjuryForPlayer` | busca solo en las lesiones del jugador (índice `injuriesByPlayer` por colección, como los de WSR2), con la misma primera coincidencia |
| `recordEligibilityParticipation` | calcula las apariciones por jugador una vez por partido, en lugar de filtrar la hoja estadística para cada perfil |

## 3. Orden y dependencias entre resultados del mismo día

- El orden de aplicación es el de `prepared`, es decir, el orden del calendario. Nunca es el orden en que terminan las simulaciones: los resultados del *pool* se indexan por trabajo, no por llegada.
- **El lote no supone que los resultados sean independientes.** El resultado N+1 lee lo que dejó el N: clasificación, fatiga, moral, temporada completada y lesiones. Es exactamente lo que hacía la aplicación uno a uno.

| Dependencia | Cómo se preserva |
|---|---|
| mismo equipo dos veces el mismo día | `dayGamesAreIndependent` desvía ese día a la ruta secuencial (cada partido se prepara sobre el mundo anterior), sin lote, como antes |
| fin de temporada el mismo día | `finalizeCompletedSeason` se evalúa tras cada resultado: la temporada se completa una sola vez, tras su último resultado (prueba explícita) |
| lesiones | `applyPostMatchInjuries` por resultado, con el mismo orden y el mismo RNG |
| fatiga y estímulo | se componen secuencialmente sobre el valor acumulado (`clampCareerFatigue`, `addDevelopmentStimulus`), sin suma agregada |
| moral | `applyMoraleEvent` por persona y resultado, con sus topes y no linealidades |

## 4. Atomicidad

- El mundo de entrada **nunca se escribe**: solo se mutan registros creados por el propio lote.
- Si un resultado falla a mitad del día, la excepción sale de `applyDayOutcomes`. Las copias del lote se descartan junto con los mundos intermedios y el llamador conserva el mundo original.
- El día sigue siendo una transacción: `FAILED` con el mundo intacto.
- Pruebas:
  - fallo provocado en el último resultado: mundo idéntico, mismos objetos de moral, fatiga y estímulo;
  - después, el día se aplica con normalidad.
- La validación completa sigue siendo **una por día**, sobre el mundo final.

## 5. Sincronía y asincronía

- Las rutas síncrona y asíncrona usan el mismo `applyDayOutcomes`. Los *workers* solo resuelven partidos.
- Pruebas existentes que siguen pasando por el lote:
  - un *pool* que responde en orden inverso da el mismo mundo que la ejecución en línea (`matchResolution.test.ts`, `worldSim.test.ts`);
  - una simulación fallida deja el día en `FAILED` con el mundo intacto.

## 6. Equivalencia exacta con `5915331`

Mundo completo por dominio (*hash* del JSON canónico de cada clave de `GameWorld`), día a día:

| Corpus | Resultado |
|---|---|
| 48, 144, 288 y 528 equipos, 4 días, MINIMAL (usuario FAST + BACKGROUND) | **EXACTO** |
| 48, 144, 288 y 528 equipos, 4 días, STANDARD (16 FAST + BACKGROUND por día) | **EXACTO** |
| 528 equipos con carga de *scouting*, 6 días | **EXACTO** |
| 144 equipos, 30 días (fatiga, desarrollo, lesiones generadas por los partidos) | **EXACTO** |

`src/app/game/dailyResultBatch.test.ts` comprueba que, sobre el mundo prototipo, el lote da exactamente el mundo de aplicar los resultados uno a uno:

- día mixto FAST + BACKGROUND, con 3 copias por día frente a ≥ 3 por resultado;
- atomicidad;
- sellado;
- últimos partidos de temporada el mismo día;
- guardar → cargar → avanzar.

**FULL** (partido del usuario visto en directo) no pasa por el lote del día: entra por `completeMatchNext(result, 'FULL')`, la misma cadena canónica.

**Guardar y cargar:**

- Un día en lote no pierde ningún dominio que no perdiera ya el mundo recién creado.
- La partida se recarga con estadística, fatiga y estímulo idénticos y sigue avanzando de forma determinista.
- **Heredado y fuera de alcance:** el formato de guardado no reproduce exactamente algunos dominios derivados, ni siquiera en un mundo nuevo (`competitions`, `personalitiesByPersonId`, `moraleByPersonId`, `worldDbCompetitionRuntime`, `worldAnnualDevelopmentCycle`).

## 7. Rendimiento

### Aplicación de los resultados de un día

Partidos BACKGROUND; mejor de 3 (2 a 2.016 equipos):

| Equipos | Resultados | `5915331` | WSR2.1 | ms/resultado | Copias de mapas por día |
|---:|---:|---:|---:|---|---|
| 528 | 241 | 1.548 ms | **467 ms** | 6,42 → **1,94** | 723 → **3** |
| 1.008 | 461 | 6.557 ms | **1.652 ms** | 14,22 → **3,58** | 1.383 → **3** |
| 2.016 | 923 | 29.776 ms | **9.591 ms** | 32,26 → **10,39** | 2.769 → **3** |

### Día mixto

Configuración de WSR1 (`wsr1Perf.ts mixed <copias> 12 worker 6`): 16 partidos FAST en 6 *workers* y el resto BACKGROUND.

| Equipos | Partidos | `5915331` | WSR2.1 |
|---:|---:|---:|---:|
| 528 | 242 | 16,5 s | **14,7 s** |
| 1.008 | 462 | 22,8 s | **19,0 s** |
| 2.016 | 924 | 52,6 s | **32,6 s** |

Los 16 partidos exactos en 6 *workers* fijan un suelo de ~12–14 s, independiente del tamaño del mundo.

### Lectura

- Los tres mapas compartidos ya no se copian por resultado: **3 copias por día a cualquier escala**.
- Lo que queda por resultado sigue creciendo con el mundo (1,9 → 3,6 → 10,4 ms). Se debe a la **colección de partidos**:
  - `applyMatchResult` la reconstruye y reindexa;
  - la comprobación de fin de temporada y las rivalidades de la narrativa la recorren entera.

  Es el siguiente P1. Hacerlo incremental implica cambiar el modelo de colecciones de `updateGameWorld` y la invalidación de índices de colecciones mutadas, fuera del alcance de este hito.
- **Proyección a 2.000 equipos:** medida directamente. El día mixto baja de 52,6 s a 32,6 s; la aplicación, de 29,8 s a 9,6 s.

## 8. Restante

**P0:** ninguno.

**P1:**

1. **Colección de partidos por resultado.** Reconstrucción y reindexado de `games`, y recorridos completos de partidos en la comprobación de fin de temporada (`isCompetitionSeasonComplete`) y en las rivalidades (`processNarrativeMatch`). Es O(partidos) por resultado: 10,4 ms por resultado a 2.016 equipos. Un lote para `games` necesita índices por temporada que se mantengan dentro del lote.
2. **Copias por resultado de los mapas de entrenadores** (reputación y experiencia; O(entrenadores)) y de la lista de estadísticas (crece durante la temporada).
3. **Guardar y cargar:** las diferencias heredadas de ida y vuelta siguen documentadas y sin cambio.

## 8b. Medición opcional del fin de temporada: no completada

Se avanzó el mundo de 144 equipos (`wsr2Lifecycle.ts 3 330`, MINIMAL) día a día para medir el fin de temporada y la ola de vencimientos de contratos.

- **El avance se detuvo en el día 81** (diciembre de 2032) con `BREAKPOINT_PREVENTED`: un punto de decisión del usuario bloquea el día.
- El arnés no tiene política de decisiones. **No se llegó al fin de temporada ni a los vencimientos**: la medición queda pendiente y necesita un arnés que resuelva esas decisiones.
- En los 81 días medidos, el ciclo fuera de los partidos se mantuvo pequeño y estable, sin crecimiento con el tiempo:

| Días | Ciclo medio | Máximo |
|---|---:|---:|
| 1–19 | 40 ms | 101 ms |
| 20–39 | 58 ms | 272 ms |
| 40–59 | 53 ms | 116 ms |
| 60–80 | 78 ms | 442 ms |

## 9. Archivos

| Archivo | Cambio |
|---|---|
| `src/domain/world/dailyResultBatch.ts` | lote, registro escribible y contador de copias para diagnóstico |
| `src/app/game/matchResolution.ts` | `applyDayOutcomes` aplica el día dentro del lote |
| `src/engine/match/MatchResultApplication.ts` | moral escrita en el registro del lote |
| `src/app/matchNext/MatchNextDynamicConsequences.ts` | fatiga y estímulo en el registro del lote, tomados al primer cambio. Es la frontera de aplicación de WSR1, no el motor: `src/engine/match-next/` no cambia |
| `src/domain/world/availability.ts`, `collectionIndexes.ts` | lesiones por jugador |
| `src/engine/eligibility/EligibilityEngine.ts` | apariciones por jugador, una vez por partido |
| pruebas | `src/app/game/dailyResultBatch.test.ts`; índice de lesiones en `collectionIndexes.test.ts` |
| herramientas | `scripts/world-sim/wsr21Apply.ts`; `WSR2_DETAIL=STANDARD` en `wsr2Lifecycle.ts` |
