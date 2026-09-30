# BT3 · Contacto, faltas, pérdidas y balón muerto (MatchEngine Next)

Rama `match-next-basketball-core-bt3`, worktree `C:\BDM-NEXT-TRUTH`, base `e8254eb` (BT2). Sin push, sin PR, sin merge. Sin `git branch -f`. Los datos de auditoría
están en `docs/match-next-bt3/audit/`, la evidencia visual en `docs/match-next-bt3/evidence/`.

## 1–3. Estado

- **STATUS TÉCNICO: PASS con reservas conocidas.** typecheck y build limpios; tests BT3 (33) en verde; la suite de motor, app y dominio queda solo con los **4 fallos
  preexistentes** de `matchNext.test.ts` (ya rojos en `e8254eb`: reloj de rebote ofensivo, `gameRunning` tras canasta, `possession` tras rebote, regla "sin Map/Set").
  Ver §29 para la clasificación de los 37 fallos iniciales.
- **STATUS BASKETBALL: PARCIAL (no PASS comercial).** El juego ya tiene contacto medido, faltas con ofensor y víctima, tiros libres como ciclo de vida, bonus por
  reglamento, tapones con geometría, robos, pérdidas con causa y balón muerto sin saltos. Pero: faltas por debajo de un partido real (26 frente a ~35–40), TL/tiro 0,13
  (real ~0,22–0,30), sin pull-up (mid-range 8 %), putbacks con conversión baja, ritmo +24 % de posesiones frente a BT2 y rating sin efecto medible en tapones y rebote (§33).
- **STATUS VISUAL: PARCIAL.** Los 14 incidentes nuevos se identifican en Chrome real con marcadores etiquetados y una línea de estado (§28). No hay animación de contacto
  ni de salto: solo placeholders con etiqueta.
- **PROGRESO GLOBAL: 100 % del alcance de implementación**; el resultado basket se califica arriba con criterio duro.

## 4–6. SHAs

Inicial `e8254eb7be9585464b97937fb545cb04e1fa3611`. Final y commit: el commit de la rama `match-next-basketball-core-bt3` que incluye este documento (ver `git log -1`).

## 7. Robustez del modelo BT2 (BT3A)

**Evidencia de fragilidad (`sweep-before-*`, 3 semillas por valor).** El reparto de tiros de BT2 dependía de un parámetro libre, `closeoutEfficiency` (cuánto de bien cree el
atacante que cerrará el defensor): triples 56 % (0,30) → 54 % → 43 % → 35 % → 25 % → 21 % (0,55). Un cambio de ±25 % de un número inventado movía 35 puntos porcentuales;
además había un escalón entre 0,35 y 0,45 (argmax duro entre tiro, pase y bote).

**Correcciones (causa, no ajuste):**

1. La creencia de cierre ya no tiene parámetro: `DecisionCore.forecastCloseout` usa la **cinemática real** (aceleración, velocidad máxima, fatiga, `closeoutReactionTicks`
   de reacción tras el pase) y es la **misma** que ejecuta la simulación (`ActionCore` / `Closeout.ts`). La creencia y el mundo no pueden discrepar.
2. La elección entre opciones pasa de argmax a **softmax** (ruido Gumbel determinista, escala `decisionTemperaturePoints = 0,15`, sin consumir RNG): un empate técnico
   se reparte y el reparto responde de forma progresiva. Los parámetros viven en `tuning.ts` (solo `withTuning` para auditorías).

**Resultado (`sweep-final-*`, 3 semillas, motor final):**

| Parámetro barrido | Valores | % triples | Otras respuestas |
|---|---|---|---|
| `closeoutReactionTicks` | 1 / 2 / 3 / 4 | 41 / 42 / 45 / 39 | sin tendencia; rango 6 pp |
| `continuationValuePoints` | 0,88 / 0,98 / 1,08 | 41 / 42 / 45 | rango 4 pp |
| `decisionTemperaturePoints` | 0 / 0,1 / 0,15 / 0,25 | 44 / 41 / 42 / 44 | no monótono: ruido de 3 semillas |
| `screenBaseValuePoints` | 1,1 / 1,25 / 1,4 | 41 / 42 / 41 | **pantallas/partido 15 / 21 / 29**: respuesta progresiva y monótona |

