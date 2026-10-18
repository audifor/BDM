# BS19A · Human RPG Engine: auditoría de reutilización y ruta jugable

Fecha de auditoría: 2026-10-17.
Base revisada: `audifor/BDM` `main` (`ceaa45529ce23c4e94bbc2cef17d9d0d987552b6`) y PRs existentes indicadas abajo.
Estado: **AUDITADO / ROADMAP PROPUESTO**. Sin implementación BS19 nueva y sin certificación funcional BS19.

## 1. Objetivo de producto (corregido por directriz del propietario, 17-10-2026)

**El protagonista es el entrenador creado por el jugador.** BS19 no es solo un motor de reacción del staff: es el **Basketball Life RPG**, una simulación de vida, identidad y trayectoria del entrenador en un universo de baloncesto persistente.

Nuevo requisito que invalida el orden original: **crear a tu coach desde cero antes de empezar la carrera** y conservar su identidad PERSON en el tiempo. Vida profesional, relaciones, economía personal, reputación, compromisos, decisiones y recuerdos con consecuencias reales, mientras los demás actores y las competiciones siguen viviendo.

Auditoría de ausencia en `main`:
- `src/ui/startup/BootstrapApp.tsx`: solo recoge universo y equipo; no nombre, DOB ni trasfondo del entrenador.
- `src/app/game/NewGameUniverseCatalog.ts`: preset RPG opcional, ningún `UserCoachCreationDraft`.
- `src/app/game/createConfiguredGame.ts`: preset conectado solo a algunas rutas y no expuesto al usuario en startup.
- `src/engine/world/WorldGenerator.ts`: `userCoachId = coaches[0].id` y nombre generado.
- `src/domain/coach/Coach.ts`: Coach es la fachada existente de PERSON + StaffProfile; se debe reutilizar.
- `src/domain/coachFinances/CoachFinances.ts`: dinero/estilo de vida reutilizables, sin nueva economía paralela.

**Documento rector actualizado:** [BS19_PRODUCT_VISION_COACH_CREATOR_LIFE_SIM.md](BS19_PRODUCT_VISION_COACH_CREATOR_LIFE_SIM.md).

Contrato experiencial: **hecho/contexto simulado real -> perspectiva y situación -> elección del protagonista -> acción autorizada -> efecto canónico -> memoria/relación/carrera/economía -> consecuencias posteriores**. No se limita a eventos de staff. Se permiten acontecimientos emergentes generados prospectivamente por reglas del mundo; nunca historias presentadas sin su correspondiente evento persistido.

**Límite:** no replicar Los Sims completo, no sistema de microtareas, no nuevo framework transversal abstracto, no duplicar PERSON/Coach RPG/Governance/Finance, no interferir con el desarrollo paralelo WorldDB V2 y generadores. BS20 sigue siendo responsable de enriquecimiento narrativo y medios, no de las consecuencias canónicas.

## 2. Reuse-first: autoridades existentes

