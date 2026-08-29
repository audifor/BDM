# PCB Recovery Audit contra BDM

**Fecha:** 2026-08-27  
**Naturaleza:** auditoría de lectura. No se ha editado código de producto, ni datos, ni configuración.  
**Criterio de evidencia:** el código ejecutable tiene prioridad sobre documentos. Los documentos PCB se usan para recuperar intención de diseño, nunca como prueba de que una mecánica esté terminada.

## 1. Resumen ejecutivo

PCB fue una primera versión ambiciosa de un simulador/manager de baloncesto para escritorio: Electron + React para la interfaz y un proceso Python + SQLite para la simulación y los datos. Conserva mucho valor de diseño, especialmente en la densidad de los flujos de GM, la presentación de listas, la simulación 2D y la visión de scouting, agentes, mercado, club y calendario. Sin embargo, su implementación está concentrada en pocos archivos enormes, mezcla modelos relacionales con bolsas JSON, y carga y renderiza datos a gran escala sin evidencia de virtualización ni carga diferida.

BDM no debe absorber PCB como una base de código. BDM ya tiene una arquitectura más sana y una cobertura de sistemas de juego sorprendentemente más amplia: mundo normalizado JSON-safe, Domain/Engine TypeScript puros, RNG inyectado, ecosistemas FIBA/NBA/NCAA, draft, salary cap, trades, NIL, elegibilidad, competición, desarrollo, lesión, narrativa y MatchEngine separado del visor. La oportunidad es **recuperar diseños, contratos UX y reglas de producto de PCB**, adaptándolos a las entidades y motores de BDM.

La primera ola de recuperación recomendada es de interfaz y aplicación: roster configurable, perfil de jugador y registro de partidos, scouting/fog, training/load/medical y navegación de mercado. No requiere copiar Python, Electron, SQLite, `data_json` ni el renderer monolítico.

## 2. Identificación de los proyectos y alcance

| Elemento | Hallazgo |
|---|---|
| Raíz BDM | `C:\BDM` — Tauri 2, React, TypeScript, Vite y Rust. |
| Raíz PCB | `C:\BDM\PCB` — `backend`, `BPC`, `.git` y el archivo `bu`. |
| Fuente PCB más rica | `C:\BDM\PCB\bu`: contiene documentación de producto, frontend Electron/React y backend Python. El árbol activo `PCB\backend` conserva los servicios/motor equivalentes. |
| Alcance auditado | Código y documentación disponibles en ambas raíces, sin ejecutar ni mutar el producto. |
| Límite | No hay perfilador, trazas de producción ni mediciones de FPS/memoria; las conclusiones de rendimiento se basan en evidencia estática y se declaran como tales. |

Estados empleados:

- **FUNCIONAL:** hay ruta/servicio/motor implementado y conectado de forma plausible.
- **PARCIAL:** hay implementación sustancial, pero no prueba suficiente de flujo completo, profundidad o robustez.
- **DISEÑADO:** aparece como especificación o intención, sin implementación equivalente demostrada.
- **PROTOTIPO:** UI o lógica experimental/local que no prueba integración estable.
- **DESCONOCIDO:** no se halló evidencia suficiente para afirmar más.

## 3. Arquitectura PCB encontrada

### 3.1 Runtime y fronteras

PCB usa Electron como contenedor. `frontend/electron/main.js` levanta un único proceso Python (`backend/app/main.py`) y le envía comandos JSON por `stdin`; resuelve respuestas JSON por `stdout` con un mapa `pending` de promesas. El renderer usa el preload de Electron y llama a `window.pcbasket.invoke(command, payload)`.

Es un diseño claro para un prototipo offline, pero no hay cola, cancelación, prioridad, back-pressure ni aislamiento de cargas pesadas por comando. Una simulación o agregación síncrona en Python comparte proceso con todas las peticiones de interfaz.

### 3.2 Persistencia

SQLite se inicializa mediante migraciones. El esquema incluye, entre otras, tablas de `team`, `player`, `contract`, `match`, `event_log`, `agency`, `agent`, `savegame`, `season`, `competition`, `fixture`, `standing`, `person`, `transfer`, `injury`, `scout_report`, `gm_event` y `gm_decision`.

La capa es híbrida: tiene columnas e índices relacionales, pero muchos datos viven en `data_json`. Esto acelera el prototipado, pero desplaza filtros, agregados y cambios complejos a `json_extract`, parseos completos y reescrituras de blobs.

### 3.3 Backend y comandos reales

El dispatcher `backend/app/api/commands.py` expone familias reales para:

- jugadores, equipos, contratos y log de partidos;
- partidos, eventos, control y acciones;
- agencias/agentes;
- smartphone, agenda y decisiones del GM;
- avance del mundo/IA/día;
- reglas, ligas, instalaciones, consejo y contratos;
- competición, calendario, clasificación y resultado;
- analítica;
- entrenamiento/salud;
- club, personal y objetivos;
- mercado, shortlist, ofertas, contraofertas, scouting y transferencias;
- promoción juvenil.

Esto prueba una superficie de producto amplia. No prueba que cada pantalla llegue a cada comando ni que la simulación tenga equilibrio de producción.

### 3.4 Frontend

`PCB/bu/frontend/renderer/src/App.jsx` tiene **6.569 líneas** y `index.css` **3.335 líneas**. `App.jsx` concentra estado, efectos, carga, filtrado, secciones, club, mercado, tácticas, training, medical, roster, rotaciones, mentoring y acciones. `SectionRouter.jsx` organiza las secciones de Hub, Plantilla, Entrenamiento, Tácticas, Club, Medical y Mercado, pero el núcleo sigue dependiendo del gran `App`.

El CSS global implementa una identidad densa de escritorio: superficies oscuras, acentos, paneles, tablas, badges, glass/blur y microinteracciones. Es una fuente útil de lenguaje visual, no una base aconsejable para trasladar sin reducirla.

### 3.5 Motor de partido

`backend/app/sim/mmp_engine.py` tiene **3.303 líneas**. Implementa una simulación 2D con estados de jugadores y balón, espacios, selección de receptor, tiro, rebote, faltas, tiros libres, tiempos muertos, cansancio, sustituciones, rotaciones, matchups, tácticas, eventos, keyframes y estadísticas. Es una de las piezas más valiosas de PCB, pero también una unidad monolítica y síncrona.

## 4. Inventario de sistemas PCB: producto, código y estado

| Sistema | Estado | Evidencia de código | Diseño/documentación recuperable |
|---|---|---|---|
| Roster / Plantilla | FUNCIONAL | Tabla, búsqueda, columnas, ordenación, selección, drag/reorder, menú contextual y vistas en `App.jsx`. | Presentación operativa tipo manager, posiciones y profundidad. |
| Perfil y log de jugador | FUNCIONAL | `player.list`, patch y `player_profile_service.match_log`. | Ficha contextual y lectura de rendimiento. |
| Atributos y potencial | PARCIAL | Datos y masking de scouting en `player_service`. | Documento propone escala 1–1000, ~90 atributos, rasgos, perks, arquetipos, mentalidad y biomecánica. |
| Scouting / fog of war | FUNCIONAL | Tier 1–6, máscara de potencial/valor/atributos y `scout_report`. | Incertidumbre progresiva, no números mágicos exactos. |
| Contratos | PARCIAL | Tabla/servicio de contratos; mercado crea acuerdos. | Cláusulas, bonus y negociación profunda están documentados más que demostrados. |
| Agencias y agentes | PARCIAL | Listado/generación, asignación, comisión y relación de agencia. | Personalidad, leverage, demandas, paquetes y estrategia: DISEÑADO. |
| Mercado / negociación | PARCIAL | Shortlist, ofertas, contraofertas, transfer, scout y avance diario. | Flujo GM valioso; reglas y profundidad necesitan adaptación. |
| Competición / calendario | FUNCIONAL | Temporada, competición, fixtures, clasificación, resultados y snapshots. | Ciclo de ligas y cierre de temporada. |
| Analítica | PARCIAL | `analytics_service.py` (769 líneas), awards/leaderboards/agregados. | Hub de rendimiento e historial, sin evidencia de caché ni UI madura. |
| Partido 2D | PARCIAL | MMP engine de 3.303 líneas y eventos. | Tablero, keyframes y lectura visual de posesiones. |
| Tácticas | PARCIAL | Tactics board, creador, matchups, rotaciones y plays. | Creador visual de jugadas/roles, pero parte usa estado local/prototipo. |
| Entrenamiento de equipo | PARCIAL | Grupos y efectos en `health_service`; pantallas de training. | Plan semanal, objetivos y carga visible. |
| Entrenamiento individual | PARCIAL | Rutas/pantallas y mapeos de atributos. | Evolución individual explicable al jugador. |
| Load management | PARCIAL | Vista/columnas/orden/filtros en renderer; salud entrena por día. | Semáforo de carga y decisión staff-GM. |
| Mentoring | PROTOTIPO | Estado/UI aparece en renderer. | Sistema relacional no verificado en backend. |
| Médico / lesiones | PARCIAL | Tabla de injury y health/training. | Prevención, historia y regreso al juego son recuperables como diseño. |
| Club / facilities | PARCIAL | Catálogo, bonus, coste, upgrade y personal en `club_service`. | Progresión de infraestructura. |
| Staff | PARCIAL | Roles, rendimiento, contratación y conversión jugador-entrenador. | Responsabilidades y especialidades más profundas en documentación. |
| Board / objetivos | PARCIAL | Snapshot/objetivos/negociación. | Relación GM–propiedad y presión institucional. |
| GM hub / agenda | FUNCIONAL | `gm_service`, `smartphone_service`, eventos y decisiones. | Centro de mando de un GM. |
| Smartphone / contenido | PARCIAL | Entidades y comandos propios. | Capa de inmersión, no prioritaria para motor. |
| IA de equipos | PARCIAL | Perfil, roster fit, rotaciones, tácticas y avance diario en `ai_service`. | DNA de franquicia como brújula de IA. |
| Juventud | PARCIAL | `youth.promote`; escasa evidencia de pipeline completo. | Cantera, desarrollo y promoción. |
| Universo global | DISEÑADO | Blueprint/GDD. | USA Pro, NCAA, FIBA, femenino y reglas por universo; BDM ya adelanta gran parte. |

