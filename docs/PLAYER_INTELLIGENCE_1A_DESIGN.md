# Player Intelligence 1A — Truth, Knowledge and Scouting Uncertainty

**Estado:** diseño y auditoría. Sin implementación.  
**Decisiones heredadas:** rating 1–100; Player Model objetivo de 35 ratings mínimos, 21 tendencies, 4 measurements, 8 dimensiones de personalidad; Truth, State, Knowledge y Derived son capas distintas.

## 1. Executive Summary

Player Intelligence será la autoridad que determina qué puede conocer cada organización sobre un jugador, sin modificar qué es el jugador. Su propósito no es revelar gradualmente la verdad, sino convertir evidencia incompleta, sesgada y con fecha en estimaciones útiles, rangos, descriptores o desconocimiento.

BDM ya tiene un fundamento real: `PlayerKnowledgeRecord` por equipo observador/jugador sujeto, con estimación y uncertainty para los siete ratings bootstrap. Es determinista y el Market ya lo muestra. No es aún Player Intelligence: no tiene dimensiones fuera de esos ratings, coverage/confidence/freshness por dimensión, fuentes, informes, misiones, decay, evaluadores, transferencia institucional ni reglas de decisión de IA.

La propuesta mantiene una sola PlayerTruth y construye conocimiento institucional sparse, alimentado por reportes individuales. Los view models son observer-specific y compactos. La IA de management decide desde su propia Knowledge; MatchEngine puede consultar Truth porque simula realidad física, pero no debe contaminar draft, trade, recruiting o signings.

## 2. Existing BDM Knowledge Audit

| Elemento actual | Evidencia | Estado y límite |
|---|---|---|
| `PlayerKnowledgeRecord` | `src/domain/knowledge/PlayerKnowledge.ts` | Equipo observador, jugador, fecha y siete estimates; CANONICAL bootstrap. |
| `BasketballRatingKnowledge` | mismo archivo | `estimatedValue` entero 0–100, `uncertainty` entero 0–20; no coverage/confidence explícitos. |
| View | `ratingKnowledgeView` | Sólo `unknown` o rango `min/max` y low/medium/high derivado de uncertainty. |
| Persistencia | `GameWorld.playerKnowledgeById` | Un registro por pareja observador-equipo/jugador, validado contra duplicados. |
| Generación | `ensurePlayerKnowledge` | Sólo para equipo de usuario; crea registros para todos los jugadores del mismo ecosistema. |
| Error | `PlayerKnowledgeEnrichment` | Error hash determinista por observador/jugador/rating; propio ±1, rival ±6. No cambia por observación. |
| UI | `MarketScreen.tsx` | Muestra los siete ratings usando conocimiento; no se localizó consumo equivalente en Roster, Profile, Draft, Recruiting o Trade. |
| Staff | `StaffPerson.ts` | Scout con talentEvaluation, potentialEvaluation, analysis, etc.; no hay conexión a knowledge. |
| Scouting UI | Desktop registry | App Scouting marcada `future`. |

La implementación actual inicializa conocimiento **denso** dentro de la categoría de ecosistema: aproximadamente observador × todos los jugadores elegibles, cada uno con siete valores. No hay informes, misiones, fuente de evidencia, bias, decay, potencial, personality, health ni reglas AI. Es una base que debe migrarse, no extenderse sin rediseño.

## 3. Design Principles

1. PlayerTruth nunca se sobrescribe con una evaluación.
2. Knowledge pertenece a un observador institucional, no al jugador ni a la UI.
3. Cobertura, confidence, accuracy/uncertainty y freshness son variables separadas.
4. Más observación no garantiza exactitud; puede confirmar un sesgo.
5. Todo update, error y decay es determinista con RNG inyectado.
6. El conocimiento sólo existe cuando hay fuente, contacto, informe o dato público; se persiste sparse.
7. Derived evaluation depende de Truth para engine interno o de Knowledge para decisiones del observador; nunca es una tercera verdad.
8. La interfaz recibe view models compactos y autorizados, no PlayerTruth completo.

## 4. Player Truth Boundary

PlayerTruth contiene/referencia identidad, measurements, ratings, tendencies, traits y development truth. Personality conserva su dominio; Health conserva Injury/CareerFatigue/Medical; morale, relationships, contracts y market state quedan fuera. El usuario, scout, IA y UI nunca modifican Truth por escribir un informe.

