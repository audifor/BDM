# BT4 · Pace, Shot Ecology & Player Identity — Informe

Rama `match-next-basketball-core-bt4`, worktree `C:\BDM-NEXT-TRUTH`. No hay push, PR ni merge.
Todas las cifras salen de las auditorías de `src/presentation/match-next/audit/bt4/` (`BT2_AUDIT=1`), en `docs/match-next-bt4/audit/`.
Las tablas "BT4" son el motor de este commit, medido con 12–16 semillas por auditoría (3–5 en identidad y rosters, que son 18 y 6 configuraciones).

## 1–4. Estado

| Ítem | Valor |
|---|---|
| 1. STATUS TÉCNICO | **PASS**. Typecheck limpio, build OK, Live e Instant deterministas (tests de paridad en verde), 0 transiciones de juego ilegales, todas las partidas completas. |
| 2. STATUS BASKETBALL | **FAIL en ritmo, PASS en ecología de tiro**. El ritmo sigue en ~214 posesiones combinadas; se ataca en BT4.1. |
| 3. STATUS VISUAL | **PARCIAL**. Las capturas de Phaser de esta fase se hicieron sobre el motor de BT4.1 (ver `docs/match-next-bt4-1/evidence/`). Sobre el motor de BT4 solo se generaron las ventanas reproducibles (`audit/scenarios.json`), no contact sheets. |
| 4. STATUS PLAYER IDENTITY | **PASS con reservas** (manejador débil, rebote ofensivo plano entre 50 y 85). |

SHA inicial: `25821d7ef69a621b98977203e14d13d1d4467f96` (BT3). SHA final y commit: el de este commit (ver `git log`).

## 5. Contabilidad del ritmo (BT4A)

Reloj corrido: 2400 s. BT2: 183,7 posesiones de 11,3 s. BT3: 229,5 de 9,8 s. BT4: 215,5 de 10,7 s.

| Fase (BT4) | s/posesión | Frecuencia | Cuota del tiempo |
|---|---|---|---|
| inbound | 0,41 | 49% | 3,9% |
| transición | 1,96 | 97% | 18,4% |
| asentamiento (settlement) | 2,62 | 78% | 24,5% |
| lectura | 0,67 | 51% | 6,2% |
| montaje de acción (bloqueo) | 0,41 | 9% | 3,8% |
| ejecución de acción | 2,18 | 93% | 20,4% |
| ventaja | 0,21 | 40% | 1,9% |
| reset | 0,08 | 9% | 0,7% |
| tiro | 0,66 | 90% | 6,2% |
| rebote | 0,85 | 56% | 7,9% |
| balón muerto | 0,64 | 14% | 6,0% |

## 6. Distribución de duración (BT4B)

| | <4 s | 4–8 | 8–12 | 12–16 | 16–20 | >20 |
|---|---|---|---|---|---|---|
| BT2 | 4,3% | 17,7% | 40,4% | 19,4% | 12,6% | 5,6% |
| BT3 | 6,9% | 28,1% | 37,7% | 18,3% | 6,5% | 2,5% |
| BT4 | 4,8% | 21,3% | 41,4% | 21,8% | 7,0% | 3,7% |

Por tipo (BT4, media): rebote defensivo 10,3 s, tras canasta 10,1 s, tras tiros libres 11,2 s, tras pérdida 9,4 s, segunda oportunidad 16,0 s.

## 7. Causa del exceso de ritmo

BT3 pasó de 184 a 229 posesiones: las posesiones que acaban en pérdida (~+17, de 5,7 s), las que acaban tras tiro libre anotado (~+12), un 37% menos de penetraciones y un 47% menos de bloqueos. Las ablaciones de los mecanismos de decisión de BT3 **no** devolvieron el ritmo de BT2.
Lo que sí se encontró en BT4 (y se corrigió porque era tiempo físico que faltaba, no decisión): 0,4–0,5 s del rebote defensivo a la decisión, una suspensión de rebote constante de 1,2 s y 0,2 s de preparación del tiro.
Esas correcciones bajaron de ~229 a ~214 posesiones. **El resto no está resuelto en BT4**: el ataque toma el primer tiro mejor que la media, porque el valor de seguir es plano hasta los últimos 12 s del reloj. BT4.1 lo trata.

## 8. Ecología de tiro (BT4E)

