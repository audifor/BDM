# ME-LOCK1.2 · Certificación de igualdad y rendimiento

Rama `match-next-me-lock1-2-exact-execution`, desde `6492794`.

## 1. Entorno de medida

| | |
|---|---|
| Hardware | Intel i5-12400F (6 núcleos físicos, 12 hilos), Windows 11 |
| Runtime Node | node 24.12.0, *bundles* esbuild con `import.meta.env.DEV = false` (`scripts/next/melock1Build.mjs`), iguales para base y rama |
| Runtime navegador | Chrome headless sobre Vite *dev* (`dev-melock-bench.html`, pool real de Web Workers de `getWorldMatchRunner`), base y rama en la misma sesión |
| Pool | `worker_threads` con el protocolo de producción (`createWorkerPoolRunner`, `scripts/next/melock11Worker.ts`) |
| Regla | base y rama siempre en la misma sesión y con la misma herramienta; los A/B alternan procesos. La máquina se calentó durante la sesión (la base de 100 partidos dio 65 s al principio y 73–78 s después), así que se comparan pares, no cifras sueltas |

## 2. Corpus de certificación

`scripts/next/melock12Corpus.ts`: 25 partidos generados por el camino de producción (mundo → `port.prepare` → `port.simulate`).

| Grupo | Casos |
|---|---|
| Golden ME-LOCK1.1 | 5 semillas de prototipo; una (`p2-424242`) llega a la prórroga |
| Formatos reales, como datos de la competición | FIBA, NBA (×2), NCAA masculino, NCAA femenino, WNBA (×2) |
| Identidades tácticas, ritmo alto y bajo, coberturas | `fast`/`controlled` en los dos sentidos; `dropD`/`blitzD`; `switchD`/`helpHigh`; `press`/`helpLow`; `press`/`sag` |
| Problemas de faltas | límite personal 3; límite 2 con dos defensas de presión |
| Fatiga | quintetos iniciales con fatiga de carrera 75 |
| Diferencia de plantilla | visitante con valoraciones ×0,7 |
| Prórroga | `overtime-p3-107` (85-87 tras una prórroga) |
| Universo ACB | 3 partidos del primer día ACB, uno con formato NBA |

**Huella por caso:** *hash* (claves ordenadas) de:

- el *setup*;
- el resultado completo;
- los eventos;
- las estadísticas;
- el `finalState`.

La línea base está en `docs/matchengine-next/melock12/baseline-6492794.json` y se regenera desde código, sin *fixtures* guardados.

Comprobación:

```text
node scripts/next/melock1Build.mjs scripts/next/melock12Corpus.ts node_modules/.cache/melock12/corpus.mjs
node node_modules/.cache/melock12/corpus.mjs --jobs 6 --full cert --compare docs/matchengine-next/melock12/baseline-6492794.json
```

## 3. Igualdad exacta

| Guardián | Alcance | Resultado |
|---|---|---|
| Corpus | 25 partidos: *setup*, resultado, eventos, estadísticas y estado final | **25/25 idénticos a `6492794` tras cada paso** |
| Corpus con diagnóstico FULL | lo mismo, comprobando cada proyección incremental contra su definición | **25/25 idénticos, 0 violaciones** |
| FULL = FAST | 21 casos en la base (`baseline-6492794-full-fast-21cases.log`); 6 casos (`FULL_CERT`) en cada paso de la rama | idénticos |
| Mundo completo, juegos de duración real (`scripts/next/melock12WorldHash.ts`) | prototipo 3 días FIBA (12 partidos); ACB 2 días (18); prototipo 2 días NBA (8). 251 dominios del `GameWorld` cada uno: clasificaciones, estadísticas, fatiga, calendario, resultados, historiales… | **mundo y 251/251 dominios idénticos a `6492794`** |
| Día en paralelo frente a serie (Node y Chromium) | días de prototipo y ACB | idéntico |
| Pruebas | `execution.test.ts`; `matchResolution.test.ts` (día síncrono = asíncrono = pool con respuestas en orden inverso; fallo de *worker* sin aplicar nada) | verdes |