## 5. Player State Boundary

PlayerState es estado cambiante del mundo: disponibilidad, lesiones, fatiga, moral, forma, rol asignado, contrato, equipo y situación de mercado. Cada subdominio mantiene owner. Intelligence puede observar State con permisos y freshness propios, pero no lo duplica como PlayerTruth.

## 6. Observer Model

La unidad canónica es **OrganizationKnowledge**, identificada por `organizationId`/equivalente de equipo BDM. Es la memoria deportiva archivada del club y alimenta decisiones de management. Un `EvaluatorReport` individual conserva quién generó evidencia y permite sesgo/especialización. La organización no adquiere automáticamente todo lo que sabe una persona: sólo recibe un reporte completado, una transferencia explícita o un dato público.

## 7. Organizational Knowledge

Una organización posee:

- knowledge entries sparse por jugador/dimensión;
- reports archivados y su provenance;
- assignments activos;
- política de consolidación de informes;
- datos públicos de acceso común.

Al salir un scout, los informes entregados permanecen en el archivo del club; su conocimiento personal no reportado se marcha con él. Al entrar, puede aportar un número limitado de dossiers personales y expertise regional/competición, no exportar la base de datos completa de su club anterior.

## 8. Evaluator Model

`EvaluatorReport` es una evaluación individual con `evaluatorId`, capacidades aplicables, source, fecha, mission y observaciones. No necesita que cada scout tenga un nuevo bloque de ratings persistentes inmediatamente: BDM ya posee `talentEvaluation`, `potentialEvaluation`, `analysis`, `tacticalKnowledge`, `medicalKnowledge`, `communication`, `adaptability` y otros atributos de staff. V1 reutiliza `talentEvaluation`, `potentialEvaluation`, `analysis`, `tacticalKnowledge`, `medicalKnowledge`; carácter/territorio se dejan como v2 si el modelo de Staff se amplía con propósito.

## 9. Knowledge Dimensions

| Dimensión | Contenido | Granularidad v1 |
|---|---|---|
| IDENTITY | identidad pública, edad, nacionalidad, posición | entidad/datos públicos |
| MEASUREMENTS | height, weight, wingspan | entidad/campo |
| PERFORMANCE | stats, uso, eficiencia/form | resumen contextual |
| SHOOTING, FINISHING, CREATION, PASSING | ratings/tendencies del dominio | dominio; detalle por rating sólo al abrir perfil |
| DEFENSE, REBOUNDING, PHYSICAL, MENTAL | mismo patrón | dominio/detalle bajo demanda |
| TENDENCIES | comportamiento observado | dominio/tendency |
| PERSONALITY | dimensiones inferidas | dimensión, no Truth |
| DEVELOPMENT | potential/proyección/curva | dominios + proyección global |
| HEALTH | disponibilidad e historial permitido | resumen restringido |
| CONTRACT, MARKET | datos contractuales e interés | contextual/público o negociado |
| TACTICAL_FIT, ROLE_FIT | evaluación para contexto concreto | derivada, fechada |

## 10. Coverage

`coverage: 0..100` responde “¿cuánta evidencia relevante tenemos?”. Se almacena por dimensión, no por rating si no hubo evaluación detallada. Coverage es acumulativa con rendimiento decreciente y puede bajar si la evidencia queda obsoleta. No se muestra por defecto al usuario.

## 11. Confidence

`confidence: 0..100` responde “¿cuánta confianza merece nuestra evaluación?”. Deriva de calidad de fuente, consistencia de observaciones, capacidad del evaluator y freshness; puede ser baja con coverage alta si informes fiables discrepan. Internamente se persiste para la dimensión o estimate, no se infiere sólo de uncertainty.

## 12. Uncertainty

V1 persiste `estimate` y `uncertainty` (semiancho no negativo), no `min/max` ni distribuciones. El rango de visualización se deriva con clamp 1–100: `[estimate - uncertainty, estimate + uncertainty]`. Esto es determinista, compacto y permite mejoras futuras. `coverage` y `confidence` modulan la actualización de estimate y uncertainty, pero no son sinónimos.

## 13. Bias

