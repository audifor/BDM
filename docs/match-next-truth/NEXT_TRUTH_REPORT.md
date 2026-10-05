# Basketball Truth · MatchEngine Next + Phaser 4.2

Rama `match-next-phaser-truth` (worktree `C:\BDM-NEXT-TRUTH`), base `38f17a7` (`matchengine-next-7-match-center-feature-parity`).
Worktrees antiguos (`C:\BDM-MATCH-PHASER`, ramas `match-next-phaser-poc`, `match-presentation-v1`, `match-basketball-truth-bt1`) **no se han tocado**; solo se leyeron como donor.

## 1. Fuente canónica (evidencia)

`38f17a7` es la punta que contiene todo el linaje Next: ME-NEXT 0–6 (`0062d78`, mergeado en `f66f78a`), la integración Live/Instant y el
"Match Center parity" (ME-NEXT 7). `main` (`c23771f`) solo tiene el motor legacy `src/engine/match`; BT1 se hizo sobre ese motor.

**MatchEngine Next = `src/engine/match-next/`** (6.2 kLOC): `kernel.ts` (`tick`, `applyCommand`), `state.ts` (`MatchState`, eventos), `frame.ts`
(`toFrame` → `MatchFrame` de solo lectura), `possession.ts`, `ball/` (BallState, BallTransitions, BallFlight, LooseBallPursuit),
`movement/` (PlayerKinematics, MovementIntent), `structure/` (FiveOutStructure, OffensiveStructure, SlotAssignment), `defense/ManDefense.ts`,
`actions/` (DecisionCore, ActionCore), `transition/ReboundTransition.ts`, `responsibility/`, `clockRules.ts`, `coaching/RotationDecision.ts`,
`observer.ts`, `rng.ts`, `setup.ts`. Integración: `src/app/matchNext/` (`MatchEnginePort`, `MatchNextEnginePort`, `MatchNextLiveController` =
Live, `runInstant` = Instant sobre el mismo controlador, `prepareMatchSetup`, `MatchNextResult`). Docs: `docs/match-next/ME_NEXT_6_INTEGRATION.md`.

**Dependencias legacy documentadas (solo en la frontera de app):** `prepareMatchSetup` importa `MatchTacticalPlan` de `@/engine/match` y
`prepareMatchOptions` de `@/app/game/playUserGame` para construir el `MatchSetup`. El kernel Next no importa `@/engine/match`.
Este trabajo no usa `src/engine/match` como autoridad.

## 2. Fase 1 · ¿Expone Next suficiente verdad espacial para un renderer externo?

**Sí, y mejor que legacy.** Cada `MatchFrame` (tick = 0,1 s) trae: posición, velocidad y `facing` por jugador; `intent` (target, urgencia,
facing, propietario), `responsibility`, `decision`, `assignment` defensiva, `ballRelation`, rol de transición y de rebote; balón con
`kind` (HELD/PASS_IN_FLIGHT/SHOT_IN_FLIGHT/REBOUNDABLE/LOOSE/DEAD/INBOUND/JUMP_BALL), altura, dueño y `flight` (from/target/release/arrival);
posesión con fase (INBOUND/ADVANCE/SETUP/ACTION/SHOT/LIVE_REBOUND), reloj de juego y de posesión, marcador, estructura ofensiva 5-out
(slots con esquinas), `defensiveStructure` (on-ball, help, rotaciones), `transition`, `reboundState`, acciones y eventos con secuencia.

| Info del POC legacy | En Next |
|---|---|
| Posición/velocidad/orientación/balón | **Directo** (`position`, `velocity`, `facing`, `ball`) |
| Intents cut/screen/drive/defensiveReaction derivados | **Modelo distinto**: `responsibility` + `decision` + `intent` + acciones DRIVE/KICK_OUT/CATCH_AND_SHOOT/CLOSEOUT; help = `defensiveResponsibilityChanged` HELP/ROTATE/X_OUT |
| Asignaciones (calculateDefensiveAssignments) | **Directo**: `assignment` del frame |
| Fases de posesión derivadas (BT1C) | **Directo**: `possession.phase` es canónica |
| Segmentos de 3–24 s, lead-in, coreografía de balón | **No aplica**: Next ya emite 10 Hz con vuelo y altura del balón |
| Screens / P&R / cuts | **No existen** en Next (ME_NEXT_6 lo declara); no se simulan ni se fingen |
| Faltas, tiros libres, tapones, asistencias | **No existen** como verdad canónica |

