# BT5 · Identidad táctica: equipo, entrenador y plan

Base `8d14f81` (BT4.5), rama `match-next-basketball-core-bt5-tactical-identity`. Sin push, PR ni merge. Auditoría previa: `BT5_TACTICAL_BASELINE.md`.

**Veredictos (por separado):**

| categoría | estado |
|---|---|
| TECHNICAL | **PASS** |
| TACTICAL IDENTITY | **PARTIAL** |
| BASKETBALL TRUTH | **PARTIAL** |
| VISUAL RECOGNIZABILITY | **PARTIAL** |

Se puede distinguir a un entrenador de otro, a una plantilla de otra y a un plan de otro por lo que hacen sus jugadores, y la táctica sale de decisiones. Pero:

- la presión defensiva tiene un efecto invertido;
- la agresividad de la ayuda apenas cambia nada;
- la familiaridad no tiene efecto medible;
- las pérdidas (31,1 por partido) y el ritmo (185 posesiones) quedan en el borde de lo que el brief admite;
- visualmente solo el ritmo se reconoce sin ayudas.

## Método y evidencia

- **Huella por equipo**: `src/presentation/match-next/audit/bt5/fingerprint.ts`. Se calcula sobre los eventos canónicos, en modo de solo lectura.
- **Matriz de experimentos**:
  - configuraciones en `src/presentation/match-next/audit/bt5/configs.ts`;
  - test `experiments.test.ts`, 31 configuraciones con 6 semillas cada una (`31337, 424242, 7, 1, 99, 2024`), partidos completos de 40 min;
  - resultados en `docs/match-next-bt5/audit/exp-v7-*.json`, tablas en `summary-v7.md` (las genera `scripts/next/bt5Summary.mjs v7`).
- **Experimento de contexto**: `context.test.ts`, que produce `context-v7.json` (10 finales de 4 minutos por situación de marcador).
- **Regresiones a 12 semillas** (`31337, 424242, 7, 1, 99, 2024, 11, 12, 3, 5, 21, 42`), en `docs/match-next-bt5/audit/regression/`:
  - ledger de pase BT4.5: `pass-bt5final-*.json`;
  - ledger de posesiones BT4.4: `ledger-bt5final-*.json`;
  - flujo e identidad BT4.2: `flow-bt5final12.json`.
- **Línea base con los mandos antiguos**: `exp-base-*.json`. **Ablaciones de desarrollo**: `exp-abl2-*.json`, `ledger-coachA-d1/d3.json`.
- **Visual**: `scripts/next/styleFrames.mjs`, más el log canónico de la misma ventana (`visualWindow.test.ts`). Capturas en `C:\Users\jorge\Videos\bdm-bt5-styles` (fuera del repo).

Salvo que se diga otra cosa, las cifras de identidad son la huella del equipo **local** (`generated-team-0001`) contra el mismo rival (`generated-team-0008`), y solo cambia lo que dice la configuración. La **distancia de identidad** es la media de las diferencias absolutas en 14 dimensiones de estilo, cada una dividida por una escala típica (`STYLE_SCALES`). 0 significa el mismo estilo; ≈0,4 es lo que separa dos configuraciones casi iguales (ruido entre semillas); a partir de 1 los estilos son claramente distintos.

---

## 1. Arquitectura previa

Ver `BT5_TACTICAL_BASELINE.md`. Resumen:

- El plan tenía ritmo, perfil de tiro, interior/perímetro, cobertura y jugador destacado.
- El perfil de tiro **multiplicaba el valor de los tiros de cada zona**: imponía la cuota de tiro.
- El ritmo apenas cambiaba nada (0,7 s por posesión).
- Todo lo demás era igual para todos los equipos:
  - formación 5-out única;
  - tres familias de jugada por hash;
  - iniciador = quien tuviera el balón;
  - 2 jugadores al rebote ofensivo;
  - una sola regla de ayuda;
  - una cobertura para todo el partido;
  - sin contexto ni adaptación.
- El entrenador y la cohesión del equipo existían en el mundo, pero no llegaban al motor.

## 2. Arquitectura nueva

Una capa nueva, pura y determinista, sin Phaser, en `src/engine/match-next/tactics/`:

| módulo | qué hace |
|---|---|
| `TacticalIdentity.ts` | identidad (7 dimensiones de ataque, 4 de defensa), las tres autoridades + contexto → `tacticalIntent()`; `explainTacticalIntent()`; `defensiveShape()` |
| `OffensiveRoles.ts` | roles dinámicos de los cinco en pista |
| `PlayCalling.ts` | familias, ubicación, spacing, iniciador, receptor del saque, tempo del saque tras canasta |
| `Coverage.ts` | cobertura de cada bloqueo, profundidad del drop, retraso de comunicación |
| `MatchMemory.ts` | memoria del partido y ajuste en partido |

`TacticalIntent` **no se guarda en el estado**. Se deriva cada vez de sus entradas (plan, quinteto, marcador, reloj al final del partido, cansancio cuando importa, ajuste vigente) y se memoiza exactamente sobre esas entradas.

Lo único nuevo en el estado (todo JSON-safe y opcional, sin cambio de versión):