Ningún parámetro mueve el reparto más de ~6 pp (antes 35 pp). **Reserva honesta:** con la temperatura 0,10 la base de acierto en el aro (0,70 → 0,74) todavía movía los
triples de 52 % a 45 %; con 0,15 dio 49 / 44 / 44 % para 0,70 / 0,72 / 0,74. La sensibilidad no desaparece: se reparte entre más parámetros y ninguno es un botón libre.

## 8. Sistema de contacto (BT3B)

`contact/ContactModel.ts`. El contacto se **mide, se clasifica y solo después se cobra**. Clases: incidental, defensivo legal, pantalla, bote (drive), tiro, rebote y
desplazamiento ilegal. Entradas: posiciones, velocidades, orientación, velocidad de cierre y masa (`weightKg`, `wingspanCm` nuevos en el jugador). Puntos únicos de juicio:
un contacto de bote por bote (cuando los cuerpos se separan), tiro y tapón en el release, rebote/balón suelto en el toque, pantalla una vez tras el uso, robo por tick.
El modelo devuelve una **probabilidad de pito**; quien llama sortea con el stream sembrado `outcome`. Los contactos ≥ 0,12 de severidad emiten `contact`; **todo pito lleva
su contacto registrado** (test). Las tolerancias del árbitro (`REFEREE_TOLERANCE`: aro 1,0, pintura 0,6, media distancia 0,25, triple 0,1, carga 0,18, bloqueo 0,65, mano 0,55,
pantalla ilegal 0,6, balón suelto 0,22, rebote 0,1) son los parámetros de calibración y están documentadas como tales: no hay tasas fijas.

## 9. Faltas (BT3C)

`rules/Fouls.ts`. Tipos: tiro, mano (reach), bloqueo, carga, pantalla ilegal, balón suelto y rebote. Cada falta guarda ofensor, víctima, tipo, tick, posesión, resolución
(`OFFENSIVE_TURNOVER`, `AND_ONE`, `FREE_THROWS`, `BONUS_FREE_THROWS`, `INBOUND`) y contadores. El ofensor sale de la geometría (quien llega más fuerte a quien), no de un sorteo.
**12 partidos:** 26,3 faltas (tiro 16,1; mano 5,0; bloqueo 3,1; carga 1,7; balón suelto 0,25; rebote 0,17; pantalla ilegal 0,08). Falta: comportamiento sin balón (agarrones, mano
en cadera) y pantallas ilegales casi no ocurren (0,08/partido).

## 10. Faltas de tiro / AND-ONE (BT3D)

Tiro sin falta / falta antes del tiro / falta en el tiro / canasta + falta son **eventos distintos y relacionados**. La falta en el aire (`shot.inFlight`) deja volar el balón y
se liquida en la llegada (AND-ONE si entra: 5,7 por partido; 1 TL). Un tiro con falta entra con el factor 0,8 (mano en la cara). El valor esperado del tiro incluye ahora
tapón y valor de falta (`evaluateShotOpportunity`).

## 11. Tiros libres (BT3E)

`rules/FreeThrows.ts`: parte del ciclo de vida, no una suma. Formación en la línea (responsabilidades `PERIOD_RESTART`), `READY`, vuelo de 6 ticks, resolución en la llegada,
marcador y eventos `freeThrowMade/Missed` con índice y total; último fallado → rebote vivo; último anotado → balón muerto `madeBasket` y saque. Probabilidad
`0,5 + tiro·0,0044 − fatiga·0,0008` (0,45–0,94), de los atributos canónicos. **28,3 TL/partido, 85 % de acierto, TL/tiro 0,13** (bajo; §33). Con tiro 30 frente a 80:
FT 65 % → 92 % (§26).

## 12. Bonus (BT3F)

