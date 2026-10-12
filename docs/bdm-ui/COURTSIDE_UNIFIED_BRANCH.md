# BDM UI · Courtside · Rama de trabajo unificada

## Rama activa única
`feat/bdm-ui-courtside`

Todas las iteraciones de BDM UI Courtside posteriores a esta integración deben realizarse **solo en esta rama**. No crear por pantalla ramas paralelas ni continuar las ramas históricas `feat/bdm-ui-home-redesign`, `feat/bdm-ui-player-redesign` y `feat/bdm-ui-roster-v4`, salvo autorización expresa.

## Integración realizada
- HOME + escritorio + barras globales: `feat/bdm-ui-home-redesign`, ya ancestro de PLAYER.
- PLAYER: `feat/bdm-ui-player-redesign` con todas las pestañas, datos y pruebas existentes.
- ROSTER V4: `feat/bdm-ui-roster-v4`, fusionada mediante commit de integración de **dos padres** sin resolver por pérdida de una de las ramas.
- Referencias visuales: `docs/visual-proposal` e implementación Courtside original se conservan.

## Normas
- Courtside es la referencia estética canónica **1:1**, no mera inspiración. Sin barra lateral, sin reinterpretaciones no aprobadas.
- Mantener el comportamiento de escritorio/ventanas y navegación que el usuario aprobó.
- Backend, motor, save, datos canónicos y sistemas de Legacy/NG permanecen intactos excepto cuando un cambio ya existente de PLAYER está expresamente incorporado.
- No tocar, forzar, fusionar ni publicar en `main` hasta paridad funcional y autorización del usuario.
- No declarar certificación completa sin typecheck, build, pruebas focales de HOME + barras + PLAYER + ROSTER y comparación visual.

## Próximos pasos
Los diseños y las pantallas de Courtside deben continuar en esta misma rama. Las ramas históricas se conservan como respaldo, pero **no son ramas de trabajo activas**. No eliminar otras ramas o cerrar sus PR sin registrar el reemplazo.

## Nueva autoridad de presentación (ROSTER V5)
- Las anteriores reglas visuales Legacy/NG no son restricciones. La UI Courtside es la implementación de referencia, conservando únicamente el contrato de datos y las acciones canónicas del juego.
- La estética de ROSTER no importa ya `roster-workspace.css` ni `roster-v4.css`; sus componentes visuales y tabla usan `courtside-roster.css` / `CourtsideRosterTable.tsx` sin depender de la pintura NG.
- Los dos temas utilizan los tokens originales Courtside del shell (`--cs-*`). Una pantalla no está certificada si solo cambia la barra superior al alternar tema.
- La vista General usa 11 columnas útiles. El resto se añade mediante vista, gestor de columnas o vistas propias, con preferencias aisladas del grid antiguo (`courtside-roster-v5-*`).
- Toda la personalización (orden, ancho, ordenación, visibilidad, selección) se hace sin tocar la información de `GameWorld`.
- Las vistas legacy, sus preferencias antiguas y los componentes de dominio compartidos continúan disponibles; no se borra funcionalidad por la migración visual.

## ROSTER · Familias Player Truth y acciones Courtside (2026-10-11)
- Una vista **ESTADÍSTICAS** separada y ocho vistas de las familias de `PLAYER_RATING_FAMILY_KEYS` (80 atributos exactos), sin depender de la antigua proyección de 35. Se muestran solo evaluaciones permitidas por el conocimiento organizacional; el desconocido no se revela.
- Selector de **presencia**: jugadores de la plantilla actual o jugadores con **contrato activo con el equipo pero fuera de esa plantilla**. No se introducen agentes libres ni se interpreta la ausencia de contrato registrado como libertad contractual.
- Se sustituye el selector nativo de rol de la tabla Courtside por el menú de rotación propio de BDM, conectado a las acciones canónicas. Fuera de la plantilla, o sin control del equipo, la edición está deshabilitada.
- Editor de columnas superpuesto y fuera del flujo de la tabla para no desplazar filas; preferencias visuales aisladas por versión `courtside-roster-v6-*`.
- Las ocho vistas ofrecen cada atributo real con etiqueta propia en castellano y columnas configurables; las vistas anteriores y las personalizadas se conservan como posibilidad independiente.

## STAFF Courtside · ST-UI 1 · Primera integración jugable (2026-10-12)

- Rama de trabajo única `feat/bdm-ui-courtside`; nunca fusionar a `main` sin autorización.
- Portada departamental reconstruida como dirección deportiva: personal contratado, vacantes realmente abiertas, sobrecarga real y solicitudes; no tratar los objetivos cosméticos `UI_ROLE_STAFFING_TARGET` como contratos ni plazas abiertas.
- Seis pestañas principales: STAFF, ASIGNACIONES, ASESORÍA, DINÁMICAS, MERCADO, COMPARATIVA. Las cuatro últimas pantallas previas de asignaciones, asesoría, dinámicas y ficha de persona se preservan funcionalmente, aunque todavía se debe sustituir el CSS residual NG y rediseñar dossiers/inspector.
- MERCADO: operaciones de StaffCareerService, con vacante real, candidatos elegibles y filtrados por puesto, identificación, entrevista, oferta y confirmación explícita; se exige disponibilidad económica y elegibilidad del dominio. No se inventan empleados, presupuestos o fichajes.
- COMPARATIVA: usa el conjunto de participantes de una edición Season y compara media de idoneidad por equipo solo para el mismo StaffRoleId. Cuando no existe personal de ese puesto se muestra sin datos. Esta métrica no representa rendimiento observado ni simula predicciones.
- Todas las acciones mutantes se realizan contra el mundo canónico vía `replaceWorld`, y deben probarse en partidas reales antes de certificar el circuito de Save/reload.
- Próximas subfases necesarias antes de certificar STAFF completo: dossier individual Courtside, dinamicas y asesoría con evidencias y registro longitudinal, experiencias avanzadas de asignación y contratos (despidos/promociones), permanencia Save/Load, valoración visual en oscuro/claro.

