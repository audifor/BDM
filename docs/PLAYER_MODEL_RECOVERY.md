# BDM Player Model Recovery

**Fecha:** 2026-08-27  
**Ámbito:** auditoría y especificación; no implementación.  
**Decisión vinculante:** todos los ratings canónicos usan semántica **1–100**. La verdad interna puede usar decimales cuando un engine lo necesite; la interfaz no convierte la escala a 1–1000.

## 1. Executive Summary

PCB conserva un superset valioso de **90 atributos documentados**, más identidad, origen, personalidad, traits, perks, arquetipos, mentalidades, salud, potencial y mercado. No es un modelo único: la documentación describe una taxonomía profunda de 1–1000, mientras el generador crea muchos campos sin que todos tengan un consumidor demostrable. El motor MMP sí consume un subconjunto concreto de tiro, manejo, pase, defensa, rebote, físico y clutch.

BDM tiene un modelo canónico pequeño pero real: identidad, bio, posición primaria, siete ratings 0–100 marcados expresamente como *bootstrap*, potencial de techo, personalidad independiente, moral, fatiga de carrera, lesiones, conocimiento por observador y estímulo de desarrollo. Sus consumidores son deterministas y están separados por dominio, pero el nivel de granularidad actual no alcanza el producto de PCB.

La recomendación es un **canon por capas**: 35 ratings mínimos con consumidores claros, 21 tendencies, 4 measurements mínimas (5 extendidas), 8 dimensiones de personalidad, traits escasos con efecto explícito, estado de salud separado, desarrollo probabilístico y métricas derivadas no persistidas. El canon extendido añade 13 ratings sólo cuando MatchEngine/Training/Scouting tengan el consumidor correspondiente. Arquetipos y roles se derivan; no son otra fuente de verdad.

## 2. PCB Player Model Sources

| Fuente | Generación | Qué prueba |
|---|---|---|
| `PCB/bu/Docs/Concepto/Players/1.Atributos.md` | Diseño | 90 campos, categorías y efectos pretendidos. |
| `0.Origenes.md`, `3.Personalidades.md`, `4.Traits.md`, `5.Perks.md` | Diseño | Origen, personalidad, traits y perks. |
| `6.Arquetipos...md`, `7.Mentalidades...md`, `8.Biomecánica.md` | Diseño | Etiquetas de arquetipo/mentalidad; biomecánica apenas especificada. |
| `PCB/backend/app/domain/catalogs.py` | Implementación | Parsea documentos y entrega catálogos; fallback de 20 atributos. |
| `services/generator_service.py` | Implementación | Genera bio, atributos, identidad, traits, perks, potencial, valor, salud y moral. |
| `services/ai_service.py` | Implementación | Agrupa atributos para fit, roles, tácticas y evaluación IA. |
| `services/health_service.py` | Implementación | Mapea grupos de entrenamiento a atributos. |
| `sim/mmp_engine.py` | Implementación | Consume parte de los atributos durante el partido. |
| `services/player_service.py`, `player_profile_service.py`, `market_service.py` | Implementación | Lista, knowledge/scouting, histórico y mercado. |
| Renderer PCB | UI | Presenta atributos, identidad, estado y roster; no prueba cada efecto. |

## 3. PCB Raw Field Inventory

La siguiente es la lista exhaustiva de los 90 IDs de `1.Atributos.md`. `D` = definido/documentado; `G` = generado y persistido en `attributes`; `S` = referencia encontrada en simulación; `A` = usado por IA; `T` = usado por training/health. Un guion significa que esta auditoría no localizó consumidor real.