| Área | Autoridad / prueba de existencia en main | Estado auditado | Qué conectar |
|---|---|---|---|
| Identidad humana | `src/domain/person`, `src/domain/personality`, `src/domain/coachRpg`, `src/domain/world/GameWorld.ts` | Activa, PERSON 50 todavía no consolidado en main | Un solo PERSON entre jugador/staff/coach y su DOB fuente; no crear identidades paralelas |
| Moral | `src/domain/morale/Morale.ts`, eventos de mundo | Activa en sucesos seleccionados | Hechos profesionales y deportivos, perspectiva y respuesta |
| Relaciones | `src/domain/relationships/Relationships.ts`, `src/domain/world/RelationshipEvents.ts` | Ocho facetas, eventos direccionales; cobertura parcial | Crear efectos SOLO ante interacciones verificadas, no inicializar afinidad como amistad |
| Memory | `src/domain/memory/Memory.ts`, `src/engine/memory/MemoryEngine.ts` | Propietario/observador, dedupe, decay, puente Relationship | Lecturas y consecuencias de recuerdos según actor; no confundir memoria con evento |
| Staff Human State | `src/domain/staffHumanState`, `src/engine/staff/StaffHumanReactionEngine.ts` | 11 dimensiones, reacciones y efectos; evento fuente obligatorio | Mostrar causas, opciones y consecuencias; usar writer actual |
| Cultura / cohesión | `src/domain/staffCulture`, `src/domain/staffUnitCohesion`, `src/engine/staff/StaffCultureCohesionPipeline.ts` | Activa para staff, impacto deportivo transversal parcial | Respuestas específicas; sin modificador universal inventado |
| Conflictos | `src/domain/staffConflict/StaffConflict.ts`, `src/engine/staff/StaffConflictEngine.ts` | Ciclo, participantes, gravedad, causas, resoluciones | Decisiones del usuario solo ante conflictos reales persistidos |
| Política / agencia | `src/domain/staffPolitics`, `src/engine/staff/StaffPoliticalActionEngine.ts`, `src/app/staffCareerAutonomy/StaffCareerAutonomyService.ts` | Acciones políticas, solicitudes, decisiones y carrera del staff | Responder/mediar/delegar con derechos y resultados trazables |
| Coach Career / RPG | `src/domain/coachRpg`, `src/domain/coachCareer`, pantallas Coach | Parcialmente jugable | Identidad/carrera/reputación y consecuencias humanas, sin segunda carrera |
| Governance | BG1-BG8, `src/app/governance`, BS18 PR #141 | BS18 sigue PARTIAL | Reusar permisos y decisiones; no crear poderes políticos fuera de Governance |
| UI y paradas | Staff Dynamics, Coach, Board, Memory, `SimulationBreakpoints` | Algunas vistas, acciones y paradas incompletas | Exponer acciones reales; UX Courtside se valida por separado |
| Narrativa | `src/domain/narrative`, `src/engine/narrative` | Selección limitada de eventos | BS20 propietario. BS19 entrega hechos auditables, no genera ficción |

Evidencia de inventarios: `docs/strengthening/BDM_MASTER_CAPABILITY_REGISTRY.md`, `BDM_CROSS_SYSTEM_INTEGRATION_MATRIX.md`, `BDM_PRODUCT_MANIFESTATION_MAP.md`, `BDM_DORMANT_CAPABILITIES.md`, `BDM_REUSE_FIRST_DEVELOPMENT_DIRECTIVE.md`. Algunos inventarios son snapshots anteriores, no evidencia de certificación de los PRs de 2026-10-17.

### Líneas PERSON 50 todavía NO fusionadas

