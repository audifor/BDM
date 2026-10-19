# F1 — partido jugable e integrado

Base: `b41c223c` (`origin/main`, F0 integrado en la PR #162, 2026-10-19).
Rama: `playable/f1`. Alcance: exclusivamente F1. El estado final, el SHA y los checks de CI
se registran en la PR de F1.

Recorrido certificado en Windows, sobre el ejecutable Tauri real
(`npm run tauri -- build --debug --no-bundle -- --offline`, frontend de producción embebido,
sin servidor Vite):

`NEW GAME → ACB 2026/27 → UCAM Murcia → Home → ROSTER → TACTICS → PARTIDO → ACTA → CLASIFICACIÓN → Save V4 → recarga → siguiente partido`

## Prueba real Windows: PASS (16 pasos, 20 puntos del recorrido de aceptación)

`node scripts/playable/f1-windows-acceptance.mjs` lanza `bdm.exe`, se conecta al WebView2 por
DevTools y actúa con eventos reales de ratón y teclado (los desplegables nativos y los
`<select>` se cambian con el setter nativo más sus eventos). Evidencia:
[windows-acceptance.json](evidence/f1/windows-acceptance.json) y 23 capturas en
[evidence/f1](evidence/f1).

| # | Comprobado en el ejecutable | Evidencia |
|---|---|---|
| 1–2 | NEW GAME, ACB 2026/27, entrenador Elena Piloto, UCAM Murcia, inicio 1 jul 2026; Continue se detiene el 26 sep 2026 ante Casademont Zaragoza | `01`–`03` |
| 3 | Roster: quinteto PG/SG/SF/PF/C y banquillo B1–B4 con el selector de rotación; contadores `5/5 QUINTETO` y `4/7 BANQUILLO` | `04` |
| 4 | Tactics muestra exactamente el mismo quinteto y banquillo | `05` |
| 5 | Rotaciones: minutos fijados y guardados en la partida | `06` |
| 6 | Pizarra: ritmo «Máximo ritmo», triples «Más», esquema «Proteger pintura», bloqueo directo «Hedge». Lo que el motor no ejecuta se declara «sin efecto en el partido» | `07` |
| 7–8 | Guardar (Save V4 nativo), cerrar el proceso, volver a abrir y CONTINUE: quinteto, banquillo, ritmo, esquema y cobertura vuelven exactos | `08`, `09` |
| 9 | Partido: la presentación muestra «Elegido por ti», «Minutos fijados por ti» y el plan guardado | `10` |
| 10 | Partido en directo con el MatchViewer hasta el final. Con el partido abierto, Guardar y Cargar están desactivados y lo explican | `11`–`13` |
| 11 | Acta: puntos de cada jugador = total de equipo = marcador; los titulares del acta son los cinco elegidos | `14` |
| 12 | Competition: Clasificación (PJ/G/P/PF/PC/Dif) y Resultados reflejan el partido | `15`, `16` |
| 13 | Home: nuevo balance y siguiente encuentro (Valencia Basket, 3 oct 2026) | `17` |
| 14 | Guardar, cerrar, cargar y volver a guardar: **payload Save V4 idéntico** tras reiniciar | `18` |
| 15 | Continue hasta el 3 oct 2026 sin duplicar el partido anterior; segundo partido por simulación rápida: 2 partidos del usuario, 10 completados, 10 actas, ninguno duplicado, primer resultado intacto | `19`, `20` |
| 16 | Modo claro y ventana compacta de 1280×720 sin desbordamiento horizontal ni errores de render en consola | `21`–`23` |

La partida nativa del usuario se respaldó antes de empezar y se restauró al terminar: SHA-256
idéntico (`userSaveSha256Before` = `userSaveSha256After` en el JSON).

## Autoridades reutilizadas (sin sistemas nuevos)

- Quinteto y suplentes: `world.lineupsByTeamId` (`TeamLineup`), escrito solo por
  `engine/tactics/LineupEngine` desde el store, igual en Plantilla, Pizarra y selector de rotación.
- Rotación: `world.rotationPlansByTeamId`, validada por `RotationEngine`/`isValidRotationMinutes`.
- Tácticas: `world.tacticalPlansByTeamId` (plan del equipo) y `gamePlansByKey` (ajuste del partido
  y emparejamientos), resueltos por `resolveEffectiveTacticalPlan`.
- Motor: Match Next (`MatchEnginePort`, `MatchNextLiveController`), `prepareMatchOptions` como única
  preparación, y `completeMatchNext` como única aplicación del resultado.
- Resultado y clasificación: `applyMatchResult`, `MatchStatLog`, `calculateStandings` y el modelo de
  Competition. Issue #22: Competition ya leía `GameWorld`; se certifica con test (ver abajo).
- Persistencia: Save V4 y `TauriGameSaveRepository`. No hay slots, formatos ni repositorios nuevos.

## Defectos encontrados y corregidos dentro de F1

1. **Plan táctico sin persistencia ni autoridad única.** La Pizarra guardaba ritmo, enfoque, sistema,
   espaciado, etc. en `localStorage` y en un store de UI transitorio que el partido recibía como
   «override»: nada de eso llegaba a `GameWorld` ni al Save V4. Ahora las instrucciones que el motor
   ejecuta se escriben en `GameWorld` al instante y no existe el botón «Guardar ajustes».
2. **Controles decorativos.** Foco, libertad creativa, sistema, espaciado, frecuencia de P&R, riesgo
   en el pase, rebote ofensivo, defensa al poste, transición, agresividad y protección de aro no
   tienen soporte canónico: se muestran con «SIN EFECTO EN EL PARTIDO» en lugar de simular una
   acción. «Cobertura P&R» del Plan de Partido (legacy) cambiaba en realidad el esquema defensivo con
   las etiquetas Drop/Switch/Blitz; ahora son dos controles independientes. Los roles y tareas
   individuales de la Pizarra avisan de que son notas sin efecto en el motor.
3. **Quinteto no validado.** `setLineupSlot` admitía lesionados o no elegibles y la preparación del
   partido los sustituía en silencio. Ahora `LineupAvailability` aplica la misma regla que el
   partido (plantilla, en activo, sano, elegible); el store explica el rechazo en Plantilla y
   Pizarra, el selector de rotación deshabilita al lesionado y la columna EST de Plantilla
   distingue OUT / NE / BAJA.
4. **Orden de suplentes ignorado.** Los suplentes B1..B7 elegidos solo servían para el «activo de 12»;
   el reparto automático de minutos los ignoraba. Ahora el orden elegido manda en el banquillo.
5. **Minutos obsoletos.** Un plan de minutos guardado para otros doce jugadores se aplicaba igualmente
   (el recién llegado jugaba 0 minutos). Ahora solo se aplica si describe el quinteto y banquillo
   actuales; si no, reparte el cuerpo técnico y la pantalla de Partido lo avisa.
6. **Pantalla de Partido sin información ni acta.** Solo listaba la plantilla con la fatiga. Ahora
   presenta competición, equipos y récords, quinteto inicial real (el que usará el motor),
   banquillo y minutos previstos, no disponibles con motivo, plan táctico, emparejamientos y quinteto
   rival, y tras el encuentro muestra el acta con el `MatchStatLog`.
7. **Guardar durante un partido en directo** guardaba el mundo previo al partido sin avisar. Ahora está
   bloqueado con una explicación. Es el tratamiento previsto: el progreso de un partido en directo no
   es parte de `GameWorld` y no se crea otro sistema de persistencia.
8. El botón «Reanudar partido» seguía activo tras el pitido final.
9. El panel derecho de la Pizarra quedaba limitado a 265 px de altura; ahora usa todo el panel.

## Tácticas → MatchEngine: qué llega y dónde influye

| Instrucción (Courtside) | Campo canónico | Dónde influye en Match Next | Evidencia (test F1 nº 3) |
|---|---|---|---|
| Ritmo | `pace` | `tacticalIntent().offense.tempo` (decisiones de ataque, transición, saques rápidos) | tempo(+2) > tempo(−2) |
| Volumen de triples / ataque al aro / media distancia | `shotProfile` | `offense.interior` (hacia dónde busca terminar el ataque) | triples +2 → más intentos de 3 que aro +2, con semillas fijas |
| Esquema defensivo | `defense.interior/perimeter` | `defense.pressure`, ayuda y profundidad del bloqueo | presión perimetral > proteger pintura |
| Cobertura de bloqueo directo | `defense.pickAndRollCoverage` | cobertura de cada bloqueo rival (evento `screenSet.screenCoverage`) | blitz ≥ 90 % vs drop ≤ 10 % de bloqueos cubiertos en blitz |
| Jugador destacado | `featuredPlayerId` | +4 de posición como creador y +0,08 como destino de pase | +4 exacto y más pases recibidos |
| Emparejamientos | `gamePlansByKey.matchups` | `defensiveMatchupOverrides` | cubierto por los tests del motor y persistido en F1 10A |
| Quinteto y rotación | `TeamLineup`, `minutesByPeriod` | quinteto inicial, objetivos de minutos de `decideRotationSubstitutions` | test nº 2: el quinteto abre el partido y todo cambio voluntario trae a un jugador con minutos previstos |

No se exige que una táctica cambie el marcador de un partido aislado.

## Limitaciones reales (declaradas, no ocultas)

- Match Next solo admite sustituciones decididas por el cuerpo técnico (`coachSubstitutions`); no hay
  comando de sustitución manual ni de cambio táctico en directo. El visor no ofrece controles falsos y
  la pantalla de Partido lo dice. Los minutos previstos son un objetivo que el cuerpo técnico ajusta
  por posición, fatiga y faltas: el reparto real puede apartarse del previsto.
- Los ajustes de Pizarra sin soporte canónico (lista del defecto 2) no se ejecutan.
- Guardar durante un partido en directo no está soportado y la aplicación lo impide.

## Pruebas automáticas

- [`PlayableF1.test.ts`](../../src/app/game/PlayableF1.test.ts): 18 escenarios sobre el universo ACB real
  (UCAM Murcia, 26 sep 2026): 1 quinteto válido e inválido; 2 sincronización Plantilla/Tácticas/motor,
  orden de suplentes y minutos obsoletos; 3 tácticas → kernel; 4 partido completo y prórroga ACB; 5
  sustituciones; 6 estadísticas = acta = eventos; 7 resultado una sola vez; 8 Home/Calendario/Competition
  coherentes; 9 dos partidos consecutivos; 10 Save V4 antes y después; 11 determinismo; 12 simulación
  rápida = visualización por fotogramas = resultado instantáneo.
- UI: pantalla de Partido (presentación, no disponibles, acta), Pizarra, selector de rotación,
  bloqueo de guardado durante el partido, columna de estado de Plantilla, y `LineupAvailability`
  (lesión y no elegibilidad NCAA).
- Se actualizan los tests que fijaban el comportamiento decorativo (botón «Guardar ajustes»,
  persistencia en `localStorage`, selector «Rotación» local, «Cobertura P&R» que cambiaba el esquema).

## Validación

- Typecheck, build del frontend y compilación Tauri: PASS.
- `cargo fmt --check` y `cargo check --offline`: PASS. Sin `Math.random(` en `src/` y sin imports
  de React/Zustand/Tauri en `src/domain` ni `src/engine`.
- Suite global: `npm test -- --maxWorkers=4 --testTimeout=30000 --hookTimeout=30000`.
  El resultado local y el de CI figuran en la PR.
- Save V4: roundtrip antes y después del partido y payload idéntico tras reiniciar el ejecutable.
  SHA-256 del payload antes del partido (determinista entre ejecuciones):
  `5237f8097a23525009b5f330cafa013ac9316acc83c2ffa29505892ed21125cc`.