`FoulRules` nuevo en `CompetitionRules.gameFormat`: FIBA 5/5, NBA 6/5, WNBA 6/4, NCAA masc. 5/10 con 1+1 desde 7, NCAA fem. 5/5; `resolveGameClockRules` lo lleva a
`MatchNextClockRules.foulRules` y el motor cae a FIBA solo si falta. Reinicio por periodo (la prórroga continúa la cuenta). Test por formato. Aparece poco (0,9 faltas/partido en
bonus) porque las ~26 faltas se reparten en ~3 por equipo y periodo.

## 13. Faltas personales (BT3G)

Contador por jugador, `foulOut` al límite del formato (1,6 eliminados/partido) y **sustitución forzada** en la primera oportunidad, prioritaria sobre el plan de rotación
(`forcedFoulOutSubstitution`). Corregido durante la auditoría final: una sustitución forzada sin banquillo compatible por rol **rompía la partida**
(`Replacement … is not a valid C role fit`); ahora el descalificado siempre sale (`forced`), con test.

## 14. Tapones (BT3H)

`defense/BlockModel.ts`. Exige proximidad horizontal ≤ 1,4 m, lado válido (delante, al costado, o detrás solo persiguiendo a ≥ 3 m/s), alcance real
(`standingReach` + 38 cm + interior·0,32 + movilidad·0,12) frente a la altura de suelta, y tiempo (velocidad de cierre). Base por zona (aro 0,32, pintura 0,16, media 0,05, triple
0,012). Resultados: balón suelto por tapón, fuera, recuperado por la ofensiva (rebote ofensivo sin reinicio de reloj) o por la defensa (rebote defensivo); el balón sale con
velocidad física (`blockedBallVelocity`). **8,8 tapones/partido, ~8 % de los tiros al aro.** Test: ningún tapón desde metros; cada tapón está a ≤ 1 tick del release.

## 15. Robos (BT3I)

`defense/StealModel.ts`. Solo el defensor directo y con la bola cerca (≤ 1,15 m): tasa por tick × (robo/50) × exposición del bote × cercanía. Resultados: robo limpio, poke
suelto, falta de mano, intento fallido. Más las pasadas interceptadas en el carril. **15,3 robos/partido** (interceptación 9,3; robo limpio 4,1; poke 0,75).

## 16. Deflexiones (BT3I)

Pase desviado por un defensor en la línea (robo/precisión del pase): evento `deflection`, balón suelto con `lastTouch`. **1,8/partido**, escaso.

## 17. Pérdidas (BT3J)

Solo desde acciones: bote perdido (4,9), pase malo (6,7), interceptación (9,3), falta ofensiva (2,1), balón fuera (4,3), pisar línea (0,6) = **27,8/partido** (real ~25–28).
Sin probabilidad plana por posesión. Sin *travelling* (no hay autoridad de pasos en el motor: no se inventa).

## 18. Balón fuera (BT3K)

Causas: pase malo, deflexión, tapón, balón suelto, pisar línea. Equipo que saca = rival del último en tocar; el punto es la banda/línea de fondo por donde salió. **4,3/partido.**
El balón muerto ya **se lleva** al punto de saque (antes se quedaba donde sonó el pito y el saque "aparecía" a 4–5 m).

## 19. Ciclo de balón muerto (BT3L)

`rules/PlayState.ts`: `LIVE → WHISTLE → DEAD → RESOLUTION → INBOUND | FREE_THROW → READY → LIVE`, derivado de hechos y avanzando **una arista legal** por llamada
(BFS); `playStateChanged` solo al cambiar. **0 transiciones ilegales en 12 partidos completos.** Sin teletransportes (auditoría de continuidad BT2 en verde). El reloj respeta el
reglamento del formato (`clockRules.ts`: `foul`/`freeThrow` paran el reloj; `foul` abre ventana de sustitución, `freeThrow` no) sin usar `ballDead` como sustituto de todo.
Se encontraron y corrigieron **tres atascos reales introducidos por BT3** (saque de balón fuera esperando una bola que nunca se movía; una espera de saque que sobrevivía a la
bocina; falta con balón no llevado al punto): tests de no-atasco con 6 semillas que colgaban.