## 5. Modelo de jugadores PCB

### Implementado o evidenciado

- identidad, equipo, posición y datos contractuales/mercado;
- atributos y potencial con visibilidad condicionada por scouting;
- valor de mercado estimado y reportes de scouting persistidos;
- notas, flags de GM y situación de transferencia;
- registros de partido derivados de `match.data_json`;
- vinculación con agencia/agente y efectos comerciales básicos.

### Diseñado, no demostrado como sistema completo

- orígenes y biografía;
- taxonomía amplia de atributos (el blueprint menciona ~90 y escala 1–1000);
- personalidad, rasgos, perks, arquetipos, mentalidades y biomecánica;
- progresión longitudinal ligada de manera completa a entrenamiento, entorno y narrativa.

**Decisión:** recuperar las categorías semánticas y la UX de descubrimiento, no importar la escala 1–1000 ni cualquier atributo sin una definición BDM y fuente de verdad clara.

## 6. Inventario de UX PCB

### Plantilla / roster

La mejor referencia directa. Incluye toolbar, búsqueda, selector de vista, columnas configurables, ordenación, selección, estado, badges, fila activa, enlace a perfil, menú contextual, watchlist y reordenación. Es una tabla de trabajo, no una tabla decorativa.

### Entrenamiento

El router y el renderer incluyen Team Training, Personal Train, Load Management, Staff Assignments y Training Module. El valor recuperable es la organización del trabajo semanal en decisiones visibles; la implementación actual no prueba una planificación persistida y simulada de extremo a extremo.

### Tácticas

Tablero avanzado, creador de jugadas, matchups defensivos, matriz de rotación y jugadas especiales. El creador aporta vocabulario de UX muy útil (frames, trazos, animación), pero no debe arrastrar estado local ni duplicar el modelo táctico de BDM.

### Medical

Overview, lesionados, historial, instalaciones, personal y prevención. Es el flujo más claro que falta como experiencia integrada incluso si BDM ya tiene lesión y fatiga en el dominio.

### Mercado / club / hub

Mercado agrupa scouting, agencias y agentes. Club agrupa perfil, staff, board y economía. Hub concentra mensajes, agenda y decisiones. El patrón de “centro de trabajo” es más importante que su skin exacto.

## 7. Auditoría de rendimiento PCB

### Evidencia comprobable

1. **Renderer monolítico:** `App.jsx` (6.569 líneas) mantiene una cantidad muy alta de `useState` y `useEffect` de dominios no relacionados. Cualquier cambio en su árbol tiene alto riesgo de invalidar renders del shell completo.
2. **Carga masiva:** el renderer solicita `player.list` con `limit: 1000`, `contract.list` con `limit: 1000`, `agent.list` con `limit: 500` y `agency.list` con `limit: 200`.
3. **Sin virtualización o lazy loading hallados:** no aparecen `React.lazy`, `react-window`, `react-virtualized` ni una alternativa de virtualización en el renderer auditado. Con listas extensas, eso implica coste de serialización IPC, memoria y DOM.
4. **Estilo caro y global:** `index.css` (3.335 líneas) usa extensamente superficies complejas, blur/backdrop y estilos globales. Sin perfil no se cuantifica el impacto, pero es un riesgo razonable de composición/GPU en tablas densas.
5. **Proceso único por IPC:** Electron encamina cada solicitud al mismo proceso Python. `pending` solo correlaciona respuestas; no hay limitación visible de concurrencia ni trabajo en background.
6. **Motor síncrono concentrado:** el MMP engine concentra 3.303 líneas de simulación en una unidad. Una simulación costosa puede retrasar respuestas si comparte el proceso de comandos.
7. **Agregados sobre JSON:** el log de jugador escanea por defecto hasta 240 partidos y permite hasta 800; lee `data_json`, lo parsea y deriva estadísticas. Analítica también recorre datos de partidos/objetos JSON.
8. **Estado duplicado:** renderer, `localStorage`, SQLite relacional y `data_json` comparten responsabilidades. Esto aumenta riesgo de incoherencia y trabajo de sincronización.