- `offenseFlow.call`: la jugada pedida en la posesión;
- `tactics`: la memoria del banquillo;
- en `ScreenState`: el motivo de la cobertura, la profundidad del drop, el retraso de comunicación y la ubicación del bloqueo.

Eventos nuevos:

- `playCalled`: familia, ubicación, spacing, iniciador, compañero y motivo con los pesos;
- `tacticalAdjustment`: el motivo del ajuste.

`screenSet` lleva ahora la cobertura y su motivo.

## 3. Modelo del entrenador

La identidad tiene pocas dimensiones; los pares redundantes del brief se fundieron en un solo eje.

**Ataque:**

| dimensión | rango | qué recoge |
|---|---|---|
| `tempo` | −1..1 | ritmo + apetito de transición + ataque temprano + iniciación rápida |
| `ballMovement` | −1..1 | movimiento de balón + paciencia; el negativo es presión de penetración |
| `ballScreen` | 0..1 | uso del bloqueo directo |
| `offBall` | 0..1 | movimiento sin balón |
| `interior` | −1..1 | interior frente a perímetro |
| `isolation` | 0..1 | aislamiento / caza de desajustes |
| `crash` | 0..1 | rebote ofensivo frente a balance |

**Defensa:**

| dimensión | rango | qué recoge |
|---|---|---|
| `pressure` | 0..1 | presión en el balón + en las líneas de pase |
| `help` | 0..1 | agresividad de la ayuda + prioridad del aro |
| `coverage` | drop/switch/hedge/blitz | cobertura del bloqueo |
| `dropDepth` | 0..1 | profundidad del drop |

Además, `adaptability` y `tacticalKnowledge` (0–100) del entrenador.

Un plan antiguo se lee como la identidad que describe:

- tempo = ritmo / 2;
- interior = (aro + media/2 − triple) / 4;
- presión = 0,5 + 0,2·perímetro;
- ayuda = 0,5 + 0,2·interior;
- cobertura = la del plan.

Así toda partida guardada conserva un entrenador coherente. `prepareMatchSetup` añade la **adaptabilidad y el conocimiento táctico del entrenador principal** (atributos de staff) y la **familiaridad** (cohesión del equipo, `teamCohesionByTeamId`).

## 4. Influencia de la plantilla

`rosterAffordance` mide lo que permiten los cinco en pista:

- el creador principal y el segundo creador;
- la amenaza del roller y la del popper;
- tiro, pase, poste, corte, aislamiento y rebote;
- velocidad;
- defensa del balón, protección del aro, capacidad de cambiar y manos.

A partir de eso, `rosterNaturalIdentity` da el estilo que sugieren los jugadores. La plantilla actúa de tres formas:

1. **Arrastrando la intención.** Intención = deseo + doblez·(natural − deseo). La doblez es 0,12 en un entrenador rígido y 0,50 en uno adaptable.
2. **Ponderando las familias por su viabilidad.** P&R sin manejador, poste sin hombre interior, movimiento sin tirador.
3. **A través de la ejecución.** La intención solo elige qué se busca; cada lectura sigue valorada por el modelo de tiro y de pase con los ratings reales.

## 5. Plan de partido

`matchPlan` suma desplazamientos a la identidad del entrenador para un partido concreto (por ejemplo, "jugar dentro", "abrir la pista", "correr"). El contexto se suma después (sección 14).

## 6. Roles

`lineupRoles` decide los roles a partir de ratings, cansancio, jugador destacado y la identidad. Los roles son:

- creador principal / secundario;
- spacer, tirador en movimiento, cortador;
- bloqueador, roller, popper;
- objetivo interior;
- reboteadores ofensivos (1–3 según `crash`).

No son posiciones: un jugador acumula varios (en el test, el pívot es `INTERIOR_TARGET + ROLLER + OFFENSIVE_REBOUNDER`) y cambian con cada sustitución.

## 7. Familias de jugada

Familias: `BALL_SCREEN`, `DRIVE_KICK`, `CIRCULATION`, `MOVEMENT` (pin-down), `POST` (entrada al poste), `ISOLATION` y `EARLY_OFFENSE`. Esta última no se pide: se registra cuando una posesión ataca antes de llegar a media pista.

- La jugada se pide al empezar la media pista y otra vez tras un rebote ofensivo.
- Peso de cada familia = preferencia de la intención × viabilidad de la plantilla, elevado a 1,5 (el sistema del entrenador manda), con ruido determinista por posesión.

Cómo actúa la jugada:

- **Prioridad del pase hacia el hombre de la jugada**, solo si el pase es completable (≥0,8): el manejador del bloqueo o del aislamiento, el poste, o el tirador que sale del pin-down.
- **Bonus del bloqueo** solo para el iniciador.
- **Aislamiento:** penetración preferida y bloqueo suprimido.
- **Poste:** movimiento de poste desde 2,3 m.
- **Movimiento:** el pin-down. El bloqueador se pone en la trayectoria del defensor del tirador, el tirador espera y sale, y el defensor tiene que rodear al bloqueador.

## 8. Ubicación y spacing

**Ubicación (BT5.7):**