Bifurcaciones y recortes del registro de eventos en los 25 partidos: **0 y 0** (el motor nunca anexa desde un estado viejo). Si ocurrieran, el resultado sería el mismo: una bifurcación copia el prefijo propio del estado.

## 4. Rendimiento por paso

A/B de un solo proceso, 5 casos pesados del corpus (`melock12Ab.mjs`), mediana de 3 a 5 rondas alternas:

| Paso | Cambio | ×tiempo del paso | Acumulado |
|---|---|---:|---:|
| 1 | Resumen ofensivo arrastrado | 0,877 | 0,877 |
| 2 | Clave de intención, memo de roles, `jsonEqual` | 0,898 | 0,788 |
| 3 | Registro de eventos de la sesión | 0,928 | **0,731** |
| 4 | Cinemática escalar | 0,980 en serie; 1,51 frente a 1,54 partidos/s con 6 procesos | revertido |
| 5 | Índice de jugadores | 1,039 | revertido |

### Un partido, final (corpus de 25 partidos, un proceso, solo simulación FAST)

| | Base | Rama |
|---|---:|---:|
| Media por partido | 2.621 ms | **2.024 ms** |
| Rango | 2.173–3.519 ms | 1.676–2.997 ms |
| Razón | | ×0,77 (la base se grabó con la máquina más fría; el A/B emparejado da ×0,73) |

Ningún partido del corpus baja de 1,0 s (objetivo «fuerte») ni de 0,75 s (objetivo *stretch*). La mejora frente a ~2,3 s es real pero modesta. Archivo: `docs/matchengine-next/melock12/final.json`.

## 5. Varios partidos y días

### Pool de *workers* (Node, 8 *workers*, 100 partidos)

| Medida | Base | Rama |
|---|---:|---:|
| 100 partidos, máquina fría | 65,0 s | 44,1 s |
| 100 partidos, máquina caliente (dos pares) | 78,3 / 73,3 s | 50,8 / 50,1 s |
| Razón | | **×0,65–0,68** |

### Día completo (`advanceGameDayWithResult[Async]`, de extremo a extremo)

| Día | Base Node | Rama Node | Base Chromium | Rama Chromium |
|---|---:|---:|---:|---:|
| 4 partidos, en serie | 10,5–11,6 s | 8,2–8,3 s | 9,0–9,5 s | 7,3–8,1 s |
| 4 partidos, pool frío | 4,9 s | 4,1 s | 4,8–5,6 s | 4,0–5,4 s |
| **4 partidos, pool caliente** | 4,5 s | **3,3 s** | 3,2–3,7 s | **2,7–2,9 s** |
| 9 partidos (ACB), en serie | 23,1–23,5 s | 16,6–18,4 s | 16,2–16,7 s | 13,2–13,5 s |
| 9 partidos (ACB), pool frío | 11,0 s | 9,2 s | 7,1–7,4 s | 6,6–6,7 s |
| **9 partidos (ACB), pool caliente** | 9,2 s | **6,5 s** | 6,1–6,7 s | **5,0–5,6 s** |

En Chromium la ganancia de un día es menor (−15/−20 %) que en Node (−28 %). Un día de pocos partidos lo marca el partido más lento de cada *worker*, y el navegador va en modo *dev*.

## 6. Escalado por hilos (pool real, lote de 48 partidos)

| *Workers* | ms por partido (rama) | Partidos/s | Aceleración | Eficiencia | RSS del proceso | ms por partido (base) |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.991 | 0,50 | ×1,0 | 100 % | 813 MB | — |
| 2 | 1.014 | 0,99 | ×1,96 | 98 % | 1.116 MB | — |
| 4 | 668 | 1,50 | ×2,98 | 75 % | 1.571 MB | 956 |
| 6 | **562** | **1,78** | ×3,54 | 59 % | 2.094 MB | — |
| 8 (producción en esta máquina) | 580 | 1,72 | ×3,43 | 43 % | 2.493 MB | 802 |
| 11 | 724 | 1,38 | ×2,75 | 25 % | 3.023 MB | 888 |

