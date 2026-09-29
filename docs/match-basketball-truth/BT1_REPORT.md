# BT1 · Basketball Truth — informe

Rama `match-basketball-truth-bt1` · SHA inicial `d6be1f32a2f5c12f95194a37603d2e48799a3166` (match-presentation-v1).
Motor auditado: `src/engine/match` (MatchEngine v3 por pasos de acción). **Nota:** el POC lo llamaba "MatchEngine Next", pero
el linaje `src/engine/match-next` (ME-NEXT-0..7) vive en otras ramas y no está en esta; BT1 no lo toca.

## Cómo reproducirlo

```
npm run dev                                   # vite
http://localhost:5173/dev-match-phaser.html?seed=424242&truth=1&camera=halfCourt
node scripts/bt1/capture.mjs --seed 7 --fromSegment 21 --toSegment 22 --truth     # navegador real, frames + truth JSON
node scripts/bt1/scenarios-capture.mjs                                             # las 6 posesiones reproducibles
node scripts/bt1/soak-video.mjs --seed 424242 --minutes 5 --speed 2 --out <dir>    # tiempo real + vídeo
BT1_WRITE_AUDIT=1 npx vitest run src/presentation/match-phaser/audit               # regenera docs/.../audit/*.json
```
`window.__bdmBT` expone `getTruthFrame()` (canonical + rendered de lo que hay en pantalla), `seekToSegment`, `advance`.

## 1. Método

1. **BT1A/B** `audit/basketballTruth.ts` construye, por paso de motor, un `TruthFrame` (jugador: id, equipo, canónica, renderizada,
   diferencia, velocidad, target, facing, acción, cut/drive/screen/reacción, asignación, rol; balón; partido; fase derivada).
   El modo **Basketball Truth** dibuja canónica = cuadrado hueco, renderizada = cuerpo, línea amarilla entre ambas, target (x),
   facing, asignación defensiva, balón canónico (aro) vs renderizado.
2. **BT1C** fases de posesión derivadas (no autoritativas) en `derivePossessionPhases`.
3. **BT1D/E/F** `geometryAudit.ts` y `eventConsistency.ts` juzgan geometría en metros, no nombres de intents.
4. **BT1G/H** `presentationAudit.ts` reproduce el pipeline v1 ("legacy", movido a `legacy/`) y el nuevo a 60 fps sobre el motor real.
5. **BT1I** `scenarios.ts` elige de forma determinista 6 posesiones por seed.

## 2. Hallazgos y clasificación