- El iniciador lleva el balón al punto donde empieza la jugada: arriba (HIGH / TOP) o al ala (SIDE / EMPTY_CORNER / WING / entrada al poste).
- **Empty corner:** el jugador de la esquina fuerte sube al lado débil.
- Los bloqueos laterales están permitidos (6,2 m de lateral).
- **Penetración por línea de fondo:** si el defensor tapa el centro, la penetración va por el fondo.
- **Reject:** si el defensor ya está del lado del bloqueo, el manejador ataca hacia el otro lado.

**Spacing (BT5.8): 5-out o 4-out-1-in.**

- 4-out-1-in cuando la identidad quiere jugar dentro y hay hombre interior, o cuando un grande no tira. El hueco de la esquina fuerte pasa a ser el bloque del lado del balón (`POST`), ocupado siempre por ese jugador.
- 5-out en el resto de casos.
- El spacing cambia la geometría real: su defensor se queda cerca del aro, el carril de penetración se cierra y el rebote ofensivo sube.

Resultado (TEST B):

| plantilla | formación |
|---|---|
| creación | 5-out el 100% |
| interior | 4-out-1-in el 100% |
| plantilla por defecto (pívot que no tira) | 4-out-1-in el 89% |

## 9. Bloqueo directo

Lo deciden el entrenador y la plantilla:

- **frecuencia:** familia y bonus del iniciador;
- **ubicación;**
- **manejador:** el iniciador;
- **bloqueador:** el designado (+0,25 en el valor);
- **roll / pop:** un grande que tira (≥60 y ≥ penetración+2) abre; uno que finaliza continúa;
- **reject;**
- **la cobertura de cada bloqueo** (sección 12).

Resultado: el entrenador A pide el bloqueo en el ~45% de las jugadas con cualquier plantilla. Lo que cambia es la resolución:

| plantilla del entrenador A | continuación del bloqueador | PPP |
|---|---|---|
| interior (grandes finalizadores) | roll 100% | 0,76 |
| creación (grandes que tiran) | roll 0% (pop) | 0,99 |

## 10. Juego sin balón

- **Cortes:** el máximo por posesión pasa a ser `round(1,5 + 4·offBall)` y el hundimiento necesario baja con `offBall`.
- **Pin-downs** en las jugadas MOVEMENT.
- **Drift** en las penetraciones (BT2).

Resultado: el entrenador B tiene 0,26 acciones sin balón por posesión, frente a 0,11 del A.

## 11. Transición y ritmo

El ritmo cambia por decisiones, no por consumir segundos:

1. **Saque tras canasta.** Un equipo rápido saca en cuanto están el sacador y el receptor (sin esperar la formación) y con menos pausa. Uno lento tarda más.
2. **Urgencias de la subida.** Un equipo rápido empuja también las transiciones neutras; uno controlado sube incluso con ventaja numérica sin correr.
3. **Pase de avance.** Uno que solo pide el ritmo exige ≥0,88 de completación; cualquier pase de más de 12 m de avance, ≥0,82.
4. **Ataque temprano.** Un equipo rápido puede penetrar contra una defensa que aún no está montada.
5. **Rebote ofensivo:** 1–3 jugadores según `crash`.
6. **Paciencia.** `ballMovement` alarga el compromiso con la jugada y exige pases extra.

**El leak-out (un defensor que sale antes del rebote) está implementado pero desactivado por defecto** (`leakOut: 0`): ver la sección 26.

Perfiles de auditoría:

| perfil | posesiones | s / posesión | transición |
|---|---|---|---|
| FAST (entrenador A) | 100,5 | 11,1 | 17,4% |
| BALANCED (neutro) | 92,8 | 11,5 | 9,0% |
| CONTROLLED (entrenador B) | 88,7 | 12,8 | 3,2% |

## 12. Coberturas defensivas

Cada bloqueo se cubre según la cobertura base (la del entrenador o la del ajuste en partido). Un entrenador con conocimiento táctico la adapta a los dos hombres de la acción, solo con información de nivel scouting:

- **switch salvo el grande lento:** si el defensor del bloqueador no puede con ese manejador, pasa a drop;
- **contra un tirador élite de pull-up:** hedge en lugar de drop;
- **contra un bloqueador que abre y tira:** hedge en lugar de blitz.

La profundidad del drop sale del plan, del tiro del manejador y de la amenaza del roller. El retraso de comunicación sale de la familiaridad.

| cobertura | geometría |
|---|---|
| **DROP (5.14)** | el grande espera a una distancia del aro que depende de la profundidad; el defensor del balón rodea el bloqueo por encima; el low man marca (TAG) al roller si el grande lo pierde |
| **SWITCH (5.15)** | intercambio real de asignaciones **al usar el bloqueo** (antes se hacía al ponerlo), tras el retraso de comunicación; genera pequeño contra grande; **switch-back**: tras la acción, con los dos lejos del balón, se deshace un desajuste grande cerca del aro |
| **HEDGE (5.16)** | el grande sale ~0,9 s y vuelve a su hombre; el low man marca al roller mientras tanto |
| **BLITZ (5.17)** | los dos defensores atrapan al manejador; el low man marca al roller, o el defensor libre más cercano recoge al bloqueador si abre; la defensa juega 4 contra 3 detrás |

## 13. Ayuda

Responsabilidades nuevas y extensibles (`DefensiveResponsibilityKind`): `TAG` (low man sobre el roller) y `DIG` (ayuda al recibir el poste), además de las anteriores (LOW_MAN / ROTATE / X_OUT / RECOVER / protector del aro).

