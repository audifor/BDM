# BT4.5 · Ecología del pase y cierre de pérdidas

Base `66b7625` (BT4.4), rama `match-next-basketball-core-bt4-5-pass-ecology`. Sin push, PR ni merge. Todas las cifras son medias por partido (los dos equipos) sobre **12 semillas** (`31337,424242,7,1,99,2024,11,12,3,5,21,42`), partidos completos de 40 min, salvo que se diga otra cosa.

**Veredicto: PARTIAL.** Las pérdidas bajan de 35,8 a 25,3 por causas de baloncesto, el PPP vuelve a 1,00 y el ritmo baja solo (180,5 → 175,2). No se cumplen dos criterios: los robos no bajan (21,1 → 21,2, cambia su composición) y la identidad creación/visión → asistencias cae (0,35/0,29 → 0,17/0,10), con la causa localizada en el reequilibrio `driveValueScale` 1,1 (ver "Identidad del pasador").

Instrumentos (solo lectura, no cambian ningún partido):

- `src/presentation/match-next/audit/bt45/passLedger.ts`: ledger de cada intento de pase (pasador, receptor, posiciones, distancia, tiempo de vuelo, tipo, geometría del carril, holgura de tiempo, separación y negación del receptor, ratings, fase, jugada, utilidades y resultado).
- `src/presentation/match-next/audit/bt45/cohorts.test.ts`: cohortes controladas (mismo partido, cambiando solo los ratings de pase o de defensa del equipo a 30/55/80).
- `src/presentation/match-next/audit/bt44/ledger.ts` (posesiones, BT4.4) y `bt42/flow.test.ts` (flujo e identidad), sin cambios.

Evidencia en `docs/match-next-bt4-5/audit/`:

| archivo | contenido |
|---|---|
| `pass-base12.json` | BT4.4 (punto de partida), 12 semillas |
| `pass-final12.json` | **final**, 12 semillas |
| `pass-v1*.json`, `pass-pv-*.json`, `pass-m-*.json`, `pass-i-*.json`, `pass-h1.json` | variantes intermedias de desarrollo y calibración (4–12 semillas) |
| `cohort-passer-final.json`, `cohort-defender-final.json` | cohortes controladas, código final, 4 semillas por nivel |
| `vis-passes-31337.json` | pases elegidos para la revisión visual |

Y en carpetas anteriores: `docs/match-next-bt4-4/audit/ledger-bt45final.json` (posesiones, final), `docs/match-next-bt4-2/audit/flow-bt45final12.json` (identidad, final) y `flow-id45-*.json` (diagnóstico de identidad), `docs/match-next-bt4/audit/calib-sens45.json` (sensibilidad).

## Qué se cambió en el motor

Un módulo nuevo, `src/engine/match-next/actions/PassRisk.ts`, con tres capas separadas que comparten la decisión (lo que el pasador percibe) y la física (lo que pasa):

1. **Selección** (`DecisionCore.readReceivers`, `perceivedCompletion`): el valor de un receptor es `completación percibida × valor del tiro × vista − (1 − completación) × passLossPoints`. Un balón perdido ya no vale 0, vale menos la posesión. La completación percibida es el producto de ejecución, carril y disponibilidad del receptor (negación por un defensor encima o por delante). El pasador lee el carril con su visión: uno sin visión subestima en hasta `passPerceptionBiasSeconds` (0,3 s) lo rápido que llega el defensor. El receptor de contra (`bestTransitionReceiver`) usa el mismo riesgo en lugar de "carril > 0,45 m".
2. **Ejecución** (`passExecutionError`): el error del lanzamiento depende de la precisión y el timing del pasador, la fatiga, la distancia, un defensor encima del pasador y un receptor en carrera. **Nunca del carril**: antes la calidad del pase mezclaba el carril y daba un error plano.
3. **Intercepción** (`laneRead`, `interceptAttemptChance`): un defensor amenaza el pase si puede tener la mano en la línea **antes de que pase el balón** (tiempo de reacción según sus manos, alcance por envergadura, velocidad punta, movilidad y su inercia hacia la línea, frente al tiempo de vuelo hasta ese punto). Si va a por el balón, corre al punto de la línea y la intercepción o el desvío se resuelve **durante el vuelo** solo si está físicamente allí (`BallTransitions`). El balón ya no se re-apunta al defensor: sigue hacia donde se lanzó.

