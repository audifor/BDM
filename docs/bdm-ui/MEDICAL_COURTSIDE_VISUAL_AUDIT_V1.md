# Medical · Courtside V1 | Auditoría técnica y visual

**Rama de implementación:** `feat/courtside-medical-visual-v1` desde `feat/bdm-ui-courtside`.
**Ámbito:** aplicación Medical del club y frontera con Player > Medical. No se modifica el motor de lesiones, el modelo de guardado ni las reglas de disponibilidad.

## 1. Diagnóstico del estado previo

| Superficie | Diagnóstico | Evidencia |
| --- | --- | --- |
| Club Medical / Overview | Cuatro tarjetas de definición y una tabla, prácticamente sin información gráfica | `src/ui-ng/applications/medical/MedicalWorkspace.tsx` |
| Club Medical / Injured | Tabla de casos e inspector con numerosas filas de texto; la actuación real de rehabilitación sí existe | `MedicalWorkspace.tsx`, `buildMedicalWorkspaceModel.ts` |
| Club Medical / Return-to-play | Acciones reales en Overview pero con explicaciones repetidas y sin un lugar propio | `MedicalWorkspace.tsx`, `MedicalWorkspace.test.tsx` |
| Club Medical / Risk | Datos reales de fatiga, puntuación, bandas y motivos, ocultos en tabla | `medicalWorkspaceModel.ts` |
| Club Medical / History | Registros completos de lesiones, recurrencia, rehabilitación, tests y clearance, pero presentación poco legible | `buildMedicalWorkspaceModel.ts` |
| Club Medical / Staff | Profesionales reales, carga y competencia disponibles; presentación solo tabular | `getTeamStaffPresentation` |
| Temas | Tokens NG y un bloque de botones con colores oscuros fijos, que dañan light mode y no cumplen Courtside | `medical-workspace.css` |
| Player > Medical | Ya existe mapa anatómico interactivo, carga real, historial, límites de conocimiento para rivales y navegación al Medical del club. Conservar | `PlayerMedicalView.tsx`, `buildPlayerMedicalModel.ts` |

## 2. Autoridades canónicas que se mantienen

- **Lesión y cronología:** `InjuryRecord`, `injuriesById`, `isInjuryActive`, `injuryLifecycleStatus`. No se crea otro origen de verdad.
- **Riesgo:** `getMedicalRiskAssessments` calcula evaluación actual. **No** es una probabilidad porcentual de lesión y no se etiqueta así.
- **Fatiga:** `getCareerFatigueForPlayer` aporta el escalar persistido. No combinar con minutos o carga de entrenamiento en una unidad falsa.
- **Rehabilitación:** `setRehabilitationPlan` selecciona REST, STANDARD_REHAB o ACCELERATED_REHAB. Mantener las restricciones de estado.
- **Alta médica:** `conductFitnessTest` y `reviewReturnToPlay`. Un test no concede automáticamente el alta; clearance exige la validación canónica.
- **Staff y consejos:** recomendaciones médicas, `acceptStaffRecommendation` y `dismissStaffRecommendation`. Aceptar una recomendación no da de alta.
- **Guardado y calendario:** continuar leyendo el modelo actual; la interfaz visual no añade estado persistido paralelo.

Referencia de reglas: `docs/strengthening/BS12C_MEDICAL_RECOVERY_RTP.md` y `docs/strengthening/BS12E_MEDICAL_DEPTH_REHABILITATION.md`.

## 3. Secciones Courtside V1

| Pestaña | Nuevo componente | Lectura principal | Interacción |
| --- | --- | --- | --- |
| Overview | `MedicalOverviewVisual` | Donut disponibilidad, composición del riesgo, dispersión riesgo-fatiga, días a revisión | Abrir jugador y acceder a acciones canónicas |
| Injured | `MedicalInjuryVisual` | Severidad de casos y próximas revisiones | Tabla seleccionable y plan de rehabilitación real |
| Recovery (nueva) | `MedicalRecoveryVisual` | Revisiones pendientes, casos en recuperación y próximos hitos | Tests, decisiones y recomendaciones reales |
| Risk | `MedicalRiskScatter` | Fatiga horizontal vs. riesgo vertical por jugador | Seleccionar puntos para abrir dossier; inspección en tabla |
| History | `MedicalHistoryVisual` | Familias de lesiones y relaciones de recurrencia registradas | Consultar expediente completo existente |
| Staff | `MedicalStaffVisual` | Competencia por rol, carga/utilización del equipo médico | Abrir ficha del profesional |