| Campo PCB | Tipo PCB | Fuente | Implementado | D/G/S/A/T | Descripción breve |
|---|---|---|---|---|---|
| finishing_close | ofensiva | doc/generator | YES | D/G/S/A/T | finalización cercana |
| dunking | ofensiva | doc/generator | YES | D/G/-/A/T | mate |
| floater | ofensiva | doc/generator | YES | D/G/-/A/- | flotadora |
| mid_range | ofensiva | doc/generator | YES | D/G/S/A/T | media distancia |
| three_static | ofensiva | doc/generator | YES | D/G/S/A/T | triple catch-and-shoot |
| three_off_dribble | ofensiva | doc/generator | YES | D/G/-/A/T | triple pull-up |
| deep_range | ofensiva | doc/generator | YES | D/G/-/-/- | rango profundo |
| free_throw | ofensiva | doc/generator | YES | D/G/-/A/T | tiro libre |
| post_scoring | ofensiva | doc/generator | YES | D/G/S/A/T | anotación poste |
| contact_finishing | ofensiva | doc/generator | YES | D/G/S/A/T | finalización con contacto |
| contested_shot | ofensiva | doc/generator | YES | D/G/-/-/- | tiro punteado |
| off_screen_shot | ofensiva | doc/generator | YES | D/G/S/A/T | tiro tras bloqueo |
| hook_shot | ofensiva | doc/generator | YES | D/G/-/A/- | gancho |
| fadeaway | ofensiva | doc/generator | YES | D/G/-/A/- | fadeaway |
| weak_hand_finish | ofensiva | doc/generator | YES | D/G/-/-/- | finalización mano débil |
| court_vision | cerebro | doc/generator | YES | D/G/-/A/T | visión |
| pass_short | cerebro | doc/generator | YES | D/G/-/A/T | pase corto |
| pass_long | cerebro | doc/generator | YES | D/G/-/A/T | pase largo |
| pass_bounce | cerebro | doc/generator | YES | D/G/-/A/T | pase picado |
| pass_post | cerebro | doc/generator | YES | D/G/-/A/T | pase al poste |
| pass_speed | cerebro | doc/generator | YES | D/G/S/A/- | velocidad de pase |
| creativity | cerebro | doc/generator | YES | D/G/-/-/- | creatividad; semántica de tendency |
| shot_selection | cerebro | doc/generator | YES | D/G/-/A/T | selección de tiro |
| pnr_read | cerebro | doc/generator | YES | D/G/-/-/- | lectura P&R |
| help_read | cerebro | doc/generator | YES | D/G/-/-/- | lectura de ayudas |
| clock_mgmt | cerebro | doc/generator | YES | D/G/-/-/- | gestión reloj |
| spacing_iq | cerebro | doc/generator | YES | D/G/-/-/- | spacing |
| off_ball_move | cerebro | doc/generator | YES | D/G/-/-/- | movimiento sin balón |
| ball_security_iq | cerebro | doc/generator | YES | D/G/S/-/- | evitar pérdidas |
| court_leadership | cerebro | doc/generator | YES | D/G/-/-/- | liderazgo cancha |
| def_perimeter | defensa | doc/generator | YES | D/G/S/A/T | defensa exterior |
| def_post | defensa | doc/generator | YES | D/G/S/A/T | defensa poste |
| shot_contest | defensa | doc/generator | YES | D/G/-/-/- | punteo |
| steal_onball | defensa | doc/generator | YES | D/G/S/A/T | robo balón |
| screen_nav | defensa | doc/generator | YES | D/G/-/A/T | navegación bloqueos |
| help_defense | defensa | doc/generator | YES | D/G/-/A/T | ayuda defensiva |
| steal_pass | defensa | doc/generator | YES | D/G/S/-/T | intercepción |
| closeout | defensa | doc/generator | YES | D/G/-/A/- | closeout |
| def_pnr_inside | defensa | doc/generator | YES | D/G/-/A/- | defensa P&R interior |
| def_transition | defensa | doc/generator | YES | D/G/-/A/- | defensa transición |
| block | defensa | doc/generator | YES | D/G/S/A/T | tapón |
| intimidation | defensa | doc/generator | YES | D/G/-/A/- | disuasión aro |
| box_out | defensa | doc/generator | YES | D/G/-/A/T | bloqueo rebote |
| reb_def | defensa | doc/generator | YES | D/G/S/A/T | rebote defensivo |
| foul_discipline | defensa | doc/generator | YES | D/G/S/-/- | disciplina faltas |
| acceleration | físico | doc/generator | YES | D/G/-/A/T | aceleración |
| speed_top | físico | doc/generator | YES | D/G/S/A/T | velocidad máxima |
| agility_lat | físico | doc/generator | YES | D/G/-/A/T | agilidad lateral |
| deceleration | físico | doc/generator | YES | D/G/-/A/- | frenada |
| coordination | físico | doc/generator | YES | D/G/-/-/- | coordinación |
| strength_static | físico | doc/generator | YES | D/G/S/A/T | fuerza posicional |
| strength_explo | físico | doc/generator | YES | D/G/-/A/T | fuerza explosiva |
| vert_static | físico | doc/generator | YES | D/G/-/A/T | salto parado |
| vert_run | físico | doc/generator | YES | D/G/-/A/- | salto carrera |
| second_jump | físico | doc/generator | YES | D/G/-/A/T | segundo salto |
| stamina | físico | doc/generator | YES | D/G/-/A/T | resistencia |
| fatigue_recov | físico | doc/generator | YES | D/G/-/-/T | recuperación |
| durability | físico | doc/generator | YES | D/G/-/-/- | disponibilidad/lesión |
| flexibility | físico | doc/generator | YES | D/G/-/-/- | movilidad/lesión |
| hands | físico | doc/generator | YES | D/G/-/-/- | manos |
| ball_control | manejo | doc/generator | YES | D/G/S/A/T | control de balón |
| ball_protect | manejo | doc/generator | YES | D/G/S/A/T | protección |
| off_hand_dribble | manejo | doc/generator | YES | D/G/-/A/T | manejo mano débil |
| catching | manejo | doc/generator | YES | D/G/-/-/- | recepción |
| triple_threat | manejo | doc/generator | YES | D/G/-/-/- | triple amenaza |
| crossover | manejo | doc/generator | YES | D/G/-/A/T | crossover |
| spin_move | manejo | doc/generator | YES | D/G/-/-/- | giro |
| behind_back | manejo | doc/generator | YES | D/G/-/-/- | detrás espalda |
| in_and_out | manejo | doc/generator | YES | D/G/-/-/- | in-and-out |
| step_back_tech | manejo | doc/generator | YES | D/G/-/-/- | step-back |
| traffic_dribble | manejo | doc/generator | YES | D/G/-/-/- | bote tráfico |
| speed_ball | manejo | doc/generator | YES | D/G/-/A/T | velocidad con balón |
| hesitation | manejo | doc/generator | YES | D/G/-/-/- | hesitation |
| low_dribble | manejo | doc/generator | YES | D/G/-/-/- | bote bajo |
| nutmeg | manejo | doc/generator | YES | D/G/-/-/- | caño; decorativo |
| clutch | psico | doc/generator | YES | D/G/S/-/- | ejecución final cerrado |
| consistency | psico | doc/generator | YES | D/G/-/-/- | varianza rendimiento |
| work_ethic | psico | doc/generator | YES | D/G/-/-/- | respuesta a desarrollo |
| mental_tough | psico | doc/generator | YES | D/G/-/-/- | respuesta adversidad |
| aggressiveness | psico | doc/generator | YES | D/G/-/-/- | propensión contacto; tendency |
| vocal_lead | psico | doc/generator | YES | D/G/-/-/- | liderazgo |
| chemistry | psico | doc/generator | YES | D/G/-/-/- | efecto relacional |
| adaptability | psico | doc/generator | YES | D/G/-/-/- | adaptación |
| professionalism | psico | doc/generator | YES | D/G/-/-/- | conducta/desarrollo |
| temperament | psico | doc/generator | YES | D/G/-/-/- | control emocional |
| ambition | psico | doc/generator | YES | D/G/-/-/- | aspiración |
| loyalty | psico | doc/generator | YES | D/G/-/-/- | renovación |
| greed | psico | doc/generator | YES | D/G/-/-/- | dinero/contrato |
| pressure_res | psico | doc/generator | YES | D/G/-/-/- | presión/playoffs |
| extroversion | psico | doc/generator | YES | D/G/-/-/- | media |

