# BT7 · Integración completa del baloncesto — informe

Rama `match-next-basketball-core-bt7-full-integration`, desde `c86dd3b` (BT6.1). Línea base: `docs/match-next-bt7/BT7_FULL_INTEGRATION_BASELINE.md`. Decisión de Core Lock: `docs/matchengine-next/MATCHENGINE_CORE_LOCK_DECISION.md`.

## 0. Resumen

BT7 no ajusta el baloncesto. Recorre la cadena completa de un partido real, del mundo canónico al guardado y la recarga, con un arnés que comprueba 44–46 invariantes por partido en 21 escenarios.

Se encontraron y corrigieron cuatro cosas, cada una con fallo observado, causa y evidencia antes/después:

1. **P0 · el guardado posterior al partido no se podía recargar** (todos los partidos). Las líneas de estadística llevaban décimas de segundo y el lector V4 exige enteros. Corregido en origen: redondeo por mayor resto que conserva Σ = 5 × duración.
2. **El quinteto del entrenador y su plan de minutos se contradecían.** Los titulares recibían el peso por orden de encaje, no por ser titulares. Corregido. Resuelve el fallo heredado nº 1 del motor legado.
3. **El disparador de rotación llegaba después del final del cuarto.** El plan pedía ~32 minutos y la ejecución daba 40. Corregido. Los jugadores que juegan el partido entero bajan de 5,3 a 2,4 por partido, los cambios suben de 14,1 a 22,2 y el estrés de fatiga ya no deja a nadie 40 minutos.
4. **El motivo de los cambios** nombra ahora la presión que de verdad decidió: faltas, fatiga o minutos.

Los otros 4 fallos heredados eran expectativas caducadas o *fixtures* ambiguos. Se actualizaron con su razón, o se adaptó el código cuando el guardián era correcto.

**El bloqueo para el Core Lock no está en el motor de baloncesto, sino en la arquitectura.** El partido del usuario se juega con Match Next. Los partidos IA contra IA y el avance de días siguen usando el motor legado, porque Match Next tarda ~1 minuto por partido. Hay dos autoridades de simulación en producción.

## 1. Arnés y escenarios

- **Código:** `src/presentation/match-next/audit/bt7/integration.ts` (auditoría de un partido) e `integration.test.ts` (escenarios).
- **Comando:** `BT2_AUDIT=1 BT7_SCEN=A,B,… [BT7_OUT=after] npx vitest run src/presentation/match-next/audit/bt7/integration.test.ts`
- **Camino de cada partido:** mundo → `MatchEnginePort.prepare` → `MatchNextLiveController` → `MatchEnginePort.complete` → guardado V4 → recarga → siguiente partido. Solo lectura respecto al motor.

Los invariantes y escenarios se describen en la línea base. Los resultados están en `docs/match-next-bt7/audit/` (antes) y `docs/match-next-bt7/audit/after/` (después).

## 2. Correcciones

### 2.1 P0 · segundos enteros en el contrato de estadísticas

| | |
|---|---|
| Fallo observado | `TypeError: Player stats secondsPlayed must be an integer` al recargar el mundo completado, en los 8 procesos de la matriz |
| Causa | `derivePlayerStats` escribía `courtTimeTenths / 10`; el tiempo en pista se mide en ticks de 0,1 s y `MatchStatLog`/Save V4 exigen segundos enteros |
| Corrección | `MatchNextResult.wholeSecondsPlayed`: por equipo, parte entera y luego +1 a los mayores restos hasta `round(Σ décimas / 10)`. Cada línea es entera y el total del equipo sigue siendo 5 × duración |
| Evidencia | 21/21 escenarios guardan, recargan, rechazan la reaplicación tras recargar y encuentran el siguiente partido (`stat lines carry whole seconds`, `save/reload: …`) |

### 2.2 Quinteto del entrenador = apertura del plan de minutos

| | |
|---|---|
| Fallo observado | fallo heredado nº 1: dos cambios `automatic` en el 10:00 del 1.er cuarto (`generated-player-0008 → 0012` en ambos equipos) antes de la primera jugada |
| Causa | `allocateMinuteTargets` daba el peso de titular (1,22) a los cinco primeros **por encaje** (`index < 5`). Un titular elegido por contexto, fuera de ese top 5, recibía peso de suplente (0,55), y el plan por minutos (`createRotationPlanFromMinutes`) abría con otro quinteto |
| Corrección | el reparto ordena primero el quinteto inicial y después el banquillo por encaje; los pesos no cambian |
| Evidencia | `LiveMatchController.test.ts` pasa (un paso deportivo, un evento); `CoachRotation.test.ts`, `RotationEngine.test.ts` y `MatchEnginePort.test.ts` pasan (37/37) |

