# BT6.1 · Ecología de la penetración y conversión de la ventaja

| | |
|---|---|
| rama | `match-next-basketball-core-bt6-1-drive-ecology` |
| SHA de partida | `be4b579` (BT6) |
| SHA final | el commit que contiene este informe |
| push / merge | ninguno |
| línea base | `docs/match-next-bt6/BT6_1_DRIVE_ECOLOGY_BASELINE.md` |
| datos | `docs/match-next-bt6/audit/` (`exp-d*`, `exp-ab*`, `exp-b61-*`, `scorecard-final2-b61.txt`, `summary-b61.md`, `drives-*.txt`) |

| categoría | estado |
|---|---|
| TECHNICAL | **PASS** |
| DRIVE ECOLOGY | **PARTIAL** |
| RIM / FOUL ECONOMY | **PARTIAL** |
| TURNOVER ECOLOGY | **PASS** |
| TACTICAL IDENTITY | **PARTIAL** |
| POSSESSION ECONOMY | **PASS** |
| BASKETBALL TRUTH | **PARTIAL** |
| VISUAL RECOGNIZABILITY | **PARTIAL** (lo que es del renderer, a MP2) |

## 1. Línea base de BT6 y de la penetración

Matriz BT6 (`final2`), media de 32 configuraciones × 6 semillas:

| métrica | valor |
|---|---|
| posesiones | 165,1 |
| PPP | 0,971 |
| TOV% | 15,98 |
| robos/posesión | 0,138 |
| FTr | 0,124 |
| aro | 19,2% |
| triple | 59,1% |
| pases interiores perdidos | ≈ 12% |

Auditoría de la penetración (`exp-d0-*`, 8 configuraciones × 6 semillas, observador nuevo `audit/bt61/drives.ts`). Detalle en el documento de línea base. En la neutra:

| resolución → acto | por partido |
|---|---|
| *blow-by* → pase fuera | **13,8** |
| *blow-by* → aro | 7,3 |
| contenida → pase fuera | 4,2 |
| contenida → pase interior o dump-off | 0,2 |
| contenida → reset | 0 (no existía) |

Tras el pase fuera:

- otro pase: 13,8;
- ataque del *closeout*: 0,8;
- segunda penetración: 0,2.

Origen de los intentos en el aro:

| origen | intentos |
|---|---|
| penetración | 6,7 |
| transición | 2,5 |
| manejador del bloqueo | 1,0 |
| *roll* | 0,5 |
| rebote ofensivo | 0,5 |
| corte | 0 |

Faltas de tiro: 3,0 por partido y equipo, todas en penetraciones.

## 2. Causa raíz

**La hipótesis del brief no se cumple.** "Contención → pase interior forzado → pérdida" no es lo que pasa: las penetraciones contenidas acaban casi siempre en un pase fuera.

Causas encontradas, todas desajustes entre lo que cree la decisión y lo que hace la física, más dos rigideces del flujo:

1. **El defensor batido se leía como contención.**
   - `driveEdge` (BT6) convertía en separación cualquier distancia al defensor sin mirar si estaba delante o detrás.
   - Batido el defensor, la creencia de llegar al aro caía justo cuando el penetrador había ganado.
   - Resultado: *blow-by* → pase fuera (13,8) por encima de *blow-by* → aro (7,3).
2. **El pasador leía la línea hacia donde está el receptor.** El balón se lanza hacia donde estará (el punto de recepción).
   - Para un cortador o un *roller*, esas dos líneas son distintas.
   - En los pases interiores perdidos, el defensor llegaba a la línea **0,39 s antes que el balón**; el pasador percibía un 7% de riesgo.