### Diagnóstico: por qué se volvió lento o pesado

No se puede afirmar un único cuello de botella sin perfilado. La explicación respaldada por el código es la combinación de: payloads grandes enviados por IPC, renderizado de colecciones no virtualizadas, un componente React central con estado transversal, análisis de históricos con parseo JSON, un engine Python síncrono en un proceso compartido y CSS costoso aplicado a UI densa. Cada factor por separado es asumible en un prototipo; juntos escalan mal cuando crecen roster, temporadas, histórico y pantallas simultáneas.

## 8. Auditoría BDM: sistemas reales

BDM parte de un esquema más adecuado para continuidad. `GameWorld` y `GameWorldSaveV1` son contratos normalizados JSON-safe. La arquitectura declarada y el código separan UI, Application, Engine y Domain; el motor no depende de React/Zustand/Tauri y la aleatoriedad debe ser inyectada.

| Área BDM | Evidencia real | Lectura de madurez |
|---|---|---|
| Mundo/persistencia | `src/domain/world/GameWorld.ts`, `src/save/GameWorldSaveV1.ts` | Base estructural sólida. |
| Partido | `src/engine/match`, `MatchEngine.ts`, MatchViewer y sustituciones manuales | FUNCIONAL; motor y visor separados. |
| Competición | competition, schedule, standings, season, conference y multi-competition | FUNCIONAL. |
| Ecosistemas | FIBA, NBA y NCAA en `domain/ecosystem` y motores asociados | FUNCIONAL/PARCIAL según flujo UI. |
| Draft y cap | draft, picks, future rights, salary, exceptions, rookie/dead money | FUNCIONAL en dominio/engine. |
| Trades | trade engine, matching y operaciones multi-equipo | FUNCIONAL en dominio/engine. |
| Reclutamiento/NCAA | recruiting, academic, eligibility, NIL, boosters, enforcement | FUNCIONAL/PARCIAL según pantalla. |
| Jugador/carrera | player, development, career, careerFatigue, injury, personality, morale | FUNCIONAL en dominio. |
| Staff/board | staff y board | FUNCIONAL/PARCIAL UI. |
| GM/coach | coach, reputation, RPG, finances, career | FUNCIONAL/PARCIAL UI. |
| Medios/narrativa | inbox, media, memory, narrative, relationships | FUNCIONAL/PARCIAL UI. |
| Estadísticas/legado | stats y legacy | FUNCIONAL/PARCIAL UI. |
| Pantallas | Roster, Squad, Training, Tactics, Market, Trade, Salary, Draft, Schedule, Standings, Board, Staff, Media, etc. | Ya existe superficie BDM que PCB debe mejorar, no sustituir. |

BDM tiene 517 archivos bajo `src`, frente a los grandes puntos únicos de PCB. Esta no es una medición de calidad por sí misma; sí es evidencia de una división de responsabilidades mucho más favorable.

## 9. Matriz maestra PCB → BDM

Las filas agrupan conceptos que deben evolucionar juntos; no pretenden ocultar trabajo. Coste: S (pequeño), M (medio), L (alto), XL (transversal/alto riesgo).