### ST-UI 1.1 · Facilidad y RPG basado en hechos
- ASIGNACIONES conserva su matriz avanzada original y añade **MODO SENCILLO**: tarea → responsable → menú de candidatos canónicos (dos clics desde la tarea). Los modales de Autoassign/Optimizar y sus validaciones no se duplican.
- ASESORÍA muestra una sala de decisiones con autores reales de `delegationOutcomesById`, datos de origen, estado e historial; no genera opiniones, desacuerdos o impactos ficticios. Reutiliza acciones existentes de aceptar/descartar.
- Las evoluciones de competencia, sesgos, legado de decisiones y «cerebro de club» multiopinión quedan como extensión posterior no certificada. No afirmar paridad con FM24.

### ST-UI 1.2 · Compactación transversal / first useful pixel (2026-10-12)
- Causa raíz: ApplicationWorkspace reservaba `--ng-workspace-header-height:122px` para la segunda fila pese a una cabecera visual de ~63px; se corrige a 50px y tabs a 39px **en STAFF Courtside**, no globalmente.
- COMPARATIVA: filtros junto al título en una cabecera operacional; ranking visible primero; cuatro estadísticas relegadas a la columna de información del club. Mismos cálculos y mismos datos.
- MERCADO: botón de vacante en cabecera superior y filtros junto a lista; estadísticas secundarias a la columna lateral; mismo StaffCareerService.
- ASESORÍA: las recomendaciones accionables aparecen antes de la sala histórica de decisiones.
- STAFF: portada y departamentos más densos, sin cartelas de altura forzada; ficha de departamento abre primero la tabla de profesionales y después sus cuadros analíticos.
- ASIGNACIONES: barra de estado reducida, el modo sencillo y la matriz avanzada se mantienen.
- Se conserva adaptación oscuro/claro mediante tokens Courtside; la aceptación visual real requiere capturas del usuario.

### ST-UI 1.3 · Visual authority Courtside across all STAFF screens (2026-10-12)
- Canonical **visual authority is approved HOME/PLAYER Courtside**. All earlier NG styling is subordinate and may be replaced regardless of prior design decisions; domain game logic and actions are preserved.
- New `courtside-staff-v2.css` loaded after the old functional layout CSS: palette, display and reading fonts, 13px minimum controls, buttons, toggles, tables, data grids, badges, load/coverage bars, inspectors, staff drawers, contextual menus, role popovers, modal dialogs, market, comparisons, advisory and dynamics. The old NG visual tokens are remapped to the single Courtside dual-theme palette.
- Explicitly applied to STAFF overview, ASIGNACIONES, ASESORÍA, DINÁMICAS, MERCADO, COMPARATIVA, departments and individual STAFF profile (including empty states). All links and operations remain on their existing sources of truth.
- Assignment summary replaces misleading 'VACANCIES' label by 'SIN RESPONSABLE': responsibility coverage is not a count of open employment jobs. Table columns and inspector heading revised into Spanish to match the rest of the interface.
- No guarantees of screenshot fidelity or empirical WCAG results from TypeScript/build CI alone. Visual acceptance requires testing the user's actual light/dark screens and the assignment popovers.

### ST-UI V3 · Structural UX and blocked popover (2026-10-12)
- UI authority: approved Courtside HOME/PLAYER, not inherited NG. `courtside-staff-v3.css` defines STAFF-specific layouts without changing domain model.
- The quick assignment popover now places itself above or below according to measured free space within the transformed shell, constrains its own height and scrolls its candidate list. Each candidate and each responsibility is a single row (the advanced inspector is still available on demand).
- ASESORÍA replaces NG spreadsheet with a decision inbox, professional provenance, status, full canonical inspector and real accept/dismiss actions. Empty state uses actual zero records.
- DINÁMICAS PERSONAS replaces NG spreadsheet with a selectable Courtside-focused people list sorted by needsAttention and backed by canonical human state; other subviews retain functionality and are styled using Courtside theme tokens.
- COMPARATIVA now leads with actual role-by-role club-versus-league diagnostic and a selected role inspector, rivals, and expandable league rankings; comparisons restricted to current competition edition and same job role.
- Tabs display **CONSTRUYE TU STAFF** instead of **MERCADO**; route and domain ids remain the same.
- Pending: visual acceptance across dark/light, scaled shell, various viewport sizes and real game state Save/Load.