Campos no-rating PCB adicionales: `bio.age`, `pos`, `hand`, `gender`, `height_cm`, `wingspan_cm`, `weight_kg`, `nationality`, `birthplace`; `origin`, `mentalidad`, `arquetipo`, `personality`; `traits[]`, `perks[]`; `scout.tier`; `potential`; `market_value`; `health.fatigue`, `injury_status`; `morale`; etiquetas/descripciones generadas. Todos se generan y persisten dentro del blob de jugador; no todos influyen en el MMP.

## 4. PCB Implemented vs Designed

**Implementado:** el generador crea los 90 atributos y los persiste; IA lee grupos de aproximadamente 50; health/training mapea 34; MMP consulta un subconjunto visible de `three_static`, `mid_range`, `finishing_close`, `contact_finishing`, `post_scoring`, `off_screen_shot`, `ball_control`, `ball_protect`, `ball_security_iq`, `pass_speed`, `def_perimeter`, `def_post`, `steal_onball`, `steal_pass`, `block`, `reb_def`, `foul_discipline`, `speed_top`, `strength_static` y `clutch`.

**Diseñado solamente o sin consumidor localizado:** deep range, contested shot, mano débil, casi todas las especialidades de pase, P&R/help/clock/spacing/off-ball, la mayoría de técnicas de dribbling, coordinación/flexibilidad/manos y casi todo el bloque psico. No son inútiles como ideas; no deben tratarse como mecánicas existentes.

**Dos generaciones:** `catalogs.py` conserva un fallback de 20 atributos; el documento de 90 es la generación rica. La generación real de `generator_service.py` lee los documentos si están disponibles y degrada al fallback si no lo están. Es una señal de modelo no estabilizado.

## 5. PCB Field Consumer Audit

| Flujo | Campos con consumo real localizado | Conclusión |
|---|---|---|
| Generación/persistencia | 90 atributos + bio + identidad + traits/perks + potencial/valor/salud/moral | Datos existen. |
| Match simulation | subconjunto listado en sección 4 | Datos que importan al MMP hoy. |
| IA | shooting, finishing, playmaking, defensa, rebounding, athletic y mental por grupos | Evalúa firmas, estilos, rotaciones y tácticas. |
| Training | strength/stamina/vertical/shooting/handling/technique/defense | Mapea atributos, no demuestra progresión de todos. |
| Scouting | tier, máscara de atributos/potencial/valor, scout reports | Funcional como conocimiento imperfecto. |
| UI | atributos y etiquetas, roster, perfil | Presentación amplia, no consumidor de reglas. |
| Mercado | potencial/overall/edad/valor y agencia | Valor es derivado y se persiste: deuda. |

Regla de lectura: una aparición en catálogo o UI no acredita efecto jugable. El futuro BDM sólo conserva un campo si tiene owner y al menos un consumidor de Match, Training, Development, Medical, Scouting, AI, Market, Role o Narrative.

## 6. Current BDM Player Model

| Campo BDM | Tipo | Escala | Fuente | Engine consumer | UI consumer | Persistencia | Estado |
|---|---|---|---|---|---|---|---|
| id, firstName, lastName, gender, nationalityId | IDENTITY | n/a | `Player.ts` | world/roster | roster/profile | GameWorld | CANONICAL |
| dateOfBirth, heightCm, weightKg | MEASUREMENT | natural | `PlayerBio` | age/roster | roster/profile | GameWorld | CANONICAL |
| primaryPosition | CONTEXTUAL | enum | BasketballProfile | match/rotation | roster/tactics | GameWorld | CANONICAL |
| finishing, shooting, playmaking, perimeterDefense, interiorDefense, rebounding, athleticism | RATING | 0–100 integer | PlayerRatings | match, development, training, knowledge, draft | roster/profile | GameWorld | ACTIVE bootstrap |
| potential.ceiling | DEVELOPMENT | 0–100 integer | PlayerPotential | offseason/draft/recruiting | roster | GameWorld | ACTIVE bootstrap |
| personality six dimensions | PERSONALITY | 0–100 integer | Personality | morale/media/memory | indirect | separate map | CANONICAL |
| morale | CONTEXTUAL | profile | Morale | match result | UI | separate map | ACTIVE |
| careerFatigue | HEALTH | 0–100 | CareerFatigue | training | training | separate map | ACTIVE |
| injury records | HEALTH | typed | Injury | availability | medical-adjacent | separate records | ACTIVE |
| development stimulus by rating | DEVELOPMENT | numeric accumulator | DevelopmentStimulus | training/offseason | training | separate map | ACTIVE |
| knowledge estimate/uncertainty | KNOWLEDGE (proposed category) | 0–100 / 0–20 | PlayerKnowledge | scouting | roster/profile | separate map | ACTIVE |
| overall/ability proxy | DERIVED | 0–100 | `calculateBootstrapAbilityProxy` | draft/development | possible UI | not canonical | DERIVED |
| live match fatigue | HEALTH | 0–100 | Match Fatigue | MatchEngine | MatchViewer | session only | ACTIVE |

