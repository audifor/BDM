# MatchEngine Next · Decisión de Core Lock

## Actualización ME-LOCK1 (2026-10-04)

Rama `match-next-me-lock1-fast-simulation`, desde `3408a4e`. Evidencia en:

- `ME_LOCK1_SIMULATION_UNIFICATION_REPORT.md`;
- `ME_LOCK1_FASTSIM_CERTIFICATION.md`;
- `ME_LOCK1_PERFORMANCE_PROFILE.md`;
- `ME_LOCK1_SIMULATION_ROUTE_AUDIT.md`;
- `ME_LOCK1_LEGACY_ENGINE_RETIREMENT.md`.

### BASKETBALL CORE LOCK: **YES**

ME-LOCK1 no encontró ningún P0 de baloncesto:

- las optimizaciones conservan cada partido bit a bit;
- el arnés BT7 sigue verde, con A 46/46 y R:NBA/F 44/44;
- las limitaciones de clase B (FTr, aro, creación secundaria, presión) siguen siendo P1 documentados, no bloqueos.

Las autoridades de la tabla de abajo quedan bloqueadas.

### PRODUCTION MATCHENGINE LOCK: **NO**

| Condición | Estado |
|---|---|
| Toda la simulación normal de producción usa Match Next | **SÍ**: avance de día, Simulate Day, Continue, simulación hasta una fecha, World DB e Instant, por `matchResolution.ts` en FAST; guardián estructural |
| FAST compatible en estadísticas y tácticas | **SÍ**: idéntico a FULL (10/10 partidos completos) |
| Mundo mixto FULL/FAST coherente | **SÍ**: mismo contrato y misma clasificación (prueba de día mixto) |
| Motor legado en cuarentena | **SÍ**: solo en la interfaz legacy, en la rama residual `NgMatchViewer` y en *fixtures* de prueba |
| Rendimiento de FAST práctico | **NO, todavía.** ~2,8 s por partido frente a ~0,25 s del legado: día ACB ~30 s, temporada ACB ~17 min, y las pruebas de ciclo de vida necesitan formato corto |

Lo único que falta es rendimiento. Siguiente paso recomendado: simular en paralelo, en *workers*, los partidos independientes de cada día, con resultados idénticos y aplicados en orden. Exige un avance de día asíncrono en los stores, `ContinueFlow` y `simulateUntilDate`.

### Cambios desde BT7

| Punto de BT7 | Estado ahora |
|---|---|
| P1-2 (formatos del mundo generado) | **resuelto en su dominio**: `WorldGenerator` da NBA/WNBA a las ligas NBA y NCAA masculino/femenino a las NCAA |
| P1-1 (eliminado sin banquillo) | política explícita: el motor mantiene cinco en pista y emite `foulOutNoReplacement`, nunca en silencio. Jugar con menos de cinco sigue en la lista MP2 |
| Coste del frame (punto 4 de la lista MP2) | sigue pendiente: Live con frames ~32 s |

---

# Decisión original de BT7

Fecha: 2026-10-04. Rama `match-next-basketball-core-bt7-full-integration`. Evidencia en `docs/matchengine-next/BT7_FULL_BASKETBALL_INTEGRATION_REPORT.md`.

## Decisión

**CORE LOCK: NO.** Core Lock readiness: **PARTIAL**.

El motor de baloncesto de Match Next es, por sí mismo, candidato a congelarse:

- las cadenas de disponibilidad, quinteto, rotación, fatiga, faltas, reloj, posesión, estadísticas, consecuencias y guardado están integradas y verificadas por el camino de producción;
- Live = Instant y el comportamiento es determinista;
- no quedan pruebas rojas sin explicar en las áreas tocadas.

No se congela por dos motivos que no son de baloncesto:

1. **Dos autoridades de simulación en producción.** El partido del usuario usa Match Next. El resto de partidos, el avance de días y la temporada usan el motor legado (`simulateMatchWithRotations`). Congelar el núcleo de Match Next mientras la mayoría de partidos del mundo los juega otro motor congelaría una verdad que el juego no usa de forma coherente. Es una **decisión de arquitectura para el humano**: acelerar Match Next (hoy ~55–60 s por partido), crear un modo IA de la misma economía o aceptar explícitamente dos motores.
2. **Sin control del usuario en vivo.** Ni cambios ni ajustes tácticos durante el partido en Match Next; el motor legado sí los tiene. La autoridad de cambio (`applyCoachSubstitutions`) ya es única y valida legalidad y ventanas, pero la precedencia del usuario sobre la adaptación del entrenador no existe todavía. Congelar sin ella obligaría a reabrir el núcleo.

Si el humano decide la arquitectura de simulación y MP2 añade los cambios y la táctica del usuario sobre las autoridades actuales, el núcleo puede bloquearse sin más trabajo de baloncesto.

## Autoridades que quedan bloqueadas (no se reabren sin un fallo observado)