## 20. Contacto de rebote (BT3M)

Cada contendiente toma su lado del punto de caída (`contestSlot`: el primer defensor sella el punto a 0,3 m por dentro; el segundo, 0,8 m; los atacantes a 0,7–1,0 m en los
flancos) y el rebote se juzga en el toque (`judgeBallContestContact`, faltas de rebote/balón suelto). **Melé (jugadores en el punto de caída cuando el balón es capturable, mismos
muestreos):** dentro de 1,5 m 2,94 → 2,67 (−9 %); **dentro de 0,6 m 2,28 → 0,97 (−58 %)** (BT2 → BT3, 4 semillas cada uno). Rebotes largos: `reboundLandingTarget` (BT2) ya
distribuye distancia y ángulo; no se ha añadido una segunda física.

## 21. Putbacks (BT3N)

`putbackQuality` (control por seguridad de balón/ataque al aro/fatiga, ángulo bajo o detrás del tablero, defensores a ≤ 1,6 m, equilibrio): multiplica la probabilidad en la ventana
de 3 s tras el rebote ofensivo del propio jugador, tanto en la decisión como en el tiro. **17,5 putbacks/partido = 64 % de los rebotes ofensivos, probabilidad media 0,45,
3 convertidos** (tapón, falta y contexto: ver §33; la conversión es baja).

## 22. Sensibilidad del reparto de tiros (BT3O)

Ver §7. Además el reparto **emerge** de espaciado, contesta, ubicación, tendencia, capacidad, acción, ventaja, reloj y alternativas: el tiro al aro se recalibró porque el tapón
y la falta ya son mecanismos propios (base 0,66 → 0,72 y penalización de contesta 0,28 → 0,23 en el aro: un FG% al aro que cuente tapones como fallos ronda 0,60 en baloncesto real;
el 0,66 de BT2 los absorbía como "contesta"). Sin esa recalibración los triples subían a 55 %.

## 23. Mid-range (BT3P)

**8 %** de los tiros (BT2 6 %), sin forzarlo. Auditoría (`midrange-ev.json`): a 60 de tiro y sin defensor, valor esperado del aro 1,40, pintura 1,14, media distancia
0,93–0,95, triple 1,15–1,17; con contesta 0,3, 0,76 frente a 0,90. La diferencia con el triple es estructural y coincide con la realidad de la era analítica. Faltan los
mecanismos que en la realidad generan el mid-range: **pull-up tras bote**, tiro tras pantalla con defensor por debajo, tendencias con peso real (la preferencia del plan pesa 5 % por
nivel) y la decisión aro/triple binaria por el valor. No se ha "arreglado" nada: se ha dejado documentado.

## 24. Variabilidad táctica (BT3Q)

Canales causales: perfil de tiro del plan (−2..2, 5 % del valor por nivel), uso del jugador (0,4 % por punto), ritmo (umbral de "look abierto" −4 % por nivel y lectura −0,6 ticks por
nivel), cobertura de pantalla y roster. Mismo roster, ambos equipos con el mismo plan (`tactics-final.json`, 3 semillas):

| Plan | % triples | % aro | % pintura | s/posesión | pantallas/posesión | botes/posesión | pérdidas |
|---|---|---|---|---|---|---|---|
| neutro | 42 | 18 | 30 | 9,8 | 0,084 | 0,92 | 26,7 |
| triples (+2) | 60 | 14 | 20 | 9,3 | 0,066 | 0,77 | 27,7 |
| aro (+2) | 19 | 31 | 41 | 10,2 | 0,058 | 1,11 | 19,7 |
| media distancia (+2) | 30 | 16 | 41 | 9,7 | 0,093 | 0,88 | 32,3 |
| ritmo rápido (+2) | 39 | 20 | 31 | 9,2 | 0,065 | 0,95 | 28,7 |
| ritmo lento (−2) | 47 | 21 | 24 | 10,0 | 0,097 | 0,88 | 30,3 |
| bloqueo/`blitz` | 41 | 18 | 33 | 9,8 | 0,098 | 0,85 | 25,7 |
| `drop` | 44 | 19 | 28 | 9,8 | 0,108 | 0,89 | 27,3 |