`Player.ts` llama explícitamente a la superficie de siete ratings “Bootstrap rating surface only; later player taxonomies may replace it”. No es legado: es el punto de ampliación previsto.

## 7. PCB → BDM Mapping

| PCB | BDM actual | Acción | Categoría final | Nombre canónico propuesto | Motivo |
|---|---|---|---|---|---|
| three_static + three_off_dribble | shooting | MERGE/EXTEND | RATING | threePointShooting + pullUpShooting* | base + especialidad opcional |
| mid_range, free_throw | shooting | REPLACE | RATING | midRangeShooting, freeThrowShooting | consumidores diferenciables |
| deep_range, contested_shot | ninguno | DERIVE/TRAIT | DERIVED/TRAIT | rangeModifier, toughShotMaker | evitar ratings de contexto |
| finishing_close, contact, dunk, floater | finishing | REPLACE | RATING | rimFinishing, contactFinishing, dunking, floater | acciones distinguibles |
| hook, fadeaway, post_scoring | finishing | MERGE | RATING | postScoring, postFootwork* | no tres tiros post aislados |
| weak_hand_finish + off_hand_dribble | ninguno | MERGE | RATING | weakHandSkill* | misma lateralidad técnica |
| todos los pases + vision | playmaking | MERGE | RATING/MENTAL | passing, courtVision | precisión vs lectura |
| creativity | ninguno | REINTERPRET | TENDENCY | creativePassing | conducta, no capacidad |
| shot_selection/pnr/help/clock/spacing | playmaking | MERGE | MENTAL | decisionMaking, offBallAwareness | evitar cinco IQ solapados |
| ball_control/protect/traffic | playmaking | REPLACE | RATING | ballHandling, ballSecurity | ejecución distinta |
| moves específicos | ninguno | DROP/TRAIT | TRAIT | signatureMove | no rating por animación |
| def_perimeter/post | defensas BDM | REPLACE | RATING | perimeterDefense, interiorDefense | mantener dos contextos |
| steal_onball + steal_pass | ninguno | MERGE | RATING | steal | distinguir por evento en engine |
| screen_nav/help/closeout/P&R/transición | ninguno | MERGE | RATING/MENTAL | screenNavigation, defensiveAwareness | técnica + lectura |
| block + intimidation | interiorDefense | MERGE | RATING | rimProtection | resultado observable común |
| reb_def + box_out | rebounding | REPLACE | RATING | defensiveRebounding, boxOut | conservar decisión posicional |
| acceleration/speed/agility/deceleration | athleticism | REPLACE | RATING | acceleration, speed, lateralAgility, changeOfDirection | cuatro usos distintos |
| strength/static/explo, verticals | athleticism | MERGE | RATING | strength, vertical | no dividir si engine no lo exige |
| stamina/fatigue_recov | fatigue | REINTERPRET | RATING/HEALTH | stamina, recoveryRate | capacidad vs estado |
| durability/flexibility | injury | REINTERPRET | HEALTH | injuryResistance, mobility* | ownership Medical |
| clutch/pressure_res | ninguno | MERGE | MENTAL | composure | misma ejecución bajo presión |
| consistency | ninguno | REINTERPRET | DEVELOPMENT | performanceVariance | no es capacidad fija |
| work_ethic/professionalism | personality | MERGE | PERSONALITY | professionalism | evitar doble sistema |
| ambition/loyalty/temperament/adaptability | personality | KEEP/MERGE | PERSONALITY | mismos nombres | BDM ya tiene cuatro |
| greed | ninguno | RENAME | PERSONALITY | financialMotivation* | negociación, no rating |
| chemistry/vocal_lead | relationships | REINTERPRET | RELATIONAL/PERSONALITY | leadershipOrientation | efectos por relación, no atributo aislado |
| aggressiveness | ninguno | REINTERPRET | TENDENCY | attackContact | frecuencia, no habilidad |
| extroversion | media | RENAME | PERSONALITY | mediaOrientation* | sólo si media lo consume |
| origin/mentalidad | ninguno | REINTERPRET | CAREER/TRAIT | backgroundTags | narrativa, no modificador directo |
| archetype | ninguno | DERIVE | DERIVED | archetype | calculado desde perfil |
| perks | ninguno | MERGE | TRAIT | traits | no dos sistemas solapados |
| potential + market value | potential/market | REPLACE/DERIVE | DEVELOPMENT/DERIVED | developmentCeiling, marketValue | valor nunca fuente de verdad |

