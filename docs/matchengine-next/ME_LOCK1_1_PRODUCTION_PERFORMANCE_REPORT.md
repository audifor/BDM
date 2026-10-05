# ME-LOCK1.1 · Cierre de rendimiento de producción — informe

Rama `match-next-me-lock1-1-production-performance`, desde `8c81154` (ME-LOCK1). No se ha hecho merge ni push.

## 0. Resumen

| Cambio | Antes | Ahora | Igualdad |
|---|---:|---:|---|
| Preparación (`prepare`, búsqueda del quinteto del entrenador sin asignaciones por quinteto) | 475 ms por partido ACB | 24 ms (×20) | exacta |
| Aplicación (`apply`, una sola validación completa del mundo por partido y por día en vez de una por cada actualización intermedia) | 242 ms por partido | 7 ms (×35) | exacta |
| Simulación de los partidos de un día | serie | paralelo, pool persistente de Web Workers en la app | resultados idénticos, aplicados en orden canónico |

Las tres son exactas:

- mismo resultado de cada partido;
- mismo mundo completo tras el día;
- mismo resultado de cualquier orden de finalización de los *workers*.

| Día | Antes, en serie | Ahora, en Chromium (pool caliente) |
|---|---:|---:|
| Típico (4 partidos) | 12,6 s | **3,8 s** |
| ACB (9 partidos) | 30,4 s | **6,7 s** |
| 100 partidos (Node, pool de 8) | 278 s | **66 s** |

**Lo que no se alcanzó:**

- Un partido aislado sigue en ~2,3 s (objetivo < 2 s).
- El rendimiento es de ~0,7 s por partido con 12 hilos, así que **un mundo futuro con 50–250 partidos al día tardaría de 35 s a ~3 minutos por día**. No es creíble como juego de gestión.

Las palancas exactas grandes ya están usadas, y el perfil que queda es plano y es baloncesto. **Production MatchEngine Lock: NO.**

Según el punto 22 del enunciado, me detengo e informo. Seguir requiere una decisión: arquitectura de ejecución del motor, o una política de fidelidad para competiciones lejanas (§8).

## 1. Perfil

En `ME_LOCK1_1_FAST_PROFILE.md`.

- **Simulación:** perfil plano. Ninguna función supera el 6,2 %. Sin O(N²) residual: el último recorrido de historial, `activeActions` en cada versión del array, se hizo incremental. GC al 3,6 %.
- **Fuera de la simulación:** dos costes dominaban un día ACB, la búsqueda combinatoria del quinteto del entrenador (P(16,5) = 524.160 quintetos) y la revalidación completa del mundo en cada actualización intermedia.

## 2. Optimizaciones