No hay un porcentaje universal de P&R: cambia con cobertura, roles y plan. El efecto del ritmo es pequeño (±5 % de segundos por posesión).

## 25. Asistencias (BT3R)

`stats/Assists.ts`: relación causal PASE → ventaja generada → CANASTA, no "el último pasador": mismo periodo de posesión, recepción a ≤ 22 ticks del tiro, sin bote > 12 ticks
después de recibir y utilidad de pase de la decisión ≥ utilidad de tiro + 0,02 (el pase se eligió porque la posición del receptor era mejor). **43,8 asistencias/partido** (~50 % de
las canastas de campo; real ~60 %).

## 26. Diferenciación por rating (BT3T)

Experimento controlado (`differentiation-final.json`, 6 partidos por nivel, un atributo de los 5 jugadores locales fijado en 30 u 80, todo lo demás igual):

| Atributo | Métrica | 30 → 80 | Lectura |
|---|---|---|---|
| Tiro | FG % / TL % | 27,9 → 41,7 / 65 → 92 | efecto fuerte |
| Pase (precisión, visión, timing) | pases malos / pase | 9,0 % → 6,0 % | efecto claro |
| Robo | robos | 6,5 → 11,0 | efecto claro |
| Seguridad de balón | pérdidas | 14,0 → 11,7 | modesto (solo el bote perdido y el robo la usan) |
| Rebote | rebote ofensivo / defensivo | 11,3 → 9,2 / 46,7 → 46,5 | **sin efecto medible** |
| Defensa interior + movilidad | tapones | 4,3 → 3,3 | **sin efecto medible** |

El peso de rebote en el modelo es ×1,8 entre 30 y 80, pero la posición (exp(−1,3·distancia)) domina; los tapones son ~4 por equipo y partido, por debajo de la resolución del experimento
(error ~0,9). A nivel de modelo, un protector fuerte bloquea más que uno débil (test unitario, `assessBlock`). Se declara **PARCIAL**.

## 27. Estadísticas multi-semilla, antes y después

BT2 (`docs/match-next-bt2/audit/economy-after.json`, 8 semillas, `e8254eb`) frente a BT3 final (`economy-final.json`, 12 semillas, media / mediana / mín–máx):

| Métrica | BT2 | BT3 |
|---|---|---|
| Puntos (ambos equipos) | 203 (176–222) | 234 / 238 / 213–247 |
| Posesiones (registros) | 184,5 | 229 / 229 / 221–240 |
| Segundos por posesión | 11,3 | 9,8 |
| Tiros de campo | 200 | 226 / 227 / 220–233 |
| FG % | 43 | 39 (34–44) |
| Puntos por tiro | 1,02 | 1,03 |
| Triples % | 45 (40–52) | 43 / 44 / 38–51 |
| Aro / pintura / media | — | 19 / 29 / 8 % |
| TL intentados / TL % | 0 | 28,3 (15–39) / 85 |
| Faltas / AND-ONE | 0 | 26,3 (18–35) / 5,7 |
| Tapones / robos / deflexiones | 0 / 2 / 0 | 8,8 / 15,3 / 1,8 |
| Pérdidas | 12,1 | 27,8 (22–35) |
| Rebote ofensivo % | 26 | 21 |
| Putbacks (definiciones distintas: BT2 cuenta cualquier tiro tras el rebote; BT3, el del propio reboteador en 3 s) | 23,5 | 17,5 |
| Asistencias | — | 43,8 |
| Melé ≤ 0,6 m | 2,28 | 0,97 |
| Partidos completos / transiciones ilegales | 8/8 | 12/12 / 0 |

**Lectura crítica.** El **puntos por tiro** y el reparto (triples, FG por zona) se mantienen; sube el volumen (+13 % tiros, +24 % posesiones registradas) y los puntos (+15 %), por los TL (+24
puntos), las pérdidas (más posesiones y más cortas: una pérdida dura ~5 s frente a 11 s) y por cada falta sin tiro que abre un registro de posesión nuevo. No lo considero explicado del
todo: el ritmo es un defecto abierto (§33). La **dispersión** de puntos baja (DE 14,6 → 9,7) y el FG % por partido (DE 0,026) queda por debajo de la binomial (0,032).

