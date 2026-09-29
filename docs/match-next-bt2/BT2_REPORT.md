# BT2 · Possession economy & half-court basketball (MatchEngine Next)

Rama `match-next-basketball-core-bt2`, worktree `C:\BDM-NEXT-BT2`, base `4b900de` (`match-next-phaser-truth`). Sin push, sin PR, sin merge.
Nota de entorno: la rama `match-next-basketball-core-bt2` ya existía apuntando a `95b5aad` (commit legacy de BT1); se movió con `git branch -f` a `4b900de`
(`95b5aad` sigue en `match-basketball-truth-bt1`). Un `rm -rf` mal dirigido borró `node_modules/.bin` del worktree antiguo por el junction; se restauró con
`npm rebuild --ignore-scripts` (sin cambios de código allí).

## 1–3. Estado

- **STATUS TÉCNICO: PASS.** typecheck limpio, build OK, tests nuevos y afectados en verde. Quedan 4 fallos **preexistentes** en `matchNext.test.ts` (ya rojos en `4b900de` y `38f17a7`, no tocados: reloj de rebote ofensivo, `gameRunning` tras canasta, `possession` tras rebote, regla "sin Map/Set").
- **STATUS BASKETBALL: PARCIAL (no PASS comercial).** La estructura de la posesión ya es la de un partido de baloncesto (puntos, tiros, triples, rebote ofensivo, fases, esquinas, pantallas con geometría, continuidad de balón), pero no es todavía un simulador comercial: sin faltas/tiros libres, mid-range casi inexistente, defensa que concede triples abiertos tras cada colapso, P&R solo en ~13 % de las posesiones, movimiento sin balón limitado a cortes y "drift".
- **STATUS VISUAL: PARCIAL.** Se reconoce 5-out con esquinas ocupadas, pantalla → bote → kick-out → tiro, cortes, rebote y reset (evidencia real en Chrome, §22). Sigue habiendo fotogramas de melé bajo el aro tras rebotes y no hay animación de contacto.
- **PROGRESO GLOBAL: 100 % del alcance de implementación pactado**; el resultado basket se califica arriba con criterio duro.

## 4–6. SHAs

Inicial `4b900deff5e216a68fa6aa7835f0095458c4b3f1`. Final y commit: el commit de la rama `match-next-basketball-core-bt2` que incluye este documento (ver `git log -1`).

## 7. Defectos encontrados (auditoría BT2A, 8 semillas, `audit/economy-before.json`)

371 puntos, 328 tiros, 248 posesiones, 1,33 tiros/posesión, 68 % triples, 17 % tiros > 9 m, 54 % OREB, ~87 putbacks/partido, 4,9 decisiones por posesión con
mediana de 0,9 s entre decisiones, primer tiro 1,2 s (mediana) tras entrar en SETUP, 1,32 decisiones por segundo de SETUP, balón retenido 0,3 s, esquinas vacías el
86 % del tiempo, 12 % de jugadores a < 1 m de su slot, y: **el "córner" de 5-out estaba a 6,8 m de la línea de fondo (≈ 8 m del aro: un ala profunda)**.

## 8. Causas raíz (respuestas a las preguntas de BT2A)

1. **¿Dispara demasiado pronto?** Sí: `selectDecision` corría cada tick sin reloj ni compromiso; un tiro salía ~1,2 s después de entrar en SETUP con el ataque sin colocar.
2. **¿Cada evento abre una oportunidad de tiro?** Sí: recibir un pase con `shooting ≥ 68 − pref·5` daba `CATCH_AND_SHOOT` inmediato, sin comparar con nada.
3. **¿El OREB reinicia mal la posesión?** Sí: pasaba a SETUP en el mismo tick y decidía otra vez (cadena de putbacks) y el rebote se decidía por quién llegaba a 0,12 m primero, con dos atacantes siempre "crasheando" aunque estuvieran a 6 m.
4. **¿El ataque no consume tiempo organizándose?** Correcto: no había fase de half court, ni lectura, ni nada que esperar.
5. **¿La IA decide demasiado rápido?** Sí (mediana 0,9 s, 1,3 decisiones/s en SETUP).
6. **¿Varios tiros por posesión sin estructura?** Sí: 35 % de posesiones con ≥ 2 tiros (OREB + putback).
Además, causas físicas: (a) el balón de una canasta "aparecía" a 0,08 m de altura en el aro; los reinicios "other"/violación de 24 s saltaban al centro de la cancha; el balón tras la bocina saltaba ~10 m; (b) `isBeyondThreePointLine` tenía un signo invertido: **los tiros desde la esquina valían 2** (y cualquier tiro pegado a la banda por delante de la línea de fondo también); (c) los pases fallidos eran ~17 % porque el receptor se movía a su slot mientras el balón viajaba; (d) el triple no perdía precisión con la distancia (16 % de tiros > 9 m con 35 % de acierto); (e) el cierre defensivo tras un pase iba a "jog" y empezaba después del catch; (f) las pantallas no existían.