El informe puede incorporar un `biasAdjustment` determinista, efímero o derivable a partir de evaluator capability + domain + source; nunca se muestra como “el scout se equivoca +5”. V1: error base de reporte reproducible, reducido por especialización y evidencia. V2: perfiles de sesgo optimista/conservador, especialmente en potencial y carácter. Consolidar varios informes reduce varianza, no elimina todos los sesgos compartidos.

## 14. Freshness

Toda entrada y reporte lleva `assessedAt`; fuentes también llevan `observedAt` cuando difiera. La evaluación nunca se considera actual sólo porque exista. La UI puede enseñar “visto hace 18 días” como metadata, no como un número protagonista.

## 15. Decay

| Clase | Dimensiones | Regla conceptual |
|---|---|---|
| STATIC | identity, height, DOB, nationality | no decay; corrección sólo por fuente mejor. |
| SLOW | técnica, personality, potential/development | uncertainty sube lentamente tras cambios/temporadas. |
| MEDIUM | tendencies, physical, role | decay por meses, cambio de equipo/rol o edad. |
| FAST | form, market interest, morale, usage | expira o se degrada por semanas/eventos. |
| REALTIME | fatigue, live availability | no conservar como scouting truth; consultar fuente autorizada. |

Decay se evalúa de forma lazy al consultar/actualizar una entry y durante hitos de calendario, no mediante un barrido diario de observador × jugador.

## 16. Knowledge Sources

**Minimum v1:** `PUBLIC_DATA`, `STATISTICS`, `LIVE_SCOUTING`, `VIDEO_SCOUTING`, `OPPONENT_GAME`, `OWN_TEAM_OBSERVATION`, `STAFF_PRIOR_KNOWLEDGE`, `COMBINE`, `WORKOUT`.  
**Extended:** `FORMER_CLUB`, `MEDICAL_EXAM`, `RECRUITING_CONTACT`, `AGENT_INFORMATION`, `MEDIA_REPORT`, `RELATIONSHIP_INFORMATION`, `DATA_ANALYTICS`.

## 17. Source Quality

| Fuente | Mejor dimensión | Cobertura | Confidence típica | Limitación |
|---|---|---:|---:|---|
| Public data | identity/measurements/contract público | alta | alta | no revela truth deportiva |
| Statistics | performance/role | media-alta | media | resultado ≠ rating |
| Live scouting | skills/tendencies/physical | media | depende scout | muestra limitada |
| Video scouting | skills/tendencies | media | media | sin presencia/medical |
| Opponent game | role/tendencies | baja-media | baja-media | contexto rival |
| Own observation | skill/health/role | alta | alta | no predice potencial |
| Staff prior knowledge | competencia/jugadores concretos | variable | media | transferencia limitada |
| Combine/workout | measurements/physical | alta | alta | entorno artificial |
| Medical exam | health | alta | alta | V2 y permisos |
| Analytics | performance/role | alta | media-alta | no personality/health |

## 18. Scout Capabilities

V1 mapea dimensiones a atributos existentes: talentEvaluation → habilidades base; potentialEvaluation → DEVELOPMENT; analysis → PERFORMANCE/estadística; tacticalKnowledge → TACTICAL_FIT/ROLE_FIT; medicalKnowledge → HEALTH; communication/adaptability modulan eficiencia de misión. La especialización regional/competición es v2 porque no existe como dato BDM canónico todavía.

## 19. Scout Specialization

Especialización es una matriz de relevancia, no siete nuevos ratings de staff. Ejemplo: un scout con talentEvaluation 92 y potentialEvaluation 71 reduce más uncertainty de SHOOTING/DEFENSE que de DEVELOPMENT; otro con potentialEvaluation 94 y analysis 88 mejora proyección y performance. V2 podrá declarar expertise por región/competición como tags con evidencia, no omnisciencia.

## 20. Scouting Assignments

Contrato conceptual: `id`, `organizationId`, `evaluatorId`, `subjectPlayerId?`/pool, `missionType`, `createdAt`, `startsAt`, `expectedCompletionAt`, `status`, `sourceContext`. El assignment no contiene resultados finales ni PlayerTruth. Al completarse produce uno o más reports y actualiza OrganizationKnowledge.

## 21. Mission Types