`*` = extended canon; no se añade hasta que exista consumidor aprobado.

## 8. Canonical Category Definitions

- **RATING:** capacidad 1–100 que responde “qué tan bueno es”.
- **TENDENCY:** propensión 1–100 que responde “con qué frecuencia/intención lo intenta”.
- **MEASUREMENT:** unidad natural observable; nunca se fuerza a rating.
- **MENTAL:** subgrupo de ratings cognitivos de baloncesto. Se mantiene como categoría de presentación y ownership, no como sistema distinto de escala.
- **PERSONALITY:** predisposición persistente fuera de la habilidad; 1–100.
- **TRAIT:** etiqueta escasa con comportamiento, evaluación o narrativa explícitos.
- **HEALTH:** disponibilidad, carga, lesión, recuperación y susceptibilidad.
- **DEVELOPMENT:** techo, curva, ritmo, respuesta y variación de evolución.
- **CONTEXTUAL:** depende de equipo, coach, táctica, competición o asignación.
- **DERIVED:** se calcula desde verdad; no se persiste salvo snapshot histórico justificado.
- **IDENTITY:** quién es la persona y datos estables.
- **CAREER:** trayectoria, elegibilidad, experiencia y eventos.
- **CONTRACTUAL:** contrato, derechos y mercado; fuera de PlayerTruth.
- **RELATIONAL:** relación persona–persona/equipo; fuera de PlayerTruth.
- **KNOWLEDGE (nueva categoría justificada):** lo que un observador cree saber, con rango y confianza; nunca sustituye a PlayerTruth.
- **DROP:** no añade dimensión o no tiene consumidor.

## 9. Identity Model

Canónico: `id`, `firstName`, `lastName`, `gender`, `nationalityId`, `dateOfBirth`, `birthplaceId?`, `dominantHand?`, `backgroundTags[]?`. Edad es **DERIVED** de fecha y calendario. `origin` y `mentalidad` PCB sobreviven como tags narrativos, sin sumar puntos directos a ratings.

## 10. Measurements Model

Canónico mínimo: `heightCm`, `weightKg`, `wingspanCm`, `standingReachCm?`, `dominantHand`. Extended: `handSizeCm?` sólo si captura real/dataset lo suministra y hay efecto en recepción/ball security. No usar “body type” ni dimensiones cosméticas como ratings. Sexo/género no modifica el significado del rating; las reglas de generación y competición son contextuales.

## 11. Physical Ratings

**Minimum:** acceleration, speed, lateralAgility, changeOfDirection, strength, vertical, stamina.  
**Extended:** mobility, recoveryRate.  
`durability` e `flexibility` pasan a HEALTH: no son rendimiento de posesión y necesitan ownership médico. `second_jump` se deriva de vertical + stamina + trait sólo hasta que el engine demuestre una necesidad independiente.

## 12. Shooting Ratings

**Minimum:** midRangeShooting, threePointShooting, freeThrowShooting.  
**Extended:** pullUpShooting, offScreenShooting, postFootwork.  
Rim attempts pertenecen a finishing. Corner/open/contested/catch-and-shoot no son ratings base: usan three point + tendency + context + trait. Deep range es trait/modificador de rango, no una segunda habilidad de triple.

## 13. Finishing Ratings

**Minimum:** rimFinishing, contactFinishing, dunking, floater, postScoring.  
**Extended:** weakHandSkill, postFootwork.  
Hook, reverse, alley-oop y standing/transition finish se resuelven por acción, medidas, ratings base, tendency y trait; no crean seis ratings redundantes.

## 14. Creation / Ball Handling

**Minimum:** ballHandling, ballSecurity, firstStep, changeOfDirection.  
**Extended:** separationCreation.  
Crossover, spin, behind-back, hesitation, low dribble, nutmeg e in-and-out son movimientos/animaciones o signature traits. PnR handling es contextual: habilidad de creación + decision making + táctica.

## 15. Passing

**Minimum:** passing, courtVision.  
**Extended:** passingCreativity (como tendency, no rating).  
Short/long/bounce/post/speed son tipos de pase resueltos por `passing`, `courtVision`, distancia, presión, tamaño de ventana y situación. La exactitud no debe existir cinco veces.

## 16. Post Game

`postScoring` es rating mínimo; `postFootwork` es extended. Hook y fadeaway son elecciones de acción con modifiers, no atributos permanentes independientes. Strength, height, wingspan, balance y interior defense del rival participan en la resolución.

## 17. Defensive Ratings

**Minimum:** perimeterDefense, interiorDefense, screenNavigation, defensiveAwareness, steal, rimProtection, shotContest, defensiveRebounding, boxOut.  
**Extended:** closeoutExecution, transitionDefense.  
`help_defense`, `def_pnr_inside`, `def_transition` se fusionan en defensive awareness + esquema + matchup. `intimidation` se integra en rim protection/shot contest y traits excepcionales.

## 18. Rebounding

**Minimum:** offensiveRebounding, defensiveRebounding, boxOut.  
Timing, esfuerzo, posición, vertical, strength y `crashOffensiveGlass` generan el resultado. PCB sólo documenta `reb_def`; BDM debe distinguir ofensivo/defensivo porque el consumidor de táctica sí es distinto.

## 19. Mental Model

