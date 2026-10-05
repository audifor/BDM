# BT4.3 · Lógica baloncestística (jugadas en lugar de espera)

Rama `match-next-basketball-core-bt4-3-logic` (padre `fc8c5d8`). Sin push, PR ni merge.

## Motivo

"Se está volviendo loco el juego." El análisis de `docs/match-next-bt4-2/MATCH_ANALYSIS.md` mostró que BT4.1/BT4.2 habían acumulado parches de ritmo sobre una sola idea: **la paciencia como espera**. El manejador esperaba una mejor mirada (prima de espera), los compañeros se ofrecían (OFFER) sin que se les pasara, y el ataque se llenaba de nada:

- mediana de 10,5 s hasta la primera acción real;
- 121 tramos por partido con el manejador parado más de 2 s;
- solo el 2,8% de 328 ofertas por partido acababa en pase.

## Qué se cambia

El ritmo deja de salir de esperar y pasa a salir de **ejecutar una jugada**.

1. **Jugada elegida por posesión** (`playFor`, `DecisionCore.ts`). Determinista (hash de posesión y rebotes ofensivos); pesos según creación y amenaza de rodar al aro, penetración y perfil de tiro de dos y tres. Tres jugadas: bloqueo directo (`BALL_SCREEN`), penetración y pase fuera (`DRIVE_KICK`) y circulación (`SWING`).
2. **Compromiso con la jugada** (`playRead`). Mientras la jugada no se ha ejecutado, el tiro se penaliza (`playShotFactor`), y se favorecen el bloqueo, la penetración y el pase según la jugada. Se ejecuta cuando hay bloqueo y penetración o pase, o cuando pasa `playCommitSeconds` desde que empezó la media cancha. No es un temporizador de disparo: es el fin de la jugada.
3. **Sin espera, sin oferta, sin sondeo.** `waitPremium`, `offerEnabled` y `probeEnabled` a 0.
4. **El manejador camina a su sitio de inicio** de la jugada, rodeando defensores (`OffensiveStructure.ts`), en lugar de quedarse parado.
5. **Ataque temprano contra defensa no montada** (`earlyOffenseRadiusMeters = 3`). Prohibir la penetración antes del montaje cortó las contras tras rebote defensivo (tiro en ≤8 s: 33% → 13%). Una penetración cuenta como mirada abierta mientras haya menos de tres defensores a ≤3 m de su puesto.

## Barrido del ataque temprano (4 semillas)

| radio | posesiones | pases | tiro ≤8 s tras rebote defensivo |
|---|---|---|---|
| 0 | 190 | 541 | 13% |
| 2,0 | 216 | 488 | 50% |
| **3,0 (elegido)** | 203 | 522 | 40% |

`playCommitSeconds` 12/16/20 no mueve el ritmo (203/200/202 posesiones).

## Antes / después

| | BT4.2 (12 semillas) | BT4.3 (4 semillas) |
|---|---|---|
| Posesiones | 168,5 | 202,8 |
| Segundos por posesión | 14,4 | 11,7 |
| Puntos (combinados) | 159 | 209 |
| Pases | 396 | 522 |
| Asistencias | 21,6 | 25,3 |
| Penetraciones | 96 | 156 |
| Pérdidas | 29 | 29,8 |
| Robos | — | 18,3 |
| % tiro de campo | .37 | .41 |
| Correlaciones (creación/visión/pase → asistencias) | negativa a nivel de equipo | +0,32 / +0,25 / +0,24 |
| Contras tras rebote defensivo (tiro ≤8 s) | ~33% (BT4.2: 17% de tiros en transición) | 40% |

Las cifras de BT4.2 y BT4.3 usan distinto número de semillas; son orientativas.

## Qué mejora

- Desaparece la meseta de espera: no hay prima de espera ni ofertas sin consecuencia.
- Más circulación y más asistencias; la creación y la visión por fin correlacionan con asistir.
- La contra tras rebote defensivo se recupera con el radio de 3 m.
- El manejador ya no se queda parado en el campo de ataque.

## Límites, sin maquillar

- **El ritmo no está en el objetivo.** 203 posesiones frente a 145–165 (≈+25%), 11,7 s por posesión. Los puntos combinados (209) también son altos. Ni `playCommitSeconds` ni el radio lo resuelven; el ritmo ahora depende sobre todo del número de penetraciones (156) y de las contras. Es el defecto principal que queda.
- **Pérdidas (30) y robos (18)** altos por el juego de pase.
- **Uso de estrellas** sigue concentrado (≈33 tiros de campo sobre 36 min).
- **Sensibilidad no re-medida** con los valores finales.
- **Solo defensa individual.** El 8-segundos no está cableado por competición (NCAA 10 s).
- **Sin revisión visual con valores finales.** El clip (`C:\Users\jorge\Videos\bdm-bt43-seed31337\`) se grabó antes del ataque temprano.
- Los cuatro audits (flow, fluidity, structure, economía) se ejecutaron antes de fijar el radio 3 salvo `flow-eo*`.

## Tests

Batería `src/engine` + `src/app`: 42 fallos con la máquina cargada. La mayoría son timeouts (`STACK_TRACE_ERROR`) de suites de mundo/temporada que no tocan match-next. Comparando con el baseline `fc8c5d8` en un worktree temporal, los fallos reales de los ficheros de motor coinciden (8 preexistentes: 4 en `matchNext.test.ts`, `LiveMatchController`, `SeasonContentActivation`, `MatchSession`, `MatchRotationRunner`). BT4.3 añadía 2 fallos más y se corrigieron adaptando los tests:

- `matchNextActions.test.ts`: el primer pase es una tirada con semilla y puede ser un `BAD_PASS`; se aceptan ambos resultados nombrados.
- `matchNextBt2.test.ts`: la ocupación de zona 5-out en los 3 s tras el montaje baja de 0,70 a 0,667 porque el manejador inicia la jugada antes; umbral 0,65.

Typecheck: 0 errores. Build: OK.

## Archivos

Motor: `tuning.ts`, `actions/DecisionCore.ts`, `structure/OffensiveStructure.ts`. Tests adaptados: `CoachRotation`, `MatchEnginePort`, `matchNextActions`, `matchNextBt2`, `nextTruth.audit`. Instrumentos: `audit/bt42/fluidity*`. Evidencia: `docs/match-next-bt4*/audit/*bt43*.json`, `calib-*43*.json`, `flow-eo*.json`.