| Misión | Tiempo/coste relativo | Dimensiones principales | Evaluador ideal |
|---|---|---|---|
| QUICK_LOOK | bajo | identidad, medidas, rol, strengths/weaknesses | talentEvaluation |
| FULL_REPORT | alto | skills, tendencies, role, proyección base | scout equilibrado |
| SKILL_EVALUATION | medio | dominio elegido | talentEvaluation |
| POTENTIAL_EVALUATION | medio-alto | DEVELOPMENT | potentialEvaluation |
| CHARACTER_EVALUATION | medio | PERSONALITY | v2 character capability / fuentes |
| TACTICAL_FIT | medio | fit contextual | tacticalKnowledge |
| LIVE_GAME | bajo | performance/tendencies | talent + analysis |
| TOURNAMENT_COVERAGE | alto | pool y comparativa | regional/competition expertise v2 |
| REGIONAL_ASSIGNMENT | largo | descubrimiento de pool | expertise v2 |

## 22. Scouting Reports

Propuesta BDM: `ScoutingReport { id, organizationId, playerId, evaluatorId?, assignmentId?, missionType, source, observedAt, completedAt, dimensionFindings[], narrativeFindings[], recommendation?, provenance }`.

`dimensionFindings` contiene dimensión, coverageAdded, estimate?, uncertainty?, confidence, freshness class y explicación breve. Strengths/weaknesses son descriptores derivados de findings, no otro conjunto de ratings. Tactical/character/development opinions se registran como findings contextuales, nunca mutan PlayerTruth.

## 23. Potential Knowledge

Potential se observa como **proyección** por dominio y global, cada una con estimate band/range/confidence, no como `developmentCeiling` real. Una misión de potencial mejora coverage y puede seguir errando. V1 puede mostrar sólo proyección global y dos o tres dominios destacados; v2 permite los ocho dominios del Player Model.

## 24. Personality Knowledge

PersonalityTruth permanece en su dominio. Reports pueden producir `likelyHigh`, `likelyLow`, `uncertain` o rango para professionalism, competitiveness, loyalty, etc., con fuente y confidence. Un partido, estadística o roster no revela automáticamente personalidad; own-team observation y character evaluation son fuentes válidas.

## 25. Health Knowledge Boundary

Health exacto pertenece a Medical y permisos. Rivales y mercado reciben disponibilidad pública, historial permitido o resultado de examen; nunca fatigue exacta ni predisposición privada por defecto. Own-player knowledge es alto, pero prognosis futura mantiene incertidumbre. Medical scouting es Wave 2.

## 26. Own Player Knowledge

Para jugadores propios: identity/measurements exactos; ratings, tendencies, health y rol con alta coverage/confidence; personality alta pero no absoluta; potential, ceiling, decline, adaptación futura y comportamiento de mercado continúan evaluados. Conocimiento alto no significa `100%` ni revela eventos futuros.

## 27. Opponent Knowledge

Identity, statistics, posición, role y tendencies observables empiezan con datos públicos/estadísticos. Ratings, mental, personality, health y development requieren evidencia. Este mismo contrato soportará preparación de partido y matchups sin implementar aún opponent preparation.

## 28. Prospect Knowledge

Draft, youth, recruiting e internacional comienzan con identidad/medidas/estadística disponibles según fuente y poco conocimiento privado. Combine y workout elevan measurements/physical; reportes elevan skills/potential; character/medical requieren fuentes especializadas. El prospect no debe heredar conocimiento del roster profesional.

## 29. Market Target Knowledge

Un free agent, trade target o transfer target es un subject normal con fuentes adicionales de contrato/mercado y, si procede, examen. El riesgo de información se muestra junto a evaluación: mayor upside aparente y low confidence compite honestamente con menor upside y strong confidence.

## 30. Imported Player Knowledge

Dataset real aporta hechos con `sourceProvenance`: nombre, DOB, altura, nacionalidad, club/contrato público y stats. Ratings BDM, potencial, personality, health privado y proyección siguen siendo Truth BDM + Knowledge del observador; datos reales no confieren omnisciencia.

## 31. Institutional Knowledge Transfer

