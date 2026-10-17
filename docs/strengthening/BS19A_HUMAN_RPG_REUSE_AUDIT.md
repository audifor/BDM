# BS19A · Human RPG Engine: auditoría de reutilización y ruta jugable

Fecha de auditoría: 2026-10-17.
Base revisada: `audifor/BDM` `main` (`ceaa45529ce23c4e94bbc2cef17d9d0d987552b6`) y PRs existentes indicadas abajo.
Estado: **AUDITADO / ROADMAP PROPUESTO**. Sin implementación BS19 nueva y sin certificación funcional BS19.

## 1. Objetivo de producto

Que las personas reales de BDM (jugadores, staff, entrenador, y cuando existan actores canónicos, agentes y directivos) perciban hechos comprobables, tengan intereses y memoria propios, reaccionen de forma coherente y tomen o provoquen decisiones con consecuencias persistidas y comprensibles. No basta con ver un número en pantalla.

Contrato de experiencia por caso: **hecho fuente -> perspectiva/estado del actor -> señal visible o decisión AI -> opción/acción autorizada -> consecuencia canónica -> historial/Save -> observación posterior**.

**No pertenece a BS19**: narrativas editoriales procedurales y arcos de prensa amplios (BS20), nueva base de datos de personalidades, sistemas duplicados, creación arbitraria de amistades/conflictos sin causa, sustitución de Governance (BS18), reescritura de Courtside, MatchEngine o WorldDB/generadores. La prioridad paralela WorldDB V2 y generadores se mantiene.

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

## 3. Plan incremental BS19 (no repetir bases)

| Fase | Entregable acotado | Evidencia de PASS |
|---|---|---|
| **BS19A** | Reuse audit, mapa de autoridad y hechos/capacidades utilizables. Clasificar PRs PERSON 50 y duplicidades. | Documento y matriz revisables. Solo documentación. |
| **BS19B** | Un circuito vertical de decisión humana **ya existente**: solicitud profesional o conflicto real del staff -> causa visible -> opciones habilitadas -> autoridad existente -> impacto en Human State, Relationship/Memory y carrera cuando corresponda. | E2E usuario y AI por separado, cero eventos inventados, idempotencia, permisos, Save/reload; sin éxito simulado |
| **BS19C** | Convergencia PERSON 50 y eventos observados: una identidad y un escritor de evolución, catálogo/proveniencia, compatibilidad relacional y Save V4 sin bifurcar autoridad. | Paridad de perfiles 8/50, fuente real, pruebas de replay/dedupe, ausencia de cambios cuando falta evidencia |
| **BS19D** | Extender gradualmente la misma experiencia al jugador y entrenador: promesas de rol y tiempo **observado**, renovaciones firmadas, elecciones de carrera, dinámicas del grupo. Agentes/directivos solo con fuente e interfaces de autoridad comprobadas. | E2E por hecho, sin atribuir intenciones con información omnisciente ni fabricar acciones |
| **BS19E** | AI actor/club: percepción parcial, reacción, elección y resultado con límites de jurisdicción, cadencia y costes. | Determinismo, no decisiones a espaldas del usuario en acciones reservadas, trazabilidad y límites por tick |
| **BS19F** | Manifestación Courtside en pantallas/flows ya existentes, densidad y escaso scroll; señales accionables y explicación corta de causa/efecto, sin duplicar secciones. | Validación visual claro/oscuro y UX de acciones; parity con NG y aprobación de interfaz |
| **BS19G** | Certificación transversal, Save V4, replay, cambios de equipo, temporadas y regresiones. | Tests focales y globales, evidencia de largo plazo, PASS/PARTIAL explícito por área |

Orden táctico: comenzar BS19B reutilizando el flujo del staff que ya existe en main; no incorporar primero ramas PERSON 50 divergentes. BS19C requiere reconciliar antes las autoridades de evolución. BS19F sigue la rama Courtside y su política de 1:1 sin crear mocks de gameplay.

## 4. Contrato del primer circuito BS19B

**Caso piloto: solicitud formal de un miembro de staff.** Ya existen en `src/app/staffCareerAutonomy/StaffCareerAutonomyService.ts` las operaciones `grantStaffCareerRequest`, `declineStaffCareerRequest`, `withdrawStaffCareerRequest`. También hay un `getOpenStaffCareerRequestsPresentation` y Staff Dynamics.

Exigir por cada caso:
1. Solicitud `OPEN` con identidad/empleo/fecha, responsable y fuente probada.
2. Vista compacta que muestre qué pide, quién, por qué existe y opciones válidas. No duplicar la bandeja si la actual sirve.
3. Conceder / rechazar llama **solo** a las mutaciones de aplicación ya autorizadas. `CONTRACT_DISCUSSION` no fingirá firma ni nueva negociación.
4. Comparar antes/después: status de solicitud, cambios en responsabilidad/rol/carrera, cambios reales en relaciones/memoria y Staff Human State solo cuando el sistema fuente los produzca.
5. Guardado/recarga, idempotencia, derechos del usuario, vida posterior del actor y trazas `sourceId`.
6. Si el flujo ya cumple todo, registrar PASS de reutilización y **no implementar** otro flujo; mover la prioridad a la brecha demostrada.

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

**BS19A: ROADMAP DOCUMENTADO, AUDITORÍA DE REUTILIZACIÓN INICIAL.** Queda por ejecutar inspección precisa de los wiring/acciones del circuito piloto, para decidir si BS19B es reparación o certificación de una capacidad ya existente. Nada en este documento afirma implementación BS19, typecheck, CI, integración o paridad UI.

El siguiente cambio ejecutable debe ser pequeño, focal y verificable sobre el circuito piloto, solo cuando se confirme la brecha concreta en código y tests.