- La agresividad de la ayuda adelanta el disparo de la ayuda en la penetración (±1,2 m) y la profundidad del gap y de la ayuda.
- Un defensa con conocimiento táctico no ayuda desde un tirador élite si hay alternativa.

## 14. Contexto

`tacticalContext` usa el marcador, el tiempo de juego que queda, el cansancio del quinteto y las faltas (a través del aislamiento sobre un defensor cargado).

Últimos 4 minutos con el marcador fijado; equipo local neutro; 10 semillas:

| local | tempo de la intención | 1.er tiro p50 (local) | transición (local) | s / posesión del rival |
|---|---|---|---|---|
| +15 ("proteger 15 de ventaja") | −0,46 | 12,0 s | 6,7% | 10,0 |
| empate | −0,10 | 10,9 s | 17,0% | 11,5 |
| −5 ("perseguir 5 de desventaja") | +0,12 | 9,8 s | 17,4% | 11,8 |

Con +15, el local gasta el reloj y el rival, que pierde de 15, acelera. El efecto va en la dirección correcta, pero es moderado: no es una IA de final de partido.

## 15. Adaptación en partido

`MatchMemory` revisa al final de cada posesión. Las condiciones:

- una cobertura cambia si concedió, en suficientes posesiones, claramente más que lo que concede el equipo en total:
  - posesiones necesarias: 6 + (1 − adaptabilidad)·4;
  - margen: 0,45 − 0,25·conocimiento − 0,1·adaptabilidad + 0,6/√n;
- la cobertura nueva es la que responde a lo concedido: pull-ups contra el drop, desajustes contra el switch, el short roll contra el blitz;
- una familia que rinde mal se pide menos; una que rinde bien, más;
- hay un enfriamiento (150 s) y un tope (3 ajustes);
- un entrenador con adaptabilidad < 15 no ajusta nunca.

Demostración (drop profundo contra la plantilla de creación):

| entrenador | ajustes por partido | PPP del rival |
|---|---|---|
| adaptable (95) | 2,8 | 0,91 |
| rígido (10) | 0 | 1,04 |

Ejemplos del log:

- "drop conceded 1.50 points per possession over 6 (team 0.95): change to hedge"
- "ISOLATION produced 0.43 points per possession over 7 (offense 0.96): run it less"

**Defecto:** con muestras de 7–10 posesiones a veces oscila (switch → drop → switch).

## 16. Memoria del partido

Memoria pequeña:

- por familia: posesiones y puntos;
- por cobertura: posesiones defendidas y puntos concedidos, y cómo se crearon los tiros anotados tras el bloqueo;
- los últimos 6 iniciadores;
- el ajuste vigente.

No guarda historia de eventos.

## 17. Huellas (BT5.29)

`fingerprint.ts`: ritmo, transición, pases/posesión, AST/FGM, penetraciones, bloqueos, acciones sin balón, cuotas aro / media / triple / C&S / pull-up / PnR / corte, OREB, TOV, robos, tapones, FTA, distribución de coberturas, switches por bloqueo, ayudas por penetración, TAG/DIG, cuota del iniciador y del tirador principal, familias, ubicaciones, spacing y ajustes.

## 18. Experimentos controlados (BT5.30) y distancias (BT5.31)

**TEST A · misma plantilla, distinto entrenador**

| | posesiones | s/pos | transición | pases/pos | bloqueos/pos | sin balón/pos | aro | triple | %OREB | familias principales | cobertura | PPP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| neutro | 92,8 | 11,5 | 9,0% | 2,49 | 0,39 | 0,18 | 24,8% | 57,7% | 19,2% | BS 32 · CIRC 17 · DK 16 | switch | 0,94 |
| A (rápido, P&R, presión, blitz) | 100,5 | 11,1 | 17,4% | 2,46 | 0,42 | 0,11 | 29,1% | 52,8% | 22,7% | BS 46 · DK 19 · ISO 13 | blitz 54% / hedge 32% | 0,83 |
| B (controlado, movimiento, drop) | 88,7 | 12,8 | 3,2% | 2,87 | 0,51 | 0,26 | 21,2% | 55,6% | 21,9% | BS 24 · CIRC 24 · MOV 23 | drop 100% | 0,96 |
| C (adaptable, equilibrado) | 89,3 | 12,1 | 8,2% | 2,58 | 0,46 | 0,18 | 21,6% | 58,7% | 18,7% | BS 33 · DK 18 · MOV 15 | drop 55% / switch 34% | 0,98 |

Distancias:

| par | distancia |
|---|---|
| A ↔ B | 1,04 |
| A ↔ C | 0,97 |
| B ↔ C | 0,66 |
| neutro ↔ A | 0,74 |
| neutro ↔ B | 0,75 |
| neutro ↔ C | 0,41 |

**TEST B · mismo entrenador (C), distinta plantilla**