Parámetros nuevos en `tuning.ts`: `passReactionSeconds` 0,25, `passInterceptMax` 0,12, `passInterceptSlackScale` 0,35, `passPerceptionBiasSeconds` 0,3, `passErrorBase` 0,012, `passLossPoints` 0,9, `passDenialWeight` 0,25. Reequilibrio de utilidades existentes: `passValueScale` 1,12 → 1,09 y `driveValueScale` 1 → 1,1 (ver "¿Qué ocurre con la ecología de tiro?").

Tests nuevos: `src/engine/match-next/matchNextPassEcology.test.ts` (10 tests focales de las tres capas y de la física del vuelo).

## Respuestas

### ¿Por qué BDM producía ~36 pérdidas?

Por tres defectos del modelo de pase, no por exceso de circulación:

1. **Error de ejecución plano y alto.** El 5,9% de los pases salía impreciso fuera cual fuese la dificultad (pases sin ningún defensor capaz de llegar: 4–5,5% de pérdida). Eran **11,8 pérdidas por partido** (pase impreciso suelto 7,1, fuera de banda 3,8, error del receptor 1,0).
2. **Intercepción por distancia, no por tiempo.** Un defensor a menos de 1,3 m de la línea podía robar aunque no tuviese tiempo de llegar. Al robar, el balón se **re-apuntaba al defensor** (de ahí los "pases a defensores" vistos en el visor).
3. **Selección ciega al coste.** La completación esperada iba de 0,72 a 1 y un pase perdido valía 0, no menos la posesión. El riesgo percibido medio era 14% frente a un 9,2% real de pases no completados: el pasador no distinguía un carril cerrado de uno abierto.

### ¿Qué porcentaje procedía realmente de pases?

En BT4.4, **24,2 de 35,8 (67%)** son errores de pase según la taxonomía (interceptado 9,3, impreciso suelto 7,1, fuera de banda 4,2, desviado 3,1, receptor 0,6). Si se cuentan todas las pérdidas cuyo último acto fue un pase que perdió la posesión (incluye saques), son 27,6 (77%). El resto: pérdida de regate 8,8 (3,8 sin pase previo), falta en ataque 1,4, 24 s 1,2, pisar fuera 0,3.

### ¿El problema principal era selección, ejecución o defensa?

**Ejecución**, seguida de la intercepción mal modelada. De la bajada de 10,5 pérdidas, **10,2** vienen de pases imprecisos, fuera de banda o fallos del receptor (11,8 → 1,7) y 2,9 de intercepciones (9,3 → 6,3). Los desvíos suben 3,3 (3,1 → 6,4), porque ahora el defensor que llega a la línea toca el balón en vuelo. La selección mejora (siguiente apartado), pero su efecto en el total es menor: el 46% de los pases perdidos actuales son buena decisión con mala ejecución, el 52,5% decisiones marginales y solo el 1,4% malas decisiones de fracaso esperable.

### ¿Por qué el 58% de los pases tenía un defensor cerca del carril?

Porque la distancia perpendicular no mide la amenaza. En BT4.4, el **48,8%** de los pases con un defensor a <1 m del carril no tenían amenaza de tiempo: el defensor estaba junto al pasador (el balón sale antes de que reaccione) o junto al receptor (llega tarde). Con la medida por tiempo:

| distancia al carril (BT4.5) | pases/partido | completados | interceptados | desviados | pérdida |
|---|---|---|---|---|---|
| <0,30 m | 117,3 | 92,3% | 3,4% | 3,2% | 7,8% |
| 0,30–0,60 | 95,1 | 94,4% | 1,8% | 2,1% | 5,3% |
| 0,60–1,00 | 110,6 | 97,9% | 0,4% | 0,5% | 2,0% |
| 1,00–1,50 | 65,3 | 97,4% | 0,3% | 0,8% | 1,8% |
| >1,50 | 130,7 | 99,5% | 0% | 0% | 0,4% |

La calidad media del pasador (~70) y del defensor (~67) es la misma en todos los tramos, así que el gradiente es geométrico. La cuota con defensor a <1 m baja de 58,3% a 52,5% (ledger de posesiones) y, entre ellos, los que no tienen amenaza de tiempo pasan de 48,8% a 31,8%: los pasadores evitan más los carriles realmente cerrados.

Por holgura de tiempo (tiempo del balón menos tiempo del defensor a la línea), la pérdida es 0,6–0,9% cuando el defensor no puede llegar y sube a 2,5% (0–0,15 s), 6,5% (0,15–0,3 s), 9,4% (0,3–0,6 s) y 23,5% (>0,6 s). En BT4.4 era 4–5,5% en todos los tramos sin amenaza: la pérdida ahora sigue a la física.

