# BT5.0 · Auditoría táctica de partida

Base `8d14f81` (BT4.5), rama `match-next-basketball-core-bt5-tactical-identity`. Auditoría hecha antes de tocar el juego: lectura del código de `src/engine/match-next` y de la frontera de la app (`prepareMatchSetup`, `TacticalPlanning`, dominio `tactics`/`staff`/`training`), y medida empírica con el instrumento nuevo `src/presentation/match-next/audit/bt5/fingerprint.ts` (huella por equipo; 6 semillas por configuración, `docs/match-next-bt5/audit/exp-base-*.json`).

## ¿Qué existe realmente?

El plan táctico que llega al motor (`MatchNextTacticalPlan`) tiene cuatro cosas:

| campo | rango | de dónde viene |
|---|---|---|
| `pace` | −2..2 | instrucciones del equipo / plan de partido / informe de scouting aceptado |
| `shotProfile.{rim, midRange, threePoint}` | −2..2 | instrucciones del equipo |
| `defense.{interior, perimeter}` | −2..2 | instrucciones / scouting (+1 nivel) |
| `defense.pickAndRollCoverage` | switch/drop/hedge/blitz | instrucciones del equipo |
| `featuredPlayerId` | jugador | instrucciones del equipo |

Además existe en el mundo, **sin llegar al motor**: atributos de staff del entrenador (`tacticalKnowledge`, `adaptability`, `analysis`…), `teamCohesionByTeamId` (0–100, descrita como "cohesión/familiaridad táctica" que entrena el equipo), `SavedPlay`/`Playbook` (dibujos opacos del diseñador táctico, el dominio no los interpreta) y los informes de scouting de rival (solo se traducen a ritmo y énfasis defensivo).

## ¿Qué está conectado al MatchEngine?

| entrada | dónde actúa | qué cambia |
|---|---|---|
| `pace` | `OffensiveStructure` (urgencia del que sube el balón: ±2 → sprint/jog), `readTheFloor` (umbral de "tiro abierto" −4%/nivel y ticks de relectura) | velocidad de subida y paciencia antes de organizarse |
| `shotProfile` | `evaluateShotOpportunity` (**valor del tiro ×(1 + 0,05·nivel)** por zona), `driveValue` (×(1+0,05·rim)), `playFor` (peso de DRIVE_KICK/SWING ±0,15·nivel) | **la cuota de tiro, directamente** |
| `defense.perimeter` | `guardPosition`: colchón en el balón (−0,12 m/nivel) y sombra del defensor de gap | presión en el balón y en las líneas |
| `defense.interior` | `guardPosition`: profundidad del gap (+0,1 m/nivel) y de la ayuda (+0,2 m/nivel) | hundimiento |
| `pickAndRollCoverage` | `ScreenCore.applyCoverage` y `screenSeparationFor` | geometría de la cobertura y valor del bloqueo para el atacante |
| `featuredPlayerId` | `bestReceiver` (+0,08 pts), solo en la ruta de pase "por defecto" (contraataque sin receptor de avance) | casi nada |

## ¿Qué son solo datos sin efecto?

- Atributos del entrenador (conocimiento táctico, adaptabilidad): no llegan al motor.
- Cohesión / familiaridad del equipo: no llega.
- Jugadas guardadas y playbooks: no se simulan.
- `flaggedPlayerIds` del scouting: informativos.
- Roles de rotación (`CoachRotationPlan.roleByPlayerId`): solo deciden sustituciones, nunca qué hace el jugador en pista.

## ¿Qué son parámetros globales?

Todo lo de `tuning.ts` (iguales para los dos equipos y todos los partidos): valores de tiro/pase/penetración, `playScreenBonus`, `playDriveBoost`, `playPassBoost`, `playCommitSeconds` 12 s, `playShotFactor` 0,65, `playExtraPasses` 1, `helpSag*`, `goalSideMarginMeters`, temperatura de decisión, riesgo de pase… Más las constantes de módulo: 2 perseguidores de rebote por equipo, 3 cortes máximos por posesión, 2 bloqueos máximos por posesión, umbral de pop (`tiro ≥ 62 y ≥ penetración+6`), distancia de disparo de la ayuda (4,8 m), profundidad del drop (2,6–4,2 m), etc.

## ¿Qué comportamiento está hardcodeado para todos los equipos?