| plantilla | s/pos | pases/pos | penetraciones/pos | bloqueos/pos | aro | triple | pull-up | %OREB | spacing | familias | PPP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| creación | 10,4 | 2,95 | 0,48 | 0,33 | 34,2% | 59,9% | 3,3% | 9,9% | 5-out | BS 35 · CIRC 15 | 0,98 |
| interior | 13,1 | 3,09 | 1,01 | 0,65 | 29,6% | 41,2% | 13,4% | 25,1% | 4-out-1-in | BS 30 · POST 26 | 0,81 |
| defensa | 13,5 | 3,27 | 0,66 | 0,61 | 16,4% | 64,0% | 7,4% | 21,7% | 4-out-1-in | BS 33 · CIRC 18 | 0,89 |

Distancias:

| par | distancia |
|---|---|
| creación ↔ interior | 1,86 |
| creación ↔ defensa | 1,54 |
| interior ↔ defensa | 1,43 |

**TEST C · misma plantilla y entrenador (C), distinto plan**

| plan | posesiones | transición | penetraciones/pos | aro | triple | spacing | POST |
|---|---|---|---|---|---|---|---|
| ninguno | 89,3 | 8,2% | 0,71 | 21,6% | 58,7% | 4-out-1-in 100% | 2% |
| "jugar dentro" | 90,2 | 10,0% | 0,81 | 28,7% | 52,5% | 4-out-1-in 95% | 18% |
| "abrir la pista" | 88,8 | 5,8% | 0,55 | 18,1% | 61,4% | 5-out 54% | 2% |
| "correr" | 97,7 | 11,9% | 0,71 | 31,9% | 50,7% | 4-out-1-in 82% | 3% |

Distancias:

| par | distancia |
|---|---|
| dentro ↔ abrir | 1,08 |
| abrir ↔ correr | 1,25 |
| dentro ↔ correr | 0,40 |

**TEST D · mismo local (neutro), distinto rival.** Distancias de la huella del local:

| rival | distancia | qué cambia |
|---|---|---|
| plantilla de creación | 0,92 | |
| plantilla defensiva | 0,95 | el local tira un 69,8% de triples y solo un 2,4% de pull-ups ante una defensa que no deja penetrar |
| entrenador A | 0,61 | |

**TEST E · contexto:** ver la sección 14.

**Perfil de tiro de los mandos antiguos, ya sin multiplicador:**

| plan antiguo | triples | aro | spacing | POST |
|---|---|---|---|---|
| "triples" | 71,4% | 16,5% | 5-out 100% | |
| "aro" | 45,0% | 30,7% | 4-out-1-in 99% | 28% |

Distancia entre los dos: 2,22.

## 19. Regresión de identidad individual (BT5.32)

Instrumento de flujo de BT4.2, 12 semillas, correlación entre jugadores:

| | BT4.4 | BT4.5 | **BT5** |
|---|---|---|---|
| creación → asistencias | 0,35 | 0,17 | **0,54** |
| visión → asistencias | 0,29 | 0,10 | **0,46** |
| creación → cuota de pase | −0,06 | −0,30 | −0,20 |

La identidad del creador se recupera y supera la de BT4.4, porque la selección del iniciador y la prioridad del pase hacia el hombre de la jugada ponen el balón en sus manos. Esto corrige el defecto principal de BT4.5.

Tiradores, finalizadores y reboteadores conservan su papel en las cohortes de plantilla:

- la plantilla interior rebotea un 25% ofensivo, frente al 10% de la de creación;
- la de creación hace pop el 100% de las veces;
- la cuota de tiros del máximo tirador es 37% (BT4.5: 34%).

## 20. Regresión de la ecología de pase BT4.5 (BT5.33)

12 semillas, ledger de pase:

| por partido | BT4.5 | BT5 |
|---|---|---|
| posesiones | 175,2 | 185,0 |
| puntos (PPP) | 175,2 (1,00) | 179,3 (0,97) |
| pases vivos | 518,8 | 524,3 |
| asistencias | 32,8 | 36,0 |
| pérdidas | 25,3 | **31,1** |
| robos | 21,2 | 25,2 |
| intercepciones / desvíos / robo limpio | 6,3 / 6,4 / 7,6 | 8,4 / 7,6 / 8,0 |

Las pérdidas no vuelven a 36 de forma sistemática, pero suben un 23% y quedan **en el borde** de la franja rechazada. Por posesión, 0,168 frente a 0,145.

Durante el desarrollo se encontraron y quitaron tres fuentes de pérdidas:

| causa | efecto medido | qué se hizo |
|---|---|---|
| saque al creador | intercepciones del protector del aro en transición: 1,75 → 9–15 | desactivado (`inboundToCreator: 0`) |
| leak-out | outlets perdidos el 33% | desactivado |
| empujes de ritmo hacia carriles de 0,6 de completación | | ahora exigen más completación |

## 21. Ritmo (BT5.34)

Ledger de posesiones, 12 semillas:

| | BT4.5 | BT5 |
|---|---|---|
| posesiones | 175,2 | 185,0 |
| s / posesión | 12,2 | 11,5 |
| mediana por posesión | | 10,3–11,2 s |
| ataque temprano falso por partido | 30,3 | 27,9 |

No hay posesiones instantáneas ni esperas falsas nuevas. El reloj sigue reconciliado (diferencia 0).

El ritmo **toca el límite de 185**. La subida viene de las decisiones (más jugadas que acaban antes, más transición en algunos equipos), no de consumir segundos. Aun así, es una regresión a vigilar.

## 22. Economía