## 9. Fases finales de la posesión (BT2B)

`INBOUND → ADVANCE (transición) → EARLY | HALF_COURT → ACTION → ADVANTAGE | RESET → SHOT → REBOUND → nueva posesión / reset ofensivo`. Las fases físicas de `possession.phase` no cambian;
sobre ellas `MatchState.offenseFlow` (`actions/OffenseFlow.ts`) mantiene `stage` (EARLY/HALF_COURT/ACTION/ADVANTAGE/RESET), `readyAtT` (nadie decide antes de leer),
`settledAtT` (mitad de campo asentada), `moves` (movimientos sin balón) y `resetPending` (tras OREB). Cada etapa limita qué decisiones son legítimas (§10, §16).

## 10. Modelo de decisión (BT2G/H/L)

`DecisionCore.readTheFloor`: cada opción se valora en **puntos esperados de la posesión** y se compara con el valor de seguir la posesión (`continuationValue`, decrece con el reloj):
`SHOOT` = P(canasta) × valor; `DRIVE` = 0,9 + 0,9 × ventaja sobre su defensor (rimAttack/creation vs defensa, hueco, obstrucción del carril; cada bote previo en la posesión rinde 0,8×);
`PASS` = mejor receptor: P(pase) × valor de su tiro **con el cierre defensivo predicho** (lo que tarda cada defensor en llegar durante vuelo + control + tiro); `SCREEN` = pantalla
de balón (§13); `HOLD` = seguir leyendo. Ruido determinista ±6 % (hash de tick+jugador, sin avanzar RNG). Sin Overall, sin distancia fija: los tiros lejanos pierden acierto físicamente
(`deepThreePenalty`) y solo se toman si su valor gana o si se acaba el reloj. **Oportunidad ≠ intento**: cada `decisionSelected` lleva el `utility` de todas las opciones (audit y tests: hay
oportunidades rechazadas por una lectura mejor; los tiros elegidos valen ≥ alternativas dentro del ruido). Cadencia: tras un catch/rebote/acción hay lectura (3–6 ticks según visión/timing del jugador, 7 tras OREB);
mientras el ataque no está asentado solo se actúa ante un look genuinamente abierto (≥ 1,2 pts) o si el reloj obliga.

## 11. Spacing (BT2C)

Los slots pasan a ser **zonas** (tolerancia 1,5 m, sin entrar por delante del slot): quien está dentro se queda; quien está fuera va al borde de la zona. Esquinas reales
(franja de triple de esquina, pegadas a la banda, a ~6,9 m del aro), alas a ~40° fuera del arco, independientes de la profundidad del balón. Ataque asentado (muestras SETUP con `settledAtT`):
85 % de jugadores en su zona, esquinas ocupadas ≥ 1 en el 99,2 % de las muestras (antes 14 %), distancia mínima entre atacantes 5,3 m de media.

## 12. Movimiento sin balón (BT2D)

`actions/OffBallMovement.ts`: **BACKDOOR_CUT** (su defensor niega el pase: ≤ 1,7 m y alineado con el balón), **BASKET_CUT** (defensor "sagging" ≥ 2,1 m y carril libre), **DRIFT** (mientras un compañero
bota, los espaciadores se deslizan por el arco al hueco más abierto). Solo se mueve quien tiene motivo, 1 cortador a la vez, máx. 3 cortes por posesión, cada movimiento termina (≤ 24–30 ticks) y
la pista vuelve a su zona. Eventos `offBallMove` (~390/partido, casi todos drift). No implementado: LIFT/RELOCATE/CLEAR-OUT explícitos (el relevo de slot tras un pase sí existe).

