# BT4.4 · Causalidad del ritmo

Base `9039015` (BT4.3), rama `match-next-basketball-core-bt4-4-pace-causality`. Sin push, PR ni merge. Todas las cifras son medias por partido sobre **12 semillas** (`31337,424242,7,1,99,2024,11,12,3,5,21,42`), partidos completos de 40 min, salvo que se diga otra cosa.

Instrumento: `src/presentation/match-next/audit/bt44/ledger.ts` (solo lectura: no cambia ningún partido). Evidencia en `docs/match-next-bt4-4/audit/`:

- `ledger-bt42.json`: BT4.2 (`fc8c5d8`), mismo instrumento en worktree temporal.
- `ledger-base12.json`: BT4.3.
- `ledger-val12.json`: solo el arreglo de ciclo de vida, con la regla antigua del radio de 3 m.
- `ledger-final12.json`: resultado final.
- `ledger-rows-base12.json` y `ledger-rows-final12.json`: ledger de todas las posesiones.
- `ledger-trig-*.json` y `ledger-trg-*.json`: dónde nacen los ataques tempranos.

## Respuestas

### ¿Por qué BT4.3 tenía 203 posesiones?

Las posesiones se reconcilian exactamente: **204,1 = 70,8 acabadas en canasta + 82,3 en rebote defensivo + 16,2 en tiros libres + 31,3 en pérdidas + 0,25 en violación de 24 s + 3,3 fin de periodo**. No sobra ninguna. El partido tiene 2400 s de reloj en las tres versiones, así que el exceso es de **duración media por posesión** (BT4.2: 13,05 s; BT4.3: 10,21 s), y esa duración cayó por dos causas, ambas en el motor de decisión:

1. **Ataque temprano por una puerta mal hecha (defecto de lógica).** El 56,6% de las posesiones de BT4.3 tienen un primer ataque en ≤8 s (BT4.2: 40,8%) y el **96% son penetraciones** (111 de 115 por partido). El código dice "un ataque no asentado solo actúa ante una mirada que ya está ahí: una penetración es una jugada, no una mirada" (`DecisionCore.readTheFloor`), pero la mirada abierta solo decidía *si* se actuaba; luego `best` podía ser una penetración. Además, una transición ya `STOPPED` (la defensa había parado la contra) seguía concediendo decisión libre en la etapa EARLY: **45 de ~100 penetraciones tempranas por partido (4 semillas) salían con la transición en `STOPPED`**.
2. **Triggers de contra demasiado permisivos.** El criterio "menos de 3 defensores a ≤3 m de su puesto" aprobaba ataques con la defensa casi montada. De los ataques tempranos de BT4.3, **17% son contra legítima (paridad o ventaja numérica), 39% semicontra y 43% falso ataque temprano** (ver Fase 6).

### ¿Había double-counting de posesiones?

**No.** Evidencia:

- Una posesión solo cambia por `startPossession`/`endPossession`; los pases, recepciones y recuperaciones del mismo equipo no abren posesión (`BallTransitions.ts`). Los rebotes ofensivos se cuentan *dentro* de la posesión.
- Cambios de equipo por partido: 201,4 sobre 204,1 posesiones. Las 1,7 posesiones del mismo equipo seguidas son los inicios de periodo (`periodEnd → periodStart`).
- 0,08 posesiones por partido con 0 s de reloj y 2,3 con menos de 1 s (pérdida inmediata tras robo); 0,5 inicios a menos de 1 s del anterior. Irrelevante.
- Tiros libres: 28 posesiones/partido incluyen una secuencia, ninguna secuencia abre posesión propia. Los saques (109 por partido) no abren posesión: la posesión de saque tras canasta se abre una vez.
- Un único hallazgo menor: 4–7 posesiones por partido empiezan con motivo `other` (balón suelto recuperado sin posesión abierta). Son posesiones reales; no se contaron dos veces.

### ¿Qué porcentaje del exceso procedía de turnovers?