### 2.3 Disparador de rotación a tiempo

| | |
|---|---|
| Fallo observado | 4–5 jugadores por partido juegan 40:00; motivos como «8.0 minutes exceeds the 1-minute period target»; en B, D y NCAA femenino el local usa 5–6 jugadores con banquillo disponible |
| Causa | la presión por minutos empezaba a crecer en `objetivo + 0,35` y necesitaba 1,44 min más para el umbral 3,1, así que se disparaba en `objetivo + 1,8`. Con un objetivo de 8 de 10, eso es el minuto 9,8: nunca dentro del cuarto. La fatiga no lo compensa: con jugadores frescos la fatiga de sesión llega a 22–33 y el entrenador no la siente hasta 35 |
| Corrección | la presión **alcanza** el umbral base en `objetivo + 0,35`, la tolerancia que el código ya declaraba (`MINUTE_TOLERANCE`). Pendiente (2,15/min), umbral (3,1), fatiga y faltas no cambian |
| Evidencia | mismos 15 partidos y semillas, en la tabla siguiente |

| Antes → después (15 partidos) | Valor |
|---|---|
| Cambios por partido | 14,1 → **22,2** |
| Jugadores con el partido entero, por partido | 5,3 → **2,4** |
| Media de los 5 con más minutos | 35,2 → 34,9 |
| Fatiga de sesión máxima | 33,4 → 32,0 |

| Escenario | Antes | Después |
|---|---|---|
| B (sin estrella), jugadores usados L/V | 6/7 | **9/10** |
| D (6 disponibles), cambios | 5 | 9 |
| E2 (`controlled`), jugadores con el partido entero | 7 | 2 |
| S1–S3, jugadores usados | 6–7 | 10 |
| F (fatiga 75), cambios | 24 | 45 |
| F, máximo de minutos | 40 / 40 | 36 / 36,7 |
| R:NBA, máximo de minutos (de 48) | 48 / 48 | 44,6 / 43,7 |

### 2.4 Motivo del cambio veraz

El texto del motivo forma parte del contrato de presentación. Antes, una salida por faltas decía «1.1 minutes exceeds the 3-minute period target». Ahora el motivo nombra la presión dominante:

- `foul trouble: 4 of 5 personal fouls`;
- `fatigue 61 with 6.0/8 target minutes`;
- `8.4 minutes reaches the 8-minute period target`.

### 2.5 Los cinco fallos heredados

| # | Prueba | Decisión | Razón |
|---|---|---|---|
| 1 | `LiveMatchController` «exactly one live sporting step» | **corregido el código** (2.2) | defecto real de la autoridad del entrenador |
| 2 | `matchNext` «JSON-safe setup» | **actualizada la expectativa** (14) | la competición FIBA declara el reinicio a 14 s tras rebote ofensivo (54a9f7a); el *setup* debe reflejar la competición |
| 3 | `matchNext` «scores a planned make once» | **actualizada y reforzada** | reglas FIBA: tras canasta el reloj de partido sigue en el 10:00 del 1.er cuarto y se para en los 2:00 finales del último periodo; la prueba ahora comprueba **ambos** casos |
| 4 | `matchNext` «physical defensive rebounds…» | **fixture explícito** | el caso ofensivo aparta ahora a los defensores, igual que el defensivo aparta al ataque, y el caso «sin reinicio» declara `offensiveReboundShotClockSeconds: null`; se mantienen las aserciones de regla (OREB 1, `SETUP`, 140 décimas; sin reinicio el reloj sigue bajando) |
| 5 | `matchNext` «production engine code free of…» | **adaptado el código** | el guardián (sin `Map`/`Set` en `state.ts`) es correcto; el `new Set` local de `createInitialMatchState` pasa a ser un array, sin cambio de comportamiento |

## 3. Auditoría de la cadena

Estado: **OK**, **OK*** (con matiz documentado), **P1** (defecto conocido, no bloquea) o **NO** (no existe).