3. **La creencia del *contest* tras un pase solo proyectaba al resto de defensores 0,3 s.** El balón vuela hasta 0,8 s y el receptor tarda otros 0,8 s en tirar. En transición, los defensores que vuelven a toda velocidad parecían lejos del punto de recepción.
4. **La percepción del momento de los defensores escalaba con la visión desde cero.** Un pasador de visión 0,7 ignoraba el 30% de la velocidad de un defensor que vuelve corriendo.
5. **La jugada obligaba a hacer un pase extra después de la ventaja.**
   - DRIVE_KICK necesitaba 2 pases antes de darse por ejecutada.
   - Mientras tanto, el tiro del receptor valía ×0,65 y el pase ×1,25.
   - El pase fuera que ya había doblado a la ayuda no podía castigarse.
6. **Una penetración contenida obligaba a actuar en el acto** (`mustAct`), no podía reiniciarse y prohibía penetrar en el resto de la posesión.
7. **La física del contacto leía el momento del tirador al soltar el balón.**
   - Quien sube tras una penetración frena en los 0,3 s de la recogida, y el momento que lo lleva contra el defensor desaparecía.
   - Cortes, *rolls* y rebotes ofensivos subían "sin velocidad".

## 3. Cambios

Todos causales. Ningún bonus global, ninguna cuota, ninguna espera.

| # | cambio | dónde |
|---|---|---|
| 1 | **Defensor batido.** Un defensor que está detrás del penetrador en la línea hacia el aro (> 0,3 m) se lee como batido (máxima separación). | `DecisionCore.driveEdge` |
| 2 | **La línea se lee hacia el punto de recepción** (`catchPoint`, la misma regla que usa la física para apuntar). | `PassRisk.catchPoint`, `perceivedCompletion` (`catchPointLane`) |
| 3 | **El *contest* tras el pase proyecta a los demás defensores con su movimiento durante el vuelo y la recogida** (hasta 1,2 s). | `predictContestAfterPass` |
| 4 | **Todo pasador ve el 70% del momento de los defensores**, y la visión le da el resto. Se mantiene el sesgo de visión sobre la holgura. El defensor que corre con el receptor que mira se ve entero. | `PassRisk.perceivedLaneRead`, `laneRead(watched)` |
| 5 | **La jugada se da por ejecutada cuando dobló a la defensa** (un pase fuera recibido tras la penetración). Desde ahí el valor es del jugador con el balón. | `playRead` |
| 6 | **Reset ofensivo.** | `DecisionCore.readTheFloor` (opción `reset`), `OffenseFlow.resetOffense`, evento `offenseReset` |
| 7 | **Momento al subir.** | `ActionState.gatherVelocity`, `ContactModel.assessShootingContact(approachVelocity)` |

Detalle del reset (6):

- Con bote vivo y al menos 10 s de reloj, el penetrador contenido puede sacar el balón y reiniciar.
- Vale lo que vale seguir trabajando con 5 s menos de reloj.
- El medio campo se reabre: nueva llamada y espaciado, y no se da por asentado hasta que él vuelve fuera del arco.
- "Contenido" solo prohíbe volver a penetrar hasta ese reinicio.
- Con bote muerto no hay reset: el beneficio de la presión (BT6) se conserva.

Detalle del momento al subir (7):

- El tiro guarda la velocidad con la que empezó.
- Una finalización de penetración, una flotadora o cualquier tiro a ≤ 3 m del aro (corte, *roll*, rebote ofensivo) la lleva al contacto.
- La pull-up no: se para y sube.
- La creencia de la finalización tras penetración (`readDriveStop`) usa la misma regla.

### Probado y descartado

| intento | por qué se descartó |
|---|---|
| **Valorar el tiro del receptor en el punto de recepción** (`catchPointValue`, queda como interruptor de auditoría, apagado) | Pagaba de más los pases adelantados a corredores: el modelo de tiro valora a un tirador asentado, no a uno que recibe en carrera. Ablación: con valor y línea en el punto de recepción, TOV% 16,1; solo la línea, **13,0**; solo el valor, 18,2. |
| **Lectura del *closeout* en el aire** (lectura de 2 ticks si el defensor llega lanzado) | No aumentó los ataques al *closeout* y adelantaba todas las decisiones tras recibir (rompía el asentamiento BT2). Revertido. |

## 4. Antes y después

### Entre configuraciones

Media de 32 configuraciones × 6 semillas, matriz completa:

| métrica | BT6 `final2` | BT6.1 `b61` |
|---|---|---|
| posesiones | 165,1 | **164,2** |
| s/posesión | 13,06 | 13,07 |
| tiros en ≤ 8 s | 36,7 | 36,7 |
| PPP | 0,971 | 1,007 |
| TOV / TOV% | 26,4 / 15,98 | 23,4 / **14,27** |
| robos (por posesión) | 22,7 (0,138) | 18,8 (**0,115**) |
| FTA / FTr | 19,2 / 0,124 | 20,7 / **0,132** |
| aro / corta / media / triple | 19,2 / 15,4 / 6,3 / 59,1% | **24,0** / 15,5 / 5,4 / 55,0% |
| FG en zona restringida / aro | 53,3 / 45,5% | 54,1 / 45,1% |
| AST/FGM | 0,53 | 0,51 |
| OREB% | 21,3 | 22,2 |
| faltas / tapones | 27,5 / 5,0 | 28,3 / 6,3 |

> **Nota de rigor.** La matriz `b61` se ejecutó antes de un último ajuste (cambio 7): quitar el momento a las pull-ups, que generaban faltas de tiro en triples desde lejos, unas 0,5 por partido.
>
> El piloto `d6` (6 configuraciones × 6 semillas, código final) confirma que las faltas en tiros en suspensión vuelven a 0–0,5, como en BT6, y que lo demás se mantiene:
>
> | neutra | valor |
> |---|---|
> | aro | 25,9% |
> | FTr | 0,15 |
> | TOV% | 13,6 |
> | posesiones | 165 |
>
> Sobre las cifras de `b61`, el FTr puede estar sobreestimado en ~0,005.

### Pérdidas por causa

Ambos equipos, por partido:

| causa | BT6 | BT6.1 |
|---|---|---|
| pase desviado | 7,9 | 6,0 |
| intercepción | 6,2 | 4,7 |
| robo en el bote | 5,1 | 5,2 |
| pase de transición | 2,2 | 2,3 |
| penetración robada | 1,0 | 1,1 |
| falta en ataque | 0,8 | 0,9 |

### Robos

| tipo | BT6 | BT6.1 |
|---|---|---|
| desvío | 8,1 | 6,5 |
| intercepción | 7,7 | 5,3 |
| robo limpio | 6,2 | 6,4 |

Los robos bajan donde estaba el exceso, en los pases. Los robos en el bote, que vienen de la presión de BT6, no cambian.

### Pases interiores

| | BT6 | BT6.1 |
|---|---|---|
| receptor a < 5 m, por partido | ≈ 30 por equipo (12% perdidos) | **97,5** entre los dos equipos (**6,1%** perdidos) |
| entradas (ledger BT4.5, neutra) | 47 por partido (12,3% perdidos) | **78,5 por partido (4,2% perdidos)** |

- Se lanzan más pases interiores y se pierden menos: el pasador ya ve la línea real.
- Pases perdidos por tipo:

  | tipo | perdidos |
  |---|---|
  | reversal | 2,4% |
  | *skip* | 4,1% |
  | outlet | 3,7% |
  | avance de transición | 6,8% |

### Origen de los intentos en el aro

| origen | por partido |
|---|---|
| finalización de penetración | 19,4 |
| transición | 8,7 |
| manejador del bloqueo | 6,3 |
| *roll* | 0,8 |
| rebote ofensivo | 0,8 |
| corte | ~0 |

### Faltas de tiro por origen

| origen | por partido |
|---|---|
| penetración | 8,5 |
| tiro en suspensión | 0,5 |
| cerca del aro (otras) | 0,3 |
| rebote ofensivo | ~0 |

## 5. Ecología de la penetración, después

Neutra, ataque local, por partido:

| resolución → acto | BT6 (d0) | BT6.1 (`b61`) |
|---|---|---|
| *blow-by* → aro | 7,3 | **11,0** |
| *blow-by* → pase fuera | 13,8 | 11,8 |
| ventaja parcial → aro | 2,8 | **6,8** |
| contenida → pase fuera | 4,2 | 3,0 |
| contenida → aro | 0,3 | 1,0 |
| contenida → reset | 0 | 0,2 |
| contenida → *short roll* o pase interior | 0,2 | 0,5 |

Resolución de las penetraciones, media de las 32 configuraciones, los dos equipos:

| resolución | por partido |
|---|---|
| *blow-by* | 67,4 |
| parada | 12,7 |
| contenida | 9,7 |
| ventaja parcial | 8,7 |
| robada | 1,5 |
| falta | 1,5 |

Tras el primer pase (32 configuraciones):

| qué hace el receptor | por partido |
|---|---|
| otro pase | 23,7 |
| tiro contestado | 5,1 |
| tiro abierto | 4,1 |
| ataca el *closeout* | **1,1** |
| segunda penetración | **0,6** |
| se queda con el balón | 1,3 |
| pierde el balón | 2,1 |

- **La ventaja parcial ya se convierte** (aro, tiro tras ayuda, faltas).
- **El pase fuera sigue siendo la respuesta normal a la ayuda.**
- **El pase interior no es la vía de escape por defecto** (0,5 por partido).
- **El reset existe, pero es raro** (0,2–0,3 por partido). Su precio (5 s de reloj) rara vez compensa frente a un pase fuera.
- **La segunda ventaja (atacar el *closeout*, segunda penetración) sigue siendo escasa.** Es lo principal que queda abierto.

### Controles (BT6.1.24–25)

6 semillas; `b61` para las configuraciones de la matriz:

| configuración | qué se observa |
|---|---|
| contención de élite (`oppDefense`) | aro 15–20%, contenidas el doble que en la neutra, sin disparar las pérdidas (TOV% 15–17) |
| ayuda alta | aro rival 26%, PPP 1,06; menos penetración directa |
| ayuda baja | aro rival 29%, PPP 1,04; más penetración directa, menos ventaja tras el pase fuera |
| creador de élite contra defensa de élite (código final, `exp-cvd61-*`) | PPP 0,97 (BT6: 0,89), TOV% 13,3 (16,6), pases interiores perdidos 2,2% (12%) |
| creador de élite contra defensa normal | PPP 1,01–1,03 |

Ningún extremo domina de forma universal.

## 6. Presión

BT6.1 no la toca. Lo que sigue igual:

| presión | *blow-by* | faltas defensivas | PPP del rival |
|---|---|---|---|
| baja | 23% | 15,0 | 1,08 |
| alta | 64% | 17,3 | 1,04 |

Contra la plantilla de creación: 1,09 con presión alta frente a 1,08 con presión baja.

Lo que cambia:

- **Con defensores de élite, la presión ya no rinde** (6 semillas): 1,13 con presión alta frente a 0,99 con presión baja. En BT6 era 0,88 frente a 0,97. Ahora que el defensor batido se lee como batido, cada *blow-by* acaba más veces en el aro.
- **Ninguna intensidad domina.**
- **Distancia de lo que hace el ataque rival entre presión baja y alta:** 1,05 (BT6: 0,97).

## 7. Identidad

**Distancias de estilo** (huella del local; ≈0,4 es ruido):

| par | BT6 | BT6.1 |
|---|---|---|
| entrenador A ↔ B | 0,52 | **0,64** |
| entrenador A ↔ C | 0,60 | 0,77 |
| entrenador B ↔ C | 0,67 | 0,45 |
| plantilla de creación ↔ interior | 2,85 | **3,08** |
| creación ↔ defensa | 1,45 | 1,71 |
| entrenador A + creación ↔ entrenador A + interior | 2,75 | 3,23 |
| plan "jugar dentro" ↔ "abrir la pista" | 1,91 | 1,11 |

- Recuperación parcial de la distancia entre entrenadores: la homogeneización venía en parte de que la ventaja no se convertía.
- La plantilla sigue pesando más que el entrenador.

**Coberturas** (lo que hace el ataque rival):

