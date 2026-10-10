# Certificación visual · Courtside escritorio (rama feat/home-courtside)

Alcance: solo escritorio, dirección `src/b.css`. Sin rediseño. Scripts reproducibles en `qa/scripts/` (Playwright; `PW_CHROMIUM` opcional).

## Incidencias

| # | Incidencia | Causa | Corrección | Resultado |
|---|---|---|---|---|
| 1 | Pestañas y filtros de Plantilla pegados a la izquierda a 2560 px | `b.css` `.tabs{max-width:100%}` pisaba el contenedor de 1880 px | `b.css`: `.page>*{max-width:1880px;width:100%;margin-inline:auto}` (≥1280) | PASS: contenido 1880 px en 56/56 pantallas a 2560 |
| 2 | Finanzas > Deuda: 4 KPI apiladas, de 39–47 px, con 1000 px de hueco | `layoutModules()` trataba la rejilla anidada `.s12.grid` como columna flex | `app.js`: solo rejillas de primer nivel; `finances.js`: KPI directas en la rejilla (como el resto de pestañas) | PASS: 4 KPI en talla S (220), sin hueco |
| 3a | Emparejamientos: filas de duelo de 248 px, tercera recortada | Misma causa que 2 (rejilla anidada dentro de una tarjeta) | `app.js` (mismo cambio) | PASS: 5 duelos visibles, contenido íntegro |
| 3b | Entreno > Equipo: banda diagonal rotada tapando la planificación | Colisión de clase: `.btn.ghost` heredaba `.ghost` (fantasma de arrastre: fixed, rotate 4°, 1918×166) | `b.css`: `.ghost:not(.btn)` | PASS. Afecta a todas las pantallas con `btn ghost` (ver abajo) |
| 4 | Nombres truncados (Plantilla, Profundidad, Pizarra, Clasificación, Asignaciones) | Columnas/filas sin ancho útil a 1280–1599 px; en Asignaciones la etiqueta tapaba el nombre a todos los anchos | Tabla `.fit` (relleno local) y `min-width` de columna; filas con `flex-wrap` en Profundidad/Pizarra/inspector/masa salarial; organigrama: etiqueta bajo el cargo y nodos de 220 px | PASS: 0 truncados y 0 solapes de texto, 1280–2560 |
| 5 | Tallas 220/320/440/560/720/920, barra 68 px, iconos 48 px | — | Sin cambios | PASS: 234 módulos en talla, 56/56 con barra 68 px e iconos 48×48 |

Sin ocultar contenido ni usar tooltips. Pendiente fuera de alcance: en Asignaciones, la columna «Responsabilidades» muestra «Dr.» por cortar el nombre por el primer espacio (dato del mockup).

## Barrido (tema oscuro; claro a 1280/1920/2560)

Anchos 1280, 1366, 1440, 1600, 1920, 2560 × 56 pestañas: 0 módulos fuera de talla, 0 recortes/sobresalidos, 0 solapes de módulo, 0 solapes de texto, 0 truncados, 0 scroll horizontal (página y módulos), 0 huecos a la derecha. Antes (1280): 41 truncados, 22 solapes de texto y scroll horizontal en Plantilla; (2560): 55 pantallas desalineadas.

## 112 referencias a 1920 px

Dimensiones idénticas en las 112. 73 son idénticas (0,000 % tras desenfoque anti-JPEG, umbral 24). 39 difieren, todas atribuibles a una corrección:
- `.ghost` (incidencia 3b), 28 imágenes: system inicio/anclar/arrastrar, home, roster plantilla/profundidad, tactics pizarra/partido, match directo, schedule temporada/próximos/resultados, training equipo/módulos, staff asesoría. Las referencias mostraban el botón fantasma rotado sobre otros controles (p. ej. «Sincronizar» sobre «Simular hasta…»).
- Emparejamientos y Deuda (incidencias 2/3a), 4 imágenes.
- Clasificación y Asignaciones: 0,000 % y cambio intencionado de nodos (incidencia 4); Asignaciones, 2 imágenes.
- finances/ingresos oscuro: 0,0005 % (10 px, ruido).

Los PNG de `png/courtside/{dark,light}/desktop` se regeneraron con las fuentes corregidas. Tablet y móvil están aparcados y siguen sin regenerar (anteriores a las correcciones). Antes/después: `qa/before-after/`.

## Viewport real 2560×1440

Zona de página 1314 px (SystemBar + barra de 68 px). 14 pantallas altas desplazan dentro de `.page` (la composición no se estira); las demás terminan entre 662 y 1278 px y dejan espacio vacío hasta la barra (diseño de talla fija, sin cambio). Márgenes laterales de 340 px por el contenedor de 1880.

## Datos: auditoría contra el dominio (src/, HEAD 8a0b359)

REAL: confianza de la directiva (`BoardState.confidence` 0-100, `BoardEngine`); recomendaciones del staff, médicas, de scouting, reclutamiento, necesidades del club y Finance AI (`recommendFinanceActions`); previsión financiera (`createFinancialForecast`, un escenario por llamada: BASELINE/UPSIDE/DOWNSIDE/CUSTOM); valoración (`valueOrganization`, indicativa); caja, nómina, partidas, ingresos, costes, deuda y regulación (módulos de finanzas); atributo de scout `potentialEvaluation`.
PARCIAL: techo de jugador (solo rangos del scout; el valor oculto no debe mostrarse); salud financiera (estado HEALTHY/WATCH/STRESSED/DISTRESSED, sin puntuación numérica); tope salarial (existe `SalaryRules`, pero la pestaña `cap` del modelo de finanzas es solo una nota); puntuación de partido por jugador (sin confirmar escala 0-10).
AUSENTE (derivable con método determinista declarado, o retirar): probabilidad de victoria; probabilidad de título; ritmo previsto de victorias (el «ritmo» táctico sí existe, no el previsto); fatiga prevista.
Aviso: los importes del mockup son ilustrativos aunque el dominio financiero existe; hay que comprobar el sembrado de cada club. `docs/ARCHITECTURE.md` está desactualizado respecto a staff.

## Staff > Asignaciones (solo auditoría)

Existen: 32 `StaffRoleId` (`src/domain/staff/StaffRoleId.ts`), 13 atributos 0-100, 30 `ResponsibilityKind` en 6 dominios con modos userControlled/delegated/advisory/organizational y estados CONNECTED/RETIRED/DEFERRED (`src/domain/responsibility/Responsibility.ts`), servicios `setStaffResponsibility`, `applyStaffAssignmentStrategy` y `applyStaffOptimization`, y `StaffAssignmentsScreen` (ya mutador real). Las seis tareas del mockup no son canónicas: «Entrenamiento de tiro» no tiene kind (solo el rol `shootingCoach`); «Rehabilitación» y «Planteamiento de partido» solo coinciden en parte (varios kinds RETIRED/DEFERRED); «Gestión de carga» → `determineIntensity`; «Informes de rivales» → `oppositionReport`; «Desarrollo de jóvenes» → `assignIndividualDevelopment`. No se ha rediseñado ni programado nada.