| # | Eslabón | Estado | Evidencia o nota |
|---|---|---|---|
| 1–3 | Disponibilidad canónica | OK | una proyección (`getAvailablePlayersForCompetition` en `prepareMatchOptions`), compartida con el motor legado; sin `canPlay` duplicado; convocatoria = disponibles en 21/21 |
| 4 | Plantilla / disponibles / convocados / en pista | OK | convocatoria ⊆ plantilla, igual a los disponibles; en pista ⊆ convocatoria; ningún ajeno en eventos |
| 5 | Mínimo legal | OK | con 4 disponibles, la preparación falla cerrada (`INSUFFICIENT_AVAILABLE_PLAYERS`) |
| 6 | Quinteto desde el entrenador | OK | `initialLineups` = `coachingPlans.startingLineup` en 21/21; el plan de minutos abre con ese quinteto (2.2) |
| 7 | IA de rotación (BS8) | OK* | corregido (2.3); quedan ~2,4 jugadores con el partido entero y algunas salidas tardías (p. ej. «9.7 minutes reaches the 8-minute period target»), porque FIBA solo permite cambios tras canasta en los 2:00 finales y el banquillo con objetivo 0 en el periodo no es candidato |
| 8 | Cambios del usuario frente a la IA | **NO** | `MatchNextLiveController` no expone cambios manuales; el motor legado sí (`applyManualSubstitutions`); el comando del motor (`applyCoachSubstitutions`) es la frontera única y valida igual, así que el usuario podría usar el mismo estado → MP2 |
| 9 | Ventanas de cambio | OK | `isSubstitutionOpportunity` con las reglas de la competición; 100 % de cambios con balón muerto |
| 10 | Fatiga (previa → partido → consecuencia → posterior) | OK | previa = fatiga de carrera × 0,5; en partido, ticks y eventos; posterior = Δ × 0,5 solo para quien jugó; aplicada una vez (idempotencia); los no utilizados no cambian (21/21) |
| 11 | Escala de fatiga frente al entrenador | P1 | un jugador fresco no supera ~33 en 48 minutos, así que la fatiga solo decide con fatiga de carrera alta (F); coherente, pero calibración pendiente |
| 12 | Reconciliación de minutos | OK | Σ = 5 × duración, con prórroga, 4 × 12 y 2 × 20 |
| 13–14 | Problemas de faltas y eliminación | OK* | límite de la competición (FIBA 5, NBA 6); la presión por faltas sienta al jugador a una falta del límite; ninguna reentrada; **P1-3:** sin banquillo elegible el eliminado sigue en pista |
| 15 | Lesión durante el partido | **NO** | no existe en Match Next; las lesiones son post-partido (`applyPostMatchInjuries`, sin bajar de 5 disponibles); BT7 no añade simulador |
| 16 | Identidad del entrenador tras cambios, fatiga y faltas | OK | la identidad táctica es del equipo (`tacticalPlans`) y no del quinteto; `applyOne` limpia las estructuras que nombran al saliente y se reconstruyen con los mismos planes |
| 17 | Plantilla × entrenador | OK | `createCoachRotationPlan` usa encaje por rol, rasgos (`shortRotationCoach`), adaptabilidad (tolerancia a la fatiga) y la táctica |
| 18–19 | Afinidad táctica del quinteto y cobertura posicional | OK | el sustituto debe ser compatible con el rol del saliente (posición o encaje ≥ 46); en la eliminación, rol + posición |
| 20 | Plan de partido UI → `TacticalIntent` | OK | `getEffectiveTacticalPlan` / `getGamePlan` (emparejamientos, rotación) en `prepareMatchOptions` |
| 21 | Cambio táctico del usuario a mitad de partido | **NO** | sin API en el controlador de Match Next (el legado tiene `applyTactics`) → MP2 |
| 22 | Precedencia de la adaptación | OK* | el plan del usuario es la base; la adaptación del entrenador (`MatchMemory`, histéresis) es un delta acotado sobre ella, también en el equipo del usuario; sin control del usuario en vivo no hay conflicto que resolver; cuando exista, el usuario debe ganar (MP2) |
| 23 | Marcador y final de partido | OK | puntos = marcador = eventos; prórroga correcta (E2: 5 periodos, 45 min) |
| 24–26 | Reloj y posesión | OK | reloj y reloj de posesión desde las reglas; un `possessionStart` por posesión del registro |
| 27 | Live = Instant (P0) | OK | frame en cada tick, mismo resultado y estado final (A); `runInstant` = `skipToEnd` del mismo controlador |
| 28 | Contrato de presentación | OK | `MatchFrame` (§5) |
| 30–32 | Estadísticas | OK | derivadas de eventos; equipo = Σ jugadores (14 campos); asistencias ≤ FGM |
| 33 | Consecuencias una sola vez | OK | `MatchStatLog already exists` también tras recargar |
| 34 | `PlayerDynamicState` | OK | §4 |
| 35 | Estadísticas de temporada una vez | OK | se derivan del único `MatchStatLog` por partido; la idempotencia lo garantiza |
| 36 | Guardado durante el partido | **NO** | la sesión es transitoria; un guardado a mitad descarta el partido en curso; BT7 no lo construye |
| 37 | Guardado tras el partido (P0) | OK | corregido (2.1) |
| 38 | Reaplicación | OK | falla cerrada antes y después de recargar |
| 39 | Calendario | OK* | el siguiente partido queda `scheduled`; los demás del día se simulan con el **motor legado** (§6) |
| 40 | Dos variantes de competición | OK | FIBA 4 × 10 y NBA 4 × 12 / NCAA 2 × 20 / WNBA; P1-4: el mundo generado solo tiene reglas FIBA |
| 41 | Usuario contra IA, IA contra IA | OK | AIAI 44/44 por el mismo camino |
| 42 | Ambos géneros | OK | FIBA, NBA y NCAA femeninos: 44/44 |
| 43–44 | Señal de calidad y del banquillo | OK* | mismo partido y semilla: sin estrella el PPP local cae de 0,95 (A) a 0,86 (B); en la rotación manda el encaje por rol, no una media de atributos |
| 45–48 | Estrés de fatiga, faltas, disponibilidad y tácticas | OK | F (45 cambios, nadie 40 min), C (límite 3: 5 eliminados, cambios forzados), D/D4, E1/E2 |