El club conserva reports completados y knowledge consolidado. Cambiar de staff no borra el archivo. Las entries tienen provenance para poder explicar por qué existe la evaluación. El knowledge consolidado no se marca como “propiedad” de un scout, aunque su confidence puede degradarse con freshness igual que cualquier evidencia.

## 32. Staff Knowledge Transfer

Al contratar: se pueden importar dossiers personales explícitos limitados por competición/región, como reports `STAFF_PRIOR_KNOWLEDGE`, con coverage/confidence reducidos y fecha original. Al salir: se conservan reports archivados; se pierde conocimiento personal no reportado. Relaciones/expertise no copian automáticamente jugadores ni reportes del antiguo club.

## 33. Memory Boundary

Knowledge = evaluación estructurada deportiva, trazable y actualizable. Memory = recuerdo narrativo/contextual de eventos y relaciones. Memory puede disparar una fuente `RELATIONSHIP_INFORMATION` v2, pero no crea ratings estimados sin un reporte/finding explícito.

## 34. Relationship Boundary

Relationships habilitan acceso o afectan confidence de una fuente; no revelan Truth. Un ex-coach puede aportar un informe limitado y fechado, no una copia exacta de personality/potential. Todo vínculo debe crear provenance y respetar permisos.

## 35. Statistics Boundary

Stats públicas elevan PERFORMANCE y ayudan a inferir tendencies/role; no escriben directamente `threePointShooting` ni potencial. La traducción estadística→evaluación debe ser un evaluator/analytics model determinista con confidence limitado por muestra, competición, rol y contexto.

## 36. Analytics Boundary

Analytics puede generar findings cuantitativos de performance, usage, efficiency, role y fit. No deduce personality, private health o development ceiling sin fuente permitida. Las fórmulas se versionan y sus outputs son reportes/derived evaluation, no PlayerTruth.

## 37. Display Rules

- **EXACT:** sólo cuando permiso y confidence/uncertainty lo justifican; propio no garantiza exact potential.
- **RANGE:** `74–82`, formato normal para evaluaciones.
- **DESCRIPTOR:** bandas de distribución de la competición, no cortes universales aprobados aún.
- **UNKNOWN:** `?` si no existe entry ni dato público.
- **MIXED:** una misma ficha puede mezclar exacto, rango, descriptor y desconocido.

Confidence se presenta por defecto como Very Low, Low, Moderate, Good, Strong, Very Strong; nunca como porcentajes repetidos en cada celda. Los límites exactos se calibrarán con distribución real de BDM.

## 38. Roster Contract

`RosterPlayerIntelligenceRow` contiene sólo: player identity pública, posición, estado autorizado, 3–6 knowledge cells solicitadas, potential summary, lastScoutedLabel, confidence badge y role-fit contextual opcional. Para propios prioriza claridad y velocidad; para rivales mantiene incertidumbre. La tabla no recibe PlayerTruth completo ni todos los reports.

## 39. Player Profile Contract

`PlayerIntelligenceProfile` se divide en Overview, Attributes, Development, Health y Reports. Cada sección pide su dimension set y display mode. Attributes puede cargar detalles por dominio; Reports es paginado. El profile no serializa todos los observers ni el historial de cálculos de UI.

## 40. Market Contract

Market consume `KnowledgeSummary` por target: evaluación relevante, uncertainty/confidence, potencial visible, interés/contrato público, risk flags autorizados y fecha. El valor económico/fit se deriva para la organización observadora y declara si usa datos inciertos.

## 41. Draft Contract

Draft consume measurements, public performance, combine/workout, projection, reports y medical autorizado. Las rankings de prospectos son derived evaluations por organización; el motor de draft AI debe mirar su propia Knowledge.

## 42. Recruiting Contract

Recruiting aplica el mismo modelo a HS, JUCO, internacional y transfer portal. La fuente determina conocimiento inicial y acceso a contacto/visita. No crea un sistema de scouting paralelo para NCAA.

## 43. Trade Contract

Trade muestra knowledge y riesgo de ambos lados. La validación de salary/rights es Truth/reglas; la valoración y decisión de cada club se calcula con su OrganizationKnowledge. Esto permite steals, errores y preferencias por certeza.

## 44. AI Knowledge