## 13. Pantallas (BT2E)

Acción `SCREEN` y `MatchState.screen` (`actions/ScreenCore.ts`): pantallista elegido por amenaza de rodar/abrir, **localización** junto al defensor del manejador por el lado que atacará, **hombro lejano**
(waypoint del bote), fases APPROACH → SET (pantallista a < 0,55 m y quieto) → USED, contacto físico: el defensor del manejador no atraviesa al pantallista y debe rodearlo (por debajo con *drop*, por arriba en el resto),
salida ROLL (rim) o POP (arco, si su tiro lo justifica). Eventos `screenSet/screenUsed/screenEnded`. ~24–27 pantallas por partido (13 % de las posesiones).

## 14. P&R funcional (BT2F/M)

Flujo real, verificado por tests con las 4 coberturas (`switch` = defecto del producto, `drop`, `hedge`, `blitz`): el manejador espera, el pantallista llega y planta, el manejador **usa** la pantalla
(ATTACK con waypoint, pull-up o, contra blitz, pase), la defensa responde (switch = intercambio real de asignaciones `SWITCH`; drop = el defensor del pantallista protege el aro; hedge = sale a mostrarse y recupera;
blitz = trampa), separación manejador–defensor tras usarla ≈ 1,4–2,5 m de máximo en 3 s, y salida rodando/abriendo. Los resultados (bote, pull-up, kick-out, pase al rodador, reset) salen de la geometría y de los valores,
no están predeterminados.

## 15. Selección de tiro (BT2G/H)

Ver §10. Además: tiro tras pase se evalúa con el cierre predicho; `CATCH_AND_SHOOT` solo si acaba de recibir; sin caso "SHOOT si shooting ≥ 70". El contest proyecta 0,3 s el movimiento del defensor que cierra.

## 16. Geografía de tiro (8 semillas, después vs antes)

| Zona | Antes (% / FG%) | Después (% / FG% / contest) |
|---|---|---|
| Aro < 2,2 m | 4,1 / 54 | 22,1 / 52 / 0,79 |
| Pintura 2,2–4,5 m | 14,2 / 40 | 26,6 / 45 / 0,65 |
| Media 4,5–6,5 m | 10,2 / 34 | 6,1 / 45 / 0,52 |
| Triple 6,5–8 m | 45,8 / 43 | 42,6 / 38 / 0,31 |
| Triple 8–9 m | 8,9 / 47 | 1,1 / 6 |
| Profundo > 9 m | 16,9 / 42 | 1,6 / 12 |

## 17. Rebote (BT2I)

Landing con dispersión (largo del tiro → rebote largo, lado del tirador, clamp a pista), **alcance por jugador** (0,7–1,2 m según altura/envergadura) en vez de 0,12 m, peso por habilidad + tamaño + distancia + **sellado** (un oponente entre él y el balón le resta),
box-out = colocarse entre el atacante y el balón, atacantes solo "crashean" si pueden competir (≤ 5,5 m y ≤ 2 m peor que el defensor más cercano), el resto se retira. Resultado: OREB 54 % → 26 % (20–39 % por partido); quien está más cerca del balón lo captura más (defensa más cerca en el 65 %, y gana el rebote el 79 % de esas veces).

## 18. Reset ofensivo (BT2J)

Tras OREB: `resetPending`, 7 ticks de control (aterrizar, asegurar), y decide como cualquier lectura (putback si su valor gana, kick-out, reset, reposición): sin decisión inmediata en el tick del rebote, sin escalado forzado.
Putbacks 87 → 24 por partido; posesiones con ≥ 3 tiros 8,1 % → 2,3 %.

## 19. Continuidad del balón (BT2K)

Canasta: el balón sale de la red a 3,05 m, cae y **lo llevan** al punto de saque (0,4 m/tick) — sin salto vertical ni de posición; violación de 24 s / `other`: saque desde el punto de banda más cercano (antes centro de cancha); tras la bocina el balón se lleva al punto de reinicio.
`audit/continuity-before.json` vs `-after.json` (2 semillas × 30 000 ticks): teletransportes de balón fuera de vuelo 2–3 → 0; velocidad máx. de jugador 0,63 m/tick (sin cambios).

## 20. Respuesta defensiva (BT2M)