### ¿Los jugadores reconocen ahora mejor ventanas cerradas?

Sí, con matices:

- Riesgo percibido frente a real: **4,2% frente a 3,7%** (BT4.4: 14% frente a 9,2%). Por tramos de distancia la percepción está calibrada (7,6% frente a 7,8% de pérdida real a <0,3 m) y algo pesimista en carriles abiertos (1,5% frente a 0,4% a >1,5 m).
- Calibración de la intercepción: los pases con intento percibido de 0,1–0,2 se interceptan o desvían el 11,9%; los de 0,02–0,1, el 4,8%; los de <0,02, el 1%.
- Pases a un receptor negado: 6,7% → **2,3%** de los pases.
- Excepción: el **pase de avance en transición** sigue infravalorado (riesgo percibido 10,5%, pérdida real 15,5%).
- Lo que no mejora: la cuota de pases perdidos en los que pasar no era la mejor opción (53,8% → 49,7%). La mejora está en el tamaño del error: la diferencia de utilidad entre el pase perdido y la mejor alternativa pasa de 0,009 a 0,053.

### ¿La calidad del pasador afecta selección además de precisión?

Sí. Cohorte controlada (mismo partido, todo el equipo con pase 30/55/80, 4 semillas):

| pasador | pases vivos | completados | interceptados | pérdida | asistencias | pases perdidos que no eran la mejor opción |
|---|---|---|---|---|---|---|
| 30 | 269,8 | 93,7% | 2,7% | 5,1% | 16,0 | 64,5% |
| 55 | 423,5 | 95,3% | 1,3% | 4,2% | 26,3 | 34,0% |
| 80 | 505,0 | 96,3% | 1,0% | 3,7% | 26,5 | 28,8% |

El pasador élite no solo falla menos el lanzamiento: intercepta menos porque elige menos carriles en los que el defensor llega primero, y sus pérdidas son con más frecuencia buenas decisiones mal ejecutadas. En el partido natural, los pasadores de visión baja lanzan el 60,8% de sus pases a carriles con holgura positiva para el defensor; los élite, el 49,1%.

Efecto secundario que hay que vigilar: un equipo entero de pasadores 80 juega muy despacio (144,8 posesiones, 135,5 puntos). Es una cohorte extrema (los cinco a 80), pero apunta a que el valor del pase satura frente al tiro en equipos muy pasadores.

### ¿La calidad defensiva sigue importando?

Sí en total, débilmente en los carriles de pase. Cohorte controlada (todo el equipo con robo/anticipación 30/55/80):

| defensor | robos | pérdidas provocadas | intercepciones de pase | desvíos | robos limpios en balón | completación rival |
|---|---|---|---|---|---|---|
| 30 | 13,3 | 19,5 | 4,8 | 7,3 | 1,0 | 96,6% |
| 55 | 18,8 | 24,8 | 6,0 | 7,3 | 5,3 | 95,9% |
| 80 | 26,0 | 30,5 | 5,8 | 5,8 | 14,3 | 96,1% |

Se cumple élite > medio > malo en impacto real, pero el salto de 55 a 80 viene casi entero del robo en el balón. En los carriles, el defensor élite no intercepta más que el medio: el pasador también lo ve llegar antes y no le lanza. Es coherente con la selección, pero deja al defensor de carril élite con poco impacto propio. Queda anotado como abierto.

### ¿Cuántas pérdidas y robos produce ahora?

**25,3 pérdidas** (BT4.4: 35,8) y **21,2 robos** (BT4.4: 21,1).

Taxonomía de pérdidas (por partido):

| tipo | BT4.4 | BT4.5 |
|---|---|---|
| pase interceptado | 9,3 | 6,3 |
| pase desviado y perdido | 3,1 | 6,4 |
| pase impreciso (suelto o fuera) | 10,8 | 1,4 |
| fallo del receptor (suelto o fuera) | 1,0 | 0,3 |
| pérdida de regate (sin pase / tras pase completado) | 3,8 / 5,0 | 4,1 / 4,4 |
| falta en ataque | 1,4 | 1,4 |
| violación de 24 s | 1,2 | 0,8 |
| pisar fuera | 0,3 | 0,2 |

