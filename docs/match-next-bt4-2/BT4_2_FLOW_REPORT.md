# BT4.2 · Offensive Flow Recovery — Informe

Rama `match-next-basketball-core-bt4-2-flow`, worktree `C:\BDM-NEXT-TRUTH`. Sin push, PR ni merge.
Auditorías en `src/presentation/match-next/audit/bt42/` (más las de `bt4/` y `bt41/`, todas con `BT2_AUDIT=1`); resultados en `docs/match-next-bt4-2/audit/` y `docs/match-next-bt4-1/audit/`.
Cifras del motor final: 12–16 semillas (identidad: 3 semillas por nivel y cohorte; rosters: 5; sondas de defensa: 3). La tabla de calibración está en `audit/calibration/`.
SHA inicial: `aa942a1` (BT4.1). SHA final y commit: el de este commit (`git log`).

## Estado

| | |
|---|---|
| STATUS TÉCNICO | **PASS**. 1112 tests, solo fallan los 4 base de `matchNext.test.ts`; typecheck y build limpios; Live e Instant deterministas; 16 partidos completos. |
| STATUS FLUJO (transición, pases, segunda oportunidad, identidad) | **PASS con reservas**: la transición vuelve, los pases suben un 62% y las seis cohortes se diferencian. |
| STATUS RITMO | **168,5 posesiones** (objetivo 145–165): **un 2% por encima**. No lo doy por cumplido. |
| STATUS ECONOMÍA | **NO PASS limpio**: FG .37, PPP .94, pérdidas 29, rebote ofensivo 12, triples 49% y reloj de tiro bimodal (ver Limitaciones). |
| STATUS VISUAL | **Pendiente de tu revisión** del clip de la semilla 31337. |

## Qué estaba pasando (medición, en el orden pedido)

Medición inicial sobre `aa942a1` (8 semillas, `flow-base.json`).

**1. Dónde se pierden los pases.** 230 pases por partido, 1,4 por posesión de media cancha, y el 66% de esas posesiones tenían 0 o 1 pase. El 28% de los tiros salía sin ningún pase previo y el 40% con uno solo. Tras una penetración con ventaja el kick-out sí ocurre (88% en 4 s), pero el 43% de las penetraciones acababa directamente en finalización.

**2. Por qué desaparece la transición.** La transición se resolvía como `STOPPED` en el **99%** de los casos y tras un rebote defensivo duraba 0,4 s: con el bloqueo de rebote alrededor, el rebotero siempre tiene un rival a menos de 1,4 m. A los 0,4 s la posesión pasaba a media cancha con el balón junto a su propio aro (primera decisión a **8 s** de mediana). Después, cuando el pase de salida se completaba, el motor repetía el cambio a media cancha en cuanto el nuevo portador tenía un rival cerca, aunque siguiera en campo propio.

**3. Por qué domina la penetración.** Tras un bloqueo el pase estaba desactivado salvo trampa, así que el manejador solo podía tirar o penetrar (513 bloqueos por muestra con una penetración forzada detrás). Además, al hacer coherente el valor de una penetración contenida con la paciencia, la prima de espera (1,4) inflaba su valor: con la penetración elegida su valor era 1,37 contra 0,99 del pase.

**4. Por qué desaparece la identidad del pasador y del manejador.** No era una cadencia común a todos (el tiempo de toque sí difiere con la visión y la creación). Era la tendencia: el pase se desvalora con el uso (`usage`) y la visión solo movía el valor de las miradas un ±12%, así que los jugadores de más rating son los que más tiran y penetran, y las asistencias por 36 minutos las acumulan los de rol (el de más creación tenía 0,96 y los de ratings ~49 tenían 2,4). Con pocos pases el efecto de la visión se perdía en ruido.

**5. Segunda oportunidad de 23 s.** 14 s son la posesión original, antes del rebote; desde el rebote ofensivo hasta el final quedaban 8 s, de los cuales 2,6 s de "reset" y 1,2 s de montaje de bloqueo antes de tirar, con la primera decisión a 2,4 s.

## Qué se cambió