Lote de 100 partidos (régimen estable, sin efecto de cola):

| *Workers* | Rama |
|---:|---:|
| 2 | 1.034 ms por partido |
| 4 | 576 ms |
| 6 | 526 ms |
| 8 | 441–508 ms |

- **Saturación:** en los 6 núcleos físicos. Más *workers* que núcleos físicos no aporta, y por encima de 8 empeora (el hilo principal deserializa los resultados de ~6 MB).
- **Memoria:** cada *worker* suma ~200 MB de RSS mientras simula. El RSS incluye los resultados del lote retenidos en el hilo principal (6,2 MB cada uno).
- El tamaño de pool de producción, `min(8, lógicos − 1)`, da aquí 8. Un pool igual a los núcleos físicos (6) rinde igual o mejor con ~400 MB menos, pero el navegador no expone el número de núcleos físicos: queda como recomendación, sin cambiar la política.

## 7. Memoria retenida (un proceso, `melock1Memory.ts`, `--expose-gc`)

| Tras | Base | Rama |
|---:|---:|---:|
| 20 partidos | 14,1 MB | 14,7 MB |
| 50 partidos | 14,5 MB | 15,0 MB |
| 100 partidos | 14,3 MB | 14,8 MB |

Plana: sin fuga. Los +0,5 MB son los memos por equipo (última entrada de cada equipo).

**Transitoria:**

| | Base | Rama |
|---|---:|---:|
| Asignación por partido | 6,9 GB | 5,0 GB |

## 8. Proyección a mundos grandes

Hecha con el **rendimiento medido del pool**, no con la latencia de un partido. Esta máquina rinde 1,9–2,3 partidos/s (441–526 ms por partido en régimen estable). Hay que sumar la preparación y la aplicación en el hilo principal: ~30 ms por partido, en serie.

| Partidos en un día | 6 núcleos (esta máquina) | 4 núcleos / 8 hilos (estimado) | 2 núcleos / 4 hilos (estimado) |
|---:|---:|---:|---:|
| 9 (ACB de hoy) | 5–6,5 s | ~8–10 s | ~13–16 s |
| 20 | ~10–12 s | ~17–20 s | ~30 s |
| 50 | **~24–28 s** | **~40–47 s** | ~70 s |
| 100 | **~47–56 s** | **~80–95 s** | ~2,3 min |
| 250 | **~2,0–2,3 min** | **~3,3–4 min** | ~5,8 min |

Cómo se estiman las columnas de 4 y 2 núcleos:

- se parte del pool de 4 y de 2 *workers* medido en esta máquina;
- se aplica un factor ×1,3, porque un núcleo típico de portátil es más lento y el sistema y la interfaz comparten esos núcleos.

Es una estimación, no una medida.

Para comparar, la base daba unos 65–78 s con 100 partidos, y unos 2,7–3,3 min con 250 en esta máquina.

## 9. Clasificación (§39 del enunciado)

| Carga | Juicio |
|---|---|
| ≤ ~20 partidos al día | aceptable en cualquier máquina razonable (≤ 10–20 s) |
| 50 | límite en sobremesa (~25 s), pobre en portátil (~40–47 s) |
| 100 | pobre (~50 s a ~1,5 min) |
| 250 | no aceptable (2–4 min por día) |

**CASO B, en el límite con C:**

- FAST exacto sirve para la competición del usuario y las competiciones activas, hasta ~20 partidos por avance de día;
- no sirve para un mundo de 50–250 partidos al día;
- BACKGROUND es necesario y debe diseñarse a continuación, antes de ampliar el mundo.

## 10. Pruebas

| Comprobación | Resultado |
|---|---|
| `src/engine/match-next/execution/execution.test.ts` (nuevo, 7 pruebas) | verde |
| Contenido de las pruebas nuevas | `jsonEqual` frente a `JSON.stringify` (4.000 pares); registro de eventos (en sitio, bifurcación, recorte, publicación, fuera de sesión); vistas de historial bajo 3.000 operaciones aleatorias con diagnóstico FULL; FULL = FAST con diagnóstico; un estado publicado no cambia al seguir la sesión |
| `src/app/matchNext` + `matchResolution.test.ts` (día asíncrono, respuestas en orden inverso, *worker* fallido sin aplicar nada) | 42/42 |

