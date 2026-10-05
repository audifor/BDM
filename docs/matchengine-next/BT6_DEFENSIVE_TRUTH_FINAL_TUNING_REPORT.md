# BT6 · Verdad defensiva, economía de posesión y ajuste final de baloncesto

| | |
|---|---|
| rama | `match-next-basketball-core-bt6-defensive-truth` |
| SHA de partida | `491a877` (BT5, árbol limpio salvo `docs/matchengine-next/` sin seguimiento) |
| SHA final | el commit que contiene este informe (`git log -1`) |
| push / PR / merge | ninguno |
| línea base | `docs/match-next-bt6/BT6_BASELINE.md` |
| datos | `docs/match-next-bt6/audit/` |

**Veredicto (por separado, sin nota global):**

| categoría | estado |
|---|---|
| TECHNICAL | **PASS** |
| DEFENSIVE TRUTH | **PARTIAL** |
| POSSESSION ECONOMY | **PARTIAL** |
| TACTICAL IDENTITY | **PARTIAL** |
| BASKETBALL TRUTH | **PARTIAL** |
| VISUAL RECOGNIZABILITY | **PARTIAL** (lo que es del renderer pasa a MP2) |

En una frase: la causalidad defensiva quedó corregida, pero el beneficio de la presión no se demuestra y aparecen dos regresiones de economía.

- La presión ya no tiene un efecto invertido: cuesta lo que debe (*blow-bys*, faltas, tiros libres) y ninguna intensidad domina.
- La contención depende de quién defiende.
- La ayuda mueve defensores de verdad.
- La transición se clasifica bien y el ritmo baja de 184 a 165 posesiones por acciones, no por esperas.
- **El beneficio de la presión (más pérdidas y robos) no se demuestra a 12 semillas.**
- **Las pérdidas por posesión solo bajan un 7%:** la patología se desplaza de la transición a los pases interiores.
- **Hay dos regresiones de economía:** tiros libres y cuota de aro.

---

## 1. Método

- **Instrumento:** la huella BT5 más un observador BT6 de solo lectura (`src/presentation/match-next/audit/bt6/defense.ts`). Registra:
  - pérdidas por causa;
  - duraciones por cubeta y clase;
  - penetraciones clasificadas (contención, ventaja parcial, *blow-by* y su causa, robo, falta);
  - geometría de la ayuda;
  - saturación de la zona;
  - faltas;
  - pases bajo presión;
  - economía por zona.
- **Matriz:** 32 configuraciones × 6 semillas (`31337, 424242, 7, 1, 99, 2024`), partidos completos de 40 min.
  - `exp-base-*`: código de `491a877`, antes de tocar nada;
  - `exp-final2-*`: código final.
  - Tablas en `summary-base.md` y `summary-final2.md`, comparación compacta en `compare-base-final2.txt` y resumen entre configuraciones en `scorecard-base-final2.txt`.
- **12 semillas** (se añaden `11, 12, 3, 5, 21, 42`):
  - presión baja, media y alta;
  - ayuda baja y alta (`exp-ext-*`, combinadas en `cohorts12-final2.txt`);
  - identidad individual (`players-final.json`, y `players-base.json` ejecutado sobre `491a877` en un *worktree*);
  - flujo BT4.2 (`docs/match-next-bt4-2/audit/flow-bt6final12.json`).
- **Ledger de pase BT4.5:** 6 semillas (`docs/match-next-bt4-5/audit/pass-bt6final.json`).
- **Pilotos de desarrollo:** `exp-p1…p11-*`, con el registro de lo que se probó y se descartó.
- **Comandos:**
  - `BT2_AUDIT=1 BT6_CONFIGS=a,b BT6_SEEDS=6 BT6_TAG=x npx vitest run src/presentation/match-next/audit/bt6/experiments.test.ts`
  - `node scripts/next/bt6Summary.mjs <prefijo>`
  - `node scripts/next/bt6Compare.mjs <prefijo> <prefijo>`
- **Ruido:** con 6 semillas, el PPP de una configuración varía ±0,05–0,08 entre conjuntos de semillas. Todo lo que se certifica sobre presión y ayuda usa 12 semillas.

## 2. Línea base (resumen; detalle en `BT6_BASELINE.md`)

**Presión invertida, reproducida:**

| presión | PPP rival | TOV/pos rival | robos/pos rival | *blow-by* |
|---|---|---|---|---|
| 0,95 | 1,17 | 0,109 | 0,093 | 60% |
| 0,05 | 1,04 | 0,141 | 0,115 | 23% |

**Causas encontradas en el código:**

- el defensor del balón no tenía tiempo de reacción;
- la cinemática no leía ratings defensivos;
- en una penetración el defensor reculaba en lugar de correr;
- con balón se corría igual que sin él;
- la urgencia dependía de quién ganaba el emparejamiento por ratings;
- la creencia del manejador era la contraria de la física (un defensor pegado hacía la penetración menos atractiva);
- la presión solo multiplicaba los intentos de robo, sin coste.