Robos: intercepción de pase 9,3 → 6,3, desvío 3,1 → 6,4, robo limpio en el balón 7,7 → 7,6, golpe al balón 1,1 → 0,8. El **60%** de los robos sigue viniendo del pase (BT4.4: 58,5%). Por responsabilidad del defensor, las intercepciones vienen de ayudas en el hueco (GAP 2,2), del defensor que protege el aro (1,8) y del emparejado (1,6). Los robos limpios vienen del defensor en el balón (4,8) y del que para el balón en transición (2,3).

**Los robos no bajan**: la intercepción se ha cambiado por desvío. Con el nuevo modelo, el defensor que llega a la línea toca el balón en vuelo, y casi la mitad de esos toques acaban en manos de la defensa. Esto deja casi todas las pérdidas como robos (21,2 de 25,3, un 84%) y solo 4,1 pérdidas de balón muerto. Ese reparto todavía no es realista y es uno de los motivos del PARTIAL.

### ¿Cuántas posesiones produce ahora?

**175,2** (BT4.4: 180,5), con 12,21 s por posesión (BT4.4: 11,88). Se confirma la hipótesis Q sin introducir esperas: menos pases malos → menos cambios prematuros de posesión → posesiones más largas. Las posesiones que empiezan por pérdida bajan de 28,1 a 24,3 y las cadenas pérdida → pérdida de 5,4 a 2,9.

Está en la franja "aceptable si la economía y el baloncesto son sólidos" (166–175), justo en el borde.

### ¿Qué ocurre con PPP?

Sube de **0,90 a 1,00** (puntos 162,8 → 175,2), sin tocar el tiro. Viene de las posesiones que ya no se pierden y de jugadas de media cancha más productivas: BALL_SCREEN 1,01 → 1,05, CIRCULATION 0,92 → 1,04, DRIVE_KICK 1,00 → 1,09. BROKEN_PLAY_RESET baja (1,10 → 0,94).

### ¿Se conservan los ~500 pases y las ~25 asistencias?

Sí. Pases vivos 507 → **519** por partido (todos, con saques: 596 → 608). Asistencias 28,6 → **32,8**. Completación 90,8% → 96,3%.

### ¿Se conserva la identidad de creación/visión?

**No del todo.** Correlación entre jugadores (12 semillas, mismo instrumento `flow`):

| configuración | creación → AST | visión → AST | creación → cuota de pase | posesiones |
|---|---|---|---|---|
| BT4.4 | 0,35 | 0,29 | −0,06 | 179,1 |
| **BT4.5 final** (`driveValueScale` 1,1) | **0,17** | **0,10** | −0,30 | 177,1 |
| diagnóstico: `driveValueScale` 1,0 | 0,35 | 0,28 | −0,25 | 174,6 |
| diagnóstico: `passLossPoints` 0 | 0,39 | 0,28 | −0,23 | 177,3 |
| diagnóstico: equilibrio de BT4.4 (1,0 / 1,12) | 0,27 | 0,21 | −0,20 | 171,9 |

Con la incertidumbre de ~240 jugadores (error típico ~0,065), la caída del final está fuera del ruido y los diagnósticos la localizan: el aumento de `driveValueScale` de 1,0 a 1,1 hace que los creadores penetren en lugar de pasar. No hay una opción sin coste: con 1,0 vuelve la identidad, pero los triples suben al 66% de los tiros, y eso es justo la ecología que el criterio S no permite recuperar (ver siguiente apartado). Arreglar las dos cosas a la vez exige un cambio estructural (que la decisión penetrar/pasar del creador pese su creación), fuera del alcance de BT4.5.

### ¿Qué ocurre con la ecología de tiro?

Con la completación realista, el juego se iba al perímetro (triples 58% → 66% con `driveValueScale` 1,0), porque las posesiones ya no se cortan a mitad de la circulación. Con 1,1:

| tiros por partido | BT4.4 | BT4.5 |
|---|---|---|
| cuota de triples | 0,58 | 0,60 |
| cuota de aro (restringida + aro) | 0,25 | 0,26 |
| transición | 11,5 | 12,8 |
| catch-and-shoot | 76,4 | 76,8 |
| tras kick-out | 11,0 | 16,0 |
| pull-up | 6,9 | 5,7 |
| bloqueo directo, manejador | 18,5 | 13,8 |
| penetración y finalización | 23,2 | 27,1 |

El jugador principal sigue con el **34%** de los tiros del equipo (BT4.4: 34%). La causa (rol/tendencia) es la misma que en BT4.4 y el pase no la cambia.

