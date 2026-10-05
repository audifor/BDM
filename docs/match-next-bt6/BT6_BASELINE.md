# BT6 · Línea base (antes de tocar el motor)

- **Punto de partida:**
  - commit `491a877` (BT5);
  - rama `match-next-basketball-core-bt6-defensive-truth`;
  - árbol limpio salvo `docs/matchengine-next/` (sin seguimiento, preexistente).
- **Instrumento:**
  - huella BT5 más el observador defensivo BT6 (`src/presentation/match-next/audit/bt6/defense.ts`);
  - el observador solo lee estado y eventos y no cambia ningún partido.
- **Muestra:**
  - 32 configuraciones × 6 semillas (`31337, 424242, 7, 1, 99, 2024`), partidos completos de 40 min;
  - datos en `audit/exp-base-g*.json` y tablas completas en `audit/summary-base.md` (generadas con `node scripts/next/bt6Summary.mjs base`).

Comandos:

- **Matriz:**

  ```
  BT2_AUDIT=1 BT6_CONFIGS=a,b BT6_SEEDS=6 BT6_TAG=base-gN npx vitest run src/presentation/match-next/audit/bt6/experiments.test.ts
  ```

- **Comparación compacta:**

  ```
  node scripts/next/bt6Compare.mjs base <prefijo>
  ```

## 1. Totales por partido (los dos equipos), configuración neutra

| posesiones | puntos | PPP | FGA | 2PA | 3PA | FTA | TOV | TOV% | STL | OREB | DREB | AST | faltas | BLK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 186,0 | 186,7 | 1,00 | 168,0 | 70,7 | 97,3 | 33,3 | 30,7 | 16,5 | 25,5 | 21,3 | 79,2 | 37,2 | 38,0 | 5,7 |

| transición | tiros ≤ 8 s | posesiones de media pista | s/posesión | pases/posesión | penetraciones | bloqueos directos | acciones sin balón | poste |
|---|---|---|---|---|---|---|---|---|
| 18,7 | 52,3 | 106,8 | 11,41 | 2,83 | 129,7 | 68,3 | 33,2 | 7,3 |

Variación entre semillas (neutra):

| | mínimo | máximo |
|---|---|---|
| posesiones | 181 | 194 |
| pérdidas | 26 | 46 |
| robos | 20 | 41 |

## 2. La contradicción de la presión (BT6.4), reproducida

El equipo local cambia solo la presión; entrenador C rígido.

| presión local | PPP rival | TOV rival/pos | robos/pos rival | penetraciones recibidas/partido | blow-by | contenida | faltas defensivas | aro rival | triple rival |
|---|---|---|---|---|---|---|---|---|---|
| 0,05 | 1,04 | 0,141 | 0,115 | 62 | 23% | 10% | 15,8 | 31% | 54% |
| 0,50 | 1,08 | 0,136 | 0,114 | 71 | 50% | 5% | 18,2 | 35% | 54% |
| 0,95 | **1,17** | **0,109** | **0,093** | 73 | **60%** | 2% | 23,0 | 40% | 46% |

- La presión alta concede más blow-bys, más faltas y más aro, y **fuerza menos pérdidas y menos robos**.
- El rival pasa menos (2,62 pases/posesión frente a 3,35 en BT5): la negación de líneas le hace penetrar contra un defensor pegado que no contiene.
- Con defensores de élite (plantilla defensiva):
  - la presión alta (PPP rival 1,01) no mejora a la baja (1,00);
  - los defensores élite son batidos lo mismo (54%) que los normales.

**La contención no depende de quién defiende.**

### Causas encontradas en el código

