# BS19 · Basketball Life RPG: visión de producto, creador del entrenador y simulación vital

Fecha: 2026-10-17.
Estado: **VISIÓN / REQUISITOS DE PRODUCTO PROPUESTOS, NO IMPLEMENTADOS**.
Directriz del propietario: el RPG y la vida del entrenador controlado por el usuario son el **factor diferencial** de BDM. La prioridad no es únicamente la reacción de Staff.

## Directriz del propietario posterior al cuestionario de 100 respuestas

**Canon corregido:** BDM es **simulador de entrenador con RPG (objetivo 80% baloncesto / 20% RPG)**, no un simulador vital predominante. La vida personal profunda debe ser **jugable a voluntad**, con desencadenantes y consecuencias reales, sin quitar protagonismo a la gestión deportiva.

- Creador **sin editor de rostro obligatorio**; DOB, origen (incluidas deudas o desventajas), traits, atributos, personalidad, filosofía amplia, metas y trasfondo libre/guiado.
- Modos alternativos de configurar personalidad y atributos: dilemas o personalización directa; creación libre o bajo presupuesto.
- Creador ofrece **«experiencia basket» / «experiencia rpg»** para intensidad/presentación.
- Patrimonio, deuda, inversiones y negocios se gestionan activamente; posibilidad de actuar legalmente, de modo *shady* e incluso infringir reglas, con causalidad, conocimiento, reputación, riesgo e investigación.
- Mundo con vida propia, relaciones y memorias duraderas, conversaciones seleccionadas **y texto libre**, información parcial, consecuencias futuras **no anunciadas**.
- Familia/amistades reales en el mundo cuando proceda; vida/tiempo/calendario personal y decisiones activas. Retiro, mortalidad y sucesión jugable.
- **DECIDIDO P3 = B:** **realismo con dramatización**. Causas y efectos de mundo creíbles con situaciones excepcionales ocasionales, nunca tensión artificial programada.
- **DECIDIDO P41 = B:** **vida gestionable**. Agenda, compromisos, hogar, contactos, relaciones, patrimonio, inversiones, actividades y tiempo controlables por el jugador, sin obligar a gestionar rutinas insignificantes.
- **DECIDIDO P88 = B:** **Coach con subsección «Vida»**. Allí se concentra la vida personal; Home/Inbox/Calendario lanzan y enlazan acontecimientos. No duplicar aplicaciones de Finanzas, Relaciones ni Carrera.
- **REGLA DE PRODUCTO:** B indica la **primera profundidad implementable, no un límite de por vida**. Permitir futura ampliación modular y opcional de Vida y del drama contextual, con controles de intensidad, coherencia del 80/20 por defecto y compatibilidad de Save y de la identidad/personas y consecuencias preexistentes.
- `PARCIAL`: detalle de familia, roles múltiples, etapa inicial de asistente (sin gameplay actual), selecciones nacionales (futuro).
- **Bases no sustituibles:** Human RPG Engine `HRPG1–HRPG18`, B11 Personal/RPG Economy 21–23 y PERSON50/75 traits/75 eventos, conforme al [registro reconciliado de respuestas](BS19_RPG_OWNER_DECISIONS_AND_RECONCILIATION_20261017.md).

La construcción de BS19 debe conectar las autoridades existentes antes de desarrollar contenido adicional; BS19B Coach Creator sigue como primera fase funcional, pero su diseño debe reflejar estas decisiones.

## Política aprobada de profundidad evolutiva

Las opciones B/B/B de 17-10-2026 (P3, P41, P88) son el **punto de arranque**, no máximos obligatorios. Diseñar un Coach > Vida expandible: agendas, vínculos y finanzas como módulos conectados a las autoridades existentes, con acciones contextuales desde Home, Inbox y calendario. Ampliaciones futuras pueden profundizar relaciones familiares, compra/gestión de inmuebles, negocios, política o actividades personales sin sustituir el protagonista, reescribir historia ni mover de sitio el RPG ya jugable.

Los modos de intensidad «experiencia basket» y «experiencia rpg» ajustarán **exposición y control de eventos**, no la verdad del GameWorld. La simulación de personajes y la causalidad permanecen. Evolución aditiva y testada de Save, default compatible para saves legacy, capacidades extra opcionales y ningún scroll/menú innecesario. La ampliación futura requiere desarrollo y certificación; no afirmar soporte en la build actual.

## 0. Definición canónica

**BDM no es solo dirigir un equipo de baloncesto. Es vivir la vida y la trayectoria profesional de un entrenador creado por el jugador dentro de un universo de baloncesto persistente.**