Regla: **AI Organization → OrganizationKnowledge → Derived Evaluation → Decision** para draft, recruiting, signings y trades. AI puede acceder a Truth sólo dentro de MatchEngine y validadores de reglas, nunca como shortcut de management. En V1 se debe crear knowledge on demand para AI que inicia una acción, no precargar el mundo entero.

## 45. AI Errors

Con estimates, uncertainty, confidence y bias, IA puede sobrevalorar, infravalorar, descubrir steals, escoger busts, preferir certeza o upside. Franchise DNA podrá ponderar estos riesgos después; no se define aquí. Los errores son reproducibles con seed, no arbitrarios.

## 46. Determinism

Cada assignment/report/update usa streams RNG inyectados, con seed derivada de ids y evento/fecha, sin `Math.random()`. La misma seed, mundo, staff y secuencia de acciones producen los mismos findings, ranges y decisiones AI. Los datos públicos son deterministas/no aleatorios.

## 47. Performance Model

Objetivo: 5.000 jugadores, 50 organizaciones y varias temporadas sin matriz completa observador×jugador×rating. Estrategia:

- defaults públicos derivados sin persistir;
- entries institucionales sparse sólo al observar, importar o actuar sobre jugador;
- coverage por dimensión, estimates por rating sólo si el informe es detallado;
- reports paginados y archivados;
- decay lazy/hitos de calendario;
- view models compactos, observer-specific y por pantalla;
- índices por `organizationId:playerId`, `playerId` y assignment status cuando se implemente.

## 48. Persistence

Persistir: OrganizationKnowledge sparse, reports, assignments, assessed/observed dates, source provenance, estimates, uncertainty, coverage, confidence y findings. No persistir: display descriptors, rangos min/max derivados, overall, fit, role/archetype derived ni view models. Las mediciones públicas viven en PlayerTruth/data provenance, no se duplican por observer.

## 49. Domain Events

Propuestos: `PlayerObserved`, `ScoutingAssignmentCreated`, `ScoutingAssignmentCompleted`, `ScoutingReportCompleted`, `OrganizationKnowledgeUpdated`, `KnowledgeDecayed`, `ScoutJoinedOrganization`, `ScoutLeftOrganization`, `PublicPlayerDataImported`, `MedicalExamCompleted` (v2). Cada evento declara actor, source, fecha y payload mínimo; no contiene PlayerTruth completo.

## 50. View Models

- `KnowledgeSummary`: coverage/confidence/freshness por dimensiones solicitadas.
- `RosterPlayerIntelligenceRow`: células compactas autorizadas.
- `PlayerIntelligenceProfile`: secciones lazy de overview/attributes/development/health/reports.
- `ScoutingReportView`: informe paginado, findings, source y recommendation.
- `MarketTargetIntelligenceView`: evaluación/riesgo/fecha para operación.

## 51. Minimum v1

1. Organization-specific sparse knowledge records.
2. Estimates/ranges/uncertainty/confidence/freshness para ratings bootstrap y potential summary.
3. Own/opponent/prospect/market rules.
4. QUICK_LOOK, FULL_REPORT, SKILL_EVALUATION, POTENTIAL_EVALUATION y LIVE_GAME.
5. Reutilización de capacidades Staff actuales.
6. Assignments y reports con provenance.
7. Contratos de Roster, Profile y Market.
8. AI management usando Knowledge on demand.
9. Decay lazy por dimensión y RNG inyectado.

## 52. Extended v2+

Character/medical scouting, expertise regional/competición, tournament coverage, staff prior knowledge transfer, combine/workouts completos, agent/relationship intelligence, analytics reports, bias avanzado, historial organizacional, tactical opponent preparation y detalle por los 35 ratings/21 tendencies del nuevo Player Model.

## 53. Risks

- Migrar el actual `PlayerKnowledgeRecord` denso sin borrar saves ni falsear conocimientos.
- Introducir 35×knowledge estimaciones antes de que exista storage sparse.
- Filtrar Truth a UI por props/selector accidentales.
- Permitir que la IA siga usando Truth en decisiones de management.
- Confundir coverage con confidence o stats con ratings.
- Hacer decay con scans diarios masivos.
- Exponer health/personality privada por atajos de UI.

## 54. Open Decisions