### Reglas visuales

- Tipografía, fondos, superficies, acentos, jerarquía y controles heredan variables `--cs-*` de Courtside. Los fallbacks NG solo operan fuera del shell que provee Courtside.
- Colores: lima como estado favorable, naranja para atención y rojo para gravedad. Las diferencias deben seguir siendo legibles con texto y etiquetas.
- Paneles de radios, composición densa y barras comparten la identidad Home/Player. El comportamiento de pestañas y ventanas de NG sigue operativo.
- Responsive: cuatro paneles de datos en escritorio ancho, dos en tamaños medios, uno en superficies estrechas.
- Prioridad a lectura visual, con tablas únicamente para detalle y trazabilidad.

## 4. Límites de veracidad

1. El donut expresa proporción de jugadores disponibles; no se deduce una disponibilidad adicional solo restando recuentos de lesiones.
2. Los tramos de días a revisión **no** representan porcentaje de curación, ni prometen fecha de alta. La barra solo compara días restantes en cada caso.
3. La matriz riesgo-fatiga es una **instantánea** del mundo. No inventa histórico, curva de recuperación diaria ni probabilidades de lesión.
4. Historial y recurrencia derivan de registros canónicos; familias relacionadas no constituyen diagnóstico clínico causal.
5. No mostrar datos médicos privados de jugadores rivales en Player Medical. El límite FOW existente se mantiene.
6. Ningún gráfico escribe en `GameWorld`, Save o los engines. Los únicos writes continúan siendo las acciones ya conectadas.

## 5. Deuda técnica y mejoras para otras fases

- **P1 | Serie temporal real.** Si se desea un gráfico de 30/90 días para todo el equipo, crear primero la captura y trazabilidad de snapshots reales en calendario/Save. No reconstruirlos a partir de un valor actual.
- **P1 | Integración de calendario.** Superponer las revisiones programadas y próximos partidos existentes con fechas reales, sin inferir la fecha efectiva de reincorporación.
- **P1 | Gestión de carga.** Añadir ventanas reales de partidos y entrenamiento al ámbito de club reutilizando el modelo de Player Medical, sin sumarlos como unidades equivalentes.
- **P1 | Historial de lesiones.** Filtros por temporada, familia y jugador, métricas por minutos de exposición solo cuando exista el denominador real.
- **P2 | Vista anatómica del club.** Reutilizar el mapa corporal del jugador si el esquema dispone de lateralidad precisa; nunca inferir el lado de una lesión no registrado.
- **P2 | Validación visual.** Comparar con capturas Courtside certificadas en claro/oscuro y viewport estrecho. La validación automatizada no equivale a certificación pixel-perfect por el usuario.
- **P2 | Certificación adicional.** Añadir prueba e2e de interacción en Windows, teclado y contraste en modo claro.

## 6. Certificación técnica

- Tests extendidos en `MedicalWorkspace.test.tsx`: dashboard, paneles, acciones de pruebas/alta, historial y staff.
- Workflow aislado: `.github/workflows/bdm-ui-courtside-medical.yml`.
- Puertas: `npm ci`, `npm run typecheck`, tests de Medical y Player Medical, `npm run build`.
- **Estado de la auditoría:** cambios implementados. El PASS técnico solo se declara después de revisar una ejecución satisfactoria del workflow. La certificación visual por usuario queda separada.

## 7. Política de incorporación

La rama está aislada. Objetivo de PR: `feat/bdm-ui-courtside`; no fusionar en `main` ni retirar Legacy/NG hasta paridad y certificación globales.