**Pérdidas** (30,7 por partido en la neutra):

- 19 ocurrían en los primeros 8 s;
- pases de transición: 6,8 (14,8 con la plantilla de creación);
- 86 pases por partido lanzados a una línea que el defensor ocupaba 0,3–0,6 s antes, con un 13% perdidos;
- el outlet tras rebote se lanzaba aunque solo tuviera un 60% de completación esperada, con un *fallback* forzado si no había ninguno.

## 3. Cambios

Todos son causales. Ninguno toca un resultado de box score ni introduce esperas. Los parámetros nuevos están en `tuning.ts`, con su motivo.

### 3.1 Punto de ataque: presión ≠ contención (BT6.4–7)

Módulo nuevo `defense/PointOfAttack.ts`.

**Variables, a partir de ratings canónicos:**

| variable | de qué depende |
|---|---|
| explosividad del manejador (`handlerBurst`) | creación, ataque al aro, cansancio |
| anticipación del defensor (`defenderAnticipation`) | técnica en el punto de ataque, manos |
| rapidez del defensor (`defenderQuickness`) | movilidad, técnica |

**Lo que el defensor hace con ellas:**

| magnitud | valor |
|---|---|
| reacción al primer paso | 0,05–0,35 s según el emparejamiento |
| | +0,3 s si viene de fallar un robo |
| | hasta +0,25 s si llega lanzado en un *closeout* |
| deslizamiento en postura | del *backpedal* genérico (0,6) a 0,92, según su juego de pies |
| colchón | presión 1 → 0,6 m (a un brazo); presión 0 → 1,9 m (hundido) |
| | una defensa conservadora da un paso más a quien no puede seguir y se hunde ante quien no tira |

**En `ManDefense`:**

- **En postura** (a ≤ 1,5 m de su sitio), el defensor del balón sigue al manejador con su retraso de reacción.
- **Si aún sube a recogerlo**, va adonde está el manejador. Si no, se pasaría de largo; esto se vio en `matchNextMovement` durante el desarrollo.
- **Contra una penetración no recula**: gira y corre hacia un punto de corte. Quién llega antes decide la contención.
- **El esfuerzo es siempre `sprint`**: se quitó la regla `run`/`sprint` por ratings.

**En `PlayerKinematics`**, quien bota conserva entre el 86% y el 98% de su velocidad punta, según su manejo.

**La decisión cree lo mismo que la física:**

- `driveEdge` usa la separación esperada frente a *ese* defensor, a *esa* distancia.
- En una melé usa al rival más cercano camino del aro.
- Calibración medida: las penetraciones valoradas por debajo de 0,9 batieron al defensor el 31% de las veces; las valoradas por encima de 1,2, el 63%.

### 3.2 Beneficios y costes de la presión (BT6.5, 6.8)

- **Coste de apostar.** Un robo fallido deja al defensor desequilibrado 0,6 s (`offBalanceUntilT`): llega tarde al siguiente paso.
- **Bote muerto.** Una penetración contenida con el defensor encima termina en recogida del bote (`dribblePickedUp`):
  - la distancia depende del manejo;
  - después no hay penetración ni bloqueo;
  - el defensor se pega.
- **Manos en la línea.** Un defensor a ≤ 1,25 m del pasador puede tocar el balón desde la salida. El pasador presionado tiene que pasar por fuera de esas manos.
- **Robo en el bote.** Un balón quieto y protegido queda menos expuesto: la exposición mínima baja de 0,3 a 0,15.
- **Closeouts.** Usan el colchón del punto de ataque, también en la previsión del pasador: la presión llega a un brazo y la defensa conservadora se queda corta.

### 3.3 Ecología de pérdidas (BT6.9–14, 34)

- **Línea ocupada.** Un defensor con más de 0,25 s de holgura en la línea se queda el balón (hasta 0,85 × manos).
  - Antes había un tope de 0,12, que el pasador también percibía.
  - El sesgo de visión del pasador baja de 0,30 a 0,15 s.
- **Outlet como decisión.** El pase adelantado en transición compite con asegurar el balón y subirlo (que vale 1):
  - gana progreso (hasta 20 m), ventaja numérica y ponerlo en manos del creador;
  - perderlo ahí cuesta 1,5;
  - se quitó el *fallback* forzado.
- **Campo abierto.** Un pase perdido en transición, o con la media pista sin montar, cuesta 0,6 más.
- **Desvíos.** Un pase tocado conserva el 45% de su velocidad en su línea (antes casi se paraba junto al defensor). Así no todo desvío es un robo.

### 3.4 Ayuda física (BT6.15–18)

| aspecto | conservadora | agresiva |
|---|---|---|
| cuándo se dispara | 3,4 m del aro | 7 m |
| dónde se coloca el ayudador (`helpSpot`) | en el aro, sobre la línea del penetrador | sube a su camino, 1,5 m delante |
| *stunt* desde el nail | no | por encima de 0,55 de agresividad |