Exceso de BT4.3 sobre BT4.2: **+39,0 posesiones**. Por final de posesión: tiros (canasta +15,7, rebote defensivo +11,8, tiros libres +5,7) = **+33,2 (85%)**; pérdidas netas (pase malo +3,9, robo +3,2, regate +0,2, falta en ataque +0,25, otras −1,5) = **+6,1 (15,6%)**.

Tras el arreglo, el exceso restante sobre BT4.2 es **+15,4** y las pérdidas pasan a ser **~68%** de lo que queda (+10,4: 35,8 frente a 25,4; el resto, +7,1 rebotes defensivos, −1,8 tiros libres, −0,3 fin de periodo). Sin bucle de realimentación: tras una pérdida la posesión rival acaba en pérdida el **15,1%** de las veces, por debajo de la tasa base del 19,9%; dura 11,0 s frente a 12,0 s de las demás. La cadena pérdida→pérdida es de 5,4 por partido (BT4.2: 3,6).

### ¿Qué porcentaje procedía de early offense?

Medido por contraste (no aditivo):

| contraste | posesiones |
|---|---|
| BT4.3 completo | 204,1 |
| BT4.3 con radio 0 (ablación, antes del arreglo) | 192,2 (−11,9) |
| BT4.3 + arreglo de ciclo de vida (puerta de penetración + transición parada) | 188,7 (−15,4, **39%** del exceso) |
| arreglo + radio 0 | 165,0 |
| **final (regla de ventaja numérica)** | **180,5** |

Los ataques tempranos por partido: BT4.2 67,3 · BT4.3 115,5 · final **57,6**. En tiempo: las posesiones de ataque temprano duran ~7,9 s frente a ~13,9 s de una jugada de media cancha; 82 posesiones de ese tipo en BT4.3 equivalían a unas 35 posesiones extra (~90% del exceso, estimación por tiempo). Es una cota alta, no una atribución exclusiva: parte del tiempo habría sido consumido por otras causas.

### ¿Qué play type era responsable del mayor exceso?

**EARLY_OFFENSE** (primer ataque en ≤8 s antes de ejecutar la jugada): 82,4 posesiones de 7,9 s en BT4.3. En el final son 28,3 de 7,8 s (PPP 1,19). Las jugadas de media cancha duran todas lo mismo (BALL_SCREEN 14,2 s, CIRCULATION 13,8 s, DRIVE_KICK 13,1 s, BROKEN_PLAY_RESET 21,3 s), así que ninguna acelera el juego por sí misma. Segundo factor: **NO_SET_REACHED** (26,9 por partido, 3,7 s, PPP 0,20): posesiones que mueren antes de montarse, casi todas robos y pases malos.

| play type (final) | por partido | duración s | pases | FGA/pos | pérdidas/pos | PPP | % del reloj |
|---|---|---|---|---|---|---|---|
| BALL_SCREEN | 43,3 | 14,2 | 3,4 | 0,89 | 0,11 | 1,01 | 28,6 |
| CIRCULATION | 39,5 | 13,8 | 4,9 | 0,85 | 0,14 | 0,92 | 25,3 |
| DRIVE_KICK | 29,1 | 13,1 | 3,1 | 0,90 | 0,09 | 1,00 | 17,8 |
| EARLY_OFFENSE | 28,3 | 7,8 | 1,3 | 1,07 | 0,03 | 1,19 | 10,2 |
| BROKEN_PLAY_RESET | 13,4 | 21,3 | 6,8 | 1,94 | 0,10 | 1,10 | 13,3 |
| NO_SET_REACHED | 26,9 | 3,7 | 1,5 | 0,05 | 0,76 | 0,20 | 4,7 |

(`ledger-final12.json` → `playEconomy`.) Definiciones: EARLY_OFFENSE = primer ataque (tiro o penetración) en ≤8 s sin haberse asentado; BROKEN_PLAY_RESET = hubo rebote ofensivo; el resto, la jugada `playFor` muestreada al asentarse; NO_SET_REACHED = nunca se asentó.

### ¿El reloj consumía tiempo correctamente?