- **Formación única: 5-out.** No existe 4-out-1-in ni poste. Los huecos se asignan por distancia (el pívot que no tira puede acabar en la esquina).
- **Familias de jugada: tres** (BALL_SCREEN, DRIVE_KICK, SWING), elegidas por un hash de la posesión con pesos de ratings (+ perfil de tiro). No hay MOVEMENT, POST, ISOLATION ni ataque temprano como familia, ni ubicación (todo bloqueo es "donde esté el manejador").
- **Iniciador = quien tenga el balón.** El receptor del saque es el primer jugador de la alineación en orden (base por convención), el del rebote defensivo el mejor receptor de contraataque. Nadie "pide" el balón para iniciar.
- **Roles ofensivos inexistentes**: no hay creador, tirador, cortador, poste… Solo el bloqueador sale del mejor valor del momento y el corredor de aro en transición (`rimRunnerFit`).
- **Rebote ofensivo**: 2 por equipo siempre (los más cercanos que pueden competir); el resto se repliega. No depende del entrenador.
- **Transición**: urgencias fijas (con ventaja: sprint; sin ella: el manejador trota), mismos carriles para todos.
- **Ayuda**: una sola regla (penetración que entra en 4,8 m o supera al defensor → low man + rotate + X-out) y un protector del aro. No hay tag al roller, ni dig al poste, ni rotación tras un blitz (el bloqueador queda solo).
- **Cobertura del bloqueo**: una por partido (la del plan), igual para cualquier manejador y bloqueador; el switch se hace en cuanto el bloqueo está puesto (antes de usarse) y no hay "switch back"; el drop tiene profundidad fija.
- **Contexto**: el marcador y el tiempo no cambian ninguna intención táctica (solo el reloj de posesión cambia valores de continuar).
- **Adaptación en partido**: ninguna. La única memoria es `shotValueMemory` (valor medio de los tiros propios, para el valor de seguir).

## Medida: lo que cambian hoy los mandos que existen

Mismo partido (equipo local 0001 contra 0008, plantillas por defecto, ambos con `switch`), 6 semillas, se cambia solo el plan del local. Huella del local:

| métrica | neutral | pace +2 | pace −2 | triples +2 | aro +2 | blitz |
|---|---|---|---|---|---|---|
| posesiones | 87,3 | 89,7 | 88,2 | 89,2 | 93,0 | 90,0 |
| s / posesión | 12,3 | 11,6 | 12,9 | 12,1 | 11,5 | 12,3 |
| transición (1.er tiro en los 6 s) | 6,1% | 6,3% | 4,7% | 6,2% | 9,0% | 6,1% |
| pases / posesión | 2,67 | 2,70 | 2,76 | 2,91 | 2,03 | 2,74 |
| penetraciones / posesión | 0,75 | 0,75 | 0,74 | 0,52 | 1,03 | 0,72 |
| bloqueos / posesión | 0,46 | 0,39 | 0,49 | 0,42 | 0,33 | 0,47 |
| cuota de aro | 22,9% | 30,1% | 19,4% | 18,4% | 44,6% | 21,6% |
| cuota de triple | 57,9% | 54,1% | 63,8% | **74,0%** | **29,0%** | 61,1% |
| catch & shoot | 55,8% | 55,4% | 62,5% | 67,8% | 34,3% | 57,9% |
| % rebote ofensivo | 17,4% | 16,4% | 14,3% | 16,2% | 19,8% | 16,5% |
| cuota del iniciador más usado | 33,6% | 28,2% | 29,4% | 37,5% | 34,4% | 30,3% |

Lectura:

1. **El mando más fuerte es justo el que BT5 prohíbe.** El perfil de tiro mueve la cuota de triples de 58% a 74% o 29%, pero lo hace multiplicando el valor percibido de los tiros de cada zona: es una cuota impuesta, no una consecuencia de cómo se ataca (no hay más poste, ni más bloqueos, ni otra formación; solo se tira más desde donde el plan "quiere").
2. **El ritmo apenas existe**: ±2 niveles cambian 0,7 s por posesión y 2 posesiones. La transición no cambia (6%).
3. **La cobertura sí es comportamiento** (geometría distinta), pero hay una sola para todo el partido; el blitz sube las pérdidas del rival y no cambia nada más que se vea en la huella del atacante.
4. **Con el plan neutro los dos equipos ya se distinguen algo por plantilla** (visitante: 3,30 pases/posesión, 64% de triples, 6% de PnR frente a 2,67 / 58% / 14% del local), porque las decisiones ya salen de los ratings. Esa es la base sobre la que BT5 tiene que construir: identidad que emerja de decisiones, no de multiplicadores.
5. Defectos colaterales vistos: `CUT_FINISH` = 0 (los cortes no acaban nunca en tiro etiquetado como corte), roll = 100% (nadie hace pop con estas plantillas), el iniciador más usado lleva un tercio de las posesiones solo porque recibe el saque por orden de alineación.

## Qué hace BT5 con esto

- El perfil de tiro deja de multiplicar el valor del tiro: se lee como intención interior/perimetral y actúa por formación, familias y entradas al poste (BT5.11).
- `pace`, `defense.interior/perimeter` y la cobertura se leen como la identidad del entrenador cuando no hay identidad explícita (compatibilidad de partidas guardadas).
- Se conectan como datos opcionales del plan: identidad del entrenador, adaptabilidad y conocimiento táctico, plan de partido y familiaridad (cohesión del equipo).