El *stunt*:

- lo hacen los defensores en el hueco a ≤ 7 m del penetrador;
- dan hasta 2,2 m hacia él, menos ante un tirador;
- se quedan siempre a ≥ 2,5 m, es decir, amagan y no doblan;
- antes de esa distancia mínima, la revisión visual mostraba defensores encima del balón.

Solo se mueve quien tiene la responsabilidad (ayudador, rotaciones, *stunt*). El lado débil lejano se queda en casa.

### 3.5 Contest geométrico (BT6.35)

`contestAngleFactor`:

| posición de la mano | factor |
|---|---|
| entre tirador y aro | 1 |
| de lado | 0,8 |
| desde detrás | 0,35 |

Antes, un defensor batido que perseguía disputaba como uno que estaba delante: el FG en el aro era de 40–47%.

### 3.6 Transición verdadera (BT6.23–24)

- `ShotEcology` solo etiqueta `TRANSITION` un tiro en los primeros 8 s con ventaja real: más atacantes que defensores entre el balón y el aro, o menos de 3 defensores de vuelta.
- Antes, cualquier tiro en los primeros 6 s era transición.
- Es una etiqueta: ninguna decisión la lee. El ataque temprano sin ventaja se cuenta aparte.

### 3.7 Adaptación estable (BT6.28–29)

`MatchMemory`:

- una cobertura adoptada en partido se juzga solo con sus propias posesiones;
- revertir una decisión del banquillo exige 4 posesiones más de evidencia;
- se recuerda lo que concedía cada cobertura abandonada, y volver a ella exige que la actual sea claramente peor (histéresis).

### 3.8 Familiaridad (BT6.26–27)

Dos efectos causales y pequeños:

- las rotaciones esperan la llamada entre defensores: hasta 0,5 s con familiaridad 0;
- la lectura tras recibir se alarga hasta 0,3 s.

Ningún tiro mejora por familiaridad.

### 3.9 Mecanismos (BT6.45)

| mecanismo | estado | por qué |
|---|---|---|
| modos de presión (colchón, reacción, apuesta, bote muerto, manos en la línea) | **ACTIVO** | |
| agresividad de la ayuda (disparo, posición del ayudador, *stunt*) | **ACTIVO** | |
| adaptación (con histéresis y muestra propia) | **ACTIVO** | |
| familiaridad (llamada de rotación, lectura del sistema) | **ACTIVO** | pequeño |
| outlet directo al creador | **ACTIVO**, dentro del valor del outlet (`outletCreatorGain`) | no es un modo aparte |
| saque al creador (`inboundToCreator`) | **DESACTIVADO** | pérdidas de transición 2,2 → 6,0 y totales 25,5 → 30 (p10) |
| leak-out (`leakOut`) | **DESACTIVADO** | con el entrenador A: +0,03 PPP propio, pero pérdidas 30 → 34 y pases de transición perdidos 3,8 → 5,5 (p10) |

Ni el saque al creador ni el leak-out se activan: el pase largo a un corredor sigue siendo demasiado arriesgado con esta física de pase (10 m/s). Ambos se pueden activar por `tuning` para auditoría.

---

## 4. Auditoría de presión (BT6.4–8, 38)

**12 semillas**, defensa local con el entrenador C rígido y solo la presión cambiando:

| presión | PPP rival | TOV/pos rival | robos/pos rival | *blow-by* | contenidas | faltas def. | FTr rival | botes muertos | balón a ≤ 1,15 m |
|---|---|---|---|---|---|---|---|---|---|
| 0,05 | 1,008 | 0,154 | 0,130 | 17% | 13% | 13,3 | 0,10 | 4,0 | 18% |
| 0,50 | 1,032 | 0,141 | 0,119 | 39% | 10% | 14,3 | 0,12 | 2,3 | 22% |
| 0,95 | 1,010 | 0,150 | 0,131 | 61% | 3% | 21,0 | 0,24 | 0,8 | 34% |

**Según quién defiende y quién ataca** (6 semillas):

| | PPP rival con presión alta | con presión baja | contenidas (baja) |
|---|---|---|---|
| defensa de élite | **0,88** | 0,97 | **31%** (13% con defensores normales) |
| contra manejadores de élite | 0,94 | 1,08 | |

Lectura:

- **Ya no hay causalidad invertida:**
  - BT5 tenía una diferencia de +0,13 en PPP y −20% de robos con la presión alta;
  - ahora la diferencia de PPP es nula a 12 semillas y los robos no bajan.
- **Los costes de presionar son reales, monotónicos y causales:**
  - *blow-bys* (17 → 61%);
  - faltas (13 → 21);
  - tiros libres (0,10 → 0,24);
  - el defensor está más tiempo pegado (18 → 34%).
- **Hundirse también tiene un coste y un beneficio:**
  - contiene más (13% frente a 3%) y produce más botes muertos (4,0 frente a 0,8);
  - concede tiro (triple del rival 58% frente a 55%).