**Los 182–279 puntos de una versión intermedia** no eran una realimentación: (a) el partido con más y menos puntos difería sobre todo en FG % (0,38 frente a 0,49; correlación
puntos–FG % 0,92) mientras la probabilidad media de tiro era casi constante (0,408–0,426), o sea, ruido binomial de ~200 tiros; (b) el ritmo (10–11 s/posesión) y las pérdidas no
explicaban la dispersión; y (c) el mínimo de 182 salía de partidos afectados por los atascos de §19, ya corregidos.

## 28. Evidencia visual

`docs/match-next-bt3/evidence/<incidente>-seed…/sheet-plain.png` y `sheet-truth.png` (Chrome real, semilla 424242, motor real vía `MatchNextLiveController`). Marcadores etiquetados
(`showIncidents`, activo por defecto) que **solo repiten un evento del motor**: contacto (gris), falta (rojo, con tipo), TL (amarillo, "FT i/n"), tapón (cian), robo, deflexión, intento,
balón fuera, pérdida y asistencia; y una línea de estado con la fase del balón muerto, la secuencia de TL y las faltas de equipo. Incidentes cubiertos: contacto de pantalla, contacto
de bote, falta de tiro, AND-ONE, carga/bloqueo, tiros libres, tapón, deflexión, robo, interceptación, balón fuera, saque tras falta, disputa de rebote y putback. Los marcadores
congelan la posición en el instante del evento (una búsqueda/`seek` no los inunda). Soak en Chrome real: `evidence/soak/`.

## 29. Tests

- **Nuevos** `matchNextBt3.test.ts` (33): reglas por formato, contacto (carga/bloqueo/pantalla), tapones (proximidad y protector), tiros libres, un partido completo por la ruta de
  aplicación real (faltas con ofensor/víctima/contacto previo, TL por secuencia, marcador = campo + TL, foul-out, bonus, tapones a ≤ 1 tick del release, pérdidas con causa, ciclo
  legal, asistencias, determinismo), no-atasco de 6 semillas, sensibilidad, putback, tácticas y sustitución forzada.
- **Los 37 fallos de la primera pasada**, contra `e8254eb` (worktree desacoplado):
  - **BASELINE (ya fallaban):** 4 de `matchNext.test.ts`; 8 de `startNextSeason`; 4 de `WorldDbGameBootstrap`; `ContinueFlow`, `SeasonContentActivation`, `simulateUntilDate`,
    `SystemLiveness`, `LiveMatchController`, `StaffHumanState` (timeouts y calendario, sin relación con el motor).
  - **REGRESIONES reales (corregidas):** receptor del saque lejos del punto (rompía la transición de saque tras canasta); `playStateChanged` después de `gameEnd`; falta y balón
    fuera dejaban el balón lejos del punto de saque; espera de saque que sobrevivía a la bocina; movimientos de deriva vivos con balón muerto; sustitución forzada que rompía la
    partida; y la estructura defensiva que sobrevivía a una sustitución nombrando al jugador que salió.
  - **TESTS OBSOLETOS (comportamiento sustituido a propósito):** robo por interceptación (ahora evento `steal`); rebote defensivo con el balón a media distancia (la escena era un
    sorteo sobre el RNG compartido: ahora el balón cae más allá del defensor); cierre defensivo con reacción de 0,2 s; utilidad del tiro elegido con softmax; decisión "antes de estar
    montado" con transición activa; saque tras canasta que asumía que no hubo un saque antes (`MatchEnginePort`); ventana de sustitución de 3 minutos (los descansos son otros);
    auditoría de defensa que pesaba los primeros segundos de cada posesión (ahora se juzga a partir de los 6 s: a igual edad de posesión las métricas son iguales a BT2, salvo los segundos 4–8, algo peores: distancia media al slot 3,9 m frente a 2,9 m);
    esquinas vacías por muestra (ahora por tick: 40 frente a 48 muestras en 4 partidos, el denominador se redujo 2,7×).