| Concepto PCB | Estado PCB | Equivalente BDM | Decisión | Prioridad | Coste | Razón |
|---|---|---|---|---|---|---|
| Tabla roster configurable | FUNCIONAL | `RosterSquadTable`, Squad/Roster screens | ADAPT | P0 | M | BDM tiene base; PCB aporta densidad y herramientas. |
| Búsqueda/filtros/orden/columnas | FUNCIONAL | UI roster | ADAPT | P0 | M | Contrato UX reutilizable. |
| Perfil + match log | FUNCIONAL | player/stats/history | ADAPT | P0 | M | BDM posee datos, falta consolidación visual. |
| Atributos/potencial | PARCIAL | player/development/knowledge | MAP | P1 | M | Mapear semántica, no escala PCB. |
| Fog/scouting report | FUNCIONAL | `domain/knowledge`, market/recruiting | EXTEND | P0 | L | Encaja con BDM y mejora decisiones. |
| Posiciones/roles/profundidad | FUNCIONAL | team/roster/match rotation | ADAPT | P0 | M | Alta utilidad diaria. |
| Rotaciones | PARCIAL | match/manual substitutions | ADAPT | P1 | M | Evitar duplicar autoridad de MatchEngine. |
| Entrenamiento colectivo | PARCIAL | training/development | ADAPT | P0 | L | Hacer visible el motor BDM. |
| Entrenamiento individual | PARCIAL | training/development | MAP | P1 | M | Ya pertenece al dominio BDM. |
| Load management | PARCIAL | careerFatigue/injury/training | EXTEND | P0 | M | UI + política de disponibilidad. |
| Mentoring | PROTOTIPO | relationships/personality/staff | EXTEND | P2 | L | BDM tiene piezas, falta regla aprobada. |
| Medical/return to play | PARCIAL | injury/careerFatigue/staff | EXTEND | P1 | L | No copiar tablas; diseñar flujo BDM. |
| Tactical board | PARCIAL | TacticsScreen/match tactics | ADAPT | P1 | M | Mejorar authoring y lectura. |
| Play creator/keyframes | PROTOTIPO | MatchEngine táctico | EXTEND | P2 | XL | Sólo tras definir contrato táctico. |
| Defensive matchups | PARCIAL | matchups/manual subs | ADAPT | P1 | M | Flujo claro con backend existente. |
| MMP 2D/eventos | PARCIAL | MatchEngine + MatchViewer | MAP | P1 | L | Recuperar ideas de visualización, no motor Python. |
| Estadísticas/leaderboards | PARCIAL | stats/legacy | ADAPT | P1 | M | BDM ya tiene fuente de datos. |
| Competición/calendario | FUNCIONAL | competition/season/schedule/standings | MAP | P1 | S | BDM es superior arquitectónicamente. |
| Agencias/agentes | PARCIAL | sin equivalente profundo localizado | EXTEND | P1 | XL | Gem de producto, nuevo dominio requerido. |
| Negociación de mercado | PARCIAL | market/contract/trade/salary | ADAPT | P1 | L | Integrar cap/reglas BDM. |
| Contratos/bonus/cláusulas | PARCIAL/DISEÑADO | contract/salary | EXTEND | P2 | L | No importar reglas sin decisión de producto. |
| Club/facilities | PARCIAL | finance/staff/board | EXTEND | P2 | M | Integrar costes y efectos no derivados. |
| Staff responsibilities | PARCIAL | staff/board/training/injury | EXTEND | P1 | L | Alto impacto sistémico. |
| Board objectives | PARCIAL | board/coach career | ADAPT | P1 | M | BDM ya tiene dominio. |
| GM hub/agenda | FUNCIONAL | inbox/media/narrative/coach | ADAPT | P1 | M | Recuperar navegación y priorización. |
| Smartphone/inmersión | PARCIAL | inbox/media | DROP | P3 | M | Valor bajo antes de flujos core. |
| Franchise DNA AI | PARCIAL/DISEÑADO | team/coach/market engines | EXTEND | P2 | L | Buena idea, requiere reglas explícitas. |
| Youth promotion | PARCIAL | development/recruiting/draft | ADAPT | P2 | M | Depende del ecosistema elegido. |
| NBA salary/draft/trades | DISEÑADO/ausente en PCB | salary/draft/trade | MAP | P0 | S | BDM ya es el superset. |
| NCAA/NIL/academic | DISEÑADO/ausente en PCB | academic/NIL/recruiting/enforcement | MAP | P0 | S | BDM ya es el superset. |
| FIBA/multi-country | DISEÑADO | ecosystem/competition/country | MAP | P1 | M | BDM tiene mejor base. |
| Coach RPG/finanzas personales | DISEÑADO/ligero | coachRpg/coachFinances/reputation | MAP | P1 | S | BDM ya lo implementa. |
| Narrativa/memoria/medios | PARCIAL | media/memory/narrative | MAP | P1 | S | Mantener fuente BDM. |

## 10. Decisiones de recuperación

### MAP — conservar BDM como autoridad

- Mundo, save, determinismo, calendario, clasificación y ecosistemas.
- Motor de partido y MatchViewer, incorporando sólo referencias visuales/telemetría de MMP.
- Draft, salary cap, exceptions, dead money, trades y reglas NBA.
- NCAA: recruiting, academic, elegibilidad, NIL, boosters y enforcement.
- Carrera del coach, reputación, finanzas, memoria, media, narrativa, stats y legacy.
- Entidades básicas de jugador, lesión, desarrollo, personalidad, moral, staff y board.

