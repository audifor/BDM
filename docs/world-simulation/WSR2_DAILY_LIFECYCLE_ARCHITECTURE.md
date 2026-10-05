# WSR2 · Arquitectura del ciclo diario a escala de mundo

Rama `world-sim-wsr2-daily-lifecycle-scaling`, desde `e75bbcf` (WSR1). Rendimiento en `WSR2_DAILY_LIFECYCLE_PERFORMANCE.md`; certificación en `WSR2_WORLD_SCALE_CERTIFICATION.md`.

## 1. Diagnóstico: por qué el ciclo diario era cuadrático

WSR1 dejó la resolución de partidos escalable, pero el resto del día crecía de forma aproximadamente cuadrática con el tamaño del mundo: 0,25 → 2,3 → 12,6 → 49,9 s entre 48 y 528 equipos.

Los perfiles de CPU (`node --cpu-prof`) mostraron la misma causa en todos los sistemas: **búsquedas en todo el mundo dentro de bucles por entidad**. Por ejemplo, `Object.values(world.X).find/filter/some(...)` se ejecutaba una vez por cada miembro del staff, equipo o jugador. Con N entidades por bucle y M elementos por colección, el coste es N × M.

| Origen | Patrón | Peso a 528 equipos |
|---|---|---|
| `getTeamResponsibilities`, `getResponsibilitiesHeldByStaff`, `getResponsibility` | recorrido de todas las responsabilidades del mundo en cada consulta | ~53 % de la CPU del ciclo |
| `getStaffAssignment`, `getTeamStaffAssignments` | recorrido de todas las asignaciones de staff | |
| `validateWorld` | siete búsquedas anidadas (asignación por sesión, por responsable, por autor de informe, entrenador → equipo, etc.) | 399 ms por validación, varias por día |
| `buildStaffPoliticalInfluenceIndex` | reconstruido entero para cada contexto de staff | |
| contratos de jugador (`ContractLifecycle`, `RosterContractIntegrity`) | búsqueda de contratos y de equipos con el jugador en plantilla, por jugador | `EXPIRED_CONTRACT_RECONCILIATION` 2,6 s, autocuración 4,4 s |
| Human State, cultura, valoración, autonomía de carrera | `find` de asignación, contexto vivo, contrato de staff, solicitudes y competiciones, por contexto | `STAFF_HUMAN_STATE` 22,4 s, `STAFF_CULTURE_COHESION` 9,4 s |
| elegibilidad | perfil y restricciones buscados en todo el mundo, por jugador de cada plantilla en cada partido | preparación BACKGROUND |
| validación dentro de las fases | `updateGameWorld` valida el mundo entero tras **cada** actualización intermedia de una fase | proporcional al trabajo de la fase |
| `progressScoutingAssignments` | por cada asignación procesada: recorrido de toda la carga activa del evaluador y reconstrucción de toda la colección de asignaciones | con 1.056 asignaciones abiertas a 528 equipos: 85–332 s por día |
| historiales que crecen | puntos de control semanales de carga buscados en **todos** los registros de reacción del staff, por contexto; narrativas que recorren **todas** las memorias tres veces por entrenador, en cada partido completado | crecimiento semana a semana (`STAFF_HUMAN_STATE` del lunes: 108 → 1.024 ms en 4 semanas a 528 equipos) |

## 2. Principio: índices efímeros sobre un mundo inmutable

`GameWorld` es inmutable: cada colección es un registro que se reemplaza por copia y nunca se muta en el sitio. Por eso un índice derivado de una colección **no puede quedar obsoleto** si se asocia al propio objeto de la colección.

- `src/domain/world/collectionIndexes.ts` mantiene índices en `WeakMap<colección, índice>`:
  - si la colección cambia, el objeto es otro y el índice se reconstruye;
  - si no cambia, se reutiliza entre fases, días y llamadas.