- PPP global: 0,97 (BT4.5: 1,00).
- Por familia, en el equipo local neutro: DRIVE_KICK 1,11, EARLY 1,10, ISO 0,99, CIRC 0,94, BS 0,91, MOV 0,83, POST 0,73.
- El estilo cuesta o rinde según la plantilla:

| | PPP |
|---|---|
| entrenador A (plantilla por defecto / creación / interior) | 0,83 / 0,99 / 0,76 |
| entrenador B (por defecto / creación / interior) | 0,96 / 0,93 / 0,73 |

El precio del ritmo del entrenador A con una plantilla que no lo sostiene es alto (0,83), quizá demasiado.

## 23. Validación visual (BT5.36)

**Escenario:** misma semilla (31337) y mismo partido, cambiando solo el entrenador. `?homeStyle=fast&awayStyle=controlled` y el inverso, en el visor Phaser real.

- 45 fotogramas por escenario, uno cada 1,5 s, entre los ticks 1300 y 1960.
- Junto a cada escenario, el log canónico de la ventana.

**Se reconoce sin debug:**

- **Qué equipo corre más.**
  - 3,3 s después de un rebote defensivo, el base del equipo rápido llega esprintando al codo rival con la defensa detrás.
  - El equipo controlado sube andando y los espaciadores trotan a sus huecos.
  - Tras canasta, el rápido saca en 0,9 s; el controlado, en 4,4–5,1 s.
  - Posesiones en la ventana: 5,0 / 6,0 / 12,2 s (rápido) frente a 15,8 / 20,3 / 22,7 s (controlado).
- **Qué equipo juega dentro:** el 4-out-1-in con un hombre fijo en el bloque es visible.

**Solo se reconoce con las superposiciones o el debug:**

- qué equipo usa más P&R;
- cuál mueve más el balón;
- cuál cambia en los bloqueos;
- cuál protege el aro con drop;
- cuál presiona más.

Las coberturas existen y su geometría es distinta, pero en un plano general y a velocidad real se diferencian poco.

**Defecto visto:** amontonamientos en la zona (poste + cortador + sus defensores + el que marca al roller; fotograma t1825).

Por eso la validación visual es PARTIAL.

## 24. Tests

- **Nuevos:** `matchNextTactics.test.ts`, 12 tests focales:
  - lectura del plan antiguo;
  - determinismo y explicación JSON-safe;
  - fricción entrenador × plantilla y doblez de la adaptabilidad;
  - plan de partido;
  - spacing;
  - roles dinámicos;
  - iniciador con carga;
  - cobertura según conocimiento y profundidad del drop;
  - contexto;
  - ajuste en partido (cambia con evidencia, no con 1 posesión, no si es rígido);
  - un partido real con identidades opuestas: determinista y Live = Instant.
- **Tests existentes adaptados al comportamiento nuevo** (no se borró ninguno):
  - `matchNextBt3`:
    - el perfil de tiro ya no cambia el valor de un tiro (se comprueba la igualdad);
    - la mezcla de tiro sigue cambiando con el plan, con un umbral de 0,08 en el partido corto de una semilla (en la auditoría a 6 semillas la diferencia es 0,26).
  - `matchNextBt2` (5-out): se fuerza `postSpacing: 0`, porque ese test es sobre la estructura 5-out.
  - `matchNextActions`: una falta en la penetración también cuenta como final de la secuencia; el test de kernel no tiene quien saque.
  - `CoachRotation`: en un periodo de 5 minutos un equipo puede no tener ventana legal de cambio; las comprobaciones siguen al equipo que cambió. La igualdad Live = Instant y la carga de trabajo se mantienen.
- **Corrección de un fallo de BT4 que BT5 hizo aflorar:** un tiro tras parada que se estaba preparando cuando sonaba una falta quedaba ACTIVE. Su intención de "quedarse quieto" bloqueaba al sacador y el saque no llegaba nunca (partido congelado en la semilla 424242). Ahora se cancela si el tirador ya no tiene el balón.
- **Match Next, Live/Instant y presentación:** 202 tests en verde. Fallan 5 tests, los **mismos 5 que ya fallaban en la base** desde BT4.4 (`LiveMatchController` "exactly one live sporting step" y cuatro de `matchNext.test.ts`).
- Determinismo y Live = Instant: en verde.
- Sin `Math.random(` en `src/`. Sin imports de React, Zustand ni Tauri en el motor.
- `npm run typecheck` en verde. `npm run build` correcto (solo el aviso de tamaño de chunk que ya existía).
- No se ejecutó la suite completa.

## 25. Rendimiento

| | BT4.5 | BT5 |
|---|---|---|
| un partido completo, máquina libre | 56,7 s | 59,0 s |

+4%, con ~6% más posesiones. La intención se memoiza sobre sus entradas exactas.

## 26. Limitaciones

1. **Presión defensiva con efecto invertido.**

   | presión del local | PPP del rival | robos por posesión rival | aro del rival | FTA/FGA del rival |
   |---|---|---|---|---|
   | 0,95 | 1,17 | 9,3% | 39,8% | 0,28 |
   | 0,05 | 1,04 | 11,5% | 31,2% | 0,16 |

   La presión concede (penetraciones y faltas) sin ganar robos. La negación de líneas hace que el pasador (BT4.5) evite esos carriles, y los intentos de robo terminan antes en falta. Arreglarlo exige tocar el modelo de robo en el balón y de contención, fuera de una capa táctica.