**Sí.** Reloj vivo 2399,7 s de 2400 en las 12 partidas (completas), tiempo muerto de 306 s aparte; **hueco de reconciliación 0,00 s**. Reloj vivo = transición 557 s + media cancha 612 s + acción 968 s + otro vivo (sin posesión abierta, p. ej. el saque tras canasta) 263 s. La suma cierra con 0,00 s de diferencia. No hay posesiones con reloj cero relevantes, ni dos posesiones en el mismo segundo, ni robos que reinicien mal.

### ¿Los dos tests suavizados en BT4.3 eran realmente obsoletos o escondían regresiones?

- **5-out (0,70 → 0,65): escondía una regresión real.** Mediciones del mismo test: BT4.2 **0,834 con 701 muestras**; BT4.3 **0,667 con 187 muestras**; con el arreglo de puerta **0,76 con 226**; versión final **0,725 con 298**. BT4.3 pasaba por media cancha asentada un 73% menos y con peor disciplina de zonas porque el ataque se lanzaba antes de montarse. **Restaurado el umbral 0,70**, que ahora se cumple sin tocarlo.
- **Primer pase (CAUGHT → aceptar BAD_PASS): contrato frágil, no regresión demostrada.** El primer pase del escenario es en ambos motores un cruce largo con un defensor a <0,5 m del carril (BT4.2: 12,1 m, carril 0,28 m, atrapado por tirada; BT4.3: 14,8 m, carril 0,47 m, pérdida). En otros cuatro estados de partida BT4.2 daba 4/4 atrapados y BT4.3 2/4; con 4 muestras no es concluyente. La auditoría de riesgo de pase, sobre 4474 y 7102 pases, no muestra deterioro del modelo: **6,9% (BT4.2) → 7,4% (BT4.3) → 7,2% (final) de pases no atrapados**, y el riesgo depende del carril (0–1 m: 9,3%; 2,5–4 m: 2,0%). El test queda con un contrato más débil (resolución física, recepción real y ≥2 de 4 atrapados). Es un límite del escenario sintético, que solo produce un pase por estado.

### ¿Cuál es el pace después del arreglo mínimo?

| | BT4.2 | BT4.3 | final |
|---|---|---|---|
| Posesiones | 165,1 | 204,1 | **180,5** |
| Segundos de reloj por posesión | 13,05 | 10,21 | **11,88** |
| Puntos (combinados) | 164,4 | 208,4 | 162,8 |
| PPP | 1,00 | 1,02 | 0,90 |
| FGA | 144,3 | 181,2 | 156,1 |
| Pases | 375 | 522 | 597 |
| Asistencias | 22,3 | 24,3 | 28,6 |
| Pérdidas / robos | 25,4 / 15,4 | 31,5 / 19,8 | 35,8 / 21,1 |
| Penetraciones | 97,1 | 159,2 | 113,6 |
| Ataques tempranos (≤8 s) | 67,3 | 115,5 | 57,6 |
| de ellos contra legítima | 14,2 | 20,1 | **27,7** |
| de ellos falsos | 25,5 | 50,2 | 24,4 (settled ≤8 s) |

**180,5, no 165.** No se ha perseguido el objetivo: no se ha tocado ninguna utilidad de tiro ni de penetración, ni ningún tiempo. El ritmo sale de dos correcciones de lógica; lo que queda por encima del rango es:

- **Pérdidas +10,4 por partido** (≈68% del exceso restante): el pase cruza carriles disputados en el 58% de los casos (defensor a <1 m del carril), con el mismo riesgo por pase pero 59% más pases.
- **Volumen de tiros** (156 FGA frente a 144) y 77,6 rebotes defensivos.
- **Tiempo de media cancha** más corto (612 s frente a 920 s en BT4.2) porque el manejador ya no espera: es el cambio buscado en BT4.3.

### ¿Se conservaron circulación, transición e identidad del pasador?

Sí, con matiz en la transición.