| Autoridad | Dónde |
|---|---|
| Disponibilidad (una proyección) | `getAvailablePlayersForCompetition` vía `prepareMatchOptions` |
| Quinteto, roles, plan de minutos | `createCoachRotationPlan` (titulares = apertura del plan) |
| Rotación en partido | `decideRotationSubstitutions`: ventanas de la competición; presiones de minutos, fatiga y faltas; eliminación forzada |
| Mutación del quinteto | `applyCoachSubstitutions` (frontera única; cinco en pista) |
| Reglas, reloj y reloj de posesión | `Competition.rules.gameFormat` → `clockRules` |
| Faltas, bonus y eliminación | `resolveFoulRules`, `Fouls.ts` |
| Posesión | registro `possessions` (un inicio y un cierre por posesión) |
| Tiempo en pista y minutos | `courtTimeTenthsByPlayerId` → segundos enteros por mayor resto |
| Estadísticas | `derivePlayerStats` (solo eventos); equipo = Σ jugadores |
| Consecuencias | `completeMatchNext` (falla cerrada si hay `MatchStatLog`) |
| Fatiga | carrera × 0,5 → sesión (ticks + eventos) → Δ × 0,5 a carrera, solo para quien jugó |
| Live = Instant | un controlador; `runInstant` = `skipToEnd` |
| Presentación | `MatchFrame` (proyección de solo lectura) |

## Defectos P1 conocidos (no bloquean el baloncesto)

1. **Jugar con menos de cinco.** Sin banquillo elegible, el eliminado sigue en pista y puede seguir cometiendo faltas.
2. **Formatos de competición del mundo generado.** Las competiciones `nbaLike` y `ncaaLike` reciben reglas FIBA. Es un problema de datos: Match Next ya juega correctamente NBA, NCAA y WNBA cuando la competición los declara.
3. **Escala de fatiga frente al umbral del entrenador.** Un jugador fresco no supera ~33 de fatiga de sesión en un partido, así que la fatiga solo decide la rotación con fatiga de carrera alta.
4. **Salidas tardías por falta de ventana.** Con reglas FIBA no hay cambios tras canasta salvo en los 2:00 finales. Quedan ~2,4 jugadores por partido con el partido entero.
5. **Economía de baloncesto (clase B):**
   - FTr ~0,13;
   - aro ~24 %;
   - creación secundaria escasa (~1 ataque al *closeout* por partido);
   - beneficio general de la presión no demostrado (con defensores de élite sí rinde).
6. **Coste del frame.** Cada frame lleva todos los eventos y todo el historial de posesiones: Live es un +35 % sobre Instant.
7. **Lesión en el partido y guardado durante el partido.** No existen. La lesión es post-partido; la sesión es transitoria.

## Lista para MP2

1. Cambios manuales del usuario en Live, con `applyCoachSubstitutions` y las mismas ventanas.
2. Cambio táctico del usuario en vivo, con precedencia sobre `MatchMemory`.
3. Tiempos muertos.
4. Frames incrementales (deltas de eventos y posesiones).
5. Presentación del motivo del cambio (ya veraz: faltas, fatiga, minutos) y de `rotationPlayers`.
6. Jugar con menos de cinco (P1-1).
7. Guardado durante el partido: `MatchState` + semilla.
8. Datos del mundo con formatos NBA, NCAA y WNBA (P1-2).

## Cambios futuros permitidos

- Correcciones con un fallo observado, diagnóstico causal, evidencia antes/después (mismas semillas, ≥ 12 para afirmaciones de economía) y razón documentada.
- Calibración de clase B (FTr, aro, creación secundaria, presión) cuando se demuestre con 12 semillas, sin romper los invariantes del arnés BT7.
- Nuevas capacidades del usuario (MP2) **sobre** las autoridades bloqueadas, no al lado de ellas.
- Rendimiento que no cambie resultados: el arnés BT7 debe dar el mismo estado final con la misma semilla.

## Cambios especulativos prohibidos

- Retocar umbrales, pesos o multiplicadores para mover una estadística sin una cadena causal observada.
- Una segunda proyección de disponibilidad, un segundo `canPlay` o un camino de cambios fuera de `applyCoachSubstitutions`.
- Estadísticas que no salgan de eventos, o totales de equipo que no sean la suma de jugadores.
- Aplicar consecuencias fuera de `completeMatchNext`, o en un camino que no falle cerrado.
- Lógica distinta para Live e Instant.
- Un simulador de lesiones en el partido sin una autoridad de lesiones diseñada.
- Reglas de competición codificadas en el motor en lugar de leídas de `gameFormat`.

## Revalidación

Antes de reabrir el núcleo o de declarar el Core Lock:

`BT2_AUDIT=1 BT7_SCEN=A,B,C,D,E1,E2,S1,S2,S3,F,AIAI,ACB,R:NBA,R:NCAAM npx vitest run src/presentation/match-next/audit/bt7/integration.test.ts`

Debe dar todos los invariantes en verde, salvo los dos de C2, que documentan el P1-1.
