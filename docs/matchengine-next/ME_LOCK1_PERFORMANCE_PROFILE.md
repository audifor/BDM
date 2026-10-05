# ME-LOCK1 · Perfil de rendimiento de Match Next

Rama `match-next-me-lock1-fast-simulation`, desde `3408a4e` (BT7). Todo lo de este documento es medido; nada se ha optimizado todavía.

## 1. Método

### Fixture

| | |
|---|---|
| Mundo | `createNewGame()` |
| Partido | el primer partido del usuario (`getNextUserGame`), por el puerto de producción `MatchEnginePort` |
| Semilla | 3498342002 |
| Formato | FIBA 4 × 10 |
| Resultado | 75-99, 159 posesiones, 26.466 ticks de 0,1 s, 12.563 eventos, 1.359 acciones |

### Entorno

- Windows 11, node 24.12.0, sin otra carga.
- Las medidas en ms son observacionales; varían ±10 % entre ejecuciones.

### Herramientas

Están en `scripts/next/` y solo leen el motor: no cambian el código del motor ni el resultado. Mismo marcador y mismas posesiones con y sin instrumentación.

| Herramienta | Qué hace |
|---|---|
| `melock1Build.mjs` | empaqueta un runner con esbuild y *source map* para ejecutarlo con node sin vitest; el resultado es idéntico al de vitest (75-99) |
| `melock1Run.ts` | Instant por el puerto: `prepare` → `runInstant` → `complete`, con tiempos por fase |
| `melock1Growth.ts` | coste del núcleo por cada 1.000 ticks frente al tamaño de los historiales, y coste de un `MatchFrame` a ese tamaño |
| `node --cpu-prof` + `melock1MapProfile.mjs` | perfil de muestreo de V8 (250 µs) traducido con el *source map* a fichero y línea TypeScript |
| `melock1Profile.mjs` | el mismo perfil, con tiempo inclusivo por etapa |
| Contadores | contadores de llamadas insertados solo en una copia del *bundle* (`sed` sobre el `.mjs`), nunca en el código fuente |
| `src/presentation/match-next/audit/melock1/profile.test.ts` | lo mismo dentro de vitest, con `node:inspector`, para comprobar que el entorno de pruebas da las mismas cifras |

## 2. Tiempos de un partido

| Fase | Tiempo |
|---|---:|
| Crear el mundo (`createNewGame`, una vez) | 444–579 ms |
| `prepare` (convocatorias, plan del entrenador, perfiles) | 257–315 ms |
| **Simulación Instant** (`skipToEnd`, sin frames) | **21,2–23,8 s** |
| `complete` (resultado, `MatchStatLog`, fatiga, elegibilidad, lesiones) | 46–48 ms |
| **Live** (un `MatchFrame` por tick) | **≈ 53 s** |

La cifra de «~1 minuto» de BT7 corresponde a Live con frame en cada tick, o a Instant con 8 procesos en paralelo.

**Por posesión** (159 posesiones):

- Instant: 21,2 s / 159 ≈ **133 ms**.
- Live: ≈ **333 ms**.

**Por tick:**

- media: 0,80 ms;
- al principio del partido: 0,20 ms;
- al final: 1,54 ms.

## 3. La pregunta clave: ¿cuánto queda si quitamos lo que solo sirve para observar?

```text
LIVE (frame por tick)          ≈ 53 s
  ├─ frames / presentación     ≈ 32 s   (26.466 MatchFrame; cada uno copia todo el historial)
  └─ núcleo de simulación      ≈ 21 s

INSTANT (sin frames)           ≈ 21 s
  ├─ núcleo que crece con los historiales   ≈ 15–16 s
  ├─ núcleo constante                       ≈  5–6 s   (≈ 0,20 ms por tick)
  ├─ post-partido (complete)                ≈  0,05 s
  └─ preparación (prepare)                  ≈  0,26 s
```

### Frames

`toFrame` cuesta 0,10 ms con 374 eventos y 2,66 ms con 12.563. Crece de forma lineal con el historial porque el frame copia `events`, `actions` y `possessions` completos.

Live genera uno por tick: Σ ≈ 26.466 × 1,2 ms ≈ **32 s**. **Instant no genera ningún frame**, así que quitar la presentación no acelera Instant: ya no la tiene.

### Núcleo: coste por cada 1.000 ticks frente al tamaño de los historiales

| t (ticks) | ms / 1.000 ticks | eventos | acciones | posesiones | ms por frame |
|---:|---:|---:|---:|---:|---:|
| 1.000 | 204 | 374 | 33 | 4 | 0,10 |
| 5.000 | 403 | 2.259 | 230 | 31 | 0,44 |
| 10.000 | 483 | 4.533 | 471 | 61 | 0,94 |
| 15.000 | 845 | 6.851 | 717 | 93 | 1,32 |
| 20.000 | 904 | 9.330 | 1.007 | 121 | 1,50 |
| 26.000 | 1.677 | 12.304 | 1.333 | 156 | 2,28 |