## 4. `PlayerDynamicState`: quién lee y quién escribe

| Dato | Lee Match Next | Escribe Match Next | Dueño |
|---|---|---|---|
| Fatiga de carrera (`careerFatigueByPlayerId`) | sí (previa × 0,5) | sí, solo Δ × 0,5 de quien jugó, en `complete` | mundo / entrenamiento (recuperación diaria) |
| Estímulo de desarrollo | no | sí, por carga de acción, en `complete` | desarrollo |
| Atributos (Player Truth) | sí, vía perfil | **no** | jugador |
| Lesiones | sí (disponibilidad) | no en el partido; `applyPostMatchInjuries` después | lesiones |
| Elegibilidad / participación | sí | `recordEligibilityParticipation` | elegibilidad |
| Moral, química, confianza | no | no | **no existe** |

## 5. Contrato de presentación y lista para MP2

`MatchFrame` (`engine/match-next/frame.ts`) es la proyección de solo lectura del estado. Incluye:

- reloj y reloj de posesión;
- marcador;
- balón (tipo, vuelo, contestación, probabilidad);
- posesión e historial;
- jugadores (posición, velocidad, orientación, rol, responsabilidad, intención, emparejamiento, rebote, transición);
- estructuras ofensiva y defensiva;
- bloqueo;
- estado del balón muerto;
- tiros libres y faltas;
- `rotationPlayers` (en pista, minutos, fatiga, objetivo, estadísticas);
- eventos.

Lista para MP2, sin implementar en BT7:

1. cambios manuales del usuario en Match Next Live (mismo comando `applyCoachSubstitutions` y mismas ventanas);
2. cambio táctico del usuario en vivo, con precedencia sobre la adaptación del entrenador;
3. tiempos muertos;
4. el frame lleva **todos** los eventos y todo el historial de posesiones, así que el coste crece durante el partido (Live 143 s frente a 106 s de Instant en el mismo proceso); hacen falta deltas incrementales;
5. jugar con menos de cinco (P1-3);
6. guardado durante el partido (serializar `MatchState` + semilla);
7. lesión en el partido (con su autoridad, no un simulador nuevo);
8. formatos de competición NBA/NCAA en el mundo generado (P1-4).

## 6. Autoridad de simulación: dos motores en producción

| Partido | Motor |
|---|---|
| Partido del usuario (`MatchWorkspace`, Live e Instant) | Match Next |
| Resto del día, avance de días, temporada (`advanceGameDay`, `simulateRemainingGamesToday`, `simulateAndApplyGame`) | motor legado (`simulateMatchWithRotations`) |

Los dos comparten la preparación: disponibilidad, quinteto, plan del entrenador y tácticas. No comparten el baloncesto. Las estadísticas de temporada, la clasificación y el desarrollo mezclan partidos de dos motores con economías distintas.