- BDM [#121](https://github.com/audifor/BDM/pull/121): modulación relacional opt-in con fuente, sin amistades de arranque.
- [#122](https://github.com/audifor/BDM/pull/122): WORLD DB -> PERSON 50 -> GameWorld -> Save V4.
- [#123](https://github.com/audifor/BDM/pull/123): compatibilidad 50/50 en eventos reales.
- [#128](https://github.com/audifor/BDM/pull/128) y [#131](https://github.com/audifor/BDM/pull/131): vías de evolución por eventos observados; **requieren reconciliación explícita**, no sumarlas a ciegas.
- [#129](https://github.com/audifor/BDM/pull/129), [#132](https://github.com/audifor/BDM/pull/132), [#133](https://github.com/audifor/BDM/pull/133): hechos profesionales STAFF y firmas contractuales de PLAYER.
- [#130](https://github.com/audifor/BDM/pull/130): vía adicional de experiencia/diario, comprobar autoridad y solapamiento con #131.
- Todas estas PRs seguían **open/draft/unmerged** en la comprobación del 17/10/2026. Una CI focal PASS no equivale a integración en main ni a gameplay certificado.

BS18 [#141](https://github.com/audifor/BDM/pull/141) también está **open/draft**. Las respuestas Board de BS18 no son presupuesto de BS19 ni deben reimplementarse.

## 3. Plan incremental BS19 revisado (protagonista primero)

| Fase | Entregable y prioridad | Criterio de prueba |
|---|---|---|
| **BS19A** | Auditoría y visión **Basketball Life RPG**; ausencia del creador demostrada. | Auditoría documentada, ningún PASS funcional. |
| **BS19B** | **PRIMERA FASE EJECUTABLE: Coach Creator**. Identidad, DOB, nacionalidad, trasfondo, filosofía, meta, punto de partida, incorporación válida a GameWorld y Save V4. | Person/StaffProfile/Coach canónicos sin duplicados; UI de creación real, inicio en mundo y reload con identidad exacta. |
| **BS19C** | Primer **bucle jugable de vida del entrenador**: situación, decisión, consecuencia, memoria y seguimiento. Reutilizar Staff Career Requests, Coach Career, reputación, moral, relaciones y otras autoridades existentes. | Dos opciones provocan consecuencias diferentes y comprobadas en la vida del protagonista; persistencia y vista Courtside. |
| **BS19D** | Convergencia PERSON 50/50 + relaciones/experiencias verificadas; consecuencias humanas en players/staff. | Autoridad reconciliada entre PRs divergentes, evidencia por fuente, idempotencia y Save V4. |
| **BS19E** | Vida profesional y personal relevante: empleo/desempleo, oportunidades, cambio de ciudad cuando modelado, condiciones financieras/estilo de vida, redes y legado. | Continuar partida sin empleo y recuperar carrera, elecciones humanas con efecto significativo. |
| **BS19F** | Agentes/personas que actúan fuera del control del usuario, historias emergentes causales, ritmo de vida y largo plazo. | Comportamiento plausible y trazado, sin revelar conocimiento privado ni intervención continua del usuario. |
| **BS19G** | Manifestación completa y consistente en Courtside, bajo UX NG. | Identidad, acciones, plazos, situación y evolución visibles con densidad FM y sin scroll excesivo. |
| **BS19H** | Certificación global de carrera vital y simulación a largo plazo. | Save V4, identidad persistente, regresiones, determinismo, múltiples clubes y años, UX aprobada. |

**Orden obligatorio:** BS19B Coach Creator precede al piloto anterior de solicitudes del staff. Ese circuito, que ya existe, pasa a ser un caso de BS19C y NO define el alcance completo del RPG.

## 4. Primer episodio funcional integrado en BS19C

Caso reutilizable: solicitud del staff. `src/app/staffCareerAutonomy/StaffCareerAutonomyService.ts` ya expone `grantStaffCareerRequest`, `declineStaffCareerRequest` y `withdrawStaffCareerRequest`; `StaffScreen.tsx` ya ofrece botones.

Se debe conectar la perspectiva del **Coach creado**: vínculo con quien lo solicita, circunstancias, decisión que el usuario realmente tiene autoridad para tomar, consecuencia y memoria posterior. El episodio es una muestra del motor de vida, no su sustituto.

El bucle principal debe permitir continuar la trayectoria más allá del club inicial, incluso tras despido/desempleo, sin reiniciar personalidad, reputación, dinero o relaciones. `CONTRACT_DISCUSSION` no debe fingir acuerdos ejecutados.

## 5. Gates de seguridad y producto

- No tocar `main`, BS18 #141, ni ramas WorldDB/generadores o Courtside para esta auditoría.
- BS19 no crea nueva capa universal tipo Real Life World Immersion Level ni sistema de atributos duplicado.
- Separar EVENTO real, MORAL temporal, PERSONALIDAD, RELACIÓN direccional, MEMORIA subjetiva, CONFLICTO institucional y NARRATIVA.
- No dar a AI facultades que Governance no haya otorgado; un consejo o recomendación no es una orden ejecutada.
- No interpretar un score de compatibilidad inicial como amistad o enemistad acontecida.
- Los personajes fuera de la visibilidad del entrenador no desvelan información privada sin canal/knowledge legítimo.
- No introducir cálculos O(personas²) cada día; procesar pares afectados y eventos fuentes, con límites reproducibles.
- Save V4 retrocompatible, mismo PERSON ID, pruebas de estabilidad de partidas legacy y largo horizonte.
- Reutilizar Courtside en su rama y la UX NG; no habilitar nuevas pantallas con fuentes ficticias.
- No llamar PASS global sin ejecución de pruebas y revisión jugable.

## 6. Estado y siguiente acción

**BS19A: ROADMAP DOCUMENTADO, AUDITORÍA DE REUTILIZACIÓN INICIAL.** El diagnóstico ya ha confirmado que no existe un creador real de protagonista en el inicio de carrera; se ha redactado su visión/contrato en el documento rector. Queda diseño técnico detallado e implementación de BS19B. Nada en este documento afirma implementación BS19, typecheck, CI, integración o paridad UI.

La siguiente fase ejecutable **es BS19B Coach Creator**, respetando la identidad Person/StaffProfile/Coach, las rutas de inicio, WorldDB de solo lectura y Save V4. El piloto de staff queda en BS19C. No se ha implementado aún código jugable BS19.