| Zona | Cuota | FG% | Bloqueado | Falta | Puntos/tiro |
|---|---|---|---|---|---|
| RESTRICTED | 20,6% | 48,0% | 2,5% | 26,7% | 1,31 |
| RIM | 9,3% | 41,3% | 8,5% | 6,8% | 0,92 |
| SHORT_PAINT | 11,1% | 36,9% | 10,4% | 9,3% | 0,84 |
| FLOATER_RANGE | 5,1% | 40,3% | 4,7% | 3,9% | 0,86 |
| MIDRANGE | 3,7% | 38,0% | 1,1% | 2,2% | 0,80 |
| LONG_MIDRANGE | 4,0% | 33,7% | 0% | 3,0% | 0,72 |
| CORNER_THREE | 18,6% | 35,3% | 0% | 0% | 1,06 |
| ABOVE_BREAK_THREE | 24,3% | 36,9% | 0% | 0,3% | 1,11 |
| DEEP | 3,3% | 30,1% | 0% | 2,4% | 0,98 |

Total: 209,5 tiros por partido, FG 39,1%, 1,05 puntos por tiro.

## 9. Tipos de creación (BT4F)

| Creación | Cuota | FG% | Falta | Puntos/tiro |
|---|---|---|---|---|
| CATCH_AND_SHOOT | 34,2% | 36,6% | 0,1% | 1,06 |
| DRIVE_FINISH | 25,1% | 46,5% | 21,8% | 1,22 |
| TRANSITION | 10,6% | 36,3% | 4,1% | 0,96 |
| KICK_OUT | 8,4% | 39,3% | 0,9% | 1,15 |
| PULL_UP | 8,4% | 30,3% | 6,2% | 0,73 |
| FLOATER | 5,5% | 37,7% | 11,6% | 0,88 |
| PR_HANDLER | 4,8% | 37,2% | 6,6% | 0,87 |
| PUTBACK | 2,4% | 43,3% | 6,7% | 0,93 |

La zona sale del lugar donde estaba el jugador al soltar: el tipo de creación es una etiqueta derivada del evento, no un generador.

## 10. Pull-up (BT4G)

Existe y es espacial: el penetrador cuya calle se cierra (se sortea si lo contienen) decide entre seguir, tirar desde donde está o pasar, con el mismo modelo de tiro (contesta, velocidad, ratings). Los medios (MIDRANGE + LONG) salen de pull-ups y de la salida del bloqueo (PR_HANDLER). **Crítica:** el pull-up rinde 0,73 puntos por tiro (FG 30%), demasiado bajo; se toma poco y mal.

## 11. Floater / short paint (BT4H)

Implementado sin hachas: el penetrador a 2,0–4,8 m del aro compara el flotador (menos riesgo de tapón, menos probabilidad) con seguir. Es el 5,5% de los tiros; `SHORT_PAINT` (11%) sigue siendo una zona de baja eficiencia (0,84).

## 12. Acabado al aro (BT4I)

La base pasó de 0,66 (BT3) a 0,72 y se comprobó contra el modelo: con contest alto en `RESTRICTED` el FG real es 48% (contest medio 0,82). La probabilidad base del aro tiene **elasticidad alta** sobre el reparto (ver punto 19).

## 13. Ecología de faltas (BT4J)

Las faltas de tiro por zona eran ya realistas; lo que faltaba eran las faltas no de tiro. Se añadió contacto entre cuerpos de marcaje en episodio (`EpisodeContact`). Resultado: 33,8 faltas por partido, FTA/FGA 0,17, 4,0 faltas de bonus y 2,75 eliminados por faltas. Real FIBA ronda FTA/FGA 0,28–0,30: **sigue bajo**.

## 14–19. Identidad por cohorte (BT4K–Q)

Cohortes por nivel 25 / 50 / 85, mismos partidos. (3 semillas: ruido alto.) Motor BT4:

| Cohorte | Señal | 25 | 50 | 85 |
|---|---|---|---|---|
| Tirador | Cuota de triples | 0,13 | 0,44 | 0,64 |
| | Puntos por tiro | 0,73 | 0,90 | 1,14 |
| Finalizador | Cuota al aro | 0,11 | 0,20 | 0,40 |
| | Tiros libres | 8,7 | 9,0 | 17,0 |
| Pasador | Asistencias | 9,7 | 12,7 | 17,7 |
| Manejador | Pérdidas | 14,0 | 11,3 | 7,7 |
| | Asistencias | 18,7 | 19,7 | 16,7 |
| Protector | FG rival | 0,45 | 0,47 | 0,40 |
| | Faltas propias | 32,0 | 23,7 | 17,7 |
| | Intentos rivales al aro | 41 | 33,7 | 36,3 |
| Rebotero | Rebote defensivo | 40,3 | 39,3 | 44,7 |
| | Rebote ofensivo | 3,3 | 10,7 | 9,7 |

