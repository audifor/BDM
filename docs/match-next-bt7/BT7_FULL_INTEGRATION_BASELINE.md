# BT7 · Línea base de integración completa

Rama `match-next-basketball-core-bt7-full-integration`, desde `c86dd3b` (BT6.1). Este documento recoge el estado **antes** de cualquier corrección de BT7. Las correcciones y la medición posterior están en `docs/matchengine-next/BT7_FULL_BASKETBALL_INTEGRATION_REPORT.md`.

## 1. Método

### Arnés de integración

`src/presentation/match-next/audit/bt7/integration.ts` y `integration.test.ts`. Sigue el **camino real de producción**, sin atajos:

1. mundo canónico (`createNewGame`, `createAcbTestGame`);
2. `MatchEnginePort.prepare`, el mismo `prepareMatchOptions` que usa el motor legado;
3. `MatchNextLiveController` (Instant = `skipToEnd`);
4. `MatchEnginePort.complete`;
5. guardado V4 y recarga;
6. siguiente partido del calendario.

Por cada partido se comprueban 44 invariantes (46 con Live):

| Bloque | Qué comprueba |
|---|---|
| Disponibilidad | convocatoria = proyección canónica de disponibilidad (`getAvailablePlayersForCompetition`); convocatoria ⊆ plantilla |
| Quinteto | 5 únicos, convocados e idénticos al `startingLineup` del plan del entrenador |
| Participación | ningún jugador fuera de la convocatoria aparece en eventos |
| Cambios | cada cambio saca a un jugador en pista e introduce a uno del banquillo del mismo equipo; siempre cinco en pista; cambios solo con balón muerto |
| Faltas | ningún eliminado reentra ni termina en pista; nadie supera el límite de faltas de la competición |
| Minutos | Σ minutos = 5 × duración real del partido, por equipo (con prórrogas) |
| Estadísticas | totales de equipo = Σ líneas de jugador (14 campos); puntos = marcador; FGA = eventos `shotReleased`; FTA = eventos de tiro libre; AST ≤ FGM; REB = OREB + DREB; 3PM ≤ FGM ≤ FGA; Σ más/menos coherente |
| Posesiones | un `possessionStart` por posesión del registro; todas cerradas |
| Fatiga | la fatiga previa entra desde la fatiga de carrera canónica; la de los no utilizados no sube |
| Consecuencias | la fatiga de carrera sube para quien jugó y no cambia para quien no; partido `completed`; exactamente un `MatchStatLog` nuevo |
| Idempotencia | una segunda aplicación falla cerrada, también después de recargar |
| Guardado | resultado, `MatchStatLog` y fatiga sobreviven al guardado V4; el siguiente partido sigue `scheduled` |
| Live = Instant | Live avanzando tick a tick (frame en cada tick) produce el mismo resultado y el mismo estado final que Instant |
| Determinismo | mismo *setup* → mismo estado final |

### Escenarios

| Escenario | Qué es |
|---|---|
| A | partido normal del usuario, más Live con frames y determinismo |
| S1–S3 | el mismo partido con otras tres semillas |
| B | falta la estrella: el mejor jugador local, lesionado |
| C | problemas de faltas: límite de 3 personales |
| C2 | límite de 2 con solo 6 disponibles (agotamiento) |
| D | banquillo corto: 6 disponibles |
| D4 | solo 4 disponibles |
| E1 / E2 | dos identidades tácticas en el mismo partido: local `fast` y local `controlled` |
| F | estrés de fatiga: el mejor quinteto local con fatiga de carrera 75 |
| AIAI | IA contra IA en la misma competición |
| ACB | universo ACB |
| V:* | primer partido de cada (ecosistema × género): FIBA, NBA y NCAA, en masculino y femenino |
| R:NBA / R:NCAAM / R:WNBA | la competición del partido recibe el formato real (`NBA_GAME_FORMAT`, `NCAA_MEN_GAME_FORMAT`, `WNBA_GAME_FORMAT`) en los datos del mundo |

Resultados en `docs/match-next-bt7/audit/*.json` (línea base) y en `docs/match-next-bt7/audit/after/*.json` (tras las correcciones).

## 2. Defectos encontrados en la línea base

### P0-1 · El guardado posterior al partido no se puede recargar (todos los partidos)

`createMatchNextResult` calculaba `secondsPlayed = courtTimeTenths / 10`. El tiempo en pista se mide en ticks de 0,1 s, así que casi todas las líneas tienen décimas (p. ej. 1834,7 s).

El contrato persistido (`PlayerGameStatsSnapshot`, lector V1/V4 `readStats`) exige segundos enteros, así que el mundo completado se **serializa** pero **no se puede recargar**: `TypeError: Player stats secondsPlayed must be an integer`.

Lo reprodujeron los **8 procesos** de la primera ejecución de la matriz.

La prueba existente (`MatchNextDynamicState.test.ts`) no lo detectaba porque usa periodos de 30 s y nunca recarga el mundo completado.

### P1-1 · El quinteto del entrenador y su plan de minutos se contradicen

`allocateMinuteTargets` (`CoachRotationEngine`) asignaba el peso de titular por **posición en el orden por encaje** (`index < 5`), no por pertenencia al quinteto inicial. Un titular elegido fuera del top 5 por encaje recibía minutos de suplente, y un suplente recibía minutos de titular.

Efecto en el motor legado: el plan de rotación por minutos abre con otro quinteto y hace un cambio automático en el 10:00 del primer cuarto. Es el fallo heredado nº 1 (`LiveMatchController` «exactly one live sporting step»: 3 eventos en vez de 1).