| ID | Defecto (evidencia) | Capa | Sev. | Estado |
|---|---|---|---|---|
| D01 | Cada paso de motor abarca 3–24 s de reloj y mueve hasta 22 m; v1 lo mezclaba en 650 ms fijos → jugadores a 30–39 m/s (p99 23–25) | PRESENTATION | P0 | corregido (director, ≤ 7 m/s) |
| D02 | El motor avanzaba por timer (333 ms) más rápido que la reproducción (650 ms): eventos pisados; solo 43–60 % de eventos mostrados | BRIDGE | P0 | corregido (cola pull, 100 %) |
| D03 | El balón se interpolaba durante todo el paso aunque el motor resuelve el evento AL FINAL; el tiro llegaba al aro en 0–1 de 15–17 casos; el marcador cambiaba con el balón a 4–12 m del aro | BRIDGE | P0 | corregido (segmento: mover → resolver) |
| D04 | Balón desconectado de su dueño en 84 % de los frames con balón sujeto | PRESENTATION | P0 | corregido (0) |
| D05 | Doble suavizado + `paint()` dos veces por frame (locomotion avanzaba x2) | PRESENTATION | P1 | corregido |
| D06 | Cancha en % (escala no uniforme), cámara que recortaba media pista | PRESENTATION | P0 | corregido (metros, escala única, marcas reales) |
| D07 | "SHOT_MADE seguido de REBOUND": el flujo del motor es coherente (0 violaciones P0); nace del buffering D02 (1 caso en 60 pasos en v1, 0 ahora) | BRIDGE | P0 | corregido |
| E01 | Integrador de un solo paso de Euler de hasta 24 s: la velocidad previa empujaba 12+ m en sentido contrario y el jugador quedaba pegado a la banda (8,4 % de movimientos "al revés", 7–8 % de posiciones en el borde) | ENGINE | P0 | corregido |
| E02 | Transición: el "retreat" retrocedía **alejándose** de la canasta defendida y solo 2,5 m; defensores a 20–28 m de su par | ENGINE | P0 | corregido |
| E03 | Transición: el base ataca 5 m sin tope y acaba detrás del aro (x = 0) | ENGINE | P1 | corregido |
| E04 | Slots defensivos emparejados por rol, asignación real por posición → el defensor asignado (el que contesta tiros/robos) a 10+ m; defensor del balón a 9 m de media | ENGINE | P0 | corregido |
| E05 | Rebote adjudicado a jugadores a 10–23 m del aro (mediana 10,3 m en v1) | ENGINE | P1 | corregido |
| E06 | Base/aleros a 10–12 m del aro (PG en medio campo): 54 % de los tiros desde > 9 m | ENGINE | P1 | corregido |
| E07 | Tras cada pase receptor y pasador intercambian slot; el manejador siempre va al top | ENGINE | P1 | **no corregido** |
| E08 | Sin esquinas (99,6 % de frames half-court sin nadie en la esquina); ataque = plantilla fija de 5 slots | ENGINE | P1 | no corregido |
| E09 | Tiros libres sin reposicionar; balón suelto "aparece" en manos del nuevo poseedor (63 casos / 1.560 pasos) | ENGINE | P1 | no corregido (Presentation lo enmascara con pickup/inbound visibles) |
| E10 | Tapones sin exigir proximidad (mediana 6,8 m) | ENGINE | P2 | no corregido |
| E11 | Economía: 64 % de intentos son triples, 72 tiros y 24 pérdidas por partido | ENGINE | P1 | no corregido |
| E12 | Pasos de acción gruesos: 12–24 s de tiempo cargado en el primer paso de cada posesión | ENGINE | P1 | no corregido |

**Reparto (pregunta 3).** Por nº de defectos: Bridge+Phaser 7/19 (37 %), Engine 12/19 (63 %). Ponderado por severidad
(P0=3, P1=2, P2=1): Bridge 12 %, Phaser 29 %, Engine 59 %. Es mi clasificación a partir de las auditorías, no del vídeo previo.

## 3. Antes / después (mismos seeds 424242, 7, 1, 99, 2024, 31337 × 260 pasos)

Motor (`audit/summaries-v1.json` vs `summaries.json`):

| Métrica | v1 | BT1 |
|---|---|---|
| Movimientos hacia el lado opuesto del target | 2,5 % | 0,2 % |
| Jugadores en el borde de la pista | 7,8 % | 0 % |
| Defensor del balón (dist. media) | 9,2 m | 4,9 m |
| Distancia tirador–defensor asignado | 6,9 m | 3,2 m |
| Tiros "abiertos" (> 4 m) | 72 % | 34 % |
| Tiros desde > 9 m | 54 % | 12 % |
| Rebote a mediana del aro | 10,3 m | 4,2 m |
| Robo (strip) a mediana | 6,3 m | 2,8 m |
| Frames half-court con zona pintada desprotegida | 45 % | 6 % |
| Sin ayuda de lado débil | 65 % | 3 % |

Presentación (`presentation-legacy-vs-director*.json`, seed 424242, 60 pasos):

| Métrica | v1 | BT1 |
|---|---|---|
| Vel. máx. jugador | 30–35 m/s | 5,3–6,9 m/s |
| Frames con balón sujeto desconectado | 67–84 % | 0 |
| Tiros cuyo balón llega al aro | 0/11 | 10/11 (el otro, tapón) |
| Eventos mostrados / emitidos | 28/47 | 47/47 |
| Marcador cambia con el balón a | 4–12 m | 0 m |
| Reloj sim ÷ reloj real | 25–27× | ≈ 2× |

Jugabilidad no relacionada (60 partidos completos, `game-stats-*.json`): puntos 89,2 → 89,6; FG 36 → 37 %; pérdidas 24,7 → 24,0;
faltas 13,8 → 13,1. Deriva declarada: % de triples 58 → 64 (posiciones half-court ahora tras el arco y menos ataques al aro en transición).

## 4. Cambios