Cada tick hace el mismo trabajo de baloncesto (10 jugadores, un balón), pero al final del partido cuesta **7,5 veces** más que al principio. El coste sigue al tamaño de los historiales, no al baloncesto:

- 1.er cuarto: 4,2 s;
- 4.º cuarto: 24 s en Live;
- por cada 1.000 ticks: de 636 a 3.541 ms.

Con el coste del principio del partido mantenido todo el partido (0,20 ms por tick), Instant tardaría **~5–6 s**.

## 4. Segundo nivel: dentro del núcleo

### Tiempo inclusivo por etapa (Instant, perfil de V8)

| Etapa | Inclusivo | Nota |
|---|---:|---|
| `stepState` (controlador) | 95 % | todo el partido |
| `tickCore` | 88 % | |
| **`reconcileStructures`** | **75 %** | 79.594 llamadas: **3,0 por tick** |
| `reconcileActions` | 34 % | 3,0 por tick |
| `reconcileOffenseFlow` | 6,1 % | 159.188 llamadas: 6,0 por tick |
| `reconcileTransition` / `reconcileReboundTransition` | 27 % / 23 % | 148.698 llamadas: 5,6 por tick |
| `installTransitionRoles` | 11 % | |
| `advancePlayerMovement` | 53 % | casi todo por sus llamadas a `reconcileStructures` |
| `reconcileManDefense` | 4,4 % | |
| `tacticalIntent` | 3,7 % | 688.215 llamadas: **26 por tick** |
| `reconcileOffBallMovement` | 3,3 % | |
| `activePossession` | 1,8 % | 1.076.103 llamadas: **41 por tick**, cada una un `possessions.find` |
| decisiones (`readDecision`, `readTheFloor`) | 1,6 % / 1,1 % | |
| `integrateMatchPlayers` + `stepPlayerKinematics` (movimiento) | 1,2 % / 0,7 % | |
| `lineupRoles` | 1,0 % | |
| `emitEvent` | 0,6 % | |
| `evaluateShotOpportunity` | 0,2 % | |
| rotación, fatiga y tiempo en pista | < 0,2 % | |
| `distanceBetween` (geometría) | 0,3 % de tiempo propio | |
| recolector de basura | 1,3 % | |
| validación (`validateWorld`) | 0,7 % | solo en `prepare` y `complete` |

### Por qué crece: recorridos lineales de historiales en cada tick

Las líneas más calientes, traducidas con el *source map*:

| Línea | Qué hace | Tiempo propio |
|---|---|---:|
| `ReboundTransition.ts:247/324/340/364` | `installTransitionRoles` y `updateRoleTargets` buscan, **por cada rol de transición y en cada llamada**, `actions.find(… DRIVE && ACTIVE)` sobre **todas** las acciones del partido (1.359 al final, 0 activas) | ~4,4 s |
| `ReboundTransition.ts:250` | `actions.some(… ACTIVE …)` sobre todo el historial | |
| `kernel.ts:89` | `events.some(e => e.t === now && e.type === 'reboundSecured')`: **todos** los eventos del partido, en cada tick, para encontrar los de este tick | ~0,5 s |
| `MatchNextLiveController.ts:125` | lo mismo con `ballDead`, en cada paso | ~0,4 s |
| `ActionCore.ts:72` | `events.some(e => e.t >= action.startedT …)` | |
| `state.ts:452` (`activePossession`) | `possessions.find` 41 veces por tick | 0,66 s |
| `ActionCore.ts:576` (`patchAction`) | `actions.map(...)`: copia el historial entero de acciones para cambiar una | |
| `ActionCore.ts:108/558` | `[...state.actions, action]` y `[...events, e]`: anexar copiando el array (cuadrático en el tamaño) | |

En total hay 31 recorridos `actions.find/filter/some` en el motor. Casi todos solo quieren las acciones **activas**, pero recorren también las ya resueltas.

### Trabajo repetido por tick que podría hacerse una vez

| Trabajo | Veces por tick | Cuándo cambia su entrada |
|---|---:|---|
| `reconcileStructures` | 3,0 | tras mover jugadores y tras cambiar de fase |
| `reconcileOffenseFlow` | 6,0 | dentro de cada `reconcileActions` |
| `reconcileTransition` | 5,6 | |
| `tacticalIntent(state, team)` | 26 | quinteto, marcador, adaptación del entrenador, fatiga |
| `activePossession` | 41 | al cambiar `activePossessionId` |

### Lo que **no** es el problema

- **Geometría y distancias:** 0,3 %.
- **Movimiento:** cinemática e integración, 1,9 %.
- **Decisiones del jugador:** 2,7 %.
- **Tácticas:** 3,7 %, aunque se recalculan 26 veces por tick.
- **Rotación, fatiga, reloj y eventos:** < 1 %.
- **Post-partido:** 0,05 s.
- **Validación:** solo en `prepare` y `complete`.
- **Diagnósticos:** el núcleo no construye trazas de depuración caras. Lo caro para observar es solo el frame de Live.