1. **Sin percepción ni reacción.** El objetivo del defensor del balón se recalcula cada tick desde la posición actual del manejador: no hay retraso de reacción. Lo único que limita es la cinemática.
2. **La cinemática no lee ratings defensivos.** Sale de un perfil atlético genérico; el *backpedal* es de 0,6 para todos. `pointOfAttack` y `mobility` no cambian cómo se desliza nadie.
3. **El defensor nunca "gira y corre".** En una penetración recula de cara al balón al 60–80% de su velocidad. En línea recta casi cualquier penetración le gana.
4. **El manejador corre igual de rápido con balón que sin él.**
5. **La urgencia del defensor en una penetración dependía de los ratings** (`sprint` si gana el emparejamiento, `run` si no). Era un resultado escrito en la regla, no una consecuencia.
6. **La creencia del manejador era la contraria de la física.** `driveEdge` sumaba `(gap − 1,1)/5`: un defensor pegado hacía la penetración menos atractiva, cuando en la física la hacía más probable.
7. **La presión solo multiplicaba la frecuencia de intentos de robo.** Un intento fallido no tenía coste.

## 3. Ecología de pérdidas (BT6.9)

Pérdidas por partido (los dos equipos), según su causa:

| config | pase de transición | pase desviado | robo en el bote | intercepción | penetración robada | falta en ataque | pase fuera | balón suelto | 24 s |
|---|---|---|---|---|---|---|---|---|---|
| neutra | **6,8** | 6,5 | 6,2 | 4,2 | 2,2 | 1,8 | 1,2 | 0,8 | 0,3 |
| plantilla de creación | **14,8** | 5,2 | 3,5 | 4,8 | 1,0 | 1,5 | 1,2 | 0,8 | 0,7 |
| entrenador A | **9,8** | 6,5 | 7,7 | 4,8 | 2,2 | 1,7 | 0,8 | 2,2 | 1,2 |

Cuándo ocurren (neutra):

| ≤ 4 s | 5–8 s | 9–12 s | 13–16 s | 17–20 s | > 20 s |
|---|---|---|---|---|---|
| 9,8 | 9,5 | 5,5 | 3,0 | 1,5 | 1,3 |

**19 de 31 pérdidas ocurren en los primeros 8 segundos.**

Pérdidas por tipo de pase (ledger de pase BT4.5 sobre las semillas finales de BT5):

| tipo | por partido | se pierde | pérdidas/partido |
|---|---|---|---|
| outlet | 78,7 | **8,5%** | 6,7 |
| reversal | 161,7 | 4,5% | 7,3 |
| entrada | 56,7 | 5,3% | 3,0 |
| avance de transición | 17 | 9,8% | 1,7 |

Por holgura de la línea (cuánto antes que el balón puede llegar el mejor defensor):

| holgura | pases/partido | se pierde | pérdidas/partido |
|---|---|---|---|
| < 0 s | 204 | 0,8–2,3% | 3,0 |
| 0–0,3 s | 224 | 4,5–6,3% | 12,0 |
| **0,3–0,6 s** | **86** | **13,2%** | **11,3** |

### Causas encontradas

1. **Un defensor que ya está en la línea no se trataba como tal.** La probabilidad de que vaya a por el balón tenía un tope de 0,12 aunque llegara 0,5 s antes. El pasador percibía el mismo tope, así que una línea ocupada le parecía segura al 89%. Se lanzan 86 pases así por partido.
2. **El outlet tras rebote defensivo aceptaba pases con un 60% de completación esperada.** Si no había ninguno, se pasaba igualmente al mejor receptor: había un fallback forzado.
3. **Los pases perdidos en campo abierto costaban lo mismo que en media pista.** Por eso el base de élite (visión 88) lanza avances de 10 m tras canasta con un 11% de riesgo. En un solo partido hubo 15 avances perdidos tras canasta recibida.
4. **El robo en el bote (6,2/partido) castiga igual a un balón protegido en estático** (exposición mínima 0,3) que a uno en movimiento.

## 4. Duración de las posesiones (BT6.21)

Neutra, posesiones por partido:

| clase | ≤ 4 s | 5–8 s | 9–12 s | 13–16 s | 17–20 s | > 20 s | total |
|---|---|---|---|---|---|---|---|
| contraataque (con ventaja) | 0,2 | 0,2 | 0 | 0,2 | 0 | 0 | 0,5 |
| ataque temprano (primer tiro o pérdida ≤ 8 s tras rebote o robo) | 11,8 | 28,8 | 8,0 | 1,8 | 0,7 | 0,2 | 51,4 |
| ataque temprano tras saque | 5,2 | 13,8 | 6,7 | 1,0 | 0,3 | 0,3 | 27,3 |
| media pista | 0 | 0 | 32,7 | 37,2 | 21,8 | 15,2 | 106,8 |
| terminadas en pérdida | 9,8 | 9,5 | 5,5 | 3,0 | 1,5 | 1,3 | 30,7 |

- **79 de 186 posesiones** producen su primer tiro o su pérdida antes de 8 s.
- Solo 0,5 tienen una ventaja de transición real. Esto es una limitación del clasificador: el estado `ADVANTAGE` de la transición dura poco. Como referencia, la huella BT5 cuenta 18,7 tiros etiquetados `TRANSITION`.
- Continuación tras rebote ofensivo: 8,5 por partido y equipo, media de 6,3 s.

## 5. Ayuda y coberturas

| defensa local | PPP rival | ayudas/partido | recorrido del ayudador | % con pase fuera | puntos por tiro tras el pase fuera | aro rival | FG en el aro del rival | tapones/aro |
|---|---|---|---|---|---|---|---|---|
| ayuda 0,05 | 1,02 | 56,5 | 4,1 m | 47% | 0,92 | 33% | 46% | 12% |
| ayuda 0,50 | 1,08 | 60,7 | 3,9 m | 42% | 1,00 | 35% | 43% | 9% |
| ayuda 0,95 | 1,07 | 58,5 | 3,7 m | 44% | 0,63 | 32% | 41% | 13% |
| drop | 0,97 | 59,8 | 4,0 m | 46% | 0,85 | 35% | 39% | 13% |
| switch | 1,02 | 56,2 | 3,9 m | 53% | 0,87 | 26% | 50% | 10% |
| blitz | 0,97 | 57,2 | 4,0 m | 43% | 0,84 | 34% | 48% | 11% |
| hedge | 1,08 | 56,2 | 4,1 m | 46% | 0,95 | 33% | 43% | 11% |

- **La agresividad de la ayuda no cambia la geometría:**
  - las mismas ayudas;
  - el mismo recorrido;
  - la misma cuota de aro.

  Solo adelanta ±1,2 m el disparo de un único ayudador.
- **Las coberturas sí conservan huellas distintas:**
  - el drop concede aro y pocos pull-ups;
  - el switch concede triples;
  - el blitz fuerza más pérdidas.
- **FG en el aro de 39–50% en todas las configuraciones.** El contest solo mira la distancia: un defensor batido que persigue por detrás disputa como uno que está delante.

## 6. Zona

- 0,7 atacantes y 1,6 defensores de media en la zona durante la media pista.
- Saturación (≥ 3 atacantes o ≥ 7 jugadores) el 2,4% del tiempo; sin penetración, poste ni rebote que la justifique, el 1,2%.
- 6–8 episodios cortos por partido, ninguno largo.

La aglomeración vista en BT5 es episódica, no persistente.

## 7. Identidad (resumen)

Las identidades BT5 están presentes en la línea base:

| comparación | dimensión | valores |
|---|---|---|
| entrenador A ↔ B | transición | 17,4% ↔ 3,2% |
| | cuota de familias | BS 46 ↔ BS 24 · MOV 23 |
| plantilla de creación ↔ interior | spacing | 5-out ↔ 4-out-1-in |
| | rebote ofensivo | 10% ↔ 25% |
| | triples | 60% ↔ 41% |

- Adaptación: 2,8 ajustes con alta adaptabilidad, 0 con baja.
- Familiaridad 20 ↔ 95: sin diferencia sistemática (PPP 0,93 ↔ 0,90).

Tabla completa en `audit/summary-base.md`.