**MatchEngine** (cada uno con seed/paso/antes/causa/después arriba y en los tests):
- `SpatialState.advancePlayerTowardTarget`: sub-pasos de 0,25 s (idéntico para pasos ≤ 0,25 s). Seed 424242 paso 9: PF objetivo (10,6; 5,6) desde (8,1; 5,6) terminaba en (0,0; 7,9).
- `TransitionSpatial`: retreat → slot defensivo base; ataque de transición con tope frente al aro (base 1 m, resto 1,8–5 m).
- `BaseSpacing`: defensa posicionada respecto al hombre **asignado** (`calculateDefensiveAssignments` + overrides manuales), presión 1,5 m al balón; spots PG (0,66; 0,5) y aleros (0,72) ≈ 8 m del aro.
- `ReboundResolution`: fuera de alcance (> 8 m) ×0,03.
- `MatchEngine`: pasa `defensiveMatchupOverrides` al spacing.
- Tests: golden de `MatchSession` regrabado (42-54/223 → 36-58/200), y ajustes de fixtures que codificaban el comportamiento erróneo
  (retreat "hacia atrás", targets por rol, dt de kinematics, umbral de overtime).

**Bridge**: `toMatchPresentationSegment` (paso = mover `simSeconds` y luego resolver eventos), campos de evento (`shotZone`, `reboundType`, `passTargetPlayerId`, `blocked`), cancha con arco/esquina, `possession.attackingBasket`, eventos sin significado visual se omiten.

**Phaser/Presentation**: `segmentPlan.ts` (coreografía: pickup/inbound, carry, pase, tiro→aro, netDrop, rebote, robo, TL), `PresentationDirector.ts` (cola pull, ritmo humano, marcador/posesión al resolver el evento), cámara en metros
(fullCourt/halfCourt siguiendo el balón/followBall), escena métrica con marcas FIBA, modo Basketball Truth, panel de datos, `window.__bdmBT`.
El pipeline v1 queda en `legacy/` solo como referencia medible.

## 5. Evidencia visual

`evidence/<escenario>/sheet-plain.png` (lo que ve el espectador) y `sheet-truth.png` (canónico vs renderizado), más `beats.json`
(orden de eventos) y `summary.json` (diferencias canónica–renderizada por frame).

| Escenario | Seed | Pasos motor |
|---|---|---|
| half-court | 1 | 9–12 |
| transición | 12 | 7–8 |
| screen / P&R | 424242 | 0–5 |
| drive + help | 424242 | 24–27 |
| tiro anotado | 424242 | 68–69 |
| fallo + rebote | 424242 | 14–16 |

Sesión larga real: ver `SOAK.md`.

## 6. Preguntas

**¿La verdad espacial de MatchEngine parece baloncesto sin maquillaje del renderer?**
En v1 no: jugadores contra las bandas, defensores de espaldas a su canasta, tiros desde medio campo. Tras BT1 se reconoce la *estructura*
(base arriba, aleros, pívots en el poste, defensa por hombre con presión al balón, ayuda en penetración, rebote cerca del aro, transición con
retorno) — pero no la *dinámica*: es una plantilla de 5 slots que se recoloca por pasos, sin esquinas ni movimiento continuo sin balón.
Baloncesto de simulación por pasos, no de juego comercial.

**¿Cuáles eran los problemas reales del vídeo anterior?** D01–D07 y E01–E06 de la tabla.

**¿Qué porcentaje era de MatchEngine, Bridge y Phaser?** 59 / 12 / 29 % ponderado por severidad (63 % / 11 % / 26 % por recuento).

**¿Comportamientos que no aceptaría en un juego comercial?** Sí: tiros libres sin ir a la línea, balón suelto que aparece en manos de alguien,
rebote largo como "pase", intercambio de puestos tras cada pase, sin esquinas, tapones a 7 m, 64 % de triples.

**Los cinco problemas más graves ahora**
1. Ataque = plantilla fija de 5 slots (E07/E08): sin esquinas, sin movimiento continuo, base siempre al top.
2. Pasos gruesos (E12): 12–24 s cargados con los jugadores llegando y esperando; pocas decisiones por posesión.
3. Defensa pasiva de "caparazón": 62 % de frames half-court sin presión al balón al final del paso; 56 % con un defensor a > 6 m de su hombre.
4. Geometría de balón muerto no simulada (E09): TL, saques, balón suelto, rebotes largos.
5. Economía de tiro (E11) y tapones sin proximidad (E10).