1. **Una transición parada sigue siendo transición hasta que el balón cruza** a campo de ataque, sea cual sea su origen (`transitionHoldsUntilFrontcourt`), y tampoco se pasa a media cancha al completar el pase de salida estando en campo propio.
2. **Pase tras bloqueo** permitido cuando el compañero está mejor situado (`passOffScreen`).
3. **Penetración contenida sin la prima de espera** (`driveContainedPremium` = 0).
4. **La paciencia solo actúa contra una defensa montada**: sin transición viva, sin reset ofensivo pendiente y con tres defensores a menos de 4,5 m de su puesto (`waitGateMode` 3, `defenseSetRadiusMeters`). Prima 2,0; bloqueos a 1,4.
5. **Peso de la visión del pasador** al valorar las miradas de sus compañeros (`passSightSpread` 0,8; antes 0,24), severidad del árbitro de vuelta a 1,0.
6. **Saques de banda:** cerca de la línea de fondo que se ataca la formación se recortaba contra el borde y 8–9 de los 10 jugadores quedaban apilados en ella; ahora el equipo que saca se abre hacia dentro de la pista y la defensa se coloca alrededor del aro. Test nuevo en `MatchEnginePort.test.ts`.
Todos los cambios son interruptores o parámetros de `tuning.ts`; la paciencia sigue siendo un coeficiente calibrado, no una duración.

## Resultados (12 semillas)

| | BT3 | BT4 | BT4.1 | **BT4.2** |
|---|---|---|---|---|
| Posesiones / s por posesión | 228,7 / 9,8 | 213,5 / 10,8 | 165,5 / 14,7 | **168,5 / 14,4** |
| Puntos | 233,7 | 225,4 | 179,5 | 159,0 |
| Tiros / FG% | 226 / .39 | 209,5 / .39 | 158,9 / .41 | 145,9 / **.37** |
| Triples / aro / media | .43 / .19 / .08 | .46 / .30 / .07 | .31 / .52 / .03 | **.49** / .34 / .04 |
| Tiros libres (por tiro) | 28,3 (.13) | 34,8 (.17) | 42,7 (.27) | 34,5 (.24) |
| Faltas / eliminados | 26,3 / 1,6 | 33,8 / 2,8 | 42,2 / 3,8 | 35,8 / 2,7 |
| Pérdidas / robos | 27,8 / 15,3 | 19,6 / 11,8 | 18,2 / 12,3 | **29,0** / 17,5 |
| Pases / asistencias | 484 / 43,8 | 397 / 35,6 | 245 / 15,7 | 396 / **21,6** |
| Penetraciones / bloqueos | 207 / 18 | 150 / 20 | 169 / 59 | **96** / 58 |
| Rebote ofensivo (cuota) | 27,4 (.21) | 21,8 (.18) | 19,3 (.22) | **12,1 (.14)** |
| Tapones | 8,8 | 5,8 | 7,0 | 3,4 |
| PPP | 1,02 | 1,06 | 1,08 | **0,94** |
| Infracciones de 8 s | — | — | 0,3 | 0 |

## Pases (1)

396 por partido (BT4.1: 245; BT4: 397). Pases por posesión de media cancha: media 2,5, mediana 2 (BT4.1: 1,4 y 1). Solo el 43% de las posesiones de media cancha tienen 0 o 1 pase (66%). Tiros sin pase previo: 7% (28%); con 4 o más pases: 24% (6%). Tras una penetración con ventaja, kick-out en 4 s: 89,5%.

## Transición (2)

| Inicio de la posesión | Por partido | 1.ª decisión (mediana) | Cruza a campo de ataque | Tiro en ≤8 s | Primer tiro |
|---|---|---|---|---|---|
| rebote defensivo | 71,7 | **0,9 s** (BT4.1: 8 s) | 3,5 s | **33%** (11–15%) | 13,8 s |
| tras canasta | 63,8 | 4,5 s | 4,5 s | 34% | 14,1 s |
| robo | 17,5 | 3,6 s | 2,0 s | 36% | 12,7 s |

Los tiros de creación TRANSITION son el 17% del total (BT4.1: 2,8%) y 24,8 por partido (BT4.1: 4,5; BT4: 22,1). La contra tiene un primer tiro a 4,9 s de media.

## Utilidades (3)

Utilidad media de las opciones: tirar 0,80, penetrar 0,76, pasar 1,12, esperar 1,00, bloqueo 0,29. Decisiones elegidas: pase 44%, penetración 20%, catch-and-shoot 15%, bloqueo 12,5%, kick-out 5%, tiro 3%. El pase supera a la penetración en el 77% de las lecturas (antes 53% con una penetración elegida en el 39%). Penetraciones: 96 por partido (BT4: 150, BT4.1: 169).

## Identidad (4) — cohortes 25 / 50 / 85 (3 semillas)

