# BDM Courtside | Scouting y Mercado | Auditoría y plan V1

Fecha: 2026-10-17
Rama de trabajo: `feat/courtside-scouting-market-v1`
Base: `feat/bdm-ui-courtside`

## Resumen ejecutivo

Scouting tiene simulación canónica significativamente más profunda que su UI actual. Mercado tiene ejecución real de agencia libre y rutas de trades, pero su workspace visual se reduce a agentes libres e historial de negociaciones. El problema principal es el recorrido fragmentado desde una necesidad deportiva hasta la decisión y la firma.

**Decisión de producto:** Scouting pertenece a la categoría Mercado, no Equipo. Debe conservarse como workspace propio y estar enlazado desde el centro de Mercado. No se fusionan motores, no se reemplazan transacciones, no se fabrican recomendaciones ni evaluaciones de jugadores ocultos.

## Auditoría del Scouting actual

| Área | Disponible y verificado en código | Límite UX / carencia | Acción |
| --- | --- | --- | --- |
| Asignaciones | Misiones Quick Look / Full Report / Skill / Potential / Tactical Fit / Live Game, prioridad, cancelación, asignación a staff | Entrada por tabla, poca lectura de misión global | Nuevo Centro de Inteligencia con estado agregado y acceso a asignaciones |
| Conocimiento | OrganizationKnowledge, confidence, freshness, disagreement, unknown fog-of-war | Datos útiles enterrados en tablas; no expediente longitudinal | Próxima fase: expediente vivo y línea temporal |
| Territorios | Cobertura COUNTRY / COMPETITION, descubrimiento y desgaste staff | La red no se percibe como sistema territorial; no existe visualización geográfica | Resumen gráfico de zonas reales en V1, mapa con geometría real pendiente |
| Focos | Briefs por perfil, posición, edad, territorio, evaluaciones y scouts; persistencia canónica | Criterios largos; edición/reactivación parcialmente cubierta | Tarjetas con progreso visible y editor más directo |
| Informes | Evidencia y reportes inmutables, evaluaciones con incertidumbre | Lectura dominada por texto; falta contraste visual de desacuerdos | Próxima fase: dossier de evidencia comparada |
| Staff | Capacidad, idoneidad por rol y workload real | Detectar sobrecarga exige visitar paneles | Alerta visual del estado del departamento en V1 |
| Oposición | Informes existentes | Desconectado del resto de inteligencia, pero no debe perderse | Conservar apartado y enlazar con Tácticas en fase posterior |
| Navegación | Ocho pestañas, workspace NG funcional | Se abre en Knowledge; Scouting también aparece en Equipo y Talent | Abrir en Centre y mover al grupo Mercado |
| FOW | Estimaciones conocidas, ausencia de ratings externos ocultos | Riesgo de nuevas vistas que filtren PlayerTruth | Regla obligatoria y tests de regresión |

Fuente de realidad: `BS14_SCOUTING_CAPABILITY_MATRIX.md`, `ScoutingWorkspace.tsx`, `buildScoutingWorkspaceModel.ts`, `ScoutingEngine`, `ScoutingOperationsService`.

## Auditoría del Mercado actual

| Área | Qué hay | Carencia de presentación / integración |
| --- | --- | --- |
| Agentes libres | Listado, filtros, inspector, valoraciones a partir de conocimiento disponible | UI monopolizada por una tabla y una inspección limitada |
| Contactos y ofertas | Servicio de preparación, contacto, oferta, contraoferta y firma | Todo aparece como párrafos largos debajo de los agentes libres |
| Aprobación institucional | Governance y aprobaciones vinculantes reales | El usuario no ve un flujo de hitos y bloqueos claro |
| Trades | TradeCenter y motor BS10 con reglas reales | Ruta aparte sin vista de dirección común; no debe activarse en ligas sin trades |
| Planificación de plantilla | Club needs / contract planning y conocimiento de mercado canónico | La pantalla principal no conecta necesidades, focos, conocimiento y operaciones |
| Scouts y recruiting NCAA | BS14/BS15 canónicos y workflows separados | Navegación compartimentada, sin unión de decisiones |
| Transferencias y buyouts | No hay cierre canónico del flujo general | No simular ni representar como operación disponible |
| Histórico de decisiones | Evidencias y resultados persistidos | Falta una memoria deportiva consultable con contexto original |

Fuente de realidad: `BS10_MARKET_CLOSURE.md`, `MarketWorkspace.tsx`, `MarketService`, `marketIntelligence`, `TradeGovernanceExecutionService`.

## Propuesta de arquitectura Courtside

### Mercado: hub estratégico