Regresión a vigilar: los ataques tempranos suben de 57,6 a 70,5 por partido. Los de transición legítima pasan de 27,7 a 35,5, pero también los falsos, de 24,4 a 30,3. Es consecuencia de que haya más rebotes defensivos que inician posesión (20,1 → 28,8 ataques tempranos tras rebote defensivo).

### Tipos de pase y de jugada

| tipo de pase (BT4.5) | por partido | distancia m | velocidad m/s | pérdida | pérdidas/partido |
|---|---|---|---|---|---|
| REVERSAL | 139,6 | 8,2 | 11,1 | 2,2% | 3,1 |
| SWING | 80,5 | 6,0 | 9,5 | 1,3% | 1,1 |
| OUTLET | 77,0 | 4,3 | 10,8 | 6,2% | 4,8 |
| KICK_OUT | 50,9 | 6,9 | 9,9 | 2,1% | 1,1 |
| SKIP | 41,4 | 13,3 | 16,6 | 7,0% | 2,9 |
| ENTRY | 31,6 | 6,7 | 10,4 | 5,3% | 1,7 |
| TRANSITION_ADVANCE | 15,1 | 7,6 | 11,0 | 15,5% | 2,3 |
| ROLL | 10,8 | 7,6 | 10,7 | 3,1% | 0,3 |
| RESET | 16,6 | 5,8 | 9,5 | 1,0% | 0,2 |

Por jugada, el 58% de las pérdidas de pase (10,6 de 18,1) ocurre en juego no asentado (transición y primera acción), con un 4,7% de pérdida por pase frente al 2,2–2,8% de BALL_SCREEN, DRIVE_KICK y SWING. **El juego no asentado y los pases de contra son la familia que sigue forzando pases.**

**Velocidad del balón.** El pase cruzado ya viaja más rápido (16,6 m/s, frente a 9,4–11,1 del resto), así que no se añadió ningún perfil nuevo. El tiempo de vuelo sigue discretizado en ticks (0,2–0,8 s).

**Movimiento del receptor.** La deriva del receptor a la llegada del balón baja de 0,26 a 0,13 m de media. Los balones sueltos por deriva del receptor bajan de 402 a 71 (12 partidos).

## Sensibilidad

Calibración con 4 semillas sobre el modelo final (`calib-sens45.json`). Con 4 semillas el ruido es de ±2 pérdidas y ±4 posesiones, aproximadamente.

| variante | posesiones | pérdidas | robos | pases | asistencias | puntos/FGA |
|---|---|---|---|---|---|---|
| base | 172,8 | 23,0 | 19,3 | 609,5 | 32,8 | 1,10 |
| `passInterceptMax` −10% / +10% | 174,3 / 175,0 | 23,3 / 24,0 | 19,0 / 17,0 | 605 / 616 | 35,0 / 31,3 | 1,19 / 1,14 |
| `passErrorBase` −10% / +10% | 173,8 / 174,3 | 26,0 / 26,8 | 20,8 / 19,3 | 637 / 590 | 37,0 / 32,3 | 1,16 / 1,12 |
| `passLossPoints` −10% / +10% | 176,8 / 171,0 | 27,3 / 21,8 | 20,5 / 16,8 | 606 / 608 | 33,8 / 36,8 | 1,14 / 1,17 |
| `passValueScale` −5% / +5% | 180,5 / 172,3 | 21,5 / 24,8 | 15,5 / 19,5 | 570 / 654 | 31,8 / 30,3 | 1,14 / 1,09 |

No hay ningún precipicio: los pases se mueven entre 570 y 654 y la circulación no se rompe. El parámetro más sensible es `passLossPoints`, que mueve ±2,7 pérdidas con ±10%. `passValueScale` solo se probó a ±5% (a ±10% ya se sabía del desarrollo que cambia la ecología de tiro).

## Validación visual

Phaser final (`scripts/next/passFrames.mjs`, semilla 31337), 14 pases elegidos del ledger del código final, 7 fotogramas cada uno (capturas en `C:\Users\jorge\Videos\bdm-bt45-passes-final`, fuera del repositorio):

- **Bien:**
  - Las intercepciones son defensores que se cruzan en la línea (reversal cortado por el defensor del poste alto, entrada cortada por la ayuda).
  - El desvío de un pase cruzado se produce en la ayuda del lado débil.
  - Los pases cruzados pasan por encima de la ayuda.
  - Los outlets tras rebote salen rápido hacia la banda.
  - El pase de avance tras canasta encuentra al grande que corre por delante.
  - Ya no se ven balones que cambien de dirección hacia un defensor.
