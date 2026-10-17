# BS19 · Registro de decisiones del propietario y conciliación con RPG previo

**Fecha:** 2026-10-17 · **Fuente:** respuestas del propietario a las preguntas 1–100 del cuestionario BS19, contrastadas con el trabajo anterior BDM y BDM-DB.
**Estado:** `DECIDIDO` donde la respuesta es inequívoca, incluidas 3, 41 y 88 confirmadas posteriormente; `PARCIAL` en puntos que él mismo ha condicionado. El estado de producto **NO** significa implementación.
**Objetivo de esta hoja:** impedir que se pierda el RPG diseñado con anterioridad, o que una nueva encuesta sustituya el canon HRPG y B11 ya discutido.

## A. Identidad del producto · DECIDIDO

- BDM es un **simulador de entrenador con RPG**, **80 % gestión deportiva / 20 % vida RPG** (1–2), no un simulador de vida ante todo. Este es el objetivo de tiempo/experiencia, no un porcentaje de ejecución diaria fijo.
- Lo excepcional debe provocar “esto es lo que me faltaba” respecto a Football Manager (4).
- Mundo abierto con triggers orgánicos, partidas irrepetibles (5–6, 80), libertad para crear un alter ego distinto y ser un gran entrenador con carácter conflictivo (7–8).
- Fracaso sin cierre automático de la partida (9); acciones ilegales como dirección diferencial explícita (10).
- **P3 = B, DECIDIDO: realismo con dramatización.** Los hechos deben tener causas, actores, oportunidad y consecuencias verosímiles; puede haber excepcionalidad narrativa moderada sin forzar crisis, conspiraciones o delitos cada semana. La simulación sigue gobernando hechos y evidencias.

## B. Coach Creator · DECIDIDO / POR FASEAR

- No desea editor de rostro/cuerpo ni retrato como eje del creador (11 = “no”). No imponer carga visual.
- Identidad, origen, traits, atributos, personalidad y datos personales (12–13).
- Biografía libre **y** origen guiado; historias de origen **con consecuencias sistémicas**. Ejemplo aprobado: origen con **deudas** -> presión financiera y urgencia por empleo -> decisiones y efectos reales en atributos si no puede pagar (14–15). No solo texto de background.
- Opciones de experiencia previa y puesto inicial (16), con gate: actual juego no tiene bucle jugable de ayudante; el propietario acepta diferirlo por ahora (33).
- Filosofía más amplia que «ofensivo/defensivo»; dilemas/cuestionario o asignación manual; creador libre o con presupuesto, ambos modos (17–19).
- Historia previa con clubes, amistades y conocidos opcional (20). Es origen seleccionado y simulado; no falsificar historia oficial WorldDB.
- Comienzo a elegir: desempleado / club elegido válido / ofertas proporcionales al perfil, con agente propio (31–32, 35–36).
- Club + selección nacional potencial, pero NT aún sin implementar (34, fase futura).
- Posibilidad de ejercer/invertir y compartir varios roles profesionales como propietario y dirigente, **PARCIAL** en alcance y permisos (39).
- Selector en creador de **«experiencia basket» / «experiencia rpg»** para ajustar intensidad (90). Mantener simulación canónica e impactos, variar exposición/frecuencia de intervención, no anular coherencia para NPC.

## C. Personalidad y progresión · DECIDIDO

- PERSON50 debe alterar el comportamiento real y evolucionar causalmente (21–22, 25).
- Rasgos ocultos descubribles según orígenes/traits si afectan al juego, miedos/inseguridades/resentimiento/confianza solo con efectos jugables (23–24).
- Separar verdad interna, autopercepción y reputación/percepción externa (26).
- Valores lealtad, ambición, honestidad, reconocimiento, competencia; choques internos y conflictos (27–28).
- Motivación/satisfacción/presión/agotamiento, negociación y rendimiento afectados de forma realista, sin cifras decorativas (29–30).
- Reputación contextual por territorio/nivel/competición; negociación contractual y posibilidades de rechazar ofertas por lealtad, condiciones y prioridades (37–38,40).

## D. Vida personal y patrimonial · DECIDIDO salvo 41

- **P41 = B, DECIDIDO: vida personal gestionable.** El usuario dirige activamente agenda, relaciones, hogar/residencia, patrimonio, inversiones, negocios, estudios, aficiones, compromisos y decisiones vitales con consecuencias. No exige microgestión de rutinas triviales ni carga de eventos diarios. Dejar ampliación futura de profundidad sin alterar identidad o partida guardada.
- Pareja, hijos y familia deben existir, **profundidad PARCIAL** (42); amistades no deportivas y consecuencias (43).
- Ciudad/residencia, vivienda, cambio de país, idioma/cultura conforme a atributos (44–45).
- Aficiones, estudios, descanso, formación, actividad social y agenda integrada con disponibilidad y exclusión de compromisos (46, 85–86).
- **Finanzas personales, patrimonio, negocios e inversiones = capa vital y control directo total del jugador**; no resumir en lifestyle pasivo (47,50). Eventos personales pueden desaconsejar una gran oferta deportiva (48).
- Salud, cansancio, estrés, vida-trabajo con efectos; eventos familiares difíciles opcionales y de intensidad configurable (49,92–93).
- El propietario desea **gestionar su vida**, no recibir solo simulación automática con dos elecciones al año (50).

