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