Match Next tarda ~55–60 s por partido (solo) y no es viable para jornadas completas tal como está.

Decidir entre acelerar Match Next, un modo IA barato con la misma economía o aceptar dos motores es una **decisión de arquitectura para el humano**, no un ajuste.

## 7. Defensa, aro y ventaja secundaria

Clasificación:

- **A:** comportamiento de baloncesto correcto.
- **B:** hueco de calibración (P1, no bloquea).
- **C:** defecto del motor (bloquea).

| Tema | Clase | Evidencia |
|---|---|---|
| Presión con defensores de élite | **A** | BT6, 12 semillas: PPP rival 0,88 con presión alta frente a 0,97 con baja; contienen el 31 % frente al 13 % con defensores normales; la presión rinde con quien puede sostenerla |
| Beneficio general de la presión (pérdidas y robos) | **B** | BT6: no se demuestra a 12 semillas; los costes sí son monotónicos y causales |
| Aro y faltas | **B** | BT6.1: aro 24 %, FTr 0,132; BT7, 8 partidos normales: aro 24,5 %, FTr 0,128; bajo, pero estable y causal (las faltas vienen de la penetración) |
| Ventaja secundaria (atacar el *closeout*, segunda penetración) | **B** | BT6.1: ~1,1 ataques al *closeout* por partido; escasa, pero no bloquea: no rompe ninguna cadena ni invariante |

## 8. Marcador de baloncesto (8 partidos normales: A, S1–S3, ACB, AIAI, E1, E2)

| | Antes | Después |
|---|---|---|
| Posesiones / 40 min (ambos) | 161,9 | 159,8 |
| Puntos | 82,7 | 86,3 |
| PPP | 1,00 | 1,08 |
| TOV % | 10,5 | 11,2 |
| Robos | 7,5 | 7,4 |
| FTr | 0,125 | 0,128 |
| Aro | 23,1 % | 24,5 % |
| 3PAr | 0,55 | 0,54 |
| AST/FGM | 0,52 | 0,48 |
| ORB % | 21,1 | 21,0 |
| Jugadores usados | 8,2 | 9,6 |
| Cuota del máximo usuario | 0,33 | 0,32 |

Con 8 partidos, el PPP tiene un ruido de ±0,05–0,08. La subida no está certificada y ninguna corrección de BT7 toca la economía de la posesión.

**Efecto colateral medido (6 semillas, §10).** Al jugar el quinteto que eligió el entrenador hay menos penetraciones (−9 %), menos *pull-ups* y *floaters* (−29 %) y más triples (+7 %). El 3PAr ya era alto (~0,55), así que queda como dato para la calibración de clase B, no para compensarlo en BT7.

## 9. Rendimiento y determinismo

- **Instant:** ~55–60 s por partido de 4 × 10 (solo) y 52–112 s con 8 procesos en paralelo; NBA 4 × 12 ~72 s.
- **Live con frame en cada tick:** +35 % sobre Instant (§5, punto 4).
- **Determinismo:** mismo *setup* → mismo estado final (A). Live = Instant.

## 10. Regresión enfocada

### Alcance

- **Suites:** `src/engine/match-next`, `src/app/matchNext`, `src/app/game` y `src/engine/tactics` (42 ficheros, 398 pruebas).
- **Primera pasada en paralelo:** 54 fallos. 45 son *timeouts* de 5 s por carga.
- **Segunda pasada:** los 20 ficheros con fallos, `--maxWorkers=4 --testTimeout=300000`, **a la vez en esta rama y en la base `c86dd3b`** (worktree `C:\BDM-BT7-BASE`).

### Resultado (mismos 20 ficheros, 191 pruebas)

| | Fallos |
|---|---|
| Base `c86dd3b` | 24 |
| BT7 | 20 → 15 tras actualizar la prueba de variedad |

**Los 5 heredados** fallan en la base y pasan en BT7.

**15 fallos idénticos en la base** son ajenos a BT7:

- World DB ACB: contrato profesional sin evidencia y ejecuciones largas de 1000 días, 10 años y 20 temporadas;
- rendimiento de `advanceGameDay` y medidas de rendimiento bajo carga (`clock-only baseline`, `24,000 live ticks`);
- borrador NBA;
- historial de temporada y nueva temporada;
- `keeps advancing to a future user game`.