## E. Relaciones, instituciones y política · DECIDIDO

- Posibilidad de relación con casi cualquier PERSON relevante **cuando exista acceso/interacción verosímil**; no omnisciencia (51).
- Diferenciar profesional, amistad, mentoría, rivalidad y vínculos privados; opiniones asimétricas; memoria décadas; incompatibilidad real (52–55).
- Grupos de amigos, facciones, influencia, mentores, traiciones, reconciliaciones, exjugadores, lealtades, oportunidades y rendimiento afectados (56–60).
- **Presidente, propietarios, directivos y Board deben tener tanta profundidad humana como jugadores** (61: el propietario lo reafirma; ya era doctrina BDM). Autoridades existentes: `src/domain/board`, `src/domain/governance`, `src/domain/ownership`, `src/domain/relationships`, `src/domain/staffPolitics`; no significa que sus interacciones humanas estén ya completas.
- Red de contactos, oportunidades legales y **shady**, intereses contrarios, política interna y actuación sin poder formal (62–65).
- Agentes difíciles, medios, filtraciones, rumores, redes, fans, reputación pública, compromisos incumplidos, manipulaciones y culturas diferenciadas por club (66–70).

## F. Evento, conversación, autonomía y presentación · DECIDIDO

- Eventos autónomos solo cuando algo relevante ocurra, **además** de acciones iniciadas voluntariamente por el usuario (71).
- Interacciones cortas y episodios largos coexistentes (72); respuestas dirigidas, acciones y **texto libre interpretado por la simulación** (73–74). La interfaz no debe declarar éxito porque un texto lo afirme.
- **Ocultar las consecuencias futuras**; resultados de elecciones pueden ser irreversibles, diferidos o sin respuesta; ignorar tiene efecto, sin revelación de resultados de antemano (75–80).
- Solo protagonista bajo control humano, IA autónoma con objetivos y vidas tan profundas como los demás entrenadores; el mundo continúa fuera de cámara (81–84).
- Calendario personal deportivo y extradeportivo; restricciones de tiempo y delegación (85–87).
- **P88 = B, DECIDIDO: Coach con subsección «Vida».** Coach conserva identidad/carrera/desarrollo, y la subsección Vida reúne contexto personal, agenda y puntos de acceso a relaciones, hogar y patrimonio. Home, Inbox y calendario son puertas contextuales, no duplicados de los sistemas canónicos. Mantener Courtside 1:1 y navegación NG.
- Mostrar **percepción legible**, no números de personalidad/relaciones (89). Esto no elimina las puntuaciones internas de PERSON50.
- Envejecer cambia oportunidades, capacidades, prioridades y circunstancias (91).

## G. Final de vida y legado · DECIDIDO

- Jubilación voluntaria, retorno potencial, cierre definitivo por mortalidad/biografía y sucesión jugable con otro entrenador, conservando universo y memoria histórica (94,98–99).
- Legado no solo títulos: discípulos, jugadores formados, ideas, trayectorias, influencia, redes (95–97).
- Los exjugadores pueden convertirse en entrenadores y conservar memoria de sus relaciones (96).
- Aspiración de fantasía de rol contrastada: sentirse un gran estratega del baloncesto **o** dirigir una carrera moralmente turbia y política; no extrapolar acusaciones reales sobre personas nombradas (100).

## H. Arquitecturas y contenidos previamente acordados que el cuestionario NO puede borrar

### HRPG1–HRPG18 · especificación histórica recuperada de conversaciones 2026-09-22/23

1. HRPG1 Event Foundation.
2. HRPG2 Trigger Engine.
3. HRPG3 Human State.
4. HRPG4 Relationships.
5. HRPG5 Memory.
6. HRPG6 Resolution.
7. HRPG7 Consequences.
8. HRPG8 Chains (`SEED -> DEVELOPMENT -> ESCALATION -> CRISIS -> RESOLUTION -> AFTERMATH`).
9. HRPG9 Knowledge & Secrets.
10. HRPG10 Rumours & Leaks.
11. HRPG11 Conversations.
12. HRPG12 Media Narrative.
13. HRPG13 Human AI.
14. HRPG14 Manager Interaction.
15. HRPG15 World Integration.
16. HRPG16 Debug/Inspector.
17. HRPG17 Content Library.
18. HRPG18 Certification.