### ADAPT — portar concepto y UX, reescribir sobre BDM

- Roster PCB completo: vistas, columnas, densidad, filtros, estados, toolbar y acciones contextuales.
- Perfil de jugador y registro de partidos sobre BDM player/stats.
- Navegación diaria de Training, Tactics, Club, Medical, Market y Hub.
- Rotaciones y matchups como editores que emiten comandos BDM, no como estado paralelo.
- Mercado/negociación como interfaz sobre contratos, salary y trade BDM.
- Objetivos de board y agenda GM como presentación de eventos BDM.

### EXTEND — añadir capacidades a BDM con diseño nuevo

- Knowledge/scouting con informes, confianza, caducidad y presentación de incertidumbre.
- Gestión de carga y un flujo médico de prevención, diagnóstico, recuperación y clearance.
- Agencias/agentes con modelo propio: cartera, intereses, relación, comisión, estrategia y demandas.
- Responsabilidades de staff y efectos trazables sobre entrenamiento, lesión, scouting y desarrollo.
- Planificador semanal de entrenamiento y, después, mentoring.
- Playbook/creator sólo tras fijar una especificación de táctica compatible con MatchEngine.
- Instalaciones y club sólo si sus efectos y costes son fuente de verdad, no modificadores duplicados.

### DROP — no recuperar como arquitectura/producto actual

- Electron + Python + SQLite de PCB como segunda plataforma.
- IPC JSON por stdin/stdout como backbone de juego.
- Bolsas `data_json` como sustituto de entidades BDM normalizadas.
- `App.jsx` monolítico y `index.css` global como punto de partida de UI.
- `localStorage` paralelo para estado de juego/autoritativo.
- Carga indiscriminada de 1.000 jugadores/contratos y render de todas las filas.
- Escala 1–1000 y taxonomía masiva de atributos sin definición, UI y balance aprobados.
- Smartphone como prioridad previa a roster/training/market/medical.

## 11. Gems PCB a preservar

1. La **tabla roster como superficie de trabajo**: configurable, densa, legible y accionable.
2. El **vocabulario de scouting**: información imperfecta que progresa, no valores omniscientes.
3. El **flujo de negociación** que convierte mercado en conversación y relación, no sólo botón de fichar.
4. La **separación visual de entrenamiento, carga y medicina** para que el GM comprenda causas y consecuencias.
5. El **tablero táctico** como herramienta de autoría y lectura, especialmente rotaciones/matchups.
6. La ambición del **motor de partido orientado a eventos** y su material para una narración visual.
7. La **agenda/hub GM** para convertir sistemas dispersos en decisiones priorizadas.
8. La combinación **club + instalaciones + staff + board** para dar peso a la operación de franquicia.
9. El concepto de **franchise DNA** para hacer que la IA y organizaciones parezcan distintas.
10. La documentación de modelos humanos (jugador, staff, board, agencia), útil como banco de diseño aunque no sea especificación final.

## 12. Qué falta, qué es parcial y qué no debe copiarse

### Faltante real en BDM frente a la propuesta PCB

- dominio profundo de agentes/agencias y negociación humana;
- UI integrada de scouting/fog orientada al GM;
- flujo médico/load management con buena visibilidad;
- dashboard/tabla de rendimiento avanzada orientada a decisiones;
- editor de tácticas/jugadas si se decide ampliar el contrato del motor;
- instalaciones/responsabilidades operativas de staff como sistema completo.

### Parcial o no probado en PCB

- mentoring, play creator persistente, profundidad de agentes, contratos con todas las cláusulas, pipeline juvenil completo, salud de extremo a extremo, balance IA y analítica escalable.

### No copiar

No copiar blobs JSON mutables, estado duplicado, UI de una sola pieza, dependencias de Electron/Python, ni el estilo visual completo sin tokenización. Son las piezas que convertirían BDM en otra variante del mismo problema.

## 13. BDM como superset real

BDM supera a PCB en los límites más importantes de un juego a largo plazo:

- una sola representación de mundo JSON-safe con guardado versionado;
- separación Domain/Engine/UI y RNG determinista;
- múltiples ecosistemas de baloncesto en vez de una promesa documental;
- reglas NBA (draft, cap, exceptions, trades) y NCAA (NIL, academics, enforcement) ya modeladas;
- MatchEngine separado de MatchViewer;
- sistemas de carrera, finanzas de coach, media, memoria, narrativa y relaciones;
- tests de múltiples pantallas y dominios, aunque la auditoría no afirma que el árbol sucio actual complete toda la suite.