- **La contención depende de quién defiende:** los defensores de élite contienen el 31% con presión baja.
- **Ninguna intensidad domina.** Con defensores de élite la presión rinde (0,88). Con manejadores de élite no hay una pérdida clara (las diferencias a 6 semillas están dentro del ruido).
- **NO conseguido:** a 12 semillas la presión alta no fuerza más pérdidas ni más robos que la baja. A 6 semillas (p9) parecía monotónico; era ruido. Los beneficios están implementados como mecanismos (apuesta, manos en la línea, bote muerto), pero su efecto neto no se distingue del ruido. Por eso DEFENSIVE TRUTH es PARTIAL.

## 5. Contención y *blow-by* (BT6.6–7)

**Penetraciones recibidas** (neutra, por partido y equipo): 68 → 51.

| clase | base | final |
|---|---|---|
| *blow-by* | 47% | 40% |
| contenida | 10% | 8% |

Las demás son de ventaja parcial (paran, flotan o pasan).

**Causas del *blow-by*** (diagnóstico):

- ventaja del manejador sobre un defensor en postura;
- *closeout* (el defensor llega lanzado: reacción hasta +0,25 s);
- desajuste (≥ 15 puntos de rating o −15 cm);
- switch;
- bloqueo.

En `pressureHigh`, por partido: ventaja del manejador 13,8; *closeout* 7,7; desajuste 7,3; *closeout* más desajuste 6,2. Con la presión media (neutra): 10,0 / 5,0 / 3,2 / 2,3. Detalle en `blowByCauses` de cada configuración.

**La creencia coincide con la física:**

| valor de la penetración (decisión) | < 0,9 | 0,9–1,0 | 1,0–1,1 | 1,1–1,2 | ≥ 1,2 |
|---|---|---|---|---|---|
| *blow-by* real (p6) | 31% | 26% | 48% | 56% | 63% |

## 6. Auditoría de pérdidas (BT6.9–14)

Media de las 32 configuraciones, por partido, los dos equipos:

| causa | base | final |
|---|---|---|
| pase de transición | 8,0 | **2,2** |
| pase desviado | 5,9 | 7,9 |
| intercepción (media pista) | 5,0 | 6,2 |
| robo en el bote | 5,7 | 5,1 |
| penetración robada | 1,8 | 1,0 |
| falta en ataque | 1,7 | 0,8 |
| pase fuera | 1,0 | 0,8 |
| balón golpeado | 1,0 | 0,7 |
| 24 s | 0,7 | 0,9 |
| **total** | **31,6** | **26,4** |
| **TOV%** | **17,2** | **16,0** |
| robos/posesión | 0,144 | 0,138 |

**Ledger de pase** (neutra, 6 semillas):

| | BT5 | final |
|---|---|---|
| outlets por partido | 78,7 | 16,5 (el reboteador sale botando) |
| outlets perdidos | 8,5% | **2,0%** |
| reversal perdidos | 4,5% | 4,1% |
| **entradas interiores perdidas** (receptor a < 5 m del aro) | 5,3% | **12,3%** (5,8 pérdidas por partido) |
| pases a líneas con 0,3–0,6 s de holgura | 86 por partido | 31 por partido, con un 26% perdidos |

- **Lo que sí se consiguió:** la patología de transición desaparece (8,0 → 2,2) y con ella las pérdidas en los primeros 4 s (9,8 → 4,7 en la neutra).
- **Lo que no:**
  - las pérdidas absolutas bajan un 16%, pero, como hay menos posesiones, por posesión solo un 7%;
  - la patología se ha desplazado a los pases interiores. La "línea ocupada" castiga ahora de verdad un pase a la zona con un defensor dentro, pero la prioridad del pase de la jugada (+0,3 a la entrada al poste con completación > 0,8) y la obligación de actuar en media pista siguen empujando esos pases;
  - los robos siguen altos (0,138 por posesión rival; la referencia NBA está en torno a 0,08).

## 7. Duración de las posesiones (BT6.21–25)

Media de las 32 configuraciones, por partido, los dos equipos:

| | base | final |
|---|---|---|
| posesiones | 183,8 | **165,1** |
| s/posesión (reloj de juego) | 11,7 | 13,1 |
| tiros en ≤ 8 s | 51,3 | 36,7 |
| contraataque real (con ventaja) | 0,5 | 21,1 |
| ataque temprano sin ventaja (tras rebote o robo) | 44,7 | 21,8 |
| ataque temprano tras saque | 31,4 | 10,8 |
| media pista | 106,6 | 111,0 |
| media pista de > 20 s | 16,1 | 24,5 |

Por cubetas, en la neutra final:

| clase | ≤ 4 s | 5–8 s | 9–12 s | 13–16 s | 17–20 s | > 20 s |
|---|---|---|---|---|---|---|
| contraataque | 3,5 | 13,7 | 2,2 | 0,5 | 0,5 | 0,2 |
| media pista | — | — | 34,5 | 30,5 | 22,5 | 24,5 |
| pérdidas | 4,7 | 9,7 | 4,8 | 2,5 | 2,3 | 1,7 |

Continuación tras rebote ofensivo (BT6.25): 7,2 por partido y equipo, media de 7,6 s. Se pone tiro, se pasa fuera o se reinicia según el contexto, con las reglas de reloj de BT4.

**Sin esperas falsas:** las posesiones se alargan porque:

- el reboteador sale botando en lugar de lanzar un outlet arriesgado;
- hay menos tiros tempranos sin ventaja;
- la contención obliga a una segunda acción;
- el manejador con bote muerto tiene que pasar.

## 8. Ayuda y coberturas (BT6.15–18)

**Ayuda**, 12 semillas:

| ayuda | PPP rival | aro rival | triple rival | FTr rival | penetraciones recibidas | PPS tras el pase fuera | tapones/aro | FG en el aro del rival |
|---|---|---|---|---|---|---|---|---|
| 0,05 | 1,014 | 25,1% | 56,3% | 0,13 | 53,9 | 1,17 | 14,8% | 52,9% |
| 0,95 | 1,063 | 22,4% | 59,9% | 0,17 | 52,4 | 1,18 | 13,2% | 47,6% |

- **La ayuda agresiva cambia la geometría:**
  - menos aro (−2,7 puntos);
  - peor FG en el aro (−5 puntos);
  - más triples;
  - más faltas.
- **Pero en total concede más** (+0,05 PPP, en el límite del ruido). Los tapones no suben.
- Es un *trade-off* real, pero no favorable con esta plantilla. En el piloto p8, antes de limitar el *stunt* a 2,5 m del penetrador, la ayuda alta bajaba el PPP (0,99 frente a 1,06). El precio de que no se vea a un defensor doblando encima del balón es que la ayuda agresiva protege menos.

**Coberturas** (misma defensa, ataque neutro, 6 semillas):

| cobertura | PPP rival | TOV rival | robos | aro | triple | PnR | FTr | ayudas TAG |
|---|---|---|---|---|---|---|---|---|
| drop | 0,975 | 0,168 | 0,145 | 22% | 55% | 17% | 0,21 | 33 |
| switch | 0,940 | 0,142 | 0,127 | 17% | 64% | 8% | 0,10 | 2 |
| blitz | 0,956 | 0,174 | 0,147 | 19% | 62% | 9% | 0,13 | 102 |
| hedge | 0,996 | 0,174 | 0,151 | 21% | 60% | 15% | 0,11 | 71 |

- **drop:** concede la zona (17% de tiros de media distancia corta, la cuota más alta) y el PnR del manejador.
- **switch:** quita el aro y el PnR y concede triples, con desajustes (0,95 *switches* por bloqueo).
- **blitz:** saca el balón (máximo de pérdidas y robos, 102 TAG por partido) y concede 1,29 PPS tras el pase fuera (4 contra 3).
- Ninguna domina (0,94–1,00).
- Distancia entre lo que hace el ataque rival frente a cada una:
  - drop ↔ switch 0,90;
  - drop ↔ blitz 0,69;
  - switch ↔ blitz 0,53.

**Saturación de la zona (BT6.19):**

- 0,7 atacantes y 1,7 defensores de media en la zona;
- saturación el 2,0–2,7% del tiempo, injustificada el 1,1–1,7%;
- ningún episodio largo, salvo 0,3 por partido con ayuda baja.

Ya era episódica en la línea base. La aglomeración visible está alrededor del balón en los bloqueos directos, no en la zona (sección 12).

## 9. Familiaridad (BT6.26–27)

Decisión: **efecto causal pequeño, activo.**

| | familiaridad 20 | familiaridad 95 |
|---|---|---|
| PPP del rival (defensa) | 1,11 | 1,01 |
| PPP propio (ataque) | 1,05 | 1,01 |
| distancia de estilo entre ambas | 0,55 (BT5: 0,52) | |

- **En defensa** se ve en la dirección esperada: las rotaciones llegan tarde.
- **En ataque** está dentro del ruido.
- No domina sobre los jugadores ni sobre la táctica, como pide el brief.

## 10. Adaptación (BT6.28–29)

| | base | final |
|---|---|---|
| ajustes por partido | 2,20 | 1,82 |
| cambios de cobertura por partido | 0,41 | 0,31 |
| oscilaciones A→B→A | 4 en 192 partidos | **1** |

La oscilación que queda (adaptHigh: switch → drop → switch) llega 1150 ticks (casi 2 min de juego) después, con evidencia.

La adaptación sigue siendo real: el PPP del rival es 1,01 con el entrenador adaptable y 1,11 con el rígido. En BT5 eran 0,91 y 1,04.

## 11. Regresión táctica (BT6.37)

Distancias de identidad (huella del local; ≈0,4 es el ruido entre semillas):