## 5. Primeros candidatos de optimización

Ordenados por ganancia esperada. Ninguno cambia una decisión de baloncesto: todos dan el mismo estado final con la misma semilla, y eso se puede probar con igualdad exacta.

1. **Acciones activas aparte del historial.** Las búsquedas por acción activa (31 recorridos, ~4–5 s) dejan de recorrer las 1.359 resueltas. El historial completo se conserva para estadísticas y frames.
2. **Eventos del tick actual.** Las preguntas «¿ha pasado X en este tick?» (`kernel.ts:89`, controlador:125, `ActionCore.ts:72`) miran solo la cola de eventos con `t` actual, no los 12.563.
3. **Índice de la posesión activa.** `activePossession` en O(1): las posesiones se anexan, así que la activa es la última.
4. **Anexar sin copiar historiales.** `events` y `actions` crecen sin copiar el array en cada `emitEvent` o `startAction`, con un registro solo de anexado y la misma vista de solo lectura.
5. **Frames solo cuando alguien los consume.** Live los necesita a la cadencia de la presentación, no en cada tick. FAST no los genera. Un frame no debería copiar todo el historial: eso es la lista MP2 de BT7.
6. **Cachear `tacticalIntent`** por equipo dentro del tick (26 → 2 por tick), invalidando con quinteto, marcador, adaptación y fatiga.
7. **Reducir las llamadas a `reconcileStructures`** (3 por tick) solo si se demuestra la misma salida. Toca la lógica de fases, así que va en último lugar y con igualdad exacta como requisito.

### Estimación

| Medida | Instant estimado | Base de la estimación |
|---|---:|---|
| 1–4 | ~5–7 s | coste constante medido al principio del partido: 0,20 ms por tick × 26.466 |
| + 6 | ~4–5 s | |

Estas cifras son una estimación a confirmar con medición tras cada cambio, no una promesa.

## 6. Consecuencias para FAST

- El modo FAST **no necesita simplificar el baloncesto** para ser viable.
- La mayor parte del coste de Instant (~75 %) es contabilidad de historiales que crece con el partido, no simulación. Corregirla beneficia por igual a FULL, Live y FAST, con resultados idénticos.
- La presentación (~32 s) solo existe en Live; FAST simplemente no la produce.
- Solo cuando el coste constante (~0,2 ms por tick) sea el límite tendrá sentido estudiar reducciones de ejecución propias de FAST, como una integración espacial menos frecuente. Exigirían la certificación estadística FULL frente a FAST.

## 7. Resultado de las optimizaciones (igualdad exacta)

Cada paso se verificó con el *hash* del estado final completo y del resultado en 6 semillas: 3498342002, 7, 11, 424242, 13 y 99, con `scripts/next/melock1Golden.ts`. Los 6 partidos son idénticos en todos los pasos. Tiempos con 2 procesos en paralelo, suma de los 6 partidos.

| Paso | Qué | Total de 6 partidos | Factor |
|---|---|---:|---:|
| Base (`3408a4e`) | — | 171,7 s | ×1 |
| 1 | `activeActions` (las acciones activas una vez por versión del historial), `actionById` y `findLastAction` sin copiar | 66,4 s | ×2,6 |
| 2 | eventos del tick actual por la cola (`someEventSince`, `countEventsSince`, `findLastEvent`) y `activePossession` desde el final | 38,5 s | ×4,5 |
| 3 | resumen ofensivo del equipo por versión del historial (`teamOffensiveActions`); *closeout* buscado hasta su pase; parche de una acción por índice (`replaceAt`) | 24,9 s | ×6,9 |
| 4 | `tacticalIntent`: reutiliza la última intención mientras sus entradas sean los mismos objetos | 21,7 s | ×7,9 |

### Instant solo, un partido

- Antes: 22,6 s.
- Después: 2,9–3,7 s.

El núcleo ya no crece con el partido: 179 ms por 1.000 ticks al principio y 238 ms al final, frente a 204 → 1.540 antes.

### Lo que queda (perfil plano)

| Componente | Peso |
|---|---:|
| `reconcileStructures` (3 llamadas por tick que hacen avanzar acciones; quitar una cambiaría el baloncesto) | 68 % inclusivo |
| `ManDefense` | 11 % |
| `ActionCore` | 10 % |
| `ReboundTransition` | 9 % |
| cinemática | 5,5 % |
| `OffensiveStructure` | 5,4 % |

El 95 % es juego vivo, a ~0,11–0,16 ms por tick. El balón muerto cuesta ~21 µs por tick: no hay tiempo muerto que saltar.

### Live

Los frames siguen copiando todo el historial: ~32 s de los ~35 s de un Live. Hacerlos incrementales es la tarea 4 de la lista MP2.