La recuperación correcta convierte PCB en una biblioteca de producto y UX para estos sistemas, no en una dependencia estructural.

## 14. Recuperaciones detalladas por dominio

### Jugadores

Mapear identidad, posiciones, desarrollo, personalidad, moral, lesión y fatiga a BDM. Adaptar la ficha PCB a vistas BDM que expliquen datos conocidos, estimados y ocultos. Extender sólo los rasgos/arquetipos que tengan efecto definido en simulación, desarrollo o relación; no crear etiquetas decorativas.

### Agencias y agentes

Es la recuperación de sistema más distintiva de PCB, pero no hay un equivalente profundo localizado en BDM. Debe empezar por un dominio pequeño: agencia, agente, clientes, relación con club, comisión y postura negociadora. Después puede crecer hacia confianza, promesas, leverage, preferencias y paquetes. Contratos y cap BDM permanecen autoritativos.

### Plantilla

P0. La tabla PCB debe inspirar una reconstrucción visual de `RosterSquadTable`, no una copia de JSX/CSS. Debe tener modelo de columnas tipado, orden/filtro/paginación/virtualización, estado de fila estable, acciones accesibles y datos derivados selectivos. La fuente de filas será BDM, nunca un caché paralelo.

### Tácticas

BDM ya dispone de pantalla y motor. Adaptar primero role assignment, matchups, rotación y una lectura de impacto. El editor libre de trayectorias/play frames es P2/XL porque cambia el contrato entre UI y MatchEngine y requiere una decisión de producto.

### Entrenamiento

Primero conectar la UX semanal a `training`, `development`, `careerFatigue`, `injury` y `staff`. Cada recomendación debe mostrar objetivo, carga, responsable, riesgo, horizonte y efecto esperado. No persistir el resultado derivado si el engine puede reconstruirlo.

### Mercado

Unificar market, contracts, salary y trade en una experiencia de pipeline: descubrir → scoutear → preseleccionar → explorar interés → negociar → validar reglas → ejecutar. Las capas de agencia se integran después sin eludir validación cap/trade.

### Staff

Partir de roles BDM y exponer responsabilidades asignables. Todo bonus debe ser trazable a una fórmula central de engine, con fuente, duración y condición, no repartido por componentes UI.

### Board

Adaptar objetivos, tolerancia y evaluación a la carrera del coach/GM BDM. PCB aporta presentación de relación institucional; BDM aporta carrera y consecuencias.

### NCAA

No portar desde PCB. BDM ya contiene recruiting, academic, eligibility, NIL, boosters y enforcement. Sólo reutilizar lenguaje visual de scouting/recruiting si encaja.

### NBA salary / draft / trades

No portar desde PCB. Mantener BDM como autoridad e incorporar sus decisiones a tabla roster/market con explicaciones claras de elegibilidad, salario y consecuencia.

### FIBA

Mapear la aspiración de universos PCB al ecosistema/country/competition BDM. Cualquier nueva regla nacional necesita especificación y tests propios; no un `data_json` abierto.

### MatchEngine y MatchViewer

El MMP PCB prueba valor visual: eventos, balón/jugadores, posesiones y momentos tácticos. Recuperar ideas de telemetría y presentación si se pueden derivar de eventos BDM. No reemplazar el engine TS ni fusionar visor y simulación.

## 15. Contrato de rendimiento para BDM

Toda recuperación PCB debe cumplir:

1. Lista con **paginación o virtualización**, nunca carga DOM completa por defecto.
2. **Memoización selectiva** de filas y selectores; no una optimización genérica que oculte datos obsoletos.
3. **Filtros y ordenación eficientes**, preferentemente sobre modelos de vista compactos.
4. **No recargas completas** por una acción local; actualizar la porción afectada o recomputar selector dirigido.
5. **No estado duplicado** entre UI, Zustand y mundo autoritativo.
6. **Estado derivado fuera del componente** cuando sea reconstruible y reutilizable.
7. **Límites explícitos** de payload, telemetría y tiempo de respuesta para histórico/simulación.
8. **Lazy loading** de pantallas pesadas y separación de edición/visualización cuando haga falta.
9. **No efectos visuales caros por fila**; tokens, superficies simples y degradación para tablas grandes.
10. **Perfilado antes de microoptimizar**: medir filas, interacción, guardado y avance de día.

## 16. Clasificación caliente / templada / fría