| Cohorte | Señal | 25 | 50 | 85 |
|---|---|---|---|---|
| Tirador | cuota de triples / pps | 0,20 / 0,75 | 0,50 / 0,67 | 0,65 / 1,17 |
| Pasador | asistencias / pases | 3,0 / 129 | 7,7 / 165 | **18,3 / 280** |
| Manejador | penetraciones / pérdidas / tiros libres | 34 / 28 / 8,0 | 38 / 24 / 9,3 | 52 / 12 / 16,0 |
| Finalizador | cuota al aro / tiros libres | 0,14 / 7,7 | 0,18 / 16,0 | 0,37 / 19,7 |
| Protector | intentos rivales al aro / faltas | 36 / 27 | 31 / 24 | 16 / 14 |
| Rebotero | rebote ofensivo / cuota | 2,3 / .06 | 3,7 / .10 | 7,7 / .16 |

Reservas: el manejador no genera más asistencias (10,7 / 15,3 / 12,3); el FG rival del protector en el aro no es monótono (.46 / .56 / .52) y sus tapones se quedan en 1,3.
Rosters (5 semillas): el de pase da **16,2 asistencias frente a 11,0** (en BT4.1 no mejoraba); el defensivo deja al rival en 16,2 intentos al aro (27,4); el reboteador sube el rebote ofensivo de 4,8 a 8,0; el de aro llega a 22 tiros libres; el de tiro lanza el 85% de triples.
Correlaciones por jugador (16 partidos, 12 regulares): tiro→triples 0,71, uso→tiros 0,70, rebote→rebotes 0,90, interior→tapones 0,62, rimAttack→tiros libres 0,38, ballSecurity→pérdidas **+0,48** (signo contrario al esperado), creación→asistencias **−0,40** y visión→asistencias **−0,27**: **a nivel de plantilla las estrellas siguen repartiendo menos** (31 tiros por 36 minutos para el de más uso); la identidad del pasador solo se ve cuando se aísla su rating.

## Segunda oportunidad (5)

10,8 por partido, duración media 22,7 s (BT4.1: 23,1). El reparto es 14,2 s antes del primer rebote ofensivo y 8,5 s después. Tras el rebote ofensivo: primera decisión a **0,9 s** (2,4 s), próximo tiro a 5,6 s, reset ofensivo de 0,9 s por posesión (2,6 s) y montaje de bloqueo de 0,6 s (1,2 s). 2,0 tiros por posesión con segunda oportunidad. La duración total sigue siendo larga porque cuenta la posesión original completa.

## Ritmo y reloj de tiro

Duración: <4 s 6,9%, 4–8 s 20,3%, 8–12 s 13,1%, 12–16 s 13,7%, 16–20 s 23,2%, >20 s 22,7%. Posesiones cortas (<8 s): 45,9 por partido; las legítimas (contra, robo) son el 41% y las pérdidas antes del tiro el 33%.
Reloj restante al soltar el tiro: 24–20 s 4,8%, 19–15 s 35,6%, **14–10 s 9,9%**, **9–5 s 37,2%**, 4–0 s 12,6%. Violaciones de 24 s: 0,9 por partido.

## Defensa, subida y saques

Distancia media del defensor a su par: 2,84 m; a más de 3 m el 34%; persigue el 2,5%; órbitas 0,1%. Infracciones de 8 s: 0; el balón llega a campo de ataque en 3,3 s de media (máx 6,9 s). Acarreos largos sin pase: 97 por partido (incluyen la subida), con el defensor a 1,1 m de media y el 58% termina en tiro. Saques con 6 o más jugadores en una línea de fondo: 0 de 279 (antes casos de 8 y 9).

## Partidos extremos (16 partidos, todos completos)

Puntos: media 157 (p10 141, p90 177; mín 130, máx 196); posesiones 168 (162–177; 150–181). Más puntos: 196 (semilla 14): +31 por suerte de tiro, +7 por faltas. Menos: 130 (semilla 19): −26 por suerte de tiro. Menos posesiones: 150 (−17 por volumen, compensado con +14 de suerte de tiro). Más tiros libres: 51 (+12 por faltas). Ninguno se reduce a "RNG": siempre volumen, suerte de tiro, faltas, pérdidas y rebotes.

## Tests

- 1112 tests, 4 fallos base de `matchNext.test.ts` (no los toca BT4.2). `npm run typecheck` y `npm run build`: OK.
- Adaptados por diseño (cada uno por una causa propia): reloj tras canasta de campo y organización del saque (el primer "balón muerto por canasta" puede ser un tiro libre), cadena de acciones y pases tras bloqueo, y el umbral de robustez del reparto de tiro (una partida de ~60 tiros mueve la cuota varios puntos).
- Nuevo: saque de banda sin apilados en la línea de fondo.