| par | BT5/base | final |
|---|---|---|
| plantilla de creación ↔ interior | 1,86 | **2,85** |
| creación ↔ defensa | 1,54 | 1,45 |
| interior ↔ defensa | 1,43 | 2,07 |
| entrenador A + creación ↔ entrenador A + interior | 2,39 | 2,75 |
| plan "jugar dentro" ↔ "abrir la pista" | 1,08 | **1,91** |
| plan "abrir la pista" ↔ "correr" | 1,25 | 1,40 |
| **entrenador A ↔ B** | **1,04** | **0,52** |
| entrenador A ↔ C | 0,97 | 0,60 |
| entrenador B ↔ C | 0,66 | 0,67 |
| neutro ↔ rival de creación | 0,92 | 1,30 |

La identidad de plantilla y de plan se refuerza. **La distancia entre entrenadores se reduce a la mitad.** No es un artefacto de la etiqueta de transición: sin esa dimensión, A ↔ B pasa de 0,90 a 0,55.

La métrica son 14 dimensiones, casi todas de perfil de tiro, y la contención real comprime el perfil de tiro de todos. En cambio, la identidad de **decisión** del entrenador sobrevive:

| | entrenador A | entrenador B |
|---|---|---|
| familias de jugada | BS 41 · DK 17 · ISO 16 | MOV 28 · BS 21 · CIRC 18 |
| cobertura | blitz 88% | drop 70% |
| bloqueos sin balón por posesión | 0,013 | 0,124 |
| posesiones | 87 | 78 |
| s/posesión | 12,7 | 14,2 |

Interacción entrenador × plantilla: el entrenador A rinde 0,85 de PPP con la plantilla de creación y 0,80 con la interior. Tiene coste con una plantilla que no lo sostiene; con la de creación también lo tiene, que es nuevo respecto a BT5.

**Identidad individual (BT6.30):**

| correlación | BT5 | base | final |
|---|---|---|---|
| creación → asistencias (instrumento BT4.2, 12 semillas) | **0,54** | | **0,41** |
| visión → asistencias (BT4.2) | 0,46 | | 0,37 |
| creación → asistencias/36 (instrumento BT6) | | 0,30 | 0,27 |
| creación → uso/36 | | 0,67 | 0,71 |
| creación → iniciaciones/36 | | 0,79 | 0,78 |
| tiro → triples/36 | | 0,67 | 0,68 |
| ataque al aro → intentos en el aro/36 | | 0,49 | **0,59** |
| ataque al aro → tiros libres/36 | | 0,23 | **0,37** |
| rebote → rebotes/36 | | 0,66 | 0,67 |
| robo → robos/36 | | 0,22 | 0,17 |
| defensa interior → tapones/36 | | 0,20 | 0,17 |
| seguridad de balón → pérdidas por uso | | −0,46 | −0,37 |

**Reparto de roles (BT6.31):** el máximo de cada equipo acapara:

- el 35% de los tiros;
- el 34% del uso;
- el 52% de las iniciaciones;
- el 38% de las asistencias.

En la base eran 37%, 35%, 50% y 34%: las estrellas siguen siendo estrellas, sin igualitarismo artificial.

**Regresión:**

- En el instrumento oficial BT4.2, creación → asistencias baja de 0,54 a 0,41. En el instrumento BT6 apenas cambia (0,30 → 0,27). Los dos instrumentos no coinciden en magnitud.
- Las relaciones de finalizador mejoran.
- Las defensivas (robo → robos, defensa interior → tapones) siguen débiles.

## 12. Validación visual (BT6.42–44)

- **Microscopio:** el visor Phaser real (`dev-match-next.html`, Vite en el puerto 5311).
- **Escenarios:** `?homeStyle=` con los estilos nuevos `press`, `sag`, `dropD`, `switchD`, `blitzD`, `helpHigh` y `helpLow` (`dev/tacticalStyles.ts`).
- **Ticks:** se localizan con `audit/bt6/scenes.test.ts`, misma semilla (31337).
- **Capturas:** 10 escenarios, con y sin superposiciones (`names, action, screens, assignments, targets`), en `C:\Users\jorge\Videos\bdm-bt6-visual-final` (fuera del repo). Una primera pasada con código intermedio está en `bdm-bt6-visual`.

