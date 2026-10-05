# WSR2 · Certificación de escala del mundo

**Rama:** `world-sim-wsr2-daily-lifecycle-scaling`, desde `e75bbcf`.

**Documentos relacionados:**

- perfil: `WSR2_DAILY_LIFECYCLE_PROFILE.md`;
- arquitectura: `WSR2_DAILY_LIFECYCLE_ARCHITECTURE.md`;
- cifras: `WSR2_DAILY_LIFECYCLE_PERFORMANCE.md`.

## 1. Equivalencia exacta del mundo con `e75bbcf`

**Criterio:** el mundo completo tras cada día debe ser idéntico, dominio a dominio, al de `e75bbcf`. Se compara el *hash* SHA-256 del JSON canónico con claves ordenadas de cada una de las claves de `GameWorld` (`wsr2Compare.mjs`). No hay tolerancias.

| Corpus | Días | Resultado |
|---|---:|---|
| 48 equipos | 4 | **EXACTO** |
| 144 equipos | 4 | **EXACTO** |
| 288 equipos | 4 | **EXACTO** |
| 528 equipos | 4 | **EXACTO** |
| 960 equipos (frente al paso anterior de WSR2, verificado exacto en los mundos menores; `e75bbcf` tarda horas a esa escala) | 4 | **EXACTO** |
| 48 equipos con carga de *scouting* | 6 | **EXACTO** |
| 528 equipos con carga de *scouting* (1.056 asignaciones, 748 informes) | 6 | **EXACTO** |
| 144 equipos, horizonte largo | 30 | **EXACTO** |

Los corpus cubren:

- días de partidos, días tranquilos y lunes;
- lesiones generadas por los partidos, hasta 224;
- autocuración, contratos y *scouting* bajo carga;
- todas las fases de staff.

Cada paso intermedio de WSR2 se verificó igual antes de seguir.

## 2. Otras equivalencias

| Comprobación | Resultado |
|---|---|
| guardar → cargar (V4 por JSON) → avanzar 3 días, con índices en frío | *hash* de cada día idéntico al de `e75bbcf` a 48, 144, 288 y 528 equipos |
| ida y vuelta de la partida guardada | 3 dominios no se conservan en el mundo de escala (`competitions`, `worldAnnualDevelopmentCycle`, `worldDbCompetitionRuntime`); **igual en `e75bbcf`**: es una propiedad previa del formato con este mundo sintético, no de WSR2 (P1 a investigar fuera de WSR2) |
| día asíncrono (pool de 6 *workers*) frente a día en línea, detalle STANDARD | idéntico, 3 días, a 144 y 528 equipos |
| World DB | `WorldDbDailyAdvance` avanza por el mismo `advanceGameDayWithResult` |
| índices frente a recorridos | `collectionIndexes.test.ts`: cada índice responde lo mismo que el recorrido que sustituye, antes y después de 8 días, y se renueva cuando cambia la colección |

## 3. Fallo y transacción del día

- Cada fase del calendario valida su mundo resultante al terminar (`withSingleWorldValidation`).
- Un mundo inválido sigue haciendo fallar la fase. El día devuelve `FAILED` con el mundo original: sin cambios parciales.
- Los estados intermedios dentro de una fase ya no se validan uno a uno. Ninguna otra fase los lee y nunca se guardan.
- Las pruebas de fallo existentes (`matchResolution.test.ts`, `SimulationBreakpoints.test.ts`) pasan.

## 4. Pruebas, tipos y compilación

- **Regresión focalizada** (320 archivos de pruebas: mundo, calendario, staff, mercado, elegibilidad, *scouting*, narrativa, juego, *stores*, partida guardada, temporada y UI de partido, *scouting* y staff): **970 pasan y 55 fallan**. Todas las fallidas están en el conjunto conocido de `4da33d1`/`e75bbcf`. **0 fallos nuevos.**
- `npm run typecheck`: limpio.
- `npm run build`: correcto (solo el aviso conocido de *chunks* grandes).
- **Determinismo:** ningún `Math.random` nuevo. El orden del RNG y de la iteración no cambia, como demuestra la §1.
- **Match Next:** `git diff e75bbcf -- src/engine/match-next src/app/matchNext` está vacío.

## 5. Objetivos del encargo