2. **La agresividad de la ayuda apenas cambia el resultado.** Ayuda alta frente a baja: PPP del rival 1,07 frente a 1,02, misma cuota de aro. Solo cambia el número de digs (52 frente a 22).
3. **Familiaridad sin efecto medible.** Distancia de 0,52 entre 20 y 95, dentro del ruido. La arquitectura existe (pesos aplanados, retraso de comunicación), pero su peso es pequeño.
4. **Leak-out desactivado.** El outlet largo a un corredor en carrera se pierde demasiado con la física de pase de BT4.5.
5. **Saque al creador desactivado**, por las intercepciones en transición. El iniciador recibe el balón por la prioridad de la jugada en media pista y por el outlet corto.
6. **El ajuste en partido oscila** con muestras pequeñas.
7. **Amontonamientos en la zona** con 4-out-1-in + cortes + TAG.
8. Pérdidas (31,1) y ritmo (185) en el borde.

## 27–30. Estados

**TECHNICAL: PASS.**

- Arquitectura pura, derivada y determinista.
- Live = Instant.
- Tests, typecheck y build en verde, salvo los 5 fallos heredados.
- Rendimiento +4%.

**TACTICAL IDENTITY: PARTIAL.**

- Entrenadores, plantillas, planes, rivales y contexto producen huellas distintas.
- El P&R, el spacing y la transición responden al sistema.
- Los roles y la selección del iniciador son dinámicos.
- Hay fricción entre plantilla y entrenador, y hay adaptación.
- Falla: el trade-off de la presión (invertido) y el de la ayuda (débil), y la familiaridad no tiene efecto.

**BASKETBALL TRUTH: PARTIAL.**

- La identidad individual mejora (0,54 / 0,46).
- El tiro emerge de las decisiones.
- Las coberturas tienen costes distintos y ninguna domina.
- Pero pérdidas +23%, ritmo 185, PPP global 0,97 y un estilo rápido mal sostenido a 0,83.

**VISUAL RECOGNIZABILITY: PARTIAL.** El ritmo y el juego interior se reconocen; el P&R, el movimiento y las coberturas, no sin superposiciones.

### Criterios de PASS

| # | criterio | estado |
|---|---|---|
| 1 | entrenador A ≠ B con la misma plantilla | sí (distancia 1,04) |
| 2 | la plantilla modifica el estilo realizado | sí (1,4–1,9) |
| 3 | el plan táctico cambia el comportamiento real | sí (dentro ↔ abrir: 1,08) |
| 4 | la frecuencia de P&R responde al sistema | sí (bloqueos llamados 24% → 46%) |
| 5 | el spacing responde | sí (5-out / 4-out-1-in según plantilla y plan) |
| 6 | la transición responde | sí (3,2% → 17,4%) |
| 7 | el perfil de tiro emerge, no se impone | sí (sin multiplicador; 71% frente a 45% de triples por decisiones) |
| 8 | varias coberturas espacialmente distintas | sí (4) |
| 9 | cada cobertura tiene trade-offs | sí; ninguna domina (PPP del rival 0,97–1,08 con concesiones distintas) |
| 10 | roles dinámicos | sí |
| 11 | iniciador no universal | sí (cuota del principal 24–38% según configuración, con carga) |
| 12 | una plantilla incompatible limita al entrenador | sí (A: PPP 0,99 frente a 0,76) |
| 13 | el contexto modifica decisiones | sí, moderado |
| 14 | adaptación en partido demostrable | sí (2,8 ajustes; PPP del rival 1,04 → 0,91); oscila |
| 15 | la identidad de BT4 sobrevive | sí, y mejora |
| 16 | la ecología de pase de BT4.5 sobrevive | **parcial**: 31,1 pérdidas (+23%) |
| 17 | el ritmo no vuelve a romperse | **parcial**: 185, en el límite |
| 18 | Live / Instant con la misma autoridad | sí |
| 19 | determinismo | sí |
| 20 | dos estilos extremos parecen partidos distintos | **parcial**: solo por ritmo y juego interior |

## Respuestas

### ¿Puede reconocerse qué equipo es cuál solo viendo cómo juega?

En parte:

- **Sí:** el ritmo (quién saca rápido, quién empuja tras el rebote, quién sube andando) y el juego interior (un hombre fijo en el bloque, entradas al poste).
- **No sin superposiciones:** el P&R frente al movimiento, y qué cobertura usa cada defensa. Están en la simulación, pero a velocidad real y en plano general se parecen.

### ¿El entrenador cambia realmente el partido?

Sí:

| | entrenador A | entrenador B |
|---|---|---|
| posesiones | 100,5 | 88,7 |
| transición | 17,4% | 3,2% |
| jugadas de bloqueo directo | 46% | 24% |
| jugadas de movimiento | 6% | 23% |
| cobertura | blitz | drop |
| sin balón por posesión | 0,11 | 0,26 |

La distancia A ↔ B (1,04) es menor que entre plantillas (1,4–1,9): **la plantilla pesa más que el entrenador**, lo que es razonable.

### ¿La plantilla limita o potencia el plan del entrenador?

Las dos cosas:

- **Limita:** el entrenador A pide el mismo volumen de bloqueos con cualquier plantilla, pero con grandes que no tiran y sin manejador rinde 0,76 y con la de creación 0,99. El entrenador B, con la plantilla interior, rinde 0,73.
- **Potencia o cambia la forma:**
  - con grandes que tiran, el bloqueo del entrenador A acaba en pop el 100% de las veces; con finalizadores, en roll el 100%;
  - con la plantilla interior, el entrenador B juega 33% de poste.

### ¿Los estilos surgen de decisiones o de modificadores estadísticos?

De decisiones:

- La intención solo cambia qué se busca: la familia, la ubicación, quién inicia, la prioridad de las lecturas, qué cobertura y dónde se coloca cada defensor, cuántos van al rebote, cuándo se saca.
- Ningún valor de tiro, probabilidad ni tasa de resultado depende de la táctica. El multiplicador por zona del perfil de tiro se eliminó.
- Dos excepciones, que siguen siendo decisiones de riesgo, no resultados:
  - la frecuencia con que el defensor en el balón intenta robar (presión);
  - el orden en que se miran las opciones (prioridad de lectura según la identidad).

### ¿Qué diferencias aparecen con el mismo roster y entrenadores distintos?

Las del TEST A: ritmo, transición, familias, bloqueos, movimiento sin balón, cobertura y rebote ofensivo. El perfil de tiro cambia menos (triples 53–59%), porque con esta plantilla las lecturas de valor siguen mandando.

### ¿Qué diferencias aparecen con el mismo entrenador y rosters distintos?

Las mayores de todas (TEST B):

- spacing (5-out / 4-out-1-in);
- poste (26% en la interior);
- penetraciones (0,48 frente a 1,01);
- rebote ofensivo (10% frente a 25%);
- roll / pop;
- pull-up (3% frente a 13%);
- triples (41–64%).

### ¿Qué cobertura defensiva produce qué concesión?

Misma defensa, solo cambia la cobertura; ataque rival neutro:

| cobertura | PPP del rival | qué concede | qué gana |
|---|---|---|---|
| drop | 0,97 | más aro (35%) | pocos pull-ups (3,7%) |
| switch | 1,02 | más triples (60%) | menos aro (26%), menos PnR (8%) |
| hedge | 1,08 | más aro (33%), más PnR (12%) y menos pérdidas del rival (14,4%) | nada claro con esta plantilla: es la peor de las cuatro |
| blitz | 0,97 | 4 contra 3 detrás | menos PnR (7%), más pérdidas del rival (17,2%) y más robos (14,7%) |

Ninguna domina. El drop no concede tantos pull-ups como en la realidad; lo hace con plantillas de manejadores tiradores, que es lo que el ajuste en partido detecta.

### ¿Existe adaptación real al rival?

Sí. Es mínima pero demostrable:

- cambia de cobertura y de familias por evidencia (muestra mínima, margen y enfriamiento);
- depende de la adaptabilidad y del conocimiento del entrenador;
- baja el PPP del rival de 1,04 a 0,91 frente al mismo entrenador rígido.

Todavía oscila con muestras pequeñas.

### ¿La identidad individual sigue existiendo dentro de la identidad colectiva?

Sí, y más que en BT4.5:

- creación y visión → asistencias: 0,54 y 0,46;
- la plantilla de grandes rebotea más;
- los grandes que tiran abren tras el bloqueo;
- el máximo tirador mantiene el 37% de los tiros de su equipo.

### ¿Qué cinco defectos siguen separando MatchEngine Next de calidad comercial?

1. **Pérdidas y ritmo en el borde** (31 y 185), con un estilo rápido que rinde mal (0,83) si la plantilla no lo sostiene.
2. **Defensa:** la presión tiene efecto invertido y la ayuda casi no cambia nada. La defensa en el balón y la contención necesitan un modelo propio de anticipación y de *blow-by*.
3. **La lectura visual de la táctica:** a velocidad real no se distingue P&R de movimiento ni cobertura de cobertura. Hacen falta jugadas más legibles, menos amontonamiento en la zona y quizá animación de bloqueo.
4. **Transición física:** el outlet largo y el pase de avance siguen siendo demasiado arriesgados para permitir un equipo de contraataque real (leak-out desactivado).
5. **Calibración económica por familia:** el poste (0,73), el movimiento (0,83) y el bloqueo (0,91) rinden por debajo de la penetración y del ataque temprano (≈1,1) con plantillas normales.

### ¿Qué sistemas NO debemos seguir tocando después de BT5?

- La capa táctica (identidad, tres autoridades, intención derivada, memoria): ya es el punto de entrada para ajustar estilos.
- Las cuatro coberturas y sus geometrías.
- La estructura de spacing (5-out / 4-out-1-in).
- La selección del iniciador.
- La física y el riesgo de pase de BT4.5, salvo el pase largo de transición.

### ¿Está el motor preparado para BT6 Final Basketball Tuning?

Sí, con condiciones:

- la arquitectura ya permite afinar por familia, cobertura e identidad sin tocar las reglas;
- antes de afinar hay que cerrar el modelo de presión y contención en el balón (defecto 2);
- y bajar las pérdidas a la franja de BT4.5.

Si BT6 empieza por ahí, el resto es calibración.
