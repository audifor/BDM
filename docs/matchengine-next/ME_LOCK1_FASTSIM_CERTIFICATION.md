# ME-LOCK1 · Certificación de Match Next FAST

## 1. Qué es FAST

FAST es un **modo de ejecución** del único motor Match Next: `MatchNextEnginePort.simulate(setup, 'FAST')`. No es otro motor.

| Modo | Qué hace | Dónde se usa |
|---|---|---|
| FULL | construye un `MatchFrame` en cada tick, como los consume el visor Live | partido del usuario en vivo |
| FAST | no hace ningún trabajo de presentación: ni frames ni *snapshots* (`skipToEnd`) | todos los partidos sin visor (IA, avance de día, temporada) e Instant del usuario |

Los dos comparten todo lo demás:

- **Entrada** (`MatchSetup`): equipos, jugadores, fatiga de carrera, entrenador, plan y tácticas, disponibilidad, reglas de competición, plan de rotación y semilla, preparada por `prepareMatchOptions`.
- **Autoridades:** posesión, tácticas, decisiones, defensa, reglas, reloj, faltas, pérdidas, tiros, rebotes, cambios, fatiga y estadísticas.
- **Salida** (`MatchNextResult` → `completeMatchNext`): resultado, marcador, estadísticas de jugador y de equipo, minutos, faltas, consecuencias de fatiga y desarrollo, entrada a las estadísticas de temporada, `MatchStatLog` y lesiones post-partido.

### Por qué FAST no reduce el baloncesto

El perfil (`ME_LOCK1_PERFORMANCE_PROFILE.md`) mostró dos cosas:

- el 95 % del coste de Instant era juego vivo;
- el ~75 % de ese coste no era baloncesto, sino contabilidad de historiales que crecía con el partido.

Esa contabilidad se corrigió para **todos** los modos, con transformaciones de igualdad exacta que se comprobaron con *hash* del estado final completo en cada paso. Así, FAST es lo bastante rápido sin hacer menos baloncesto que FULL.

Las reducciones que el enunciado permite (frecuencia espacial, integración más gruesa) **no se usaron**: habrían cambiado partidos y exigido calibrar el baloncesto, que está congelado.

### Diagnósticos

El núcleo no construye trazas de depuración caras. El único trabajo que existe solo para observar es el frame de Live, y FAST no lo genera. Por eso no hizo falta introducir niveles `NONE`/`SUMMARY`/`FULL`.

## 2. Equivalencia FULL frente a FAST

**Exacta por construcción y verificada.** El frame es una proyección de solo lectura del estado: no consume aleatoriedad ni escribe en el estado.

| Prueba | Resultado |
|---|---|
| `matchResolution.test.ts` · «FULL (a frame every tick) and FAST produce the identical result» | igualdad JSON del resultado completo |
| Cohorte `scripts/next/melock1Cohort.ts`: 10 partidos completos, 4 emparejamientos distintos de la liga FIBA masculina, semillas 1–10 | **10/10 idénticos** (*hash* del resultado y del estado final) |
| Arnés BT7 (A): Live con frame en cada tick frente a Instant | 46/46, igual |

Detalle de la cohorte:

| Partido | Semilla | FULL = FAST | Marcador | Posesiones | Cambios |
|---|---:|:---:|---:|---:|---:|
| game-0001 | 1 | sí | 69-74 | 167 | 16 |
| game-0001 | 2 | sí | 91-68 | 161 | 26 |
| game-0001 | 3 | sí | 80-99 | 171 | 29 |
| game-0001 | 4 | sí | 93-89 | 162 | 17 |
| game-0002 | 5 | sí | 100-78 | 178 | 20 |
| game-0002 | 6 | sí | 82-73 | 167 | 12 |
| game-0003 | 7 | sí | 79-80 | 173 | 25 |
| game-0003 | 8 | sí | 71-93 | 169 | 28 |
| game-0004 | 9 | sí | 100-84 | 162 | 24 |
| game-0004 | 10 | sí | 86-81 | 169 | 20 |

### Tabla de deltas (sección 43 del enunciado)

| Medida | Delta FAST − FULL | Clasificación |
|---|---:|---|
| Ritmo, PPP, TOV, STL, AST, ORB, FTr, aro, 3PA, faltas, rotaciones, minutos | **0** (mismo partido) | **PASS** |
| Huellas tácticas (tempo, transición, P&R, juego sin balón, perfil de tiro, cobertura, identidad ofensiva) | **0** | **PASS** |
| Identidad de jugador (creadores, tiradores, reboteadores, defensores) | **0** | **PASS** |
| Rotación (titulares, banquillo, faltas, fatiga, no disponibles) | **0**: misma autoridad (`createCoachRotationPlan` + `decideRotationSubstitutions`) | **PASS** |
| Fatiga y consecuencias post-partido | **0**: mismo `completeMatchNext` | **PASS** |