- **Centro de mercado:** lectura de necesidades, focos, presupuesto, conocimiento, misiones y operaciones. Debe responder «¿dónde debo actuar?».
- **Explorar:** agentes libres, búsquedas de jugadores conocidas y oportunidades identificadas. Evitar listado global que filtre verdades privadas.
- **Objetivos:** board por posiciones/necesidades, candidatos, estado de exploración, encaje estimado, comparación contra plantilla y plan de contratación.
- **Operaciones:** pipeline real de contactado, respuesta, negociación, governance, firma, trades si procede, y rutas NCAA.
- **Planificación:** 6/12/24 meses, vacantes proyectadas con contratos y reglas, presupuesto y profundidad de plantilla. No habrá «probabilidad de fichaje» sin modelo canónico.

### Scouting: sistema operativo de inteligencia

- **Centre:** radar real de inteligencia, nuevas señales, cargas y acciones.
- **Buscar / Focos:** comenzar por perfiles, no por una tabla inmensa de nombres.
- **Red:** mapa territorial interactivo con países y competiciones reales; sin inventar coordenadas. 
- **Operaciones:** misiones, asignaciones, prioridades, staff y dedicación.
- **Expedientes:** conocimiento, informe, fuentes y discrepancias.
- **Rivales:** oposición, sin romper el puente con tácticas.

La navegación bajo Mercado no elimina las ventanas independientes ni Talent Operations, Recruiting, Draft, Portal o Trades. Estas áreas mantienen sus reglas por ecosistema.

## Ideas a construir, separadas de los sistemas existentes

1. **Expediente vivo y retrospectivo:** guardar una lectura del conocimiento que tenía el club al decidir, y contrastarla años después con el resultado. Requiere un snapshot de decisión con fuente y fecha, no PlayerTruth retrospectiva.
2. **Mesa de conflicto entre ojeadores:** incertidumbre y discrepancia explícitas. El usuario decide si pide segunda opinión, otro evento real o cierra la evaluación.
3. **Sala de hipótesis de plantilla:** comparar necesidades y escenarios de contratación sin tocar el mundo hasta ejecutar. Los números simulados deben indicar claramente su fuente y supuestos.
4. **Red de confianza:** medir precisión histórica de evaluadores por país, liga, dimensión, misión y rol. Nunca asignar reputación inventada sin datos acumulados.
5. **Mercado de señales:** oportunidades públicas, rumores con fiabilidad, movimientos confirmados y carreras NCAA/NBA/FIBA. Requiere motor de noticias/evidencia con permisos y actualización canónicos.
6. **Misiones combinadas:** campaña de scouting con observaciones de varios scouts y visión comparada, respetando su capacidad, horario y territorios.
7. **Memoria de oportunidades perdidas:** el juego explica por qué se descartó un objetivo, qué información tenía el club y qué ocurrió después, sin atribuir al usuario decisiones que no hizo.

## Entrega de primera fase en rama aislada

- Scouting reubicado en grupo **Mercado** tanto en catálogo NG como en launcher de escritorio.
- Workspace Scouting funcional en el desktop host, con puente a navegación de entidades existente.
- Scouting abre en **Centre** con War Room Courtside: datos canónicos, misiones, carga, zonas, focos y señales.
- Mercado abre en un **Centro de mercado** Courtside: recorrido desde necesidades hasta negociaciones, presupuesto real, últimos informes y CTA hacia Scouting.
- Acciones de agentes libres y operaciones conservadas en pestañas con su lifecycle intacto.
- Responsive desde tamaños amplios a ventanas medianas, usando variables cromáticas de Courtside para temas claro y oscuro.
- Nuevos tests de rutas y fog of war; actualización de tests con nueva pestaña inicial.

**Estado de pruebas:** cambios enviados a GitHub. No se ha ejecutado typecheck, build ni smoke visual local en este entorno; la certificación PASS no se declara aquí.

## Riesgos y puertas de certificación

- P0: nunca exponer ratings/potencial verdaderos de jugadores externos ni datos privados de rivales; comparar únicamente información autorizada y con incertidumbre.
- P0: no duplicar estado de Scouting/Market, no crear fichajes ni ofertas fuera de las autoridades BS10/BS14/BS15.
- P0: no habilitar trades/transferencias fuera de reglas de competición y capacidades activas.
- P1: comprobar navegación entre desktop y NG, incluida apertura de ficha y deep-link desde Player Contract.
- P1: certificar contraste real en tema claro y oscuro, altura de cabeceras, density, sin exceso de scroll y modal legible.
- P1: comprobar tipos, suite focal, build y persistencia V4.
- P2: diseñar y aprobar las nuevas interfaces de objetivos, red territorial real y mesa de decisión antes de ampliar motores.