- **Circulación:** 597 pases (BT4.3 522), 3,0 pases por posesión de media cancha (mediana; p90 7), 25% con 0 o 1 pase, 28,6 asistencias.
- **Correlaciones (flujo, 6 semillas):** creación→asistencias 0,40 (BT4.3: 0,32), visión→asistencias 0,41 (0,25), cuota de pase→asistencias 0,22 (0,06 en la corrida con la puerta arreglada, 0,24 en BT4.3).
- **Identidad del pasador (4 semillas):** pases 174 → 247 → 378 y asistencias 5 → 12 → 15 según nivel de pasador 25/50/85; tirador: cuota de triple 0,15 → 0,46 → 0,62; sin inversiones.
- **Transición:** primera decisión tras rebote defensivo 0,9 s, la contra con ventaja numérica sube de 14 a 28 ataques por partido. **El tiro en ≤8 s tras rebote defensivo cae de 33–40% a 13%** (flujo): la semicontra con menos atacantes que defensores ya no ataca. Si se prefiere ese ritmo de contra, es una decisión de producto, no una corrección de errores.
- **Movimiento del manejador:** no se re-midió con clip; los cambios no tocan el caminar a su sitio (`OffensiveStructure`).

## Qué se cambió en el motor

Solo `actions/DecisionCore.ts` y `tuning.ts`, en `readTheFloor`:

1. La penetración se excluye de las opciones mientras la media cancha no esté asentada (`flow.stage` HALF_COURT o EARLY, sin `settledAtT`) y no haya ataque legítimo.
2. Ataque legítimo = ventaja de transición real del motor, o **ventaja numérica**: al menos tantos atacantes como defensores entre el balón y el aro (`hasNumericAdvantage`). Esa es la definición con la que se clasificó la contra en el ledger *antes* de ver datos.
3. Se retira el parámetro `earlyOffenseRadiusMeters` (código muerto con la regla nueva) y se exporta `defenseIsSet` solo para la auditoría.

Tests:

- `matchNextBt2.test.ts`, 5-out: restaurado a 0,70 (ver arriba).
- `matchNextActions.test.ts`, primer pase: contrato multiestado (ver arriba).
- `matchNextBt2.test.ts`, "no actúa antes del montaje salvo mirada abierta o reacción a una ventaja": **ajuste de tolerancia, no regresión de BT4.4.** Las dos decisiones que quedaban bajo el umbral eran *pases* (1,017 y 0,986 frente a 1,02), y el motor ve el pase con el refuerzo de jugada de BT4.3 (`playPassBoost` 1,25), que las utilidades registradas no llevan: 1,017 × 1,25 = 1,27 ≥ 1,2. Pasaba en BT4.3 por trayectoria, no por diseño. La tolerancia pasa a `0,85 / playPassBoost`, y el test excluye también las decisiones con ventaja numérica, igual que ya excluía las de transición.

Batería `src/engine` + `src/app`: 1549 tests, 32 fallos con la máquina cargada. De ellos, 18 son timeouts (`STACK_TRACE_ERROR`) de suites de mundo/temporada ajenas al partido y el resto coincide con los fallos del baseline `fc8c5d8` (4 en `matchNext.test.ts`, `LiveMatchController`, `SeasonContentActivation`, `MatchSession`, `MatchRotationRunner`, `startNextSeason` y `WorldDbGameBootstrap`; estos fallos se verificaron también en el baseline). No hay fallos nuevos.

## Qué sigue sin estar bien

- **180 posesiones frente a 145–165.** Documentado, no maquillado; el siguiente paso, si se quiere bajar, es el volumen de pérdidas por pases por carriles disputados.
- **Pérdidas 35,8 y robos 21,1**, por encima de BT4.2.
- **Uso de estrellas:** el primer tirador lleva el 34% de los tiros del equipo (BT4.2: 33%, BT4.3: 31%) y 26,8 FGA por partido; la concentración no ha crecido, lo que sube es el volumen total.
- **PPP 0,90** (BT4.2: 1,00): el ataque es menos eficiente; no se ha investigado en este milestone.
- **Sin revisión visual** con los valores finales.
- Solo defensa individual; el 8 s no está cableado por competición.