Football Manager aporta la gestión profunda, un simulador de vida aporta circunstancias y elecciones, el RPG aporta identidad/evolución, y la simulación del mundo aporta continuidad sin depender de la presencia del usuario.

La identidad del entrenador NO puede ser un registro genérico elegido tras pulsar 'New Game'. **El jugador lo crea y ese PERSON es el protagonista estable de toda la partida**. Su vida no se reinicia al cambiar de club, de país, de nivel competitivo, ni al quedarse sin trabajo.

Un suceso humanamente importante tiene ciclo:
**contexto/situación emergente -> información accesible al protagonista -> decisión del usuario (o reacción personal si no decide) -> cambio concreto y limitado -> memoria/relaciones/carrera/economía -> consecuencias posteriores.**
Cada elección debe tener una consecuencia inteligible, no necesariamente positiva ni necesariamente inmediata. La ausencia de elección también puede tener consecuencias si existe un plazo definido.

No confundir este objetivo con construir Los Sims, inventar un framework transversal de inmersión, o multiplicar barras sin gameplay. No habrá obligaciones triviales diarias: relevancia y densidad FM. La simulación deportiva y humana debe seguir viva incluso cuando el usuario no interviene.

## 1. Diagnóstico reproducible de estado actual (main, 17-10-2026)

- `src/ui/startup/BootstrapApp.tsx`: `StartScreen` solo recoge universo y equipo; `onStart({ universeId, userTeamKey })`. No hay entrada de nombre, apellidos, DOB, origen, filosofía, historia, retrato o condiciones de vida del entrenador.
- `src/app/game/NewGameUniverseCatalog.ts`: `NewGameConfiguration` ofrece `coachRpgPreset?` opcional, pero ningún `CreateUserCoachProfile` ni payload de identidad.
- `src/app/game/createConfiguredGame.ts`: el preset llega a prototipo y ACB TEST, pero las rutas `worldDbSpain` y NCAA simulada no lo reciben desde esta función.
- `src/engine/world/WorldGenerator.ts`: el `userCoachId` es `coaches[0].id` y su nombre se genera. El perfil profesional rookie admite presets, no un creador humano completo.
- `src/domain/coach/Coach.ts`: Coach es fachada de PERSON canónico + StaffProfile ya existente y debe conservarlo. No crear otro PersonId paralelo ni depender de `createLegacyCoach` para nuevas partidas.
- `src/domain/person/Person.ts`: base real de nombres, fecha de nacimiento opcional, nacionalidad(es), género y posibles referencias. `Coach` necesita preservar la identidad compartida.
- `src/domain/coachRpg/CoachRpg.ts`: aptitudes, skills, perks, rasgos profesionales y XP ya existen, por lo que no inventar otra progresión de entrenador.
- `src/domain/coachFinances/CoachFinances.ts`: estilo de vida y economía personal existentes, actualmente con defaults; reutilizar. No convertir salario y liquidez inicial en valores incongruentes con el pasado elegido.
- `src/app/game/WorldDbSpainGame.ts` y `WorldDbGameBootstrap.ts`: el importador DB conserva fuentes del mundo y determina un entrenador de usuario para el equipo elegido. El creador tendrá que incorporarse mediante una **acción de nueva partida / nuevo técnico** con identidad y empleo coherentes y autoritativos, sin sobrescribir silenciosamente PERSON reales, contratos, historia o incumbentes. DB origen permanece read-only.
- Save V4, career, Governance, TeamStaffAssignment, StaffEmployment, Reputation, Relationships, Memory y Coach RPG son autoridades existentes que hay que usar.

**Conclusión:** ausencia confirmada de creador de protagonista. No afirmar que las pantallas Coach RPG existentes lo sustituyen.

## 2. BS19B · Coach Creator (primera fase funcional, P0)

### Flujo de alta en una NUEVA CARRERA

1. **Quién eres**: nombre, apellidos, fecha de nacimiento, género dentro del soporte del dominio actual, nacionalidad(es) soportadas y presentación visual (retrato/avatar cuando la infraestructura visual esté validada). Ciudad de origen, idiomas y físico solo si tienen fuente/modelo y un consumidor o son metadata verificable, no scores inventados.
2. **De dónde vienes**: trasfondo deportivo plausible: nuevo entrenador, cantera, asistente, analista, exjugador, veterano. Elegir trayectorias disponibles y calibradas; experiencia y reputación inicial derivadas de un historial de arranque coherente, no trofeos ficticios presentados como resultados reales ya simulados.
3. **Cómo entrenas**: identidad táctica, desarrollo, liderazgo, gestión de grupo, análisis y valores. Selecciones comprensibles en lugar de 50 sliders arbitrarios. Crea atributos profesionales y personalidad mediante las autoridades existentes; ventajas y limitaciones reales, no todo alto.
4. **Qué persigues**: ambiciones y orientación profesional. Una meta cambia prioridades de agente/carrera y lectura de decisiones, no sirve solo como texto.
5. **Cómo comienza tu vida**: estado profesional desempleado o appointment válido en club seleccionado. Vida privada/raíces familiares y red inicial **opcionales**, sin imponer un modelo familiar al jugador. Condiciones económicas y residencia/presiones coherentes con la elección, sin simular de forma ficticia contratos ya firmados.
6. **Vista previa y confirmar**: ficha de identidad, perfil, fortalezas, dificultades y oportunidades razonables antes de persistir e iniciar el calendario.