**1 fallo nuevo:** `matchNextBt4` «has real variety» (7 *pull-ups* en las semillas 424242 y 7, umbral > 8). Investigación causal:

1. **Ablación.** Solo el disparador (2.3) no cambia la selección de tiro: 0,665 → 0,653 penetraciones por posesión; *pull-ups* y *floaters* 14,8 → 14,5 por partido. El cambio viene de 2.2.
2. **La hipótesis «menos creación en pista» queda descartada.** La creación media en pista es 68,3 → 68,7.
3. **Causa.** Los titulares elegidos por el entrenador ya no se sientan en el primer balón muerto. Local 0008 (POA 56, interior 71) sustituye a 0006 (POA 47, interior 48). Visitante 0088 (escolta, tiro 76, POA 73) sustituye a 0092 (ala-pívot). Mejores defensores del punto de ataque y un quinteto más exterior: penetraciones 0,665 → 0,601 por posesión, *pull-ups* + *floaters* 14,8 → 10,5 por partido y triples 86 → 92 por partido (6 semillas).

Es la consecuencia de ejecutar la decisión del entrenador, no un defecto. El umbral se había calibrado con la rotación que contradecía al entrenador. Se actualiza a > 5 con su razón: la prueba sigue exigiendo que existan *pull-ups*. Con el cambio, `matchNextBt4.test.ts` pasa 17/17.

### Otras comprobaciones

- Enfocadas: `CoachRotation`, `LiveMatchController`, `RotationEngine` y `MatchEnginePort`, 37/37.
- `npm run typecheck`: limpio.
- `npm run build`: limpio.
- `git diff --check`: limpio.

## 11. Escenarios manuales

| Escenario | Resultado |
|---|---|
| A · partido normal | 46/46; Live = Instant; guardado y recarga |
| B · falta la estrella | la estrella (0009, 80,9) fuera de convocatoria y quinteto; rotación de 9 |
| C · problemas de faltas | con límite 3: 7 salidas por «foul trouble: 2 of 3», 5 eliminaciones con cambio forzado; ninguna reentrada |
| D · banquillo corto | 6 disponibles: 9 cambios; Σ minutos correcto; con 4, falla cerrada |
| E · dos identidades | mismo partido y semilla: `fast` 173 posesiones, AST/FGM 0,50; `controlled` 151 posesiones, AST/FGM 0,66 |
| F · Live frente a Instant | idénticos con frame en cada tick |
| G · guardar y recargar tras el resultado | 21/21: resultado, `MatchStatLog` y fatiga sobreviven; la reaplicación falla cerrada; el siguiente partido está disponible |

## 12. Veredictos

| Área | Veredicto | Motivo |
|---|---|---|
| TECHNICAL | **PASS** | los 5 fallos heredados resueltos; los 15 fallos restantes de las suites enfocadas son idénticos en la base; typecheck y build limpios; P0 de guardado corregido |
| RULES/CLOCK | **PASS** | reglas, reloj y ventanas desde la competición; 4 formatos verificados |
| ROTATION/AVAILABILITY | **PASS** | una proyección de disponibilidad; quinteto = plan; rotación corregida; P1-3 documentado |
| FATIGUE/PLAYER STATE | **PASS** | cadena completa, una sola aplicación; P1 de escala documentado |
| FOUL TROUBLE | **PARTIAL** | presión por faltas y eliminación correctas; sin banquillo, el eliminado sigue en pista (P1-3) |
| TACTICAL INTEGRATION | **PARTIAL** | plan → intención OK y adaptación acotada; sin cambios del usuario en vivo |
| POSSESSION ECONOMY | **PASS** | registro único; ~160 posesiones / 40 min; BT7 no la toca |
| BASKETBALL TRUTH | **PARTIAL** | PPP ~1,0–1,08, pérdidas creíbles; FTr bajo y creación secundaria escasa (B) |
| STATS/POST-MATCH | **PASS** | derivadas de eventos, reconciliadas, una vez, persistentes |
| LIVE=INSTANT | **PASS** | idénticos con frame en cada tick |
| PRESENTATION CONTRACT | **PASS** | `MatchFrame` completo; coste incremental pendiente (MP2) |
| VISUAL RECOGNIZABILITY | **PARTIAL** | sin cambios visuales en BT7; la ventaja secundaria escasa limita lo que se reconoce |
| CORE LOCK READINESS | **PARTIAL · CORE LOCK NO** | dos autoridades de simulación en producción (§6), sin cambios del usuario en vivo; ver la decisión |