| # | escenario | ¿parece baloncesto? (sin superposiciones) | ¿el movimiento coincide con el estado del motor? |
|---|---|---|---|
| 1 | presión alta (`press`, t1201–1245) | sí: el defensor va pegado al hombro del manejador | sí: ON_BALL a un brazo; *reach* en el log |
| 2 | presión baja (`sag`, t513–557) | no se distingue de la media en fotograma fijo: la ventana cae en un bloqueo | sí |
| 3 | DROP (t1845–1893) | sí: el grande espera atrás | sí |
| 4 | SWITCH (t2585–2629) | **aglomeración** de 6 jugadores alrededor del balón en el cambio | sí: el cambio de asignaciones ocurre al usar el bloqueo |
| 5 | BLITZ (t2101–2145) | sí: trampa en el ala, balón fuera, TAG al roller en la zona | sí |
| 6 | penetración, ayuda y pase fuera (`helpHigh`, t2441–2485) | sí: el low man sube al camino; el pase sale al lado de la ayuda | parcial: el X_OUT queda encima del balón, porque su objetivo es el punto medio de dos atacantes (heredado de BT2) |
| 7 | P&R (`sag`, t877–921) | sí | sí |
| 8 | acción sin balón (`dropD`, COME_OFF t2293–2329) | sí | sí |
| 9 | transición (`press`, t805–845) | sí: tras la canasta, la defensa recoge al manejador en medio campo; *reach* | sí |
| 10 | media pista (`sag`, t1401–1557) | sí: 5-out espaciado, defensores entre su hombre y el aro | sí |

**Reconocible sin ayudas:**

- la presión en el punto de ataque cuando el manejador está asentado;
- la ayuda que sube al camino;
- la trampa del blitz;
- el ritmo (ya en BT5).

**Difícil de reconocer:**

- presión baja frente a media;
- drop frente a hedge;
- el *stunt*.

El 65% del tiempo con balón son recepciones y bloqueos (`gap-probe-*.json`), y ahí todas las defensas se parecen.

**Defectos visuales que quedan:**

- aglomeración alrededor del balón en los bloqueos directos;
- el X_OUT encima del balón.

Lo que es de presentación (legibilidad de las coberturas, animación del bloqueo) pasa a MP2.

## 13. Economía estadística (BT6.32–33, 41)

Media de las 32 configuraciones, los dos equipos, por partido:

| métrica | base | final | referencia externa (solo aceptación, no se usa en el motor) |
|---|---|---|---|
| posesiones | 183,8 | 165,1 | FIBA ≈ 145–155 |
| s/posesión | 11,7 | 13,1 | |
| PPP | 1,00 | 0,97 | ≈ 1,0–1,1 |
| TOV% | 17,2 | 16,0 | ≈ 13–15 |
| robos/posesión | 0,144 | 0,138 | ≈ 0,08 |
| AST/FGM | 0,55 | 0,53 | ≈ 0,55–0,6 |
| OREB% | 22,3 | 21,3 | ≈ 22–28 |
| FTA/FGA | 0,187 | **0,124** | ≈ 0,25 |
| aro (zona restringida + aro) | 29% | **19%** | ≈ 30–35% |
| corta / flotadora | 11% | 15% | |
| media distancia | 4% | 6% | |
| triple | 56% | 59% | ≈ 40% |
| FG en zona restringida / aro | 46,7% / 40,3% | **53,3% / 45,5%** | ≈ 65% / 45% |
| transición real por partido | (mal etiquetada) | 21 | |
| faltas | 36,8 | 27,5 | ≈ 40 |
| tapones | 6,8 | 5,0 | |

Variación (neutra, 6 semillas):

| | mínimo | máximo |
|---|---|---|
| posesiones | 149 | 168 |
| pérdidas | 18 | 30 |
| robos | 13 | 29 |

**Regresiones de economía causadas por BT6:**

- **Tiros libres y cuota de aro.** La línea base llegaba al aro porque nadie contenía. Ahora la defensa contiene y, por tanto:
  - hay menos intentos en el aro (47 → 29 por partido);
  - hay menos faltas de tiro;
  - las faltas en total bajan de 37 a 28, con menos bonus.

  Por intento en el aro, la tasa de falta de tiro no baja (0,27 → 0,29, media de las 32 configuraciones). Falta que el ataque genere aro por otras vías (cortes, *rolls*, poste).
- **Triples.** Suben de 56% a 59%. Eran ya la estructura de valor del motor desde BT4.

## 14. Rendimiento (BT6.46)

Un partido completo (semilla 31337, observador incluido), con la máquina libre y ejecuciones consecutivas:

| | base `491a877` | final |
|---|---|---|
| tiempo por partido | 56,4–59,2 s | **50,7–51,7 s** |
| posesiones | 194 | 149 |

- Unos −10% por partido, porque hay menos posesiones con el mismo tiempo de juego.
- El coste por tick no crece:
  - la lectura del punto de ataque es O(1) por defensor;
  - la línea del pasador añade una distancia por defensor y pase.
- Sin barridos patológicos.

## 15. Tests (BT6.47–50)

**Nuevos o adaptados (sin borrar ninguno):**

- `matchNextTactics`: "una cobertura adoptada se juzga con sus posesiones y el banquillo no vuelve por ruido" (histéresis, muestra propia, vuelta legítima).
- `matchNextPassEcology`: el caso BT4.5 "un defensor junto a la línea que no llega no es amenaza" se mantiene, con un defensor a 0,9 m de la línea. Se añade el caso BT6.8: un defensor encima del pasador, con la mano en la línea, puede tocar la salida, pero solo como una apuesta pequeña (< 5%). El caso BT4.5 original (a 0,3 m de la línea, junto al pasador) es justo lo que BT6.8 cambia, por razón de baloncesto.
- `matchNextDefense`: la urgencia del defensor del balón en una penetración es `sprint`. BT6.6 quita la regla por ratings.