- distancias 0,42–0,64 (BT6: 0,53–0,90);
- PPP del rival: drop 1,01, switch 1,08, hedge 1,08, blitz 1,14.

El blitz pasa a ser la más castigada. Con la jugada liberada tras el pase fuera, el ataque explota el 4 contra 3 de detrás.

**Identidad individual** (flujo BT4.2, 12 semillas):

| correlación | BT6 | BT6.1 |
|---|---|---|
| creación → asistencias | 0,41 | 0,38 |
| visión → asistencias | 0,37 | 0,32 |
| visión → cuota de pase | 0,07 | 0,25 |

- **No se recupera creación → asistencias.** La creación secundaria tras el pase fuera (atacar el *closeout*, *drive-and-dish*) sigue siendo escasa.
- **Instrumento BT6, 12 semillas:**

  | correlación | valor |
  |---|---|
  | creación → uso | 0,75 |
  | ataque al aro → aro | 0,61 |
  | ataque al aro → tiros libres | 0,37 |
  | rebote → rebotes | 0,66 |
  | defensa interior → tapones | **0,31** (BT6: 0,17) |
  | seguridad de balón → pérdidas | −0,47 |

- **Reparto:** el máximo de cada equipo acapara el 37% de los tiros, el 35% del uso y el 50% de las iniciaciones.

## 8. Validación visual

- **Herramienta:** Phaser (`dev-match-next.html`), semilla 31337, estilos `sag`, `dropD` y `helpHigh`.
- **Escenas:** localizadas con `audit/bt6/scenes.test.ts`, ampliado con las escenas BT6.1.
- **Capturas** (con y sin superposiciones): `C:\Users\jorge\Videos\bdm-bt6-1-visual`.

Pregunta: ¿la secuencia visible explica por qué acabó la posesión?

| escena | ¿se explica? |
|---|---|
| penetración limpia (t2104–2136) | sí: el penetrador llega al aro con su defensor detrás y la ayuda tarde |
| penetración contenida + recogida del bote (t1820–1860) | sí: muere el bote cerca de la zona y el balón sale fuera (t1835) |
| ayuda + pase fuera (t1760–1796) | sí: penetración por la línea de fondo, contacto (t1765) y pase a la esquina |
| *short roll* (t2644–2680) | sí: tras usar el bloqueo, el pase va al bloqueador que rueda hacia el codo |
| entrada interior (t1516–1548) | sí |
| falta en el aro | la escena encontrada (t7560) era una falta en un triple desde medio campo, tras una pull-up desde la penetración. Reveló el error de dar momento a las pull-ups, que se corrigió (cambio 7). |
| reset | no aparece en partidos completos de estos estilos (es raro). Se valida con el test y el log (`offenseReset`). |
| segunda penetración | no se encontró ninguna escena: el fenómeno es escaso (0,6 por partido) |

Sigue visible la aglomeración en el bloqueo directo y en la zona tras la ayuda, igual que en BT6 (pasa a MP2).

## 9. Tests

**Nuevos** (`matchNextDriveEcology.test.ts`):

- el pase a un cortador se lee en la línea al punto de recepción;
- un penetrador con su defensor detrás cree que llega al aro;
- el reset reabre el medio campo y no se asienta hasta que el manejador vuelve fuera.

**Ajustado:**

- `MatchNextDynamicState` "identical persistent consequences for Live and Instant": presupuesto explícito de 20 s.
- Juega dos partidos cortos. En la ejecución paralela de la suite focalizada superaba los 5 s por defecto. Solo pasa y con la igualdad exacta. La aserción no cambia.

**Regresión focalizada** (motor Match Next, `app/matchNext`, presentación, `LiveMatchController`):

- **201 pasan, 5 fallan.** Son los mismos 5 que fallan en `491a877` y `be4b579`, con el mismo mensaje (heredados, sin relación con BT6.1).

**Otras comprobaciones:**