**Reservas:** el manejador reduce pérdidas pero no genera asistencias; el protector baja el FG rival pero no los intentos al aro de forma monótona; el rebote ofensivo no sube de 50 a 85.

## 20. Tendencia frente a capacidad (BT4S)

Las capacidades técnicas no se convirtieron en tendencias arbitrarias: solo el uso (`usage`) inclina al manejador hacia atacar y lejos de pasar (`usageDrivePerPoint`, `usagePassPerPoint`), y la visión filtra cuánto ve el pasador. Tirar, rimAttack, creation, etc. entran por el modelo de tiro y de penetración.

## 21. Robustez del softmax (BT4T)

Barrido de temperatura (3 semillas, motor BT4):

| T | Posesiones | FG% | Triples | Aro | Medios | Puntos |
|---|---|---|---|---|---|---|
| 0,00 | 201 | 0,45 | 0,53 | 0,40 | 0,02 | 244 |
| 0,05 | 205 | 0,42 | 0,53 | 0,38 | 0,02 | 247 |
| 0,10 | 206 | 0,46 | 0,44 | 0,40 | 0,05 | 258 |
| **0,15** | 217 | 0,39 | 0,45 | 0,30 | 0,08 | 224 |
| 0,25 | 215 | 0,39 | 0,46 | 0,23 | 0,10 | 228 |
| 0,40 | 219 | 0,36 | 0,44 | 0,16 | 0,15 | 210 |
| 0,60 | 222 | 0,32 | 0,49 | 0,13 | 0,14 | 205 |

**No hay acantilado** pero el reparto es **continuo y amplio**: la temperatura mueve el tiro al aro de 40% a 13%. La calibración actual (0,15) está en un punto donde el ruido ya empuja al ataque hacia lejos del aro.

## 22. Sensibilidad de parámetros (BT4U)

±10% sobre el motor BT4 (3 semillas): el parámetro más sensible es `rimBaseMakeProbability` (−10%: aro de 30% a 12%, triples de 45% a 66%, FTA de 30 a 11). Después `threeBaseMakeProbability` y `driveValueScale`. El reparto de tiro **depende demasiado de pocas constantes globales**; se debe reportar como defecto. Tabla completa en `audit/calib-sens5.json` y `docs/match-next-bt3/audit` (sweeps).

## 23. Emergencia por rosters (BT4V)

Local con un plantel distinto, mismos ajustes tácticos y rival (5 semillas):

| | base | tirador | aro | pasador | defensivo | rebotero |
|---|---|---|---|---|---|---|
| triples | 0,45 | **0,83** | 0,19 | 0,44 | 0,50 | 0,47 |
| al aro | 0,29 | 0,06 | **0,54** | 0,33 | 0,24 | 0,28 |
| FTA | 14,4 | 3,8 | **36,4** | 18,2 | 10,2 | 16,6 |
| asistencias | 15,6 | 27,8 | 7,8 | 17,8 | 21,0 | 18,6 |
| rebote ofensivo | 9,0 | 3,8 | 13,6 | 9,6 | 7,8 | 10,2 |

Seis plantillas dan seis partidos distintos. STATUS PLAYER IDENTITY no es FAIL por este criterio.

## 24. Distribuciones de jugadores (BT4W)

Regulares (12 jugadores con ≥12 min por partido, 16 semillas), por 36 minutos: tiros 20,2 (p10 8,7 / p90 34,5), puntos 21,2, asistencias 3,1, rebotes 11,0. Correlaciones rating→estadística: tiro→triples 0,81, uso→tiros 0,60, rebote→rebotes 0,86, interior→tapones 0,57, creación→asistencias **0,23** (débil), rimAttack→tiros libres 0,28.

## 25. Comparación BT2 / BT3 / BT4

| | BT2 | BT3 | BT4 |
|---|---|---|---|
| Posesiones | 184 | 229 | 214 |
| s/posesión | 11,3 | 9,8 | 10,8 |
| Puntos | — | 233,7 | 225,4 |
| Tiros | — | 226 | 209,5 |
| FG% | — | .39 | .39 |
| FTA (FTA/FGA) | — | 28,3 (.13) | 34,8 (.17) |
| Al aro / tres | — | .19 / .43 | .30 / .46 |
| Faltas | — | 26,3 | 33,8 |
| Pérdidas | — | 27,8 | 19,6 |
| Asistencias | — | 43,8 | 35,6 |
| Tapones | — | 8,8 | 5,8 |