Efecto en Match Next: el titular tiene un objetivo de minutos de suplente desde el principio.

### P1-2 · El disparador de rotación llega después del final del cuarto

En `RotationDecision.decideForTeam`, la presión por minutos **empezaba a crecer** 0,35 min después del objetivo del periodo y necesitaba ~1,44 min más para alcanzar el umbral (3,1). Un titular con objetivo de 8 de 10 minutos solo podía salir a los ~9,8 minutos, es decir, nunca dentro del cuarto.

El plan del entrenador pide ~32 minutos para los titulares. La ejecución daba 40.

| Línea base (15 partidos) | Valor |
|---|---|
| Cambios por partido | 14,1 |
| Jugadores con el partido entero por partido | 5,3 |
| Jugadores usados (B, local) | 6 de 11 |
| Jugadores usados (D, local) | 5 de 6 |
| Jugadores usados (V:ncaaLike:female, local) | 5 de 7 |

El texto del motivo también mentía. Una salida por problemas de faltas se describía como «1.1 minutes exceeds the 3-minute period target».

La **fatiga no es la causa**: con jugadores frescos, la fatiga de sesión llega a 22–33 en 40 minutos, por debajo del umbral del entrenador (35 para empezar a pesar, ~65 para decidir sola). Cuando la fatiga es real (escenario F, fatiga de carrera 75), el entrenador sí cambia por fatiga (24 cambios; «fatigue 57–65»). La cadena fatiga → rotación funciona; lo que fallaba era el disparador por minutos.

### P1-3 · Sin banquillo elegible, el eliminado sigue en pista

C2 (6 disponibles, límite 2) y V:ncaaLike:male (7 disponibles, 3 eliminados): cuando no queda nadie elegible en el banquillo, `forcedFoulOutSubstitution` no encuentra sustituto y el jugador eliminado sigue jugando, e incluso comete más faltas (7 personales con límite 2).

FIBA permite jugar con menos de cinco. El motor no lo modela, porque asume cinco en pista en toda la estructura.

### P1-4 · Las competiciones generadas son todas FIBA

Los generadores del mundo prototipo nunca usan `NBA_GAME_FORMAT` ni los formatos `NCAA_*`/`WNBA`, así que los ecosistemas `nbaLike` y `ncaaLike` juegan 4 × 10 con reglas FIBA.

Match Next sigue fielmente las reglas de la competición: con el formato real en los datos (escenarios R:*) juega 4 × 12, 2 × 20 y 4 × 10 WNBA. Es un hueco de **datos del mundo**, no del motor.

### Fallos heredados (5)

| # | Prueba | Aserción | Diagnóstico |
|---|---|---|---|
| 1 | `LiveMatchController` «exactly one live sporting step» | `expected 3 to be 1` | defecto real P1-1: dos cambios automáticos en el 10:00 |
| 2 | `matchNext` «JSON-safe setup» | `offensiveReboundShotClockSeconds` null | expectativa caducada: la competición FIBA declara reinicio a 14 s desde 54a9f7a |
| 3 | `matchNext` «scores a planned make once» | `gameRunning true` | expectativa caducada: con reglas FIBA el reloj sigue corriendo tras canasta salvo en los 2:00 finales (54a9f7a); la prueba está en el 10:00 del 1.er cuarto |
| 4 | `matchNext` «physical defensive rebounds… optional reset» | posesión distinta | *fixture* ambiguo: el caso ofensivo no apartaba a los defensores (el defensivo sí apartaba al ataque) y el rebote, físico, lo ganaba la defensa; además el caso «sin reinicio» dependía de que la competición declarase null |
| 5 | `matchNext` «production engine code free of…» | `/\b(?:Map|Set)\b/` en `state.ts` | falso positivo: un `new Set` local en `createInitialMatchState`, no un campo del estado |

## 3. Lo que funciona en la línea base

- **Disponibilidad.** Una única proyección (`prepareMatchOptions` → `getAvailablePlayersForCompetition`), compartida por Match Next y el motor legado. No hay `canPlay` duplicado. La estrella lesionada (B) queda fuera de la convocatoria y del quinteto. Con 4 disponibles, la preparación falla cerrada (`INSUFFICIENT_AVAILABLE_PLAYERS`).
- **Cambios legales** en los 21 partidos. Siempre cinco en pista. Ninguna reentrada tras eliminación cuando hay banquillo.
- **Estadísticas derivadas de eventos.** Equipo = Σ jugadores, puntos = marcador, FGA y FTA = eventos, en todos los partidos.
- **Σ minutos = 5 × duración** en todos los partidos, también en prórroga (E2) y con 4 × 12 y 2 × 20.
- **Consecuencias una sola vez.** La segunda aplicación lanza `MatchStatLog already exists`.
- **Live (frame en cada tick) = Instant** y determinismo (A, 46/46).
- **Reglas de competición.** Duración, reloj de posesión, reinicio tras rebote ofensivo, límite de faltas, oportunidades de cambio y parada del reloj tras canasta salen de `Competition.rules.gameFormat`.

## 4. Rendimiento (línea base)

Medido con 8 procesos en paralelo; solo, un partido completo tarda ~55–60 s.

| Medida | Valor |
|---|---|
| Instant, 4 × 10 | 52–112 s según la carga (media ~85 s) |
| Live con frame en cada tick | 143 s, frente a 106 s del Instant del mismo proceso (+35 %) |