### Regresión enfocada

Mismo alcance que ME-LOCK1.1:

- `app/matchNext`, `engine/match-next`, `engine/tactics`, `engine/world`;
- `app/game` (ciclo de vida, avance de World DB, *save/load*);
- `stores`, `ui-ng/system`, `ui-ng/applications/match` y `staff`;
- `engine/season`, `save`, `app/staffHumanState`, StaffScreen.

| Ejecución | Resultado |
|---|---|
| Completa, carga alta | 771 en verde y 69 fallos |
| Los 24 ficheros con fallos, repetidos en la base `6492794` y en la rama a la vez, con los mismos *workers* | **base 232/57, rama 232/57, el mismo conjunto exacto de fallos** |

Ninguna regresión nueva. Los otros 12 eran *timeouts* por carga y pasan en las dos al repetir.

Los 57 fallos previos son los ya documentados en ME-LOCK1.1, más pruebas de duración y de entorno:

- `startNextSeason`;
- *save* V1, V3 y V4;
- `ContinueFlow`, `GameApplication`;
- World DB de 1.000 días y diez años;
- StaffScreen y StaffWorkspace;
- `MatchNextDebugApp`, etc.

| Comprobación final | Resultado |
|---|---|
| `npm run typecheck` | limpio |
| `npm run build` | correcto (solo el aviso previo de tamaño de *chunk*) |
| `Math.random(` en `src/` | 0 |

## 11. Veredictos

| Área | Veredicto | Motivo |
|---|---|---|
| TECHNICAL | **PASS** | typecheck y build limpios; pruebas nuevas en verde; ninguna regresión nueva frente a `6492794` |
| EXACT RESULT EQUIVALENCE | **PASS** | corpus 25/25; mundo completo 3/3 escenarios con 251/251 dominios |
| DETERMINISM | **PASS** | orden de RNG y de coma flotante intactos; mismo mundo con cualquier *runner* y orden de finalización |
| EXECUTION ARCHITECTURE | **PARTIAL** | registro de eventos de la sesión, vistas arrastradas, memos exactos y diagnóstico de dos niveles. No se construyó un núcleo mutable: medido, la copia del estado es ~0,6 % |
| SINGLE MATCH PERFORMANCE | **PARTIAL** | 2,62 → 2,02 s (×0,73–0,77); objetivos 1,0 s y 0,75 s no alcanzados |
| MULTI-MATCH PERFORMANCE | **PARTIAL** | 100 partidos: 65–78 s → 44–51 s; objetivo 20–30 s no alcanzado |
| DAY PERFORMANCE | **PARTIAL** | 4 partidos 2,7–3,3 s (objetivo < 2 s); 9 partidos 5,0–6,5 s (objetivo < 4 s) |
| LOWER-END HARDWARE SCALABILITY | **PARTIAL** | mundo actual bien en 4 núcleos (~8–10 s el día ACB); 50 o más partidos al día, no |
| 250-MATCH WORLD SCALABILITY | **FAIL** | 2,0–2,3 min en 6 núcleos; ~3,3–4 min en 4 núcleos |
| MEMORY | **PASS** | retenida plana (+0,5 MB de memos); transitoria 6,9 → 5,0 GB por partido; ~200 MB de RSS por *worker* |
| LEGACY QUARANTINE | **PASS** | guardián intacto, sin ningún uso del legado |
| BASKETBALL CORE LOCK | **YES** | |
| PRODUCTION MATCHENGINE LOCK | **YES, condicionado** a la frontera explícita | FAST = competición del usuario y activas, ~20 partidos por día. **NO** si el producto exige FAST para todo el mundo futuro |
| BACKGROUND MODE REQUIRED NOW | **YES** | siguiente hito de diseño (caso B, en el límite con C) |