| # | Cambio | Comprobación de igualdad | Efecto |
|---|---|---|---|
| A1 | `appendAction`/`replaceActionAt`/`copyActions` derivan la vista de acciones activas de la anterior (mismo contenido y orden que `filter`) | 10 resultados golden idénticos | ~4 % (ruido) |
| A2 | `selectContextualLineup`: términos por jugador precalculados con la misma aritmética, DFS por índice sin asignaciones, sumas en el mismo orden de *slots*, top-3 por inserción y claves de desempate solo en empate | *hash* de los 26 *setups* (prototipo + ACB, 2 días) idéntico a `8c81154`; 10 resultados golden idénticos | `prepare` 475 → 24 ms por partido ACB |
| A3 | `withSingleWorldValidation` (`GameWorld`): dentro de una aplicación, los mundos intermedios no se validan; el resultado pasa una sola vez por la misma `validateWorld`, que solo comprueba y nunca transforma. Usada en `completeMatchNext` y en `applyDayResults` | *hash* del mundo completo tras 3 días de prototipo y 3 de ACB, idéntico a `8c81154` | `apply` 242 → 7 ms por partido |
| B1 | El día en tres fases: preparar todos los partidos desde el mundo del inicio del día (semillas en orden de calendario), simular y aplicar en orden de calendario | mundo completo idéntico a la resolución secuencial en 5 días reales (3 de prototipo, 2 de ACB) | — |
| B2 | `MatchSimulationRunner`: en línea, o pool persistente de *workers* (`createWorkerPoolRunner`); *worker* web `matchSimulation.worker.ts`; selección en `getWorldMatchRunner` | pruebas: mismo mundo con el *runner* en línea, con el pool y con un pool que responde **en orden inverso**; un fallo de *worker* deja el día `FAILED` sin tocar el mundo | día 4 → 3,8 s; ACB → 6,7 s (Chromium) |
| B3 | Frontera asíncrona mínima: el cuerpo de `advanceGameDayWithResult` es un generador que solo cede «simula estos partidos preparados». La versión síncrona simula en línea y la asíncrona usa el *runner*: es el mismo proceso. Añadidos `advanceGameDayAsync`, `advanceGameDayWithResultAsync`, `simulateRemainingGamesTodayAsync`, `continueGameAsync` y `tickSimulateUntilDateAsync`; acciones de store asíncronas con `simulationBusy` y descarte si el mundo cambió mientras tanto; la interfaz NG las usa | pruebas anteriores + nuevas | — |

La API síncrona se mantiene intacta para pruebas y bibliotecas.

## 3. Certificación de igualdad exacta (contra `8c81154`)

| Guardián | Alcance | Resultado |
|---|---|---|
| `scripts/next/melock11Golden.ts` | 10 resultados FAST completos, con estado final, en 4 emparejamientos | idénticos tras A1, A2, A3 y B |
| `scripts/next/melock11SetupHash.ts` | 26 *setups* preparados | idénticos |
| `scripts/next/melock11WorldHash.ts` | mundo completo tras 3 días (prototipo y ACB) | idéntico |
| `scripts/next/melock11DayEquivalence.ts` | resolución por fases frente a secuencial, 5 días reales completos | idéntica |
| `matchResolution.test.ts` | día síncrono = asíncrono en línea = pool con respuestas en orden inverso | iguales; el fallo de *worker* no aplica nada |
| Navegador (`dev-melock-bench.html`, Web Workers reales) | mundo en línea frente al del pool | idéntico (prototipo y ACB) |

## 4. Paralelismo: auditoría de dependencias y decisión

**¿Son independientes los partidos de un día hasta que se aplica su resultado?** Sí, cuando ningún equipo juega dos veces ese día. `dayGamesAreIndependent` lo comprueba; si falla, el día vuelve a la resolución estrictamente secuencial.

| Dependencia | Análisis |
|---|---|
| Equipos y jugadores | la preparación de un partido lee solo sus dos equipos (plantilla, disponibilidad, fatiga, entrenador) |
| Clasificación | la preparación no la lee; se actualiza en la aplicación, en orden |
| Lesiones y estado del jugador | los escribe la aplicación de cada partido, solo para sus jugadores |
| Calendario y competición | no cambian durante la resolución; `finalizeCompletedSeason` corre en la aplicación, en orden |
| Aleatoriedad | una semilla por partido, extraída en orden de calendario antes de simular; no hay RNG compartido |
| Finanzas y eventos | en la aplicación, en orden |
| Orden de las consecuencias | orden de calendario, estable |

Comprobado de forma empírica: el mundo completo es idéntico al secuencial en 5 días reales.

**Arquitectura:** día → partidos independientes → simulación concurrente → resultados por índice → aplicación en orden canónico. El orden en que se resuelven las promesas no afecta al mundo.

**Serialización** (`structuredClone`):

| Dato | Tamaño | Coste |
|---|---:|---:|
| *Setup* | ~25 KB | — |
| Resultado | 6,2 MB | 33–46 ms |

Al *worker* nunca se envía el `GameWorld`.