- **Mal:** un "avance de transición" de 0,2 m a un compañero pegado, en un grupo de cuatro jugadores tras un rebote, interceptado por el defensor que está encima. No sale del nuevo selector de contra, que exige progreso, sino de otra ruta. Es un pase que no tendría que existir.
- No se revisaron posesiones completas de principio a fin, solo pases aislados con su contexto (unos 0,7 s).

## Tests y validación

- Tests focales: `matchNextPassEcology.test.ts`, 10 de 10. Se corrigió el umbral del test "defensor ya en la línea", que estaba fijado a 0,1 con el valor anterior de calibración (0,45): ahora se compara con el máximo calibrado y con el mismo defensor a 1,2 m de la línea.
- Match Next, Live/Instant y presentación (`src/engine/match-next`, `src/app/matchNext`, `LiveMatchController.test.ts`, `src/presentation/match-next`): 5 fallos, los mismos 5 que en la base `66b7625` (comprobado en un worktree de la base): `LiveMatchController` "exactly one live sporting step" y cuatro de `matchNext.test.ts` (configuración JSON-safe, canasta y saque, rebotes, y dependencias del motor por el uso de `Map`/`Set`). No los introduce BT4.5. El test de rendimiento de `matchNext.test.ts` falló con la máquina cargada por tres auditorías en paralelo y pasa ejecutado solo.
- Determinismo: los tests de determinismo de Match Next pasan. No hay `Math.random(` en `src/engine/match-next`.
- `npm run typecheck`: sin errores. `npm run build`: correcto (solo el aviso de tamaño de chunk que ya existía).
- No se ejecutó la suite completa.

## Criterios de PASS

| # | criterio | estado |
|---|---|---|
| 1 | taxonomía de pérdidas explicada | sí |
| 2 | taxonomía de robos explicada | sí |
| 3 | selección y ejecución separadas | sí (tres capas en `PassRisk`) |
| 4 | riesgo del carril por geometría y tiempo real | sí |
| 5 | el pasador élite decide mejor | sí (cohorte: 64,5% → 28,8% de pérdidas sin ser la mejor opción) |
| 6 | el defensor élite mantiene impacto | sí en total; débil en los carriles de pase |
| 7 | pérdidas reducidas o justificadas | sí (35,8 → 25,3) |
| 8 | robos reducidos o justificados | **no**: 21,1 → 21,2, intercepciones cambiadas por desvíos |
| 9 | circulación preservada | sí (519 pases vivos) |
| 10 | asistencias preservadas | sí (32,8) |
| 11 | identidad del pasador preservada | **no**: 0,35/0,29 → 0,17/0,10, causa localizada |
| 12 | transición preservada | sí, con más falso ataque temprano |
| 13 | el ritmo mejora por causalidad, no por esperas | sí (180,5 → 175,2) |
| 14 | el PPP no empeora | sí (0,90 → 1,00) |
| 15 | sensibilidad estable | sí (4 semillas) |
| 16 | visualmente los pases parecen baloncesto | sí, salvo el pase de 0,2 m en un grupo |

## ¿Qué sigue impidiendo calidad comercial?

1. **Identidad del creador frente a ecología de tiro.** Hoy se elige entre las dos con un solo parámetro (`driveValueScale`). Hace falta que la creación pese en la elección entre penetrar y pasar.
2. **Reparto de robos y pérdidas de balón muerto.** El 84% de las pérdidas son robos y el desvío en vuelo acaba demasiadas veces en manos de la defensa. Faltan pérdidas de balón muerto (pasos, balón fuera tras desvío).
3. **Juego no asentado.** El pase de avance en transición pierde el 15,5% y su riesgo está infravalorado. El 58% de las pérdidas de pase ocurre antes de montar la jugada. Además, existe una ruta que lanza pases de 0,2 m en grupos de jugadores.
4. **Defensor de carril élite.** El pasador lo evita, así que su ventaja propia en los carriles es pequeña. Necesita anticipación (leer el pase antes del lanzamiento) para tener impacto.
5. **Ritmo.** 175 posesiones está en el borde superior de lo aceptable, y el falso ataque temprano ha subido (24,4 → 30,3).
6. **Equipos muy pasadores.** Con los cinco a 80 de pase, el partido se ralentiza mucho (145 posesiones), lo que sugiere que el valor del pase satura.
