# F2 — gestión diaria funcional e impacto real de las decisiones

Base: `3c06fb9b` (`origin/main`, F0 #162 y F1 #163 integrados, 2026-10-19). Rama: `playable/f2`.
Alcance: exclusivamente F2. El SHA final y los checks de CI se registran en la PR de F2.

Plan canónico: [PR #161](https://github.com/audifor/BDM/pull/161) (`docs/PLAYABLE_CORE_V1_CANONICAL_PLAN.md`, aún abierta; su texto se
leyó sin convertir propuestas en decisiones). Contratos F0/F1 conservados: [F0](F0_CERTIFICATION.md), [F1](F1_CERTIFICATION.md).

## Flujo de 30 días (ACB 2026/27, UCAM Murcia, 27 sep → 27 oct 2026)

`Planificación (Training Studio) → sesión programada → avance diario (CONTINUE) → ejecución (fase TRAINING) → fatiga / estímulo / cohesión → Save V4 → partido (familiaridad y fatiga iniciales)`

- Tramo A/B: día 0 = 27 sep 2026 (tras el primer partido real), 30 días, **cuatro partidos del usuario** (3, 10, 17 y 24 oct) y los de
  los otros 17 clubes. Tramo Windows: 26 sep → 26 oct (misma ventana, un día antes), también con los mismos cuatro partidos.
- Cada día pasa una sola vez por `advanceGameDay` (`advanceDayWithTrace`: recuperación → entrenamiento → lesiones/avisos → calendario).
- Autoridades reutilizadas, sin motores nuevos: `ScheduledTrainingEngine` (ejecución y evidencia), `TrainingEngine` (recuperación diaria
  de fatiga, regla de partidos), `DelegatedTraining` + `StaffResponsibilityService` (delegación), `LineupEngine`/`RotationEngine`,
  `ReturnToPlayEngine`/`FitnessTest` (Medical), `SimulationBreakpoints` + `breakpointRouting` (avisos), `prepareMatchSetup` (entrada del
  motor), Save V4. Las decisiones del brazo B son **llamadas a acciones del store de Courtside**; ninguna escribe en el mundo directamente.

## Reconocimiento: qué producía consecuencias reales

| Pieza | Estado | Evidencia |
|---|---|---|
| Sesiones programadas → fatiga, estímulo (`DevelopmentStimulusEvent`), moral, cohesión, riesgo de lesión | Real y conectada | M1, M3, M4, A/B 2–3 |
| Cohesión → `plan.familiarity` del motor; fatiga → `dynamicState.careerFatigue` y fatiga de sesión | Real y conectada | A/B 4–5 |
| Quinteto guardado → titulares del acta; lesión → no elegible en Plantilla/Partido/Medical | Real (F1) | A/B 6, M6 |
| Delegación (`createTeamTrainingPlan`, `assignIndividualDevelopment`, `determineIntensity`) → módulo/intensidad ejecutados + `DelegationOutcome` | Real | M8–M10 |
| Ejecutor asignado a la sesión → multiplicador 0,90–1,18 de estímulo y cohesión | Real | M7 |
| Revisión de alta (RTP) → breakpoint `ACTION_REQUIRED` con ruta a Medical | Real | M6 y Windows 17 |
| **Training › Staff** | **Desconectada: leía el mapa retirado `trainingResponsibilitiesByTeamId`** | corregida (ver abajo) |
| Objetivos individuales de Training Studio › Desarrollo (`individualGoals`) | Declarativos: ningún motor los consume | **no se cuentan como evidencia** |
| Cambios de atributos | El desarrollo canónico aplica el estímulo el **1 de julio**; no ocurre dentro del horizonte de 30 días | no se promete ni se mide |

## Defecto encontrado y corregido dentro de F2

1. **Training › Staff mostraba siempre «Sin datos de plantilla técnica».** La pestaña leía `trainingResponsibilitiesByTeamId`, el mapa que
   `STAFF_SYSTEM_V2 §14.1` retiró; la delegación que el usuario hace en Staff › Asignaciones (`responsibilitiesById`) no se veía en la
   pantalla de Training. Ahora lista las funciones de entrenamiento del club con responsable, rol y modo desde la autoridad canónica
   (`getTeamResponsibilityPresentation`). Test: `TrainingWorkspace.test.tsx` («Staff tab shows the canonical Responsibilities…») y paso 6
   de la prueba Windows.
2. El resto de la cadena (avance diario, ejecución, evidencia, disponibilidad, delegación, Save V4) funcionó sin cambios de producto: la
   prueba A/B no encontró decisiones que no llegaran al motor.

## Comparación A/B de 30 días

Mismo `GameWorld` inicial en dos copias Save V4 idénticas (se prueba la igualdad del payload), mismo calendario, reglas, plantillas y
staff. Semillas: función pura de (salt 7, id de partido); semillas de los cuatro partidos `608655685, 742876637, 608508590, 541251019`.
Detalle completo y decisiones con fecha en [ab-comparison.json](evidence/f2/ab-comparison.json).

**A · automática:** configuración inicial, sin ningún comando. **B · activa** (30 decisiones registradas): cada domingo planifica la
semana siguiente en Training (defensa/tiro/ataque/recuperación o P&R/acondicionamiento alto/transición/recuperación, intensidad y
ejecutor de mayor idoneidad; el día previo al partido, libre); asigna cada semana un ejercicio de tiro al peor tirador (objetivo
individual); el día 1 delega el desarrollo individual en el entrenador de desarrollo (Staff › Asignaciones); la víspera de cada partido
guarda el quinteto del cuerpo técnico descansando al titular más fatigado si hay un suplente descansado de su posición.

| Indicador | Día 0 | A · Automática | B · Activa | Diferencia | Causa verificable |
|---|---|---|---|---|---|
| Fatiga media del plantel (día 30) | 2,47 | 0,57 | 12,54 | +11,97 | `careerFatigueDelta` de cada sesión (`execution.participants`); recuperación diaria común |
| Fatiga media diaria (media de 30 días) | 2,47 | 0,83 | 7,28 | +6,45 | carga de sesiones − recuperación (3/día) − sesiones de recuperación |
| Fatiga máxima de un jugador | 11,74 | 11,95 | 33,93 | +21,98 | sesión de intensidad alta de las semanas pares |
| Alivio de fatiga por sesiones de recuperación | 0 | 0 | 97,48 | +97,48 | `activeRecovery`/`lowLoadRecovery` (multiplicador < 0) |
| Carga de entrenamiento (`dailyWorkloadScore`) | 0 | 0 | 831,5 | +831,5 | intensidad × duración × multiplicador de cada sesión |
| Sesiones completadas (club del usuario) | 0 | 0 | 23 | +23 | fase TRAINING del día: 18 de equipo + 5 individuales |
| Estímulo de desarrollo de entrenamientos | 0 | 0 | 776,3 | +776,3 | un evento canónico por jugador y sesión; el agregado = suma de eventos (comprobado) |
| Estímulo de desarrollo de partidos | 0 | 277,4 | 275,7 | −1,7 | minutos jugados |
| Cohesión (familiaridad táctica del motor) | 50 | 50 | 68,13 | +18,13 | `cohesionDelta` de las sesiones tácticas = suma exacta; el partido la lee como `plan.familiarity` |
| Disponibilidad (mínimo de disponibles) | 16 | 16 | 16 | 0 | sin lesiones en la ventana (ninguna fabricada) |
| Jugadores con ≥10 min por partido | — | 5,75 | 6,5 | +0,75 | quinteto/banquillo guardados frente a selección contextual |
| Minutos del titular más cargado | — | 39,2 | 39,1 | −0,1 | descanso del titular más fatigado |
| Sesiones con ejecutor asignado | 0 | 0 | 18 | +18 | `assignedStaffPersonIds` → `executingStaffRoles` |
| Multiplicador de ejecución del staff (medio) | — | 1 | 1,072 | +0,07 | `trainingStaffExecutionMultiplier` (rol × competencia) |
| Decisiones delegadas (`DelegationOutcome`) | 0 | 0 | 5 | +5 | `assignIndividualDevelopment` delegada: el responsable elige el módulo |
| Puntos a favor − en contra (4 partidos) | — | +8 | −63 | −71 | **un solo sorteo por partido; no es causalidad** (ver abajo) |
| Victorias (4 partidos) | — | 3 | 0 | −3 | idem |
| Clasificación tras el día 30 | — | 7.º | 17.º | −10 | idem |

### Qué se prueba y qué no (causalidad frente a azar)

- **Efectos causales demostrados, con la cadena completa decisión → comando → hecho canónico → cambio observable → posible consecuencia
  → conservación en Save V4** (tests `PlayableF2` 2–5, 8–9 y `PlayableF2Mechanisms` M1–M10):
  1. *Entrenamiento / carga / recuperación:* 23 sesiones ejecutadas (A: 0) con fatiga, estímulo y cohesión exactamente iguales a lo que dicen el
     catálogo y `trainingLoad`; la recuperación diaria y las sesiones de recuperación bajan la fatiga; `REST`/`REDUCED` gobiernan fatiga y
     estímulo por jugador (M3–M4); la cohesión y la fatiga resultantes llegan al motor de partido (A/B 4–5).
  2. *Rotaciones / staff / ejecución:* el quinteto guardado abre el acta (A/B 6); el ejecutor escala estímulo y cohesión según su
     idoneidad, sin tocar la fatiga positiva (M7); la delegación hace que el responsable decida módulo e intensidad y deja
     `DelegationOutcome` persistente; tomar la decisión de vuelta devuelve el control (M8–M10).
  3. *Medical:* escenario controlado de lesión (M6): el lesionado desaparece de Plantilla, Entrenamiento (participación `REST`, sin fatiga ni
     estímulo), Medical y Partido; Continue se detiene en la revisión de alta con ruta a Medical; la recomendación del staff procede de la
     lesión real; al darle el alta es seleccionable y juega el partido siguiente; todo sobrevive a guardar/cargar.
- **Marcadores:** con las mismas semillas, B (0–4) y A (3–1) difieren en el resultado registrado, pero eso es un único sorteo por partido y
  el cambio de estado desvía todo el partido. Se midieron los estados previos a cada partido con **10 semillas idénticas por brazo**
  ([multi-seed.json](evidence/f2/multi-seed.json)): diferencia pareada B − A en margen = **+2,33** (error estándar 3,40; IC95 % [−4,35; +9,00]; 40 pares).
  No hay evidencia de que gestionar mejore ni empeore el marcador en este tramo; no se afirma ninguna de las dos cosas.
- **Atribución por familia de decisiones** ([attribution.json](evidence/f2/attribution.json); 17 días, 2 partidos, 10 semillas, 20 pares):
  - guardar el quinteto que el cuerpo técnico ya habría elegido: diferencia **exactamente 0** (los partidos son idénticos; **sin bonificación oculta por
    intervenir**);
  - sólo entrenamiento + delegación: −3,40 (IC95 % [−10,33; +3,53]); sin efecto distinguible del azar;
  - una mala decisión de rotación (los cinco peores como titulares): **−18,30 (IC95 % [−28,53; −8,07])**: las decisiones sí llegan al motor y
    una mala puede perjudicar de forma medible.
- **Exceso de carga** ([overload.json](evidence/f2/overload.json)): fuerza de intensidad alta cinco días seguidos lleva la fatiga media a 42,8 (frente a 0)
  y causó una lesión de entrenamiento; el margen pareado (24 semillas) fue −1,25 ± 4,23, no distinguible. El mecanismo (fatiga y riesgo de
  lesión crecen con intensidad, carga y participación) se verifica de forma determinista (M4–M5).

## Save V4

- Día 0 → dos copias Save V4 con payload idéntico.
- **Día 15 guardado y cargado, y continuado hasta el día 30 = mundo idéntico al recorrido ininterrumpido** (payload completo; mismos
  conjuntos de sesiones, eventos de estímulo, actas y `DelegationOutcome`; mismos resultados de los partidos 3–4).
- Los mundos finales A y B sobreviven a guardar/cargar con sus diferencias intactas (sesiones, cohesión, fatiga, responsabilidades, quinteto).
- Windows nativo: payload (ordenado por claves, como las pruebas de equivalencia Save V4) idéntico tras reiniciar el ejecutable.

## Prueba real Windows: PASS (17 pasos)

`npm run tauri -- build --debug --no-bundle -- --offline` y `node scripts/playable/f2-windows-acceptance.mjs`
(`F2_RTP_FIXTURE` añade el paso 17). Ejecutable Tauri con frontend de producción embebido, sin Vite; eventos reales de ratón y capturas
en [evidence/f2](evidence/f2), resumen en [windows-acceptance.json](evidence/f2/windows-acceptance.json).

| # | Comprobado en el ejecutable | Capturas |
|---|---|---|
| 1 | NEW GAME ACB → partido 26 sep → guardar → cerrar → reabrir → CONTINUE: partida F1 válida (1 partido del usuario en el Save V4 nativo) | `01` |
| 2 | Calendario y próximos encuentros (Valencia 3 oct … Real Madrid 24 oct) | `02` |
| 3 | Training Studio: cuatro sesiones de la semana (defensa, tiro, ataque, recuperación) + plan de equipo (foco Tiro, intensidad Media) + tres semanas automáticas | `03`, `04` |
| 4 | Objetivo individual: «Asignar ejercicio» a un jugador | `05` |
| 5 | Staff › Asignaciones › Modo sencillo: delegar el desarrollo individual (candidatos ordenados por idoneidad) | `06`, `07` |
| 6 | Training › Staff muestra esa delegación (defecto corregido) | `08` |
| 7 | CONTINUE hasta el 3 oct: se ejecutaron **exactamente** las cinco sesiones programadas, cada una con evidencia, un `DelegationOutcome`, cohesión > 50 y cargas positivas y negativas de fatiga | `09` |
| 8 | Training › Resultados (5 completadas) y Medical: fatiga media de Training = Medical = media de las 16 filas | `10`, `11` |
| 9 | Plantilla: quinteto y banquillo descansando al titular más cargado | `12` |
| 10–12 | Dos partidos disputados (3 y 10 oct); los titulares del acta son el quinteto guardado; Competition (Clasificación y Resultados) con los marcadores | `13`–`16` |
| 13 | Guardar y cerrar; cargar: payload idéntico | `17` |
| 14 | Cargar y continuar: partidos 17 y 24 oct, fecha final 26 oct (30 días) | `18` |
| 15 | Save V4 nativo: 5 partidos del usuario, 45 partidos completados = 45 actas, 23 sesiones únicas con evidencia, sin eventos duplicados, ninguna sesión en día de partido | — |
| 16 | Tras cerrar y cargar, delegación, sesiones completadas y quinteto siguen en Courtside | `19`, `20` |
| 17 | Aviso médico → decisión: la revisión de alta vencida detiene Continue, el botón de la barra enruta a Medical, se da el alta y el jugador vuelve al siguiente partido | `21`–`24` |

La partida nativa del usuario se respaldó antes y se restauró: SHA-256 idéntico (`userSaveRestored: true`). El paso 17 carga un Save V4
generado por el test M6 (lesión creada con `createInjury`, escenario controlado, no una lesión natural).

## Limitaciones reales (declaradas)

- El club del usuario **no entrena si el entrenador no programa sesiones** (los demás clubes sí, por la planificación semanal de IA); la
  delegación cambia contenido e intensidad de las sesiones programadas pero no las programa. Es el comportamiento vigente; A refleja
  exactamente eso. «Entrenamientos automáticos» rellena todos los días sin partido con el foco del plan (incluida la víspera del partido).
- Los objetivos de Training Studio › Desarrollo son declarativos; el objetivo individual con efecto es la sesión individual asignada.
- Los atributos de los jugadores no cambian en 30 días (el desarrollo canónico aplica el estímulo el 1 de julio): sólo se mide el estímulo.
- La prueba Windows usa simulación rápida para los partidos (el visor en directo se certificó en F1).

## Validación

- Typecheck, build del frontend y compilación Tauri: PASS. `cargo fmt --check` y `cargo check --offline`: PASS. Sin `Math.random(` en `src/`.
- Tests F2: [`PlayableF2.test.ts`](../../src/app/game/PlayableF2.test.ts) (13), [`PlayableF2Mechanisms.test.ts`](../../src/app/game/PlayableF2Mechanisms.test.ts) (10),
  [`PlayableF2Attribution.test.ts`](../../src/app/game/PlayableF2Attribution.test.ts) (1), más el test de UI de Training › Staff;
  arnés en `src/app/game/testSupport/PlayableF2*.ts`. 24/24 con `--testTimeout=30000 --hookTimeout=30000`.
- Regresiones F0/F1 y focales de Training, Medical, Staff, calendario y Save V4: 38 archivos, 377 tests PASS.
- Suite global y CI: ver la PR.