Cierre `sprint` (< 2,2 m `jog`, entre medias `run`, sin bajar de la velocidad actual → frena, no se "corta"), el defensor del receptor **cierra durante el vuelo del pase**, rim protector del lado débil (mantiene un pie en la pintura mientras su hombre está lejos del balón), coberturas de pantalla (§14), ayuda existente (LOW_MAN/ROTATE/X_OUT) ahora solo se dispara si el conductor **de verdad** superó a su hombre (separación ≥ 1,2 m y defensor ya no delante). Robos de pase por carril (1,3 m), pases fallidos por calidad del pasador (rara vez recuperables).

## 21. Estadísticas antes/después (8 semillas: 424242, 7, 1, 99, 2024, 31337, 11, 12)

Fuente `audit/economy-before.json`, `economy-after.json`, `compare.txt`.

| Métrica (media, mín–máx entre partidos) | Antes (4b900de) | Después (BT2) |
|---|---|---|
| Puntos totales | 370 (339–419) | 203 (176–222) |
| Tiros | 328 (313–345) | 200 (192–220) |
| Posesiones | 248 (233–263) | 184 (173–193) |
| Tiros / posesión | 1,33 (1,19–1,46) | 1,09 (1,02–1,24) |
| Duración media posesión (s) | 7,7 (7,2–8,2) | 11,3 (10,6–12,1) |
| % triples | 0,68 (0,63–0,73) | 0,45 (0,40–0,52) |
| % tiros > 9 m | 0,17 | 0,02 |
| % rebotes ofensivos | 0,54 (0,46–0,61) | 0,26 (0,20–0,39) |
| Putbacks / partido | 87 (66–111) | 24 (15–47) |
| Pérdidas | 19,0 | 12,1 |
| FG % | 0,42 | 0,43 |
| Decisiones por posesión (mediana) | 4 | 4 (p90 9 → 7) |
| Mediana de gap entre decisiones | 0,9 s | 1,5 s |
| Decisiones por segundo de SETUP | 1,32 | 0,51 |
| Balón retenido (media / p90) | 0,29 / 0,6 s | 1,85 / 4,8 s |
| Histograma tiros/posesión 0,1,2,3,4+ | 6,5/65/20/6,2/1,8 % | 7,3/79,9/10,4/1,8/0,5 % |
| Esquinas vacías (ataque asentado) | 86 % (todas las muestras) | 0,8 % |

Sanity checks (no objetivos): puntos totales entre 176 y 222 en las 8 semillas (nunca 300–400). Ojo: **PPP ≈ 1,10 sin un solo tiro libre**, más alto de lo razonable para 45 % de triples: la defensa concede demasiado.

## 22. Distribución multi-semilla

Ver `audit/economy-after.json` (`perGame`): puntos 176/209/201/218/201/187/222/212; tiros 192–220; posesiones 173–193; OREB 20–39 %; triples 40–52 %. Ninguna semilla se acerca al rango de 300–400 puntos.

## 23. Escenarios visuales (Chrome real, Phaser, vista normal + Basketball Truth con overlays de pantalla/cortes)

`docs/match-next-bt2/evidence/<kind>-seed*-t*/sheet-{plain,truth}.png` (12 fotogramas por escenario, `beats.json`, `summary.json`), reproducibles con `audit/scenarios.json`:
half-court, transición ataque/defensa, **screen**, **pickAndRoll**, **cut**, **kickOut**, **offensiveRebound**, drive, help defense, pass sequence, tiro anotado/fallado, rebote, saque.
Se añadieron overlays de diagnóstico `screens` (localización, hombro, línea manejador–pantallista) y `moves` (cortes/drift) al modo Truth; Phaser sigue sin decidir nada.
Sesión larga en Chrome real (no headless): `scripts/next/soak.mjs`, resumen en `evidence/soak/`.

## 24. Tests