BT2 solo se midió en ritmo (worktree temporal).

## 26. Partidos extremos (BT4Y)

16 partidos. Más puntos: 276 (+49 sobre la media), de ellos +25 por volumen (239 posesiones), +27 por suerte de tiro de campo, +7 por rebotes ofensivos, −6 por pérdidas. Menos puntos: 179 (−48), −35 por suerte de tiro, −9 por volumen. Ninguna explicación se reduce a "RNG": la descomposición da siempre volumen, calidad de tiro, tiros libres, pérdidas y rebotes.

## 27. Evidencia visual

`docs/match-next-bt4/audit/scenarios.json` (17 ventanas) y capturas en `docs/match-next-bt4-1/evidence/` (sobre el motor de BT4.1).

## 28–31. Tests, base, typecheck, build

- Focales de BT4: `matchNextBt4.test.ts`, 17 en verde. Se actualizaron por diseño: BT2 (tolerancias de cadencia y de muestra), BT3 (umbral de pérdidas), paridad Live de MatchEnginePort, etc.
- Pasada amplia: 1105 tests, 4 fallos base de `matchNext.test.ts` (los mismos de antes de BT4), más uno de rendimiento que depende de la carga y pasa aislado.
- `npm run typecheck`: limpio. `npm run build`: OK.
- Bug real encontrado y corregido durante la fase: el controlador liberaba el saque con una intención ajena a la formación (sacador a 4,89 m del punto). Ahora exige la intención de la propia formación y que el sacador esté en el punto.

## 32. Árbol de trabajo

Un único commit en la rama `match-next-basketball-core-bt4`, con el árbol limpio.

## 33. Limitaciones restantes

1. **Ritmo**: 214 posesiones combinadas frente a ~150–165 reales (FAIL de BT4; ver BT4.1).
2. FTA/FGA 0,17 frente a ~0,28 reales.
3. FG 39%: bajo.
4. Asistencias: creación→asistencias casi sin señal (0,23).
5. El reparto de tiro es muy sensible a la probabilidad base del aro y de los triples.
6. Un único tipo de pull-up rinde 0,73 puntos por tiro.
7. Sin movimiento sin balón rico: cortes y bloqueos sin balón no existen.

## Respuestas explícitas

**1. ¿Por qué BT3 generó ~24% más posesiones que BT2?** Por más pérdidas (~+17) y más finales de posesión tras tiro libre anotado (~+12), menos penetraciones (−37%) y menos bloqueos (−47%), y porque se aceptaban tiros abiertos enseguida (44% con contest < 0,1). Las ablaciones de decisión no lo devolvieron.

**2. ¿El ritmo actual se parece a un partido real?** No. Son 214 posesiones combinadas y 10,8 s por posesión; un partido FIBA real ronda 150–165 y ~15 s.

**3. ¿El mediocampo emerge de situaciones reales?** Sí: los tiros de media distancia salen de pull-ups y de la salida del bloqueo, pero son pocos (7%) y de poco valor (0,72–0,80 puntos por tiro).

**4. ¿El reparto de tiro depende demasiado de constantes globales?** Sí. `rimBaseMakeProbability −10%` mueve el aro de 30% a 12%; la temperatura del softmax mueve el aro de 40% a 13%.

**5. ¿Un buen tirador juega distinto de uno malo?** Sí: triples 13% → 64% del tiro, puntos por tiro 0,73 → 1,14.

**6. ¿Un buen base juega distinto de un mal manejador?** A medias: pierde 14 → 7,7 balones, pero no genera más asistencias; la señal de creación es débil.

**7. ¿Un buen protector del aro modifica el ataque rival?** Sí en eficiencia (FG rival 0,45 → 0,40, faltas 32 → 17,7) y de forma no monótona en intentos al aro.

**8. ¿Un buen rebotero gana más posesiones de forma medible?** Sí: rebote ofensivo 3,3 → 10,7, pero no mejora de 50 a 85.

**9. ¿Dos plantillas distintas producen partidos distintos?** Sí, con claridad (tabla del punto 23).

**10. ¿Qué cinco defectos impiden la calidad comercial?**
1. El ritmo (214 posesiones): se ataca en BT4.1.
2. El reparto de tiro se rompe con pocas constantes.
3. Faltas y tiros libres (FTA/FGA 0,17 frente a ~0,28), con mucha varianza entre partidos.
4. Sin ataque sin balón ni juego de poste: el repertorio es corto.
5. La creación de juego (manejador, pasador) apenas produce asistencias.