MENTAL se conserva como dominio de **ratings 1–100**, no como atributos psicológicos. Minimum: decisionMaking, anticipation, composure, offBallAwareness, defensiveAwareness, discipline. Extended: clockAwareness. `clutch` y pressure resistance se fusionan en composure; shot selection/P&R read/help read/spacing IQ se expresan con decision making, awareness y contexto. Así cada mental tiene una pregunta distinta y un consumidor plausible.

## 20. Tendencies Model

Todas son 1–100, cambian MEDIUM y obedecen a táctica/rol sin reemplazarlos:

- `drive`, `attackContact`, `dunkAttempt`, `floaterAttempt`, `postUp`, `midRangeAttempt`, `threePointAttempt`, `pullUpAttempt`, `catchAndShoot`;
- `pickAndRollBallHandler`, `pickAndRollRoll`, `isolation`, `creativePassing`, `transitionPush`;
- `cut`, `offBallScreenUse`, `crashOffensiveGlass`;
- `helpDefense`, `gambleForSteal`, `switchDefense`, `foulAggression`.

Ejemplo canónico: 88 en `threePointShooting` y 35 en `threePointAttempt` = gran tirador que no se ofrece o no recibe ese rol. MatchEngine elige conducta con tendency+táctica; resuelve éxito con rating+contexto.

## 21. Personality Model

BDM actual ya canoniza `ambition`, `professionalism`, `loyalty`, `resilience`, `temperament`, `teamOrientation`, y Moral/Memory consumen parte de ellas. Propuesta **PERSONALITY CANON**: conservar esas seis y añadir sólo `adaptability` y `competitiveness`. `workEthic` se fusiona en professionalism; `mentalTough` en resilience; `chemistry` se vuelve RELATIONAL; `vocalLead` se vuelve leadership trait/relational effect; `greed` se renombra `financialMotivation` sólo cuando el sistema contractual lo consuma; `extroversion` se incorpora sólo cuando Media tenga uso aprobado.

## 22. Traits Model

Mantener un único sistema de `traits`, no traits+perks. Un trait debe tener una regla de activación, consumidor y explicación. Candidatos:

- `toughShotMaker`, `deepRange`, `catchAndShootSpecialist`, `slipperyOffBall`;
- `floorGeneral`, `breakStarter`, `lobPasser`;
- `rimRunner`, `ambidextrousFinisher`, `postLockdown`, `chaseDownBlocker`, `quickSecondJump`;
- `ironDurable`, `injuryProne`, `lateBloomer`, `earlyBloomer`, `lockerRoomLeader`.

`Posterizer`, `Clamps`, `Pogo Stick` y similares de PCB son candidatos si tienen efecto de MatchEngine verificable. `nutmeg` y traits puramente animados se descartan. Traits no otorgan bonos opacos globales a todo el equipo.

## 23. Archetypes / Roles

**Archetype = DERIVED**, por ejemplo 3&D Wing, Shot Creator, Rim Runner, Stretch Five, Point-of-Attack Defender. Se calcula por ratings+tendencies+medidas+posición y puede variar con desarrollo.  
**NaturalRole = DERIVED** por el mismo mecanismo.  
**AssignedRole = CONTEXTUAL**: decisión del coach/equipo, con fit calculado; nunca se persiste dentro del jugador como habilidad.

## 24. Position Model

Mantener `primaryPosition`; añadir `secondaryPositions[]` sólo si se alimenta desde datasets/generación. `positionProficiency` debe derivarse de height/wingspan, ratings, tendencies y experiencia por posición; no crear otro rating manual. PG/SG/SF/PF/C siguen siendo etiquetas de lineup, mientras role cubre la función real.

## 25. Health Interface

PlayerTruth no absorbe estado clínico. Health posee lesiones, historial, severidad, fecha de retorno, disponibilidad, career fatigue y live fatigue. Propuesta extendida: `injuryResistance`, `recoveryRate`, `medicalRiskProfile`, `workloadTolerance`; todos con dueño Medical/Training y visibilidad distinta. `stamina` es capacidad de rendimiento; `fatigue` es estado; nunca se mezclan.

## 26. Development Model

Desarrollo posee estímulos por rating, respuesta a entrenamiento, edad, personalidad, salud y entorno. Minimum: `developmentCeiling`, `developmentStage`, `growthRate`, `declineSensitivity`. Extended: `trainingResponsiveness`, `peakAgeRange`, `performanceVariance`, `lateBloomer/earlyBloomer` traits. No se almacena XP de UI como fuente de verdad: se guardan inputs/eventos y el engine calcula cambios.

## 27. Potential Model

No basta “un número visible”. Propuesta: un `developmentCeiling` interno 1–100 para la capacidad agregada, envelopes por dominio/rating derivables para desarrollo y un `developmentProfile` que describe curva y probabilidad. El ceiling puede cambiar raramente por lesión grave o descubrimiento/reevaluación de modelo, no por cada entrenamiento. Training modifica estímulo/probabilidad de alcanzar techo; personalidad modifica consistencia y respuesta; edad y perfil determinan pico y declive. Scouting expone **estimación/rango/confianza**, no el ceiling real. Late/early bloomer son traits/descriptores de curva, no potencial extra independiente.

## 28. Derived Metrics

No persistir: `overall`, offensive/defensive evaluation, positional evaluation, role fit, tactical fit, readiness, market value, expected minutes, archetype, depth-chart rank, age, form summary y scouting range. Se pueden snapshotear para histórico/analytics con fecha y versión de fórmula, nunca como fuente operativa de PlayerTruth.