### Contrato técnico del creador

- Un `UserCoachCreationDraft` validado -> `Person` canónico único -> `StaffProfile` coach -> `Coach` fachada -> RPG/personalidad/moral y carrera/economía derivados explícitamente -> `GameWorld.userCoachId`.
- Modelo de identidad único para todas las variantes de creación: prototipo, ACB test, import WorldDB y simuladas. Adaptadores por fuente cuando sus permisos y esquemas divergen; nada de dos creadores.
- Si se elige club con entrenador titular real, la ruta debe aplicar una política explícita y consistente sobre vacante, reemplazo y consecuencias históricas o bloquear; nunca reasignar por detrás un Team/Coach/Staff existente para encajar la UI.
- Cambiar de club no crea nueva persona ni borra relaciones, memoria, reputación, dinero, skills o historia.
- Save V4 roundtrip completo y retrocompatibilidad; partidas anteriores siguen aceptando su manager legacy y no obligan a recrearlo.
- Semilla determinista para valores derivados de elecciones y circunstancias, con igual salida ante los mismos datos/seed. No alterar aleatoriamente un mundo histórico de WorldDB.
- Retrato/imagen, idiomas u opciones sociales complejas son fases graduables: **no bloquear el P0 funcional** si faltan contratos de UI o contenido.

## 3. BS19C–G · Basketball Life Simulator

### 3.1 Vida profesional (núcleo)

Contratos propios, desempleo, candidaturas reales, entrevistas, acuerdos, reputación, relaciones con directiva, cambios de staff, rivales entrenadores, ascensos/descensos, inseguridad laboral, filosofía, desarrollo de habilidades y legado. Gestión de equipos y competiciones por sus motores existentes. Un club puede despedir al protagonista; la partida no termina por perder el trabajo.

### 3.2 Relaciones sociales con memoria

Jugadores, asistentes, superiores, agentes, colegas, rivales, mentores y antiguos clubes reaccionan con perspectiva, personalidad PERSON, oportunidad y evidencia. La compatibilidad inicial es predisposición, nunca una amistad preexistente. Una promesa rota, apuesta por un joven o despido puede afectar durante años la confianza y la carrera. La gente puede tener vínculos fuera del club, siempre originados por interacciones reales simuladas.

### 3.3 Vida fuera del banquillo (diferencial, proporcional)

Dinero y estabilidad personal reutilizando CoachFinances; residencia/traslados cuando exista modelo; formación/cursos; red de contactos, exposición pública, descanso/estrés profesional y compromisos personales opcionales. Decisiones de vida deben afectar disponibilidad, relaciones, estabilidad, opciones contractuales o desempeño cuando haya relación causal y balance, no limitarse a decoración.

Familia/pareja y vida privada pueden existir como opciones de personaje y líneas de eventos **voluntarias**, sin forzar ese contenido ni inventar psicología diagnóstica. Su amplitud exacta requiere decisiones de producto; no introducir un subsistema entero antes de un caso jugable.

### 3.4 Mundo que vive por sí mismo

Otros entrenadores mantienen carreras, rivalidades, cambios de equipo, oportunidades y memorias sin que el usuario los gestione. El jugador puede quedarse sin empleo y seguir asistiendo a entrevistas, formándose, tomando decisiones y contemplando los cambios deportivos del mundo. Eventos nuevos generados por reglas explícitas a partir de contexto real de la partida sí están permitidos: son **hechos del mundo simulado**, con origen y persistencia; nunca el UI fingirá como ocurrido algo que el motor no produjo.

### 3.5 Historias que emergen, no diálogos vacíos

Las tramas son consecuencia de hechos persistidos y elecciones: un ayudante que se marcha y luego rivaliza contigo, jugador al que impulsaste que vuelve como referencia, club que te despidió, oportunidad en otra ciudad con sacrificios, conflicto de vestuario tras una promesa incumplida. BS19 controla hechos, personajes y decisiones; BS20 podrá enriquecer su presentación narrativa sin tomar autoridad de esos hechos.