## Adenda: marcaje y patinaje (revisión visual de la persona usuaria, semilla 31337)

Dos fallos vistos en el partido:
- **"Un jugador se va hasta el otro campo".** El defensor 08 recorría 10 m del aro (x=4) al centro (x=14) y volvía, porque su par asignado era un atacante rezagado en su propio campo. Los objetivos de marcaje no tenían límite respecto al balón. Ahora un defensor que no está sobre el balón no toma un puesto más lejos de su aro que el balón más 1,5 m (`goalSideMarginMeters`), así que no sigue a un rezagado al otro campo. En el mismo tramo los cinco defensores se repliegan de forma monótona (el 08 baja de x=18,5 a 2,7 y se queda).
- **"El defensor azul patina".** Todos los defensores corrían mirando al balón (orden de orientación fija) y sin penalización por ir de espaldas o de lado. Ahora, con más de 3 m por recorrer, corren mirando hacia donde van (`defenderTravelFacing`), y el motor penaliza la velocidad máxima al ir de espaldas (60%) y algo menos de lado (~85%) (`backpedalSpeedFactor`, en el perfil de cada jugador). Fotogramas de defensores a >3 m/s de espaldas: 4,5% → 3,1%; deslizándose de lado: 3,7% → 2,4%.

Economía con todo encendido (4 semillas): 168,5 posesiones, 174 puntos, FG .40, PPP 1,16, 25 pérdidas (27,5), 23 asistencias, triples 46%, aro 41%, 38 tiros libres. Los tests del puerto del motor que dependían de qué primer tiro entra se adaptaron (un tiro con falta ya no cuenta como "tiro de campo" en el helper).
Limitación: las cifras de esta adenda son de 3–4 semillas; no he repetido la cadena completa de auditorías con estos dos cambios.

## Limitaciones restantes

1. **Ritmo a 168,5** (2% sobre el rango) y con un reloj de tiro **bimodal**: el 36% de los primeros tiros sale con 19–15 s, solo el 10% con 14–10 s y el 37% con 9–5 s. La paciencia acaba de golpe cuando el valor de seguir cae por debajo de lo que ofrece el tiro; un partido real tiene una masa central.
2. **Economía por debajo de un partido real**: FG .37 (real ~.45), PPP 0,94, 159 puntos, **29 pérdidas**, **12 rebotes ofensivos** (real ~20), 3,4 tapones y **triples al 49%**. Los pases extra han cobrado su peaje: más pérdidas y menos eficiencia.
3. **Identidad a nivel plantilla sin cerrar**: creación→asistencias −0,40 y visión→asistencias −0,27; las estrellas siguen tirando (31 tiros por 36 minutos) y el manejador no genera asistencias.
4. La paciencia es un coeficiente calibrado (2,0), no una duración; la regla de 8 s sigue sin conectarse a las reglas por competición (NCAA 10 s).
5. Sensibilidad ±5%/±10% **no** medida sobre estos valores finales.
6. Solo defensa individual en media cancha; presión, caja +1 y zonas son trabajo futuro.
7. Visual pendiente: ver el clip (`C:\Users\jorge\Videos\bdm-bt42-final-seed31337\`).

## Respuestas a las preguntas de la medición

- **¿Dónde se perdían los pases?** En el tiro al primer pase (28% sin pase), en la penetración que acababa directamente en finalización (43%) y en el bloqueo, que forzaba una penetración detrás.
- **¿Por qué desaparecía la transición?** Se resolvía como "parada" en 0,4 s y la posesión pasaba a media cancha con el balón en su aro.
- **¿Por qué dominaba la penetración?** Bloqueo con pase desactivado y valor de la penetración contenida inflado por la paciencia.
- **¿Por qué se perdía la identidad del pasador?** Tendencia por uso y una visión que apenas movía el valor de pasar; con pocos pases quedaba en ruido.
- **¿Un OREB reinicia una posesión completa?** Ya no: el reset baja de 2,6 s a 0,9 s y la decisión llega a 0,9 s; la posesión sigue pareciendo larga (22,7 s) porque cuenta la posesión original completa (14 s).
- **¿Qué impide todavía la calidad comercial?** 1) La economía (FG .37, 29 pérdidas, 12 rebotes ofensivos, 49% de triples); 2) el reloj de tiro bimodal; 3) la identidad por plantilla (las estrellas no reparten); 4) el visual sin revisar y 5) sensibilidad sin medir ni variantes defensivas.