## 29. Overall / Evaluation

BDM tiene `calculateBootstrapAbilityProxy`, promedio de sus siete ratings; PCB genera `overall` con promedio de atributos. Ambos son DERIVED y demasiado planos para decidir por sí solos. Mantener una evaluación general sólo como UI/scouting, acompañada de evaluación por posición, rol y táctica. IA debe evaluar necesidades y fit ponderados; no ordenar el mundo por overall global.

## 30. Scouting Visibility

| Visibilidad | Ejemplos |
|---|---|
| PUBLIC | nombre, nacionalidad, edad derivada, altura, posición, contrato cuando reglas lo permitan. |
| OBSERVABLE | mano dominante, estilo visible, tendencies aproximadas, medidas públicas. |
| EVALUATED | ratings, tendencies, personality inferible, potential, medical risk, role fit. |
| PRIVATE | ceiling real, development profile, injury susceptibility, relaciones y motivaciones contractuales. |
| INTERNAL | fatiga exacta, estímulos, cálculos de engine. |
| DERIVED | overall, value, role/archetype/fit; se muestra según conocimiento de inputs. |

## 31. Knowledge Stability / Decay

| Propiedad | Estabilidad | Conocimiento |
|---|---|---|
| identidad/medidas | STATIC | público/observable |
| personalidad | SLOW | evaluado/privado |
| ratings técnicos/físicos | SLOW–MEDIUM | evaluado, uncertainty decrece por scouting |
| tendencies | MEDIUM | observable/evaluado |
| potential/perfil desarrollo | SLOW | evaluado, alta incertidumbre |
| moral/form/rol | FAST | contextual |
| fatiga/live fatigue | REALTIME | interno/propio parcial |
| lesión/recuperación | FAST–MEDIUM | médico/contractual según contexto |
| market value/fit/overall | DERIVED | se recalcula al consultar |

## 32. Engine Ownership

| Propiedad | Owner |
|---|---|
| Identity/measurements/base ratings | Player + Development validation |
| Tendencies/roles/archetypes | Player profile source; Match/Tactics consume; roles/archetypes derivan |
| Mental ratings | Player/Development; Match/AI consumen |
| Personality | Personality domain |
| Morale/relationships | Morale + Relationships |
| Fatigue/load/recovery | Training + CareerFatigue + Match Fatigue |
| Injury/medical risk | Injury/Medical |
| Potential/curve/stimulus | Development |
| Knowledge/ranges/confidence | Knowledge/Scouting |
| Contract/value | Contract/Salary/Market |
| Overall/fit/value/archetype | Evaluation services, derivados |

## 33. Consumer Matrix

| Property group | Match | Training | Development | Medical | Scouting | AI | Market | Narrative | UI |
|---|---|---|---|---|---|---|---|---|---|
| identity/measurements | Y | - | Y | Y | Y | Y | Y | Y | Y |
| technical/physical ratings | Y | Y | Y | - | Y | Y | Y | - | Y |
| mental ratings | Y | Y | Y | - | Y | Y | Y | Y | Y |
| tendencies | Y | Y | Y | - | Y | Y | Y | Y | Y |
| personality | - | Y | Y | - | Y | Y | Y | Y | Y |
| traits | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| health/fatigue/injury | Y | Y | - | Y | partial | Y | Y | Y | Y |
| development profile/potential | - | Y | Y | Y | Y | Y | Y | Y | Y |
| contextual role/fit | Y | - | - | - | Y | Y | Y | - | Y |
| derived metrics | indirect | - | - | - | Y | Y | Y | Y | Y |

Un campo individual sólo entra al canon si hereda al menos un `Y` real o si se aprueba explícitamente un consumidor futuro.

## 34. DROP List

- Escala PCB 1–1000.
- `nutmeg`, `behind_back`, `in_and_out`, `low_dribble` y otras animaciones como ratings.
- Open/corner/contested/catch three como ratings permanentes separados.
- Pase corto/largo/picado/post/speed como cinco capacidades independientes.
- Hook y fadeaway como ratings obligatorios separados.
- `intimidation` como aura opaca; integrar en resolución/traits.
- `chemistry` como número individual aislado; usar relaciones.
- Overall y market value persistidos como verdad.
- Arquetipo y mentalidad PCB como modificadores directos que duplican ratings/personality.
- Perks separados de traits.

## 35. Canonical Player Model Proposal

### IDENTITY — 10
`id`, `firstName`, `lastName`, `gender`, `nationalityId`, `dateOfBirth`, `birthplaceId?`, `dominantHand?`, `primaryPosition`, `secondaryPositions?`.

### MEASUREMENTS — 4 minimum / 5 extended
`heightCm`, `weightKg`, `wingspanCm`, `standingReachCm`; extended `handSizeCm`.

### RATINGS — 35 unique minimum

- Shooting (3): `midRangeShooting`, `threePointShooting`, `freeThrowShooting`.
- Finishing (5): `rimFinishing`, `contactFinishing`, `dunking`, `floater`, `postScoring`.
- Creation (4): `ballHandling`, `ballSecurity`, `firstStep`, `changeOfDirection`.
- Passing (2): `passing`, `courtVision`.
- Defense (7): `perimeterDefense`, `interiorDefense`, `screenNavigation`, `defensiveAwareness`, `steal`, `rimProtection`, `shotContest`.
- Rebounding (3): `offensiveRebounding`, `defensiveRebounding`, `boxOut`.
- Physical (7): `acceleration`, `speed`, `lateralAgility`, `changeOfDirection`, `strength`, `vertical`, `stamina`. (`changeOfDirection` belongs to creation/physical only once; total unique ratings is 37.)
- Mental (6): `decisionMaking`, `anticipation`, `composure`, `offBallAwareness`, `defensiveAwareness`, `discipline`. (`defensiveAwareness` belongs to defense/mental only once.)