1. ¿`organizationId` requiere entidad nueva o TeamId basta inicialmente para cada ecosistema?
2. ¿Cuándo pasa una evaluación de rango a exacta y qué permisos la permiten?
3. ¿Cómo se calibra descriptor por distribución de competición/género sin sesgo?
4. ¿Qué staff capability adicional, si alguna, merece persistirse para character/regional expertise?
5. ¿Qué subset de potencial por dominio se muestra en v1?

## 55. Final Recommendation

Sustituir conceptualmente el bootstrap actual por OrganizationKnowledge sparse y report-driven, preservando su buena separación observer/subject y determinismo. Implementar primero reports, assignments, range model y AI knowledge on demand sobre los siete ratings; ampliar al Player Model canónico después de que la migración de ratings esté aprobada. Esta secuencia entrega incertidumbre jugable sin acoplar scouting a una taxonomía aún no implementada.

## Master Knowledge Matrix

| Knowledge Dimension | Source | Coverage | Confidence | Decay | Own | Opponent | Prospect | AI |
|---|---|---:|---:|---|---|---|---|---|
| Identity | public/club | 100 | strong | static | exact | exact | variable | public |
| Measurements | public/combine | 80–100 | good–strong | static | exact | public/range | variable | source-bound |
| Performance | stats/analytics | variable | moderate | fast | high | high | variable | same knowledge |
| Skill domains | scout/video/own | variable | variable | slow | high range | range | low→range | same knowledge |
| Tendencies | live/video/stats | variable | variable | medium | high | range | low | same knowledge |
| Personality | own/character | variable | variable | slow | high but not exact future | low | unknown | same knowledge |
| Development | potential scout | variable | variable | slow | range | low | key range | same knowledge |
| Health | own/medical | permissioned | variable | realtime | high | public only | limited | permitted summary |
| Contract/market | public/agent | variable | good | fast | high | public/negotiated | n/a | same knowledge |
| Tactical/role fit | scout/analytics | contextual | variable | medium | high | range | low | same knowledge |

## Playable Examples

| Caso | Truth | Knowledge | Display | Decisión creada |
|---|---|---|---|---|
| 1. Jugador propio | 3PT 78.4; ceiling 86 | skill 78±1, potential 82–91 | `78`, `A- / A` | entrenar tiro o extender contrato sin fingir conocer techo. |
| 2. Rival conocido | strong perimeter D 83 | DEF 78±5, tendencies alta coverage | `73–83`, “agresivo” | preparar matchup sin acceder a Truth. |
| 3. Rival desconocido | elite shooter 90 | sólo stats y identity | `?`, 42% 3PT | gastar misión o defender conservador. |
| 4. Free agent | ceiling 79, injury risk privado | 74±7, medical desconocido | `67–81`, confidence low | decidir examen frente a firma rápida. |
| 5. Trade target | good passer 81, potential 84 | passing 76±5, potential B | `71–81`, `B` | comparar pick/activo con riesgo de información. |
| 6. Draft prospect | 3PT 70, ceiling 92 | combine exacto; potential B+–A | medidas exactas, proyección rango | elegir upside o certeza. |
| 7. NCAA recruit | high competitiveness 88 | skills por stats; character unknown | ratings rangos, personalidad `?` | enviar character evaluation antes de oferta. |
| 8. Transfer portal | role player, fatigue alta | role/performance reciente alta; fatigue no exacta | descriptor role, status público | priorizar encaje sin conocer carga interna. |
| 9. Joven internacional | wingspan 218, low current skill | medidas públicas; skills low coverage | 218 cm, skills `?–?` | asignar regional/tournament scouting. |
| 10. Descubierto por scout nuevo | defender 80 | prior report de ex-liga 72±9 | `63–81`, fuente archivada | validar con live report antes de trade. |

## Evidence inspected

`src/domain/knowledge/PlayerKnowledge.ts`; `src/domain/world/knowledge.ts`; `src/engine/world/PlayerKnowledgeEnrichment.ts` y tests; `GameWorld.ts`; `MarketScreen.tsx`; `StaffPerson.ts`; `MatchEngine`, Draft, Recruiting, Training, Development, Memory, Relationships y desktop registry. Los documentos previos `PCB_RECOVERY_AUDIT.md` y `PLAYER_MODEL_RECOVERY.md` se usaron como contexto, con el código BDM como prioridad.