## 3. Fase 2 · Donor audit (`C:\BDM-MATCH-PHASER`)

| Pieza | Clase | Decisión |
|---|---|---|
| `camera.ts` (+test), métrica, escala única | **PORTABLE** | copiado sin cambios |
| Cancha métrica FIBA/NBA (marcas, arco, esquinas) | **PORTABLE/ADAPTABLE** | reescrita sobre `NextCourt` |
| Escena Phaser (cuerpos, balón, overlay) | **ADAPTABLE** | reescrita sobre `NextRenderFrame` |
| Modo Basketball Truth (cuadrado canónico, línea, target, facing, asignación, balón canónico) | **ADAPTABLE** | portado; añade slots 5-out |
| Panel/`window.__*` de captura, scripts capture/scenarios/soak | **ADAPTABLE** | portados como `__bdmNext` y `scripts/next/` |
| `MatchPresentationState/Event`, `MatchPresentationBridge` | **REJECT** | acoplados a `MatchSessionState` legacy y a % de cancha |
| `segmentPlan`, `PresentationDirector` (segmentos, pickup, netDrop, coreografía) | **REJECT** | compensaban pasos gruesos y balón sin vuelo; con Next serían maquillaje |
| `legacy/locomotion` (suavizado exponencial) | **REJECT** | doble suavizado; Next ya es cinemático |
| `audit/*` (geometría, ballJump, phases derivadas) | **ADAPTABLE** | geometría reescrita sobre ticks Next |
| Fixes de gameplay de `src/engine/match` (95b5aad) | **NO PORTADOS** | ver §8 |

## 4. Contrato Presentation Next

```
MatchEngine Next (MatchState) ──toFrame()──▶ MatchFrame (solo lectura, del propio motor)
  ▶ MatchNextPresentationBridge.toNextTickFrame  (puro, sin RNG, sin @/engine/match; metros; décimas→segundos)
  ▶ NextTickFrame + eventos del tick             (src/presentation/match-next/types.ts)
  ▶ NextPresentationDirector                      (tira un tick cuando la reproducción lo consume; interpola 10 Hz→60 fps;
                                                   dispara los eventos de cada tick una vez, en orden; NO coreografía)
  ▶ PhaserNextRenderer / PhaserNextScene (Phaser 4.2.1)
```
Phaser no decide posesión, pase, tiro, rebote, reloj ni marcador ni escribe posición canónica; el renderizado va como máximo 1 tick (0,1 s)
por detrás de la verdad. Test (`NextPresentation.test.ts`): bridge verbatim/puro, joins asignación↔guardedBy, 1 evento = 1 emisión en orden,
interpolación exacta, sin saltos de evento a cualquier fps/velocidad, motor nunca > 1 tick por delante, velocidad renderizada < 9 m/s.

## 5. Escenarios reproducibles (seed · ventana de ticks) — `audit/scenarios.json`

half-court seed 2024 t6203–6340 · transición ofensiva seed 424242 t54–124 · transición defensiva 424242 t116–265 · drive 424242 t215–320 ·
help 424242 t303–485 · secuencia de pases (6) 424242 t3097–3303 · tiro anotado 424242 t1127–1291 · fallo 424242 t602–722 ·
rebote 424242 t747–867 · saque 424242 t503–610. **Screen y P&R: no existen en Next → no hay escenario (no se falsean).**
Evidencia (Chrome real): `evidence/<escenario>/sheet-plain.png`, `sheet-truth.png`, `beats.json`, `summary.json`; antes de los fixes: `evidence-before/`.
Sesión larga: ver `SOAK.md`.

## 6. Hallazgos (auditoría 6 seeds × partido completo; `audit/summaries-before.json` → `summaries-after.json`)