**Tolerancias.** No hacen falta. Al ser el mismo partido, la tolerancia exigible es cero, y se cumple. Por la misma razón no hay sesgo sistemático posible entre los modos.

Las relaciones de baloncesto que FAST debe preservar son las de Match Next, auditadas en BT5–BT7:

- orden de fuerza de los equipos;
- huellas tácticas;
- identidad de jugador;
- formatos de competición.

Siguen siendo válidas sin recalibrar porque FAST **es** Match Next. Sus limitaciones (clase B en BT7: FTr ~0,13, aro ~24 %, creación secundaria escasa) también son las mismas, y no son propias de FAST.

### Mezcla de partidos FULL y FAST en una temporada

No crea dos universos estadísticos: el resultado de un partido no depende del modo. La prueba «mixes a user Live game (FULL path) with FAST world games into one competition state» lo comprueba en un día real:

- mismo contrato de `MatchStatLog`;
- misma clasificación;
- mismas claves de estadística.

## 3. Rendimiento

Windows 11, node 24.12.0, un solo proceso, máquina sin otra carga. Medidas observacionales con `scripts/next/melock1Bench.ts`, sobre el *bundle* de `melock1Build.mjs`.

| Ruta | Legado | Match Next FULL (frame por tick) | Match Next FAST |
|---|---:|---:|---:|
| Un partido (incluye `prepare` + `complete`) | 294 ms (simulación: 15 ms) | 32,0 s | 3,7 s (primero, con calentamiento) |
| 10 partidos | 2,9 s (245 ms por partido) | — | 29,4 s (2,89 s por partido) |
| 100 partidos | — | — | 278 s (media 2,78 s, mediana 2,75 s, máximo 3,71 s) |
| Día típico (prototipo, 4 partidos) | 1,05 s | — | 12,6 s |
| Día pesado (ACB, 9 partidos) | 6,5 s | — | 30,4 s |
| Temporada ACB (306 partidos, estimada a partir del día ACB) | ~3,7 min | — | ~17 min |

### Antes de ME-LOCK1 (mismo partido, solo)

| Ruta | Antes | Después |
|---|---:|---:|
| Instant | 22,6 s | 2,9–3,7 s |
| Live con frames | ~53 s | ~32 s |

### Memoria

| Medida | Valor |
|---|---|
| Memoria retenida tras 5, 10, 15 y 20 partidos FAST (con GC forzado) | plana, ~14 MB sobre la línea base (mundo y cachés acotadas); sin fugas, nada de presentación retenido |
| Resultado transitorio de un partido | 6,2 MB en JSON (estado final con ~12.000 eventos); se libera tras `complete` |
| Lo que persiste por partido | el `MatchStatLog`, ~12,8 KB |
| Pico de *heap* con 100 partidos | 222 MB, transitorio |

### Objetivo operativo

| Situación | Tiempo |
|---|---|
| Día normal del prototipo | ~13 s |
| Jornada ACB | ~30 s |
| Temporada ACB completa | ~17 min |

Es usable para avanzar día a día con indicador de progreso, pero está **lejos** del legado: ~11 veces más lento por partido. No es todavía práctico para simular temporadas enteras de forma interactiva.

**Veredicto de rendimiento: PARTIAL.** Siguiente palanca, sin cambiar el baloncesto: simular en paralelo, en *workers*, los partidos independientes de un día y aplicar los resultados en orden. Exige un avance de día asíncrono.

## 4. Determinismo, guardado y fallo

| Propiedad | Evidencia |
|---|---|
| Determinismo de FAST: misma entrada, semilla y modo, mismo resultado | prueba «FAST is deterministic»; *hashes* golden de 6 semillas, repetidos en cada optimización |
| Guardado y recarga tras un día FAST | prueba «simulates a whole day»: estado de los partidos, `MatchStatLog`, fatiga de carrera y clasificación idénticos tras el guardado V4; la reaplicación falla cerrada |
| Fallo sin aplicación parcial | prueba «a Game that cannot be prepared fails without touching the world» |

El fallo se propaga por el mismo contrato de resolución, sin aplicación parcial, porque `complete` es una función pura del mundo.

## 5. Veredictos

| Área | Veredicto |
|---|---|
| FAST BASKETBALL EQUIVALENCE | **PASS** (exacta) |
| TACTICAL EQUIVALENCE | **PASS** (exacta) |
| PLAYER / ROTATION EQUIVALENCE | **PASS** (exacta) |
| POST-MATCH CONSEQUENCES | **PASS** (mismo `completeMatchNext`) |
| FAST PERFORMANCE | **PARTIAL** (×7,9 frente a antes; ×11 más lento que el legado) |