| Objetivo | Resultado |
|---|---|
| ciclo a 528 equipos < 5 s (fuerte) / < 10 s (aceptable) | **0,15–0,36 s** (antes, 16–51 s) |
| día mixto total ≤ 20–25 s | 528 equipos: **17,9 s** (antes, 71,2 s); 1.008 equipos: **23,3 s** |
| prueba de escala solo BACKGROUND | 1.008 equipos, 462 partidos: **13,6 s** |
| proyección a 1.000 equipos con factor empírico | medida directa a 1.008 equipos; factor del ciclo ×1,9–2,1 por ×1,91 equipos (lineal) |
| cadencias | sin cambios: ninguna fase se salta, espacia ni muestrea |
| calibración BACKGROUND | sin cambios (`bg-v1`) |

## 6. Veredictos

| Veredicto | Resultado | Base |
|---|---|---|
| TECHNICAL | **PASS** | equivalencia exacta; pruebas, tipos y compilación |
| DAILY EXECUTION ARCHITECTURE | **PASS** | índices efímeros por colección, validación por fase, trabajo de *scouting* por día; orden y cadencias intactos |
| STAFF HUMAN STATE SCALE | **PASS** | 22,4 s → 0,08–0,13 s a 528 equipos; lunes plano durante 30 días |
| STAFF CULTURE SCALE | **PASS** | 9,4–10,3 s → 0,08 s |
| SCOUTING SCALE | **PASS** | con 1.056 asignaciones: 85–332 s → 0,15–0,42 s por día; lineal hasta 960 equipos |
| MEDICAL SCALE | **PASS** | 5,9 s → 6–18 ms, con hasta 224 lesiones generadas por los partidos |
| SELF-HEALING SCALE | **PASS** | 4,4 s → 19–44 ms |
| CONTRACT SCALE | **PASS** | reconciliación diaria 2,6 s → 1–3 ms. La ola de vencimientos de fin de temporada no cae en la ventana de 30 días; usa el mismo índice por jugador |
| RESULT APPLICATION SCALE | **PARTIAL** | la preparación es constante (7 ms por partido). La aplicación crece con el mundo: 3,6 → 7,2 → 14,3 ms por partido de 240 a 1.008 equipos, porque cada partido copia los mapas de moral, fatiga y estímulo. Suficiente hasta ~1.000 equipos; los lotes por día quedan como P1 |
| DETERMINISM | **PASS** | mundos idénticos día a día; pool igual que en línea |
| SAVE/LOAD | **PASS** | continuación tras cargar idéntica a `e75bbcf`; los índices no se guardan. El hueco de ida y vuelta es previo y está documentado |
| LONG-HORIZON SAFETY | **PASS** | 30 días: sin crecimiento semanal; deriva lineal pequeña (104 → 148 ms) por historial acumulado |
| 500-TEAM SCALE | **PASS** | 528 equipos: ciclo < 0,4 s; día mixto 17,9 s |
| 1000-TEAM PROJECTION | **PASS** | medida directa a 1.008 equipos: ciclo ≤ 0,7 s; día mixto 23,3 s; solo BACKGROUND 13,6 s |
| MATCHENGINE LOCK PRESERVED | **PASS** | Match Next no se toca; bloqueo en `4da33d1` |
| **WORLD SIMULATION SCALE READY** | **YES** | ciclo diario y día de mundo dentro de objetivo a 500 y a 1.000 equipos, con equivalencia exacta |

## 7. P0 / P1 restantes

**P0:** ninguno.

**P1:**

1. **Lotes de aplicación de resultados.** La aplicación por partido es O(mundo): copia los mapas de moral, fatiga y estímulo, y la propia validación. Es lo que más crece por encima de 1.000 equipos: un día mixto a 2.000 equipos se extrapola a ~45 s. Los lotes por día deben demostrarse exactos o certificarse aparte.
2. **Ida y vuelta de la partida guardada en el mundo de escala.** `competitions`, `worldAnnualDevelopmentCycle` y `worldDbCompetitionRuntime` no se conservan; ocurre igual en `e75bbcf`. Hay que investigar si afecta a partidas reales o solo al mundo sintético.
3. **Ola de vencimientos de contratos y fin de temporada a escala.** No se midió en la ventana de 30 días.
4. **Historiales acumulados.** Validación por fase y avisos médicos crecen de forma lineal con el historial. Vigilar en temporadas completas.
5. **Los P1 de WSR1 siguen congelados:** calibración BACKGROUND.