### 3.6 El límite práctico

No 40 popups diarios, no microgestión de desayuno/vivienda sin consecuencia, no barras psicológicas duplicadas, no cinematografía obligatoria. Menos decisiones y más relevantes; señales de situación acumulada, acciones con deadline y seguimiento. El usuario ve lo importante en Home/Inbox/Coach Courtside sin que las dinámicas queden escondidas.

## 4. Ejemplo de episodio vertical y causal

El entrenador creado empieza a trabajar en un club de nivel modesto. Un asistente real del staff solicita más responsabilidad (`StaffCareerRequest OPEN`). El Coach ve quién lo pide, motivación conocida, vínculo y qué puede conceder la autoridad existente. Elige conceder, rechazar o posponer **solo cuando la API soporte la acción**. El staff modifica expectativas y relaciones por eventos registrados y puede buscar otro club. Años después un nuevo proceso profesional puede poner a ambos en lados distintos; si existe interacción, el sistema recupera recuerdos previos.

Segunda línea de prueba: candidato a otro club recibe oferta documentada cuando tiene circunstancias personales y compromiso contractual; rechazar o aceptar modifica carrera, economía y relaciones conforme a las reglas existentes, sin generar títulos ni ofertas ficticias retroactivamente.

Estas secuencias deben ser reproducibles e inspeccionables en Save, historial, UI e IA.

## 5. Ruta BS19 revisada, orden obligatorio

| Fase | Prioridad | Resultado |
|---|---|---|
| **BS19A** | P0 diseño | Visión protagonista, auditoría de creadores y autoridades. No certificar juego. |
| **BS19B** | P0 construcción | **Creador del entrenador**, identidad PERSON compartida, onboarding, mundo y Save V4, en prototipo primero y adaptadores multiuniverso bajo gate. |
| **BS19C** | P0 construcción | **Primer ciclo jugable de vida del entrenador**: situación / elección / acción / consecuencia / seguimiento, integrado en Coach y la navegación, reutilizando Staff Career, Coach Career, Reputation, Finance y Human State. |
| **BS19D** | P1 | PERSON 50, relaciones y recuerdos reconciliados. Construir vínculo progresivo Coach ↔ staff/jugador/directiva donde haya acciones fuente. |
| **BS19E** | P1 | Vida profesional ampliada, desempleo, crecimiento, elecciones personales significativas, traslado/estabilidad y trayectoria. |
| **BS19F** | P1 | Autonomía de otros actores, eventos emergentes, consecuencias a medio/largo plazo; narrativa basada en hechos. |
| **BS19G** | P0 aceptación por recorrido | Integración Courtside, decisiones contextuales, low-scroll, historia de vida, sin abandonar UX NG. |
| **BS19H** | P0 certificación | 1–30 años, consistencia PERSON y empleo, ramas de carrera, Save V4, determinismo, rendimiento y pruebas visuales/funcionales. |

BS19B no puede ser sustituido por un piloto centrado solo en las solicitudes del staff. Ese flujo puede usarse dentro de BS19C porque ya existe. BS19 debe ser siempre **protagonista primero, mundo vivo alrededor**.

## 6. Criterios de aceptación no negociables

1. El jugador empieza nueva partida creando un entrenador con nombre, DOB, nacionalidad, trasfondo, filosofía y metas; el juego muestra su identidad tras Save/reload.
2. Puede empezar desempleado o con destino autorizado; su carrera persiste incluso sin equipo y puede aceptar futuras oportunidades canónicas. Si el origen elegido no lo soporta aún, mostrar límite real, no un falso éxito.
3. Una elección personal/profesional genera una diferencia real y explicable en un estado canónico, persistido. El mundo puede reaccionar más adelante con la misma memoria histórica.
4. El protagonista conserva identidad al cambiar de club, país, competición o etapa vital.
5. Dos protagonistas de trasfondo/filosofía diferentes enfrentan opciones y consecuencias coherentemente diferentes bajo igual contexto. Comprobar causalidad, no mera variación de texto.
6. Ningún actor sabe datos privados del mundo que no podría conocer; no crear relaciones bilaterales de forma implícita desde predicciones PERSON.
7. El motor ejecuta con/ sin interacción del usuario, con límites de eventos, Save V4 legacy, tests de progresión y sin costes cuadráticos por parejas.
8. La experiencia se juega desde Courtside y tiene causas y opciones legibles. No limitar el PASS a backend y pantallas de estadísticas.

**No hay certificación de ninguna de estas capacidades nuevas en esta auditoría.** La implementación necesita fases aisladas, tests y validación jugable.