**Tamaño del pool:** `min(8, núcleos lógicos − 1)`. En esta máquina se satura con ~6 núcleos físicos: ACB 8,6 s con 6 *workers* y 8,2 s con 9–11.

## 5. Matriz de rendimiento

Windows 11, 12 hilos lógicos, node 24.12.0 y Chrome (motor de WebView2/Tauri). Medidas observacionales, sin aserciones de tiempo en CI.

| Escenario | ME-LOCK1 | ME-LOCK1.1 serie | ME-LOCK1.1 paralelo |
|---|---:|---:|---:|
| 1 partido FAST (`prepare` + `simulate` + `complete`) | 2,8–3,7 s | 2,3–3,2 s | — (un partido no se reparte) |
| 10 partidos | 29,4 s | 23,7 s | 9,7 s (pool de 8, dos tandas) |
| 100 partidos | 278 s | ~230 s (estimado: 2,3 s × 100) | **66 s** |
| Día de 4 partidos (de extremo a extremo, `advanceGameDayWithResult`) | 12,6 s | 10,2–11,3 s | **3,8 s** Chromium / 4,1 s Node |
| Día de 9 partidos (ACB) | 30,4 s | 21,7–26,3 s | **6,7 s** Chromium / 8,2–9,8 s Node |
| Memoria retenida | ~14 MB / 20 partidos | 14,1 / 14,4 / 14,3 MB tras 20 / 50 / 100 | — |

### Avance de día percibido

La medida en Chromium (`dev-melock-bench.html`) incluye:

- preparación;
- simulación en Web Workers;
- aplicación;
- calendario;
- reparación;
- medios;
- evaluación de *breakpoints*;

es decir, todo lo que hay entre la orden y un mundo listo. No incluye el pintado de React. El store solo sustituye el mundo y su coste es despreciable frente a los segundos de simulación.

| Pool | Prototipo | ACB |
|---|---:|---:|
| Primer uso (*workers* fríos) | 5,8 s | 7,2 s |
| Caliente | 3,8 s | 6,7 s |

### Pruebas de ciclo de vida

| Prueba | ME-LOCK1 | ME-LOCK1.1 |
|---|---:|---:|
| Pruebas de un día | 25–31 s | 19–25 s (usan el *runner* en línea) |
| Temporada ACB + 400 días | 687 s | 380 s |

## 6. Proyección a un mundo más grande

Rendimiento observado en esta máquina con pool: ~0,66–0,74 s por partido (lote de 100 y día ACB). En una máquina de 8 hilos, ~1,5 veces más lento.

| Partidos en un día | 12 hilos | 8 hilos |
|---:|---:|---:|
| 50 | ~35 s | ~50 s |
| 100 | ~70 s | ~100 s |
| 250 | ~3 min | ~4 min |

Un mundo con España, Europa, NBA, NCAA, femenino y formación tendrá días de 50–250 partidos: los sábados NCAA solos superan los 100. Con estas cifras, una temporada así costaría horas de simulación.

**No es creíble para el mundo futuro.** Para el mundo actual (≤ 9 partidos al día) sí es operativo.

## 7. Cuellos de botella restantes

1. **La simulación de un partido:** ~2,2 s de baloncesto vivo, con un perfil plano.
   - Tres pases de reconciliación por tick que hacen avanzar el estado.
   - Copias inmutables de un estado de ~49 campos por paso.
   - Defensa, acciones, transición, tácticas y movimiento, cada uno del 4 al 10 %.
2. **El techo de núcleos físicos del equipo del jugador.**
3. **Los frames de Live** (~32 s): fuera de alcance, lista MP2.

## 8. Decisión necesaria (punto 22 del enunciado)

Optimización exacta y paralelismo seguro no bastan para la escala futura. No he introducido ningún FastSim estadístico. Opciones:

| Opción | Qué es | Ganancia | Riesgo |
|---|---|---|---|
| **A. Hito de arquitectura de ejecución** (exacto) | Núcleo de simulación con estado mutable encapsulado por partido (sin copias inmutables por paso) y reconciliación incremental; criterio: igualdad bit a bit | Estimada ×2–5 por partido, sin cambiar el baloncesto | Toca el núcleo del motor: trabajo largo y delicado |
| **B. Política de fidelidad por relevancia** | Competiciones lejanas al jugador en un modo de menor fidelidad derivado del mismo motor (por ejemplo, menor frecuencia de pasos), con certificación estadística FULL frente a reducido | Grande | Rompe la identidad FAST = FULL; es una decisión de producto sobre qué partidos merecen el motor completo |
| **C. Aceptar la escala actual** | Lo actual cumple para el mundo de hoy; se revisa al ampliar el mundo | — | Deja el problema para más adelante |

**Recomendación:** A antes que B. Mantiene la identidad FAST = FULL, que es un activo de arquitectura. B solo si A no basta.

## 9. Pruebas

### Nuevas

**`matchResolution.test.ts`:**

- día síncrono = asíncrono (en línea) = pool con respuestas en orden inverso;
- un fallo de *worker* deja el día `FAILED` sin aplicar nada.

### Actualizadas

| Prueba | Cambio |
|---|---|
| `SystemBar` «advances the canonical calendar» | Continue es asíncrono: espera con `waitFor` |
| Guardián de producción | intacto: la resolución del día sigue en `matchResolution.ts`, sin ruta legada |

### Regresión enfocada

**Alcance:** `app/matchNext`, `engine/match-next`, `engine/tactics`, `engine/world`, `app/game`, `stores`, `ui-ng/system`, `ui-ng/applications/match`, `engine/season`, `save`, `app/staffHumanState`, StaffScreen y `ui-ng/applications/staff`.

**Resultado:** 813 en verde y 27 fallos. Los 27 son previos o explicados:

| Fallos | Explicación |
|---:|---|
| 8 | `startNextSeason` |
| 4 | World DB |
| 1 | `ContinueFlow` |
| 1 | draft NBA |
| 1 | `SeasonProgression` |
| 1 | `gameStore` simulate-until-date |
| 7 | `save`: fallan igual en `3408a4e` y en `8c81154` |
| 1 | `MatchNextDebugApp`: igual en las dos bases |
| 1 | SystemBar «holidaying»: previo |
| 1 | SystemBar «advances…»: corregido |
| 1 | `MatchWorkspace` «instant-result path»: inducido por carga con 8 *workers*; pasa 3/3 a concurrencia normal |

### Comprobaciones finales

Typecheck, build (emite el *chunk* del *worker*) y *diff check*: ver el commit.

## 10. Veredictos

| Área | Veredicto | Motivo |
|---|---|---|
| TECHNICAL | **PASS** | typecheck y build limpios; regresión enfocada sin fallos nuevos |
| SINGLE MATCH PERFORMANCE | **PARTIAL** | 2,3 s por partido (objetivo < 2 s) |
| MULTI-MATCH PERFORMANCE | **PASS** | 100 partidos: 278 → 66 s |
| DAY SIMULATION | **PASS** | 4 partidos 3,8 s; 9 partidos 6,7 s (objetivos < 5 s y < 10 s) |
| FUTURE WORLD SCALABILITY | **FAIL** | 50–250 partidos al día: de 35 s a 3–4 min |
| DETERMINISM | **PASS** | mismo mundo con cualquier *runner* y orden |
| MATCH RESULT IDENTITY | **PASS** | golden, *setups* y mundo completo idénticos a `8c81154` |
| MEMORY | **PASS** | plana a 20/50/100 partidos |
| LEGACY QUARANTINE | **PASS** | guardián intacto; sin vuelta atrás al legado |
| BASKETBALL CORE LOCK | **YES** | |
| PRODUCTION MATCHENGINE LOCK | **NO** | escala futura; pendiente de la decisión de §8 |