| Prioridad | Recuperación | Motivo |
|---|---|---|
| Caliente | Roster configurable y perfil/match log | Valor diario máximo y BDM ya tiene datos/pantallas. |
| Caliente | Training + load management | Convierte dominios BDM existentes en decisiones comprensibles. |
| Caliente | Scouting/fog UX | Diferenciador de GM con base `knowledge` existente. |
| Caliente | Market pipeline | Une sistemas BDM ya existentes y habilita futuras agencias. |
| Templada | Medical workflow y responsabilidades staff | Alto valor, requiere contrato de efectos claro. |
| Templada | Hub/agenda/board | Da cohesión a sistemas ya modelados. |
| Templada | Tactics board, rotations, matchups | Muy útil tras estabilizar roster/partido. |
| Templada | Agencias/agentes v1 | Diferenciador, pero dominio nuevo transversal. |
| Fría | Play creator libre/keyframes | Alto coste, cambia motor y necesita decisión. |
| Fría | Facilities detalladas | Secundario sin economía/efectos aprobados. |
| Fría | Smartphone/inmersión | No desbloquea bucle core. |
| Fría | Copia visual literal de todo PCB | Riesgo técnico alto y baja transferencia directa. |

## 17. Primera ola recomendada

**Objetivo:** hacer que BDM se sienta como una herramienta de GM profunda sin tocar sus límites arquitectónicos.

1. Definir contrato de view-model de roster BDM y reconstruir la tabla con la gramática PCB: columnas, estados, filtros, vistas y acciones.
2. Añadir perfil de jugador con historial/estadística contextual y estados de conocimiento.
3. Exponer un dashboard de entrenamiento semanal: carga, fatiga, riesgo de lesión, responsable y desarrollo esperado.
4. Convertir Market en pipeline de scouting/shortlist/interés/operación, con validación BDM visible.
5. Añadir paginación/virtualización, selectores compactos y pruebas de interacción en todas las tablas recuperadas.

Esto entrega valor visible, prueba el patrón de adaptación y deja preparado el terreno para medical, staff y agencias, sin introducir reglas nuevas de forma implícita.

## 18. Riesgos y guardarraíles de ejecución futura

- No convertir documentación PCB en reglas BDM sin aprobación; muchos apartados son aspiracionales.
- No duplicar simulación ni almacenar valores derivados para acelerar una pantalla.
- No introducir `Math.random()`; usar streams inyectados de BDM.
- No llevar lógica de motor a React/Zustand/Tauri.
- Cada nuevo modelo de agencia, instalación, rasgo o táctica requiere dueño de datos, eventos de cambio, persistencia, validación y pruebas.
- Antes de refactor visual amplio, estabilizar un sistema vertical completo (roster) y medirlo.
- Mantener pantallas existentes operativas durante cualquier migración visual incremental.

## 19. Fuentes auditadas principales

### PCB

- `PCB/bu/Docs/1.ARQUITECTURA/0. STACK.md`
- `PCB/bu/Docs/1.ARQUITECTURA/GDD 3.0.md`
- `PCB/bu/Docs/1.ARQUITECTURA/Master blueprint.md`
- `PCB/bu/Docs/1.ARQUITECTURA/Roadmap.md`
- `PCB/bu/frontend/electron/main.js`
- `PCB/bu/frontend/renderer/src/App.jsx`
- `PCB/bu/frontend/renderer/src/SectionRouter.jsx`
- `PCB/bu/frontend/renderer/src/index.css`
- `PCB/backend/app/api/commands.py`
- `PCB/backend/app/infra/migrations.py`
- `PCB/backend/app/sim/mmp_engine.py`
- `PCB/backend/app/services/player_service.py`
- `PCB/backend/app/services/player_profile_service.py`
- `PCB/backend/app/services/market_service.py`
- `PCB/backend/app/services/health_service.py`
- `PCB/backend/app/services/club_service.py`
- `PCB/backend/app/services/ai_service.py`
- `PCB/backend/app/services/analytics_service.py`

### BDM

- `docs/ARCHITECTURE.md`
- `docs/autopilot/PRODUCT_GUARDRAILS.md`
- `src/domain/world/GameWorld.ts`
- `src/save/GameWorldSaveV1.ts`
- `src/engine/match/MatchEngine.ts`
- Directorios de dominio/engine y pantallas UI de `src` enumerados en esta auditoría.

## 20. Conclusión

PCB es una fuente excelente de producto, interacción y ambición sistémica; BDM es la base correcta para implementar el juego. La recuperación debe ser selectiva: **mapear lo que BDM ya resuelve, adaptar los flujos visuales de mayor valor, extender sólo los huecos de producto comprobados y descartar la arquitectura que hizo pesado a PCB.**