Norma previamente aprobada: **REALIDAD != CONOCIMIENTO != NARRACIÓN**. Cada hecho tiene emisor, evidencia, destinatarios/observadores y reglas de difusión. No se puede contar como verdad lo que solo es rumor. Triggers no solo de rendimiento: estados, transiciones, tiempo, repetición, comparación, equipo, finanzas, contrato, gobierno, relación, instalación, físico, competencia y combinaciones. Eventos largos causales con memoria y decisiones; motor activado por sucesos, no O(N²) diario.

**Estado:** arquitectura detallada pactada, no evidencia de que HRPG1–18 estén implementados como un motor transversal completo en `main`. Las áreas actuales están repartidas entre Relationship, Personality, Memory, StaffHumanState, StaffConflict/Politics, Narrative, Media, Coach y Governance. No crear una segunda autoridad.

### Economía personal / oscura B11 · alcance acordado antes

- B11.21 Personal Economy & Wealth: ingresos, gastos, deudas, patrimonio, inversiones.
- B11.22 Business / Ownership / Investments: sociedades, negocios, participaciones, compra/fundación de clubes, inversiones, capital y riqueza histórica.
- B11.23 Benefits / Conflicts / Hidden Economy: regalos, favores, comisiones, sobornos, operaciones opacas, conflictos de interés, propietarios reales/testaferros, corrupción y misconduct financiero. Extensiones debatidas: fraude/evasión, apuestas/amaños, blanqueo, chantaje, influencia.
- Separar **movimiento económico**, **legalidad**, **declaración/transparencia**, **conocimiento del hecho**, **evidencia** y **riesgo/resultado legal**. B11 registra la economía; eventos/Enforcement/Governance gobiernan consecuencias. Nunca modelar un acto ilícito como recompensa sin sanciones potenciales o costes.
- Conexiones Coach ↔ propietario/Board/presidente/agente/proveedor/patrocinador/inversor, negocios y conflictos de interés.
- **Estado:** alcance de diseño previo; `CoachFinances` en `main` tiene salario, estilo de vida, inversiones, deudas, activos, otros ingresos y mensualidad, pero NO prueba que B11.22–23 ni el delito jugable estén conectados al RPG. BDM-DB generadores/DDL distintos del runtime.

### PERSON WorldDB V2 · dependencias ya trabajadas