Nuevos: `engine/match-next/matchNextBt2.test.ts` (18 tests sobre partidos reales por el camino de app: lectura ≥ 3 ticks tras catch, no actuar sin asentar salvo look abierto, cadencia, determinismo, utilidades de tiro, penalización de triples lejanos, esquina = 3,
zonas/esquinas, cortes con motivo y drift solo en botes, P&R con las 4 coberturas, rebote a alcance + OREB minoritario + reset de 7 ticks, continuidad del balón, cierre en vuelo), `domain/court` (esquina), `matchNextMovement` (zonas, esquinas reales).
Actualizados por comportamiento intencionalmente distinto: `matchNextActions` (el manejador lee y puede correr pantalla antes de pasar), `matchNextTransition` (rebote por alcance, outlet tras lectura), `matchNextTruthFixes` (N1 umbral, N2 busca semillas), `MatchEnginePort` (escenario de stopper), `nextTruth.audit` (screens/P&R ya existen).
Live/Instant parity, bridge/Director, determinismo: verdes. Herramientas de auditoría (`audit/bt2`) solo con `BT2_AUDIT=1`.

## 25. Typecheck · 26. Build

`npm run typecheck`: limpio. `npm run build`: OK (solo el aviso habitual de chunks > 500 kB).
Suite completa (una vez, 3.245 tests): 52 fallos bajo carga; re-ejecutados los 27 ficheros con timeout largo, 34 fallos, **32 idénticos en `4b900de`** (guardado/temporadas/reloj/legacy `engine/match`, `matchNext.test` x4: preexistentes, no tocados). Los 2 restantes eran míos o flaky: N3 (umbral de 5 saques en 3.000 ticks; ahora 6.000, verde) y un test de guardado V4 que pasa en aislamiento (flaky por tiempo bajo carga).

## 27. Working tree

Limpio tras el commit.

## 28. Limitaciones honestas

- Sin faltas ni tiros libres (el aro se defiende sin coste) → PPP inflado.
- Mid-range 6 % (real 15–25 %): el modelo de valor lo penaliza y no hay tiros "de sistema".
- Triples abiertos tras colapso de ayuda (contest medio 0,31): la defensa sigue siendo una de las causas del 43 % de triples.
- Pantallas solo de balón; no hay hand-offs, pantallas ciegas ni cortes de poste; P&R solo en ~13 % de las posesiones.
- Cierres y ayudas siguen siendo geométricos, sin lectura de pase ni "tags"; pérdidas 6/equipo (real ~13).
- Parámetros de modelo (documentados en código): valor de continuar 0,98 pts, descuento 0,95, valor base P&R 1,25, tolerancia de zona 1,5 m, eficiencia de cierre 0,40. Son calibraciones físicas/tácticas, no forzados por resultado, pero la sensibilidad es alta (cambiar el cierre de 0,4 a 0,55 lleva los triples de 43 % a 20 %).
- Posesiones sin balón visible tras OREB pueden mostrar melé bajo el aro (10 jugadores en 5 m).

## 29. Preguntas críticas

1. **¿Una partida completa tiene economía creíble?** Rango correcto (≈ 200 puntos, ≈ 200 tiros, 184 posesiones, 45 % triples, 26 % OREB, sin cadenas de putbacks), pero PPP 1,10 sin faltas y 12 pérdidas: creíble como esqueleto, no como simulador comercial.
2. **¿La mitad de cancha se reconoce como organizada?** Sí en estructura (5-out asentado, esquinas ocupadas, pantalla → bote → kick-out, cortes), no en variedad ni contacto.
3. **¿Los jugadores se mueven por razones o buscan coordenadas?** Los espaciadores siguen zonas y hoy se mueven por razones solo en cortes, drift y pantallas; el resto es ocupación de zona. Mejor que rieles, lejos de un ataque de sistemas.
4. **¿Existen pantallas/P&R espacialmente?** Sí (localización, hombro, contacto, cobertura, salida), solo de balón.
5. **¿El rebote sigue siendo fuente artificial de posesiones/puntos?** No: OREB 26 %, 24 putbacks/partido; queda dependiente de la longitud del rebote y del box-out geométrico.
6. **Cinco defectos que impiden calidad comercial:** (1) sin faltas/tiros libres/bloqueos (economía de tiro incompleta); (2) defensa que concede triples abiertos tras cada colapso y un mid-range residual; (3) repertorio ofensivo estrecho (solo P&R de balón, sin hand-offs/post/pantallas ciegas); (4) sin contacto/animación de cuerpo (screens y box-out son geometría, no se ven como contacto); (5) sensibilidad de los parámetros de valor: el equilibrio triples/pintura depende de un solo parámetro de cierre.