### Event truth / defectos de Next probados y corregidos
| ID | Defecto | Seed · tick | Antes → después |
|---|---|---|---|
| N1 | Rebote: los defensores solo persiguen el balón cuando ya es capturable, el ataque llega antes con todo el vuelo de ventaja | 424242 t74 y todo el partido | **96 % de rebotes ofensivos → 55 %**; posesión termina en canasta el 90 % → 56 % |
| N2 | Si suena la bocina con una acción activa (tiro en vuelo), `ACTIVE`/`currentDecision` sobreviven al siguiente periodo: 24 s sin decidir | 424242 tiro t6160 → bocina t6164 → violación t6439 (hasta 57 violaciones/partido) | 3 → **0** violaciones |
| N3 | Saques con `travelTicks: 1`: el balón recorre 3 m en 0,1 s (30 m/s), ~160 veces por partido | 424242 t133, t392, t523… | 1 tick → 2–8 ticks |

### Problemas que **siguen** (no corregidos; ver §9)
- **Economía irreal:** ~370 puntos y ~330 tiros por partido (antes 408 / 372; real ≈ 200 / 170); 1,3 tiros por posesión; posesión media 7,7 s; 68 % de intentos son triples y 16 % desde > 9 m; FG 42 %.
- **Rebote aún asimétrico:** 55 % ofensivos (real ≈ 27 %) y putbacks encadenados; 4 jugadores (mediana) a < 4 m del aro al asegurar.
- **Ataque:** las esquinas están vacías en el 85 % de los frames estables de half-court; solo el 21 % de los jugadores está a < 1 m de su slot y el balón nunca se sostiene > 2 s (decide cada ~1 s), por lo que el 5-out no llega a asentarse; separación mínima entre atacantes 2,3 m; 0,75 carriles de pase libres de 4.
- **Defensa:** presión al balón razonable (2,8 m de media; 26 % sin presión), pero el 46 % de los frames tiene un defensor a > 6 m de su hombre y el 36 % no tiene ayuda en lado débil.
- **Balón (verdad canónica):** al hacer canasta el balón queda `DEAD` en el aro y salta 7,9 m a las manos del sacador; no hay recuperación de balón.
- **Ausencias:** screens/P&R, cuts como acción, faltas y tiros libres, tapones, asistencias; pérdidas 19/partido e intercepciones 5.

## 7. Comparación con hipótesis de BT1 legacy (`audit/summaries-*.json`, cifras medias de 6 seeds)

| Hipótesis BT1 | Veredicto | Evidencia en Next |
|---|---|---|
| Pasos gruesos (3–24 s por paso) | **NEXT ALREADY SOLVED** | ticks de 0,1 s; velocidad máx. 6,3 m/s |
| Geometría de transición incorrecta (retreat hacia atrás, base tras el aro) | **NEXT ALREADY SOLVED** | roles de transición con targets (STOP_BALL, PROTECT_RIM, MATCH…); defensores hacia su canasta |
| Slots ofensivos pobres (PG en medio campo) | **NEXT ALSO AFFECTED (distinto)** | 5-out con esquinas y arco, base a 6,5 m del aro; pero no se ocupan (21 % a < 1 m) |
| Poca presión al balón | **NEXT ALREADY SOLVED (parcial)** | defensor on-ball a 2,8 m; 26 % sin presión |
| Asignaciones defensivas inconsistentes | **NEXT ALREADY SOLVED** | `assignment` en el frame; posiciones respecto al hombre asignado |
| Rebote insensible a la distancia | **NEXT ALSO AFFECTED (otro fallo)** | es físico y sensible a distancia (rebotero a 2,7 m del aro) pero **sensible al tiempo**: N1 |
| Geografía de tiro irreal | **NEXT ALSO AFFECTED** | 68 % triples, 16 % > 9 m tras N1 (antes 55 % / 2 % por putbacks al aro) |
| Tapones irreales | **NOT COMPARABLE** | Next no tiene tapones |
| Discontinuidades de balón suelto | **NEXT ALSO AFFECTED** | DEAD→saque 7,9 m; PASS_IN_FLIGHT→HELD hasta 8 m (saques) |
| Integrador que manda al jugador contra la pared | **NEXT ALREADY SOLVED** | cinemática por tick |
| **No estaba en BT1** | **Nuevos en Next** | N1, N2, N3 |