- Los índices **no se guardan nunca**: no forman parte del mundo, de la partida guardada ni de World DB. Tras cargar una partida, las colecciones son objetos nuevos y los índices se construyen en frío.
- Cada índice responde exactamente lo que respondía el recorrido que sustituye:
  - las listas conservan el **orden de la colección** (el orden de `filter`);
  - las búsquedas únicas conservan la **primera coincidencia** (la semántica de `find`).
  - Así, las sumas en coma flotante, el orden de iteración y el consumo de RNG son idénticos.

| Índice | Clave | Sustituye |
|---|---|---|
| `responsibilityIndex` | equipo; titular; equipo + tipo | recorridos de responsabilidades |
| `staffAssignmentIndex` | staff (primera); equipo; staff (todas) | recorridos de asignaciones |
| `teamIndex` | entrenador (primer equipo); organizaciones con equipo | validación |
| `contractsByPlayer`, `teamsByRosterPlayer` | jugador | contratos y plantillas por jugador |
| `liveStaffContextByStaff`, `staffContractsByStaff` | staff | contexto Human State vivo, contratos de staff |
| `cohesionUnitsByScope`, `conflictsByParticipant` | ámbito; actor (una vez por conflicto) | valoración de carrera |
| `eligibilityProfileIndex`, `eligibilityRestrictionsByPlayer` | jugador + ecosistema + programa; jugador | elegibilidad en la preparación de partidos |
| `reactionRecordsByContext` | contexto Human State | último punto de control de carga semanal |
| `memoriesByOwner` | propietario de la memoria | `refreshNarratives` en cada partido completado |
| `buildStaffPoliticalInfluenceIndex` (memo `WeakMap<GameWorld, …>`) | el mundo entero | reconstrucción por contexto |

Los mapas locales de una pasada (solicitudes por contexto, posición del estado por contexto, primera competición por equipo, recuperación por contexto) siguen la misma regla: se construyen una vez por pasada y se mantienen al día con las mismas inserciones que hacía la lista.

## 3. Validación: una vez por fase

`advanceDayWithTrace` ejecuta cada fase del calendario dentro de `withSingleWorldValidation`, el mismo mecanismo que WSR1 usa al completar cada partido.

- El mundo resultante de una fase que cambió se valida **entero, una vez, al terminar la fase** y antes de que otra fase lo lea.
- Los estados intermedios dentro de la fase no se validan uno a uno: ninguna otra fase los ve y nunca se guardan.
- La validación solo puede lanzar o no; nunca altera un mundo. Un día válido produce exactamente el mismo mundo.
- Un día inválido sigue fallando en la misma fase, y el día entero se revierte (`FAILED`, `worldChanged: false`). La transacción del día no cambia.

Auditoría de frecuencia de validación:

| Punto | Antes | Ahora |
|---|---|---|
| cada `updateGameWorld` fuera de un ámbito de validación única | validación completa | igual (fuera del ciclo diario no cambia nada) |
| fase del calendario | una validación por actualización intermedia | una por fase que cambia el mundo |
| partido completado (`completeResolvedMatch`) | una por partido (WSR1) | igual |
| coste de una validación a 528 equipos | 399 ms | 36 ms (lineal: 66 ms a 960 equipos) |

## 4. Orden de fases y cadencias (sin cambios)

WSR2 no mueve, salta ni espacia ninguna fase. Cada fase corre en el mismo orden, el mismo día y con la misma condición que en `e75bbcf`.