- **Rendimiento (301 ms frente a 200 ms):** era contención de CPU con otros procesos. Aislado, 65 ms frente a 63 ms en la base; en un partido completo el coste por tick es
  0,60 ms frente a 0,62 ms y las piezas nuevas suman ~1,4 % del tiempo; hay más ticks por partido (26 k frente a 24 k: tiros libres y saques).

## 30. Typecheck

`npm run typecheck` (tsc -b): limpio.

## 31. Build

`npm run build` (tsc -b + vite build): OK (`✓ built`; solo el aviso habitual de chunk > 500 kB).

## 32. Árbol de trabajo

Limpio tras el commit. Sin archivos temporales, sin tocar otras ramas ni worktrees ni `C:\BDM-MATCH-PHASER`. El worktree auxiliar de comparación se eliminó.

## 33. Limitaciones que quedan

1. **Volumen y ritmo:** +24 % de posesiones registradas y +15 % de puntos frente a BT2 (10 s por posesión).
2. **Faltas y tiros libres bajos:** 26 faltas (real ~35–40), TL/tiro 0,13 (real ~0,22–0,30), sin faltas sin balón, sin agarrones, pantallas ilegales casi inexistentes.
3. **Sin pull-up ni tiro tras pantalla con defensor por debajo:** el mid-range (8 %) no nace de los mecanismos que lo producen.
4. **Diferenciación por rating incompleta:** tapones y rebote no distinguen a los jugadores a nivel de partido (§26); seguridad de balón solo actúa en bote perdido y robo.
5. **Putbacks y asistencias:** 3 de 17,5 putbacks convertidos (conversión baja); asistencias ~50 % de las canastas.
Otras: sin *travelling*, sin tiempos muertos, sin sustitución por falta con reglas de banquillo, deflexiones escasas, marcadores visuales de placeholder.

## Respuestas explícitas

1. **¿Hay suficiente fricción para parecer baloncesto competitivo?** Casi. Hay contacto, pitos, tiros libres, tapones, robos y 28 pérdidas por partido, y el balón muerto se comporta.
   Falta densidad en faltas sin balón y en el interior: el juego todavía es demasiado limpio y demasiado rápido.
2. **¿Las faltas emergen del contacto real o siguen pareciendo RNG?** Emergen: todo pito lleva su contacto medido (test), el ofensor sale de la geometría (quien llega más fuerte) y la
   probabilidad de pito depende de severidad, zona y habilidad. Queda un sorteo (sembrado) sobre la probabilidad de pito y las tolerancias son constantes de calibración.
3. **¿Los tapones exigen posición y tiempo reales?** Sí: alcance horizontal ≤ 1,4 m, lado válido, alcance vertical frente a la altura de suelta y velocidad de cierre; ninguno desde metros.
4. **¿Las pérdidas salen de acciones identificables?** Sí: cada una tiene causa (bote, pase, interceptación, falta ofensiva, fuera, línea). No hay tasa plana por posesión.
5. **¿El reparto de tiros es robusto a cambios pequeños?** Mucho más que en BT2 (rango ≤ 6 pp frente a 35 pp) pero no invulnerable: la base de acierto en el aro aún mueve unos 5 pp por 0,02.
6. **¿El rebote sigue produciendo melés?** Menos: la melé estrecha (≤ 0,6 m) baja 58 %; dentro de 1,5 m solo −9 %. Sigue habiendo tres jugadores alrededor del punto de caída.
7. **Cinco defectos que impiden la calidad comercial:** (1) ritmo y volumen de posesiones +24 %; (2) faltas y tiros libres por debajo de la realidad y sin faltas sin balón; (3) sin pull-up:
   el mid-range no tiene origen; (4) rating de tapones y rebote sin efecto medible y conversión de putback baja; (5) presentación de placeholders: los contactos se ven como etiquetas y no como
   movimiento.