## 8. Fixes en MatchEngine Next (mínimos, con test focal `matchNextTruthFixes.test.ts`)

- **N1** `transition/ReboundTransition.ts`: los `REBOUND_PURSUERS_PER_TEAM` defensores más cercanos persiguen el punto de caída desde el tiro (simétrico con los crashers ofensivos).
- **N2** `kernel.ts finishPeriod`: las acciones `ACTIVE` pasan a `CANCELLED` y `currentDecision = null` con la bocina.
- **N3** `app/matchNext/MatchNextLiveController.ts`: `travelTicks` del saque = `clamp(ceil(distancia), 2, 8)` (misma regla que ActionCore ≈ 10 m/s).
- Live e Instant usan el mismo `MatchNextLiveController`/kernel, así que ambos reciben los tres cambios; el resultado sigue determinista por seed.
- Test existente ajustado: `matchNextTransition.test.ts` codificaba "los 5 defensores hacen BOX_OUT durante el vuelo" → ahora 3 BOX_OUT + 2 PURSUE.
- **Ningún fix de `src/engine/match` se portó**: 4 de los 6 no aplican (ya resuelto o no comparable) y los otros dos (rebote y posiciones) se re-diagnosticaron y son distintos en Next.

## 9. Preguntas obligatorias

**¿El POC anterior estaba realmente representando MatchEngine Next?** No. El código decía "MatchEngine Next" pero leía `MatchSessionState` de `src/engine/match` (legacy, pasos de 3–24 s); el motor Next (`match-next`, ticks de 0,1 s) vive en otras ramas.

**¿Qué parte del trabajo de BT1 sigue siendo válida?** La metodología (canónico vs renderizado, auditoría por geometría en metros, escenarios por seed, evidencia en navegador real), las herramientas de captura, la cámara/cancha métrica y el diagnóstico de que el pipeline v1 del POC era ilegible. Las cifras y los seis fixes son del motor legacy.

**¿Cuáles de los seis fixes legacy también eran necesarios en Next?** Ninguno tal cual: integrador (Next es cinemático), retreat/tope de transición (Next tiene roles), emparejamiento defensivo (Next usa `assignment`), spots del base (Next usa 5-out) ya estaban resueltos; el "rebote" reaparece con otra causa (N1: tiempo, no distancia).

**¿Qué problemas ya había resuelto Next por sí mismo?** Pasos gruesos, velocidad, transición, asignaciones, presión al balón, esquinas definidas, fase de posesión canónica, vuelo y altura del balón, rebote físico.

**¿La verdad espacial de Next parece baloncesto?** A nivel de estructura sí (arco 5-out, defensa por hombre con ayuda, cierres, transición con retorno, rebote físico). No a nivel de partido: sin screens/faltas/tapones, 370 puntos por partido, la mitad de los rebotes ofensivos, ataque que no asienta su estructura.

**STATUS VISUAL = FAIL** para "núcleo de un simulador comercial de alta calidad" (criterio de la tarea), aunque el presentation pipeline es correcto y los tests pasan.

**Cinco defectos que impiden considerarlo calidad comercial**
1. Economía de juego: ~370 puntos y ~330 tiros/partido, 1,3 tiros por posesión, 68 % de triples.
2. Rebote ofensivo del 55 % con putbacks encadenados (y saltos de balón al asegurar).
3. Sin screens/P&R/cuts/faltas/tapones: el repertorio se reduce a drive/kick-out/catch-and-shoot.
4. El ataque no asienta el 5-out (decisiones cada ~1 s; esquinas vacías 85 %; 21 % de jugadores en su slot).
5. Balón muerto sin física: canasta → balón que salta 7,9 m al sacador, sin recuperación ni faltas/tiros libres.