- Determinismo y Live = Instant (`matchNextTactics`, `MatchEnginePort`, `MatchNextDynamicState`): en verde.
- `npm run typecheck`: en verde.
- `npm run build`: correcto (aviso de tamaño de chunk que ya existía).
- `git diff --check`: limpio. Sin `Math.random(` en `src/`.
- Durante el desarrollo, tres tests de un solo partido fallaron en el umbral:
  - asentamiento BT2;
  - variedad de pull-ups BT4;
  - tiros libres BT3.

  Se aislaron las causas (la lectura del *closeout*, revertida, y la falta de momento en las finalizaciones cerca del aro, corregida), sin tocar ningún umbral. Con el código final pasan los tres.

**Rendimiento:**

- 59,8 s por partido frente a 51 s en BT6, con la misma semilla.
- Esa semilla tiene 169 posesiones frente a 149.
- Por posesión, +4% (más lecturas de pase).

## 10. Respuesta a la pregunta final

**Cuando la primera acción ofensiva queda contenida, ¿la posesión sigue como baloncesto?**

**En parte.** Lo que sí:

- un defensor batido ya se castiga en el aro;
- la ventaja parcial termina en aro, falta o tiro tras ayuda;
- el pase fuera tras la ayuda llega a un tirador libre de la obligación de la jugada;
- la penetración contenida sale fuera (o se reinicia);
- el pase interior se lanza cuando la línea está libre de verdad.

Lo que no:

- la segunda ventaja (atacar el *closeout*, segunda penetración, *drive-and-dish*) sigue siendo rara;
- tras el pase fuera la respuesta dominante sigue siendo otro pase.

Por eso DRIVE ECOLOGY queda en PARTIAL.

## 11. Limitaciones que quedan

1. **Creación secundaria escasa.** Ataques al *closeout*, 1,1 por partido; segundas penetraciones, 0,6; creación → asistencias, 0,38.
2. **FTr 0,132.** Solo recupera parte (+0,008). Las faltas siguen viniendo casi todas de la penetración; *roll*, corte y rebote ofensivo apenas generan tiros libres, porque casi no generan intentos en el aro (cortes ~0).
3. **Reset raro** (0,2–0,3 por partido).
4. **El entrenador A tiene más ritmo** en algunos pilotos (174 → 178–186). La media de las 32 configuraciones no cambia (164,2).
5. **Con defensores de élite la presión ya no rinde** (6 semillas). El blitz pasa a ser la cobertura más castigada.
6. **Visual:** aglomeración en el bloqueo y en la zona tras la ayuda (MP2).

## 12. Veredicto

| categoría | estado | motivo |
|---|---|---|
| TECHNICAL | **PASS** | determinista, Live = Instant, typecheck y build en verde, ninguna regresión sin explicar (los 5 fallos son de la base), +4% por posesión |
| DRIVE ECOLOGY | **PARTIAL** | resultados múltiples, ventaja parcial que se convierte, la ayuda crea el pase fuera, el reset existe y el pase interior no es la salida por defecto; pero la segunda ventaja es rara y el reset casi no se usa |
| RIM / FOUL ECONOMY | **PARTIAL** | aro 19,2 → 24,0% por conversión de la ventaja, con la contención intacta; pero el FTr no se recupera de forma material (0,124 → 0,132) |
| TURNOVER ECOLOGY | **PASS** | pases interiores perdidos 12 → 6% (entradas 12,3 → 4,2%); TOV% 16,0 → 14,3; robos 0,138 → 0,115; causas explicadas por la geometría |
| TACTICAL IDENTITY | **PARTIAL** | la plantilla sigue mandando (3,08) y el entrenador recupera parte (A ↔ B 0,52 → 0,64); pero creación → asistencias no se recupera (0,38) |
| POSSESSION ECONOMY | **PASS** | 165,1 → 164,2 posesiones, sin esperas; el reset es una acción |
| BASKETBALL TRUTH | **PARTIAL** | PPP 1,01, acceso al aro y pérdidas creíbles; pero tiros libres bajos y creación secundaria escasa |
| VISUAL RECOGNIZABILITY | **PARTIAL** | las secuencias se explican; aglomeración y legibilidad, a MP2 |