| # | Fase | Cadencia | Coste dominante antes | Ahora |
|---:|---|---|---|---|
| — | `PRE_MATCH_SELF_HEALING` | días con partidos | contratos y plantillas por jugador | índices por jugador |
| — | `MATCH_RESOLUTION` | días con partidos | (WSR1) | elegibilidad indexada |
| 1 | `DATE_ADVANCE` | diaria | validación | validación lineal |
| 2 | `ANNUAL_PLAYER_DEVELOPMENT` | 1 de julio | — | — |
| 3 | `CAREER_FATIGUE_RECOVERY` | diaria | validación | validación lineal |
| 4 | `EXPIRED_CONTRACT_RECONCILIATION` | diaria | contratos por jugador | `contractsByPlayer` |
| 5–13 | entrenamiento, reclutamiento, académico, NIL, boosters, finanzas, memoria, disciplina | diaria o mensual | — | — |
| 14 | `SCOUTING_INTAKE` | diaria | asignaciones y responsabilidades | índices |
| 15 | `MEDICAL_AND_ROSTER_ADVISORIES` | diaria | asignaciones y responsabilidades | índices |
| 16 | `SCOUTING_ASSIGNMENTS` | diaria | carga por evaluador y colección reconstruidas por asignación; validación por actualización | copia de trabajo y una sola actualización (§5) |
| 17 | `DRAFT` | según calendario | — | — |
| 18 | `STAFF_HUMAN_STATE` | diaria (+ hitos semanales los lunes) | responsabilidades, asignaciones, influencia política, `find` por contexto; historial de reacciones | índices y mapas por pasada |
| 19 | `STAFF_CONFLICTS` | diaria | — | — |
| 20 | `STAFF_CULTURE_COHESION` | diaria (+ semanal) | asignaciones y contexto vivo por miembro del staff | índices |
| 21 | `STAFF_POLITICAL_CASES` | diaria | — | — |
| 22 | `STAFF_APPRAISAL` | lunes | cohesión y conflictos por contexto | `cohesionUnitsByScope`, `conflictsByParticipant` |
| 23 | `STAFF_CAREER_AUTONOMY` | lunes | solicitudes, competiciones y responsabilidades por contexto | mapas por pasada |
| 24 | `FACILITY_CONDITION` y demás | según calendario | — | — |
| — | `POST_TRANSITION_SELF_HEALING`, `SCHEDULE_INTEGRITY`, `PRE_MATCH_MEDIA`, `BREAKPOINT_EVALUATION` | diaria | autocuración por jugador | índices por jugador |

## 5. Procesamiento de lo que vence y lotes

- **Entidades que vencen.** Los sistemas ya procesaban solo trabajo activo: el *scouting*, las asignaciones abiertas; el médico, las lesiones activas. Ningún sistema pasó a muestreo ni a una cadencia menor.
- **Trabajo del día de *scouting* en una sola actualización.** `progressScoutingAssignments` trabaja sobre una copia del día:
  - las asignaciones, por id y en el orden de la colección;
  - la carga ACTIVA de cada evaluador, en unidades enteras.

  Recorre las asignaciones abiertas en el mismo orden (prioridad, id) y toma las mismas decisiones (capacidad, partido en directo, duración con la carga del momento). Añade evidencias, informes y conocimiento consolidado en la misma secuencia y confirma todo con un solo `updateGameWorld`. El mundo resultante es el mismo que con las actualizaciones paso a paso, como verifica la comparación exacta bajo carga.
- **Lotes de aplicación de resultados (opcional): no implementado.** La aplicación por partido copia mapas completos del mundo (moral; fatiga y estímulo de desarrollo), con un coste lineal en el tamaño del mundo **por partido**. Agruparla por día cambiaría los mundos intermedios entre partidos. No se demostró exacta, así que queda como P1 (ver certificación). Las consecuencias BACKGROUND siguen entrando por `completeResolvedMatch` y alimentan los mismos sistemas que FAST.
- **Workers.** Los arreglos algorítmicos bastaron: el ciclo diario a 528 equipos cabe en menos de 1 s en un hilo. No se añadió paralelismo nuevo. Los *workers* siguen siendo los de Match Next para los partidos exactos.

## 6. Qué no cambia

- **Match Next.** Ningún archivo de `src/engine/match-next/` ni de `src/app/matchNext/` cambia; el bloqueo de `4da33d1` se mantiene.
- **Calibración BACKGROUND.** `bg-v1` no cambia y los P1 de WSR1 siguen congelados.
- **Determinismo.** El orden del RNG y la iteración no cambian: el mundo de cada día es idéntico byte a byte (JSON canónico) al de `e75bbcf`.
- **Persistencia.** Ni el formato de guardado ni los datos guardados cambian; World DB avanza por el mismo `advanceGameDayWithResult`.