- [BDM-DB PR #68](https://github.com/audifor/BDM-DB/pull/68): 50 dimensiones + traits y life events en prueba DDL-12.
- [PR #69](https://github.com/audifor/BDM-DB/pull/69): familias, hogares, pareja, amistad, rivalidad, dependencia y responsabilidad entre personas reales del fixture.
- [PR #74](https://github.com/audifor/BDM-DB/pull/74), [#76](https://github.com/audifor/BDM-DB/pull/76): 50 dimensiones con semántica y proyección/persistencia de ensayo.
- [#75](https://github.com/audifor/BDM-DB/pull/75), [#77](https://github.com/audifor/BDM-DB/pull/77): afinidad personal, encaje profesional y fricción según PERSONALIDAD50, **sin fabricar relación histórica**.
- [#78](https://github.com/audifor/BDM-DB/pull/78): 75 traits PERSON; [#79](https://github.com/audifor/BDM-DB/pull/79), [#81](https://github.com/audifor/BDM-DB/pull/81): 75 tipos de acontecimientos con evidencia; [#80](https://github.com/audifor/BDM-DB/pull/80): evolución PERSONALIDAD50 por acontecimientos.
- [#88](https://github.com/audifor/BDM-DB/pull/88): STAFF 20 tendencias, 50 filosofías y 40 proyecciones profesionales de PERSON50, pendientes de plena certificación/integración.
- [BDM PR #122](https://github.com/audifor/BDM/pull/122), [#123](https://github.com/audifor/BDM/pull/123): puente PERSON50, Save, efectos y compatibilidad condicional, todavía fuera de `main`.
- Estas PRs seguían **draft/abiertas** en auditoría. Focal CI no significa juego RPG conectado ni implementación completa.

## I. Huecos que QUEDARON FUERA de las 100 preguntas, sin convertirlos en nuevas decisiones

1. **Límites y progresión del poder real**: entrenador, DD, GM, inversor, consejero, propietario; roles simultáneos, conflictos, cesión de control y recusal.
2. **Dinero origen -> carrera**: calendario de pagos, acreedores, riesgo de insolvencia, necesidad de aceptar ofertas, negocio propio, salario real vs consumo y deudas personales.
3. **Actos ilegales**: alcance de acciones jugables y moral, exposición, conocimiento/evidencia, confidencialidad, testigos, investigación, sanciones y efectos a 20 años.
4. **Verdad / observador / rumores**: quién sabe, quién cree, quién finge saber, cómo circulan secretos, chantajes y filtraciones.
5. **Promesas de PERSON a PERSON y de club a PERSON**, verificables, con obligación/deadline, incumplimiento/reparación/olvido.
6. **Modelo de conversación**: interpretación de texto libre, validación de intención frente a resultados, límites de acceso, memoria del diálogo, conflictos con IA y transparencia de falla sin falsear hechos.
7. **Tempo y prioridad**: eventos iniciados por jugador vs automático, plazos, consecuencias de omisión, carga de agenda, exposición e intensidad sin fabricar dramas.
8. **Proceduralidad vs contenido**: motor de resolución, bibliotecas de situaciones, eventos encadenados y facciones sin guiones que reemplacen hechos.
9. **Reputación y riesgo multidimensional**: pública/profesional/local/vestuario/Board/medios/integridad/influencia; distinguir conocimiento de rumor.
10. **Familia social como PERSON reales**: vínculos, edad/DOB, residencia, hogares, responsabilidades y herencia/sucesión, con decisiones de privacidad.
11. **Fin del protagonista**: caducidad de vida, sucesión, cambios de rol, legado del mundo y preservación exacta de historia/relaciones.
12. **Inspección/QA**: explicación causal para desarrollo (HRPG Inspector) aunque UI del jugador oculte consecuencias y cifras internas.

Estos son **temas a reubicar frente a la especificación ya aprobada, no 12 subsistemas nuevos sin auditoría**.

## J. Cierre de las preguntas 3, 41 y 88 · DECIDIDO

Respuestas explícitas del propietario el 17/10/2026:

| Pregunta | Valor elegido | Definición canónica |
|---|---|---|
| **3** | **B — Realismo con dramatización** | Los acontecimientos pueden ser extraordinarios, pero tienen causalidad, frecuencia razonable, evidencia y consecuencias. No guiones ni escándalos recurrentes obligatorios. |
| **41** | **B — Vida gestionable** | El jugador gestiona activamente relaciones, patrimonio, vivienda, agenda, tiempo, oportunidades y compromisos personales; evita simulación doméstica microscópica obligatoria. |
| **88** | **B — Coach con subsección Vida** | Coach es el hub del protagonista, con **Vida** como subsección dedicada. Home, Inbox y calendario muestran o abren sucesos relevantes. Sin módulo RPG paralelo ni duplicar Finanzas/Relaciones. |

### Regla transversal aprobada: profundidad ampliable, no techo definitivo

La opción **B** es el **alcance inicial y equilibrio de producto**, nunca un límite rígido o irreversible. El jugador podrá beneficiarse de mayor profundidad cuando se desarrolle, manteniendo su entrenador y partida. En concreto:

1. Construir primero las capacidades jugables de **Vida gestionable**. Más adelante se pueden añadir subactividades opcionales en familia, propiedades, negocios, agenda, salud, redes sociales y política **sobre las mismas entidades PERSON, CoachFinances, Career, Memory, Relationships y Governance**, no mediante identidades paralelas.
2. Conservar la elección del creador «experiencia basket» / «experiencia RPG» como **preferencia de intensidad y participación** (avisos, decisiones, frecuencia de exposición, detalle de interacción), no como interruptor que destruya el estado del mundo o prive a los NPC de personalidad.
3. Si futuras ampliaciones aumentan profundidad, introducir controles granulares y opcionales por ámbito, sin imponer microgestión obligatoria ni mover el ratio 80/20 para jugadores que prefieran gestión deportiva.
4. Añadir nuevas pestañas o paneles **dentro de Coach > Vida** solo si aportan acciones y contenido únicos. Conservar las rutas y decisiones en Home/Inbox/Calendario y los responsables canónicos de Patrimonio/Relaciones.
5. Compatibilidad: ampliaciones aditivas con **Save V4/versión vigente y migraciones** que preserven ID del protagonista, historia, dinero, vínculos y acontecimientos. Una preferencia nueva tendrá valor por defecto para partidas antiguas; una nueva actividad no modifica retrospectivamente lo sucedido.
6. **Más dramatización futura**, si se aprueba, no significa crear hechos falsos, romper la causalidad o forzar conflictos. Extender variedad, sensibilidad a contexto y cadenas de acontecimientos según reglas, con equilibrio verificable.
7. Todo esto es **política de arquitectura y roadmap**, no una afirmación de que pueda alterarse hoy en una versión jugable. Implementación, QA, UX y persistencia se certificarán fase a fase.

**No quedan preguntas pendientes de las tres aclaraciones; sí quedan otros alcances de diseño marcados PARCIAL en los apartados anteriores.**