**Resultados:**

| comprobación | resultado |
|---|---|
| ficheros del motor Match Next (sin `matchNext.test.ts`) | 131/131 |
| regresión focalizada (motor, `app/matchNext`, presentación, `LiveMatchController`) | **198 pasan, 5 fallan** |
| determinismo y Live = Instant (`matchNextTactics` "is deterministic and Live and Instant share the same authority", `MatchEnginePort`, `MatchNextDynamicState` "identical persistent consequences for Live and Instant") | en verde |
| `npm run typecheck` | en verde |
| `npm run build` | correcto (solo el aviso de tamaño de chunk que ya existía) |
| `git diff --check` | limpio |
| `Math.random(` en `src/` | ninguno |
| imports de React, Zustand o Tauri en el motor | ninguno |
| suite completa | no se ejecutó |

**Fallos existentes (BT6.49).** Los 5 fallan igual en `491a877`, en un *worktree* `C:\BDM-BT6-BASE`, con el mismo mensaje de error:

| test | error | clasificación |
|---|---|---|
| `LiveMatchController` "exactly one live sporting step" | `expected 3 to be 1` | base, sin relación |
| `matchNext` "prepares a JSON-safe setup" | `offensiveReboundShotClockSeconds` | base, sin relación |
| `matchNext` "scores a planned make once…" | `gameRunning true ≠ false` | base, sin relación |
| `matchNext` "distinguishes physical defensive rebounds…" | objeto de posesión | base, sin relación |
| `matchNext` "keeps production engine code free…" | la regla `Map\|Set` coincide en un fichero de tipos | base, sin relación |

- Ninguno se corrige ni empeora con BT6.
- En la base, una ejecución también falló de forma intermitente "updates the runtime active five…", que en la rama pasa.

## 16. Defectos conocidos

1. **El beneficio de la presión no se demuestra a 12 semillas.** Más pérdidas y más robos quedan dentro del ruido. Los costes sí se demuestran.
2. **Los robos siguen altos** (0,138 por posesión) y **los pases interiores se pierden un 12,3%**. La prioridad del pase de la jugada y la obligación de actuar empujan pases a una zona ocupada. Es el siguiente punto de la ecología de pase: que la selección del pase exija más confianza para una entrada interior priorizada.
3. **Pocos tiros libres y poca cuota de aro** (FTA/FGA 0,12; aro 19%).
4. **La ayuda agresiva no compensa en PPP** (+0,05) tras limitar el *stunt*.
5. **Las distancias de estilo entre entrenadores se reducen a la mitad** (A ↔ B 1,04 → 0,52), aunque la identidad de decisión sobrevive. Creación → asistencias baja a 0,41 en el instrumento BT4.2.
6. **Visual:**
   - aglomeración alrededor del balón en los bloqueos directos;
   - X_OUT encima del balón (heredado de BT2);
   - presión baja y media, y drop y hedge, poco distinguibles a velocidad real (MP2).
7. **Leak-out y saque al creador siguen desactivados.**

## 17. Veredicto

| categoría | estado | motivo |
|---|---|---|
| TECHNICAL | **PASS** | determinista; Live = Instant; typecheck y build en verde; ninguna regresión nueva (los 5 fallos son de la base); −10% de tiempo por partido |
| DEFENSIVE TRUTH | **PARTIAL** | presión no invertida, con costes causales; contención por ratings; ayuda con geometría real; coberturas con *trade-offs*; ningún ajuste domina. Pero el beneficio de la presión no se demuestra, los robos siguen altos y la ayuda agresiva no compensa |
| POSSESSION ECONOMY | **PARTIAL** | ritmo 184 → 165 sin esperas; duraciones por acciones; transición bien clasificada; patología de transición resuelta. Pero TOV% solo 17,2 → 16,0, con la pérdida desplazada a los pases interiores |
| TACTICAL IDENTITY | **PARTIAL** | identidades de plantilla y plan más fuertes; identidad de decisión del entrenador intacta; adaptación estable (oscilaciones 4 → 1); familiaridad con efecto legítimo y pequeño. Pero la distancia de estilo entre entrenadores es la mitad y creación → asistencias baja a 0,41 |
| BASKETBALL TRUTH | **PARTIAL** | finalización en el aro creíble; contest geométrico; transición real; ritmo. Pero tiros libres 0,12, aro 19%, triple 59% y robos altos |
| VISUAL RECOGNIZABILITY | **PARTIAL** | presión en el punto de ataque, ayuda y blitz reconocibles y coherentes con el motor; aglomeración en los bloqueos y coberturas sutiles a MP2 |