**Corrected unique minimum count: 35 ratings.** Shared-domain ratings are not duplicated: `changeOfDirection` and `defensiveAwareness` each exist once. This is intentionally clearer than inflating the count.

### RATINGS — 13 extended additions
`pullUpShooting`, `offScreenShooting`, `postFootwork`, `weakHandSkill`, `separationCreation`, `closeoutExecution`, `transitionDefense`, `mobility`, `recoveryRate`, `injuryResistance`, `clockAwareness`, `passingVelocity`, `catching`.

### TENDENCIES — 18
`drive`, `attackContact`, `dunkAttempt`, `floaterAttempt`, `postUp`, `midRangeAttempt`, `threePointAttempt`, `pullUpAttempt`, `catchAndShoot`, `pickAndRollBallHandler`, `pickAndRollRoll`, `isolation`, `creativePassing`, `transitionPush`, `cut`, `offBallScreenUse`, `crashOffensiveGlass`, `helpDefense`, `gambleForSteal`, `switchDefense`, `foulAggression`.

**Corrected count: 21 tendencies.** The list is authoritative; count follows names, not an artificial target.

### PERSONALITY — 8
`ambition`, `professionalism`, `loyalty`, `resilience`, `temperament`, `teamOrientation`, `adaptability`, `competitiveness`.

### TRAITS — sparse
Only traits from section 22 with a declared consumer.

### HEALTH — separate state/profile
injuries, availability, career fatigue, live fatigue, workload, recovery and medical risk.

### DEVELOPMENT — 4 minimum / extended profile
`developmentCeiling`, `developmentStage`, `growthRate`, `declineSensitivity`; extended response, peak range and variance.

### DERIVED
age, overall, offensive/defensive/positional/role evaluation, tactical fit, market value, archetype, readiness and knowledge display ranges.

## 36. Minimum Player Model

Implementable target after design approval: 35 ratings, 21 tendencies, 4 measurements, 8 personality dimensions, sparse traits, health state, four development fields, knowledge records and derived evaluations. This is sufficient for MatchEngine, training, development, roster, scouting, draft, recruiting, market and AI without waiting for every PCB specialty.

## 37. Extended Player Model

Gradual layer: 13 additional ratings, medical risk profile, training responsiveness, peak age range, performance variance, secondary positions, richer traits and data-source metadata. Add each only with migration, consumer, visibility rule, decay rule, owner and tests.

## 38. Migration Risks

- Current BDM save shape and every `BasketballRatingKey` consumer will need a versioned migration when approved.
- Match profile adapter currently derives all match signals from seven ratings; replacing it is engine work, not UI work.
- Knowledge records contain one entry per existing rating; a new taxonomy changes scouting persistence and screen contracts.
- Draft/recruiting generation currently creates exactly seven ratings; dataset import needs explicit defaults and provenance.
- Personality is stored separately by person, so embedding it in Player would duplicate truth.
- Overly wide Player objects must not be passed to React; build compact roster/profile view models.

## 39. Open Design Decisions

1. Should ratings permit decimals internally now, or retain integer truth with decimal only in calculations?
2. Is `dominantHand` enough initially, or does dataset support justify `handSizeCm`/weak-hand detail?
3. Which extended ratings have an approved MatchEngine owner in v1?
4. Is `financialMotivation` needed for contract negotiation before agents/agencies exist?
5. Which visibility rules differ among owned player, opponent, prospect and real-world imported dataset?

## 40. Final Recommendation

Approve the layered taxonomy, not a bulk port. Freeze the distinction between Truth, State, Knowledge and Derived view models. First ratify the 35 minimum ratings and 21 tendencies with named consumers; then design a versioned Player Model migration and adapt MatchEngine/Development/Knowledge together. PCB’s depth survives where it creates an intelligible basketball decision. Its redundant micro-skills, 1–1000 scale and duplicated labels do not.

# IMPACT ON PLAYER INTELLIGENCE

The proposal gives Player Intelligence a stable contract: truth remains exact and private; each observer owns a knowledge record with estimated value, range/uncertainty, confidence, source and assessed date. Public measurements are exact; ratings and tendencies are evaluated; personality/potential/health can be private or partially inferred. Own-player knowledge has narrow ranges, opponents decay without observation, and scouts/staff improve confidence by domain. Draft, Recruiting, Market and Trades consume the same knowledge layer with different permissions, rather than inventing separate fake player copies. UI receives compact, observer-specific view models: exact values only when entitled, otherwise ranges, descriptors or unknown.

## Audit evidence

Primary code and documents inspected: PCB player concept documents; `catalogs.py`, `generator_service.py`, `ai_service.py`, `health_service.py`, `mmp_engine.py`, player/scouting services; BDM `Player.ts`, `PlayerPotential.ts`, `Personality.ts`, Knowledge, GameWorld, MatchPlayerProfile/MatchEngine, Training, Development, Draft and Recruiting engines.
