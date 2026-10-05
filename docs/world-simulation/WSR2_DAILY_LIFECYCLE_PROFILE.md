# WSR2 · Perfil del ciclo diario en `e75bbcf`

Línea base medida antes de cualquier cambio de WSR2. Arquitectura en `WSR2_DAILY_LIFECYCLE_ARCHITECTURE.md`.

## 1. Corpus de referencia

`scripts/world-sim/wsr2Lifecycle.ts` avanza el mundo de escala de WSR1 (`wsr1WorldFixture.ts`) por el avance de día de producción y registra, para cada día:

- el tiempo de cada fase;
- el mundo completo como *hash* SHA-256 de su JSON canónico, por dominio (las 250+ claves de `GameWorld`).

El mundo de escala está formado por K copias del prototipo con espacio de nombres propio. Todas las temporadas están abiertas y el primer día está lleno de partidos independientes.

Los partidos usan el detalle MINIMAL de WSR1: el del usuario es exacto y el resto, BACKGROUND. Así se aísla el coste del ciclo.

| Copias | Equipos | Jugadores | Staff | Contratos | Partidos el día 0 |
|---:|---:|---:|---:|---:|---:|
| 1 | 48 | 456 | 120 | 288 | 22 |
| 3 | 144 | 1.368 | 360 | 864 | 66 |
| 6 | 288 | 2.736 | 720 | 1.728 | 132 |
| 11 | 528 | 5.016 | 1.320 | 3.168 | 242 |
| 20 | 960 | 9.120 | 2.400 | 5.760 | 440 |
| 21 | 1.008 | 9.576 | 2.520 | 6.048 | 462 |

Días del corpus:

| Día | Fecha | Tipo |
|---:|---|---|
| 0 | 2032-10-02 | día de partidos |
| 1 | 2032-10-03 | día tranquilo |
| 2 | 2032-10-04 | lunes, con los hitos semanales de staff |
| 3 | 2032-10-05 | día tranquilo |

Variantes:

- **Carga de *scouting*** (`WSR2_SCOUT=4`): cada equipo encarga 4 misiones con el `requestScouting` de producción, lo que deja 1.056 asignaciones abiertas a 528 equipos.
- **Horizonte largo:** 30 días.

## 2. Ciclo diario fuera de los partidos en `e75bbcf` (ms)

| Equipos | Día de partidos | Tranquilo | Lunes | Tranquilo |
|---:|---:|---:|---:|---:|
| 48 | 285 | 76 | 265 | 79 |
| 144 | 2.484 | 736 | 2.135 | 763 |
| 288 | 12.805 | 3.982 | 10.475 | 3.965 |
| 528 | **51.087** | **16.086** | **42.770** | **17.983** |

Al multiplicar el mundo por 11, el ciclo se multiplica por ~180 (de 285 a 51.087 ms): un crecimiento **cuadrático**.

## 3. Fases a 528 equipos en `e75bbcf` (ms)

| Fase | Día de partidos | Tranquilo | Lunes |
|---|---:|---:|---:|
| `PRE_MATCH_SELF_HEALING` | 4.404 | — | — |
| `MATCH_RESOLUTION` (242 partidos) | 7.775 | — | — |
| `DATE_ADVANCE` | 374 | 334 | 348 |
| `CAREER_FATIGUE_RECOVERY` | 330 | 314 | 355 |
| `EXPIRED_CONTRACT_RECONCILIATION` | 2.618 | 2.599 | 2.551 |
| `SCOUTING_INTAKE` | 5.587 | 5.963 | 5.681 |
| `MEDICAL_AND_ROSTER_ADVISORIES` | 5.904 | 6.141 | 5.939 |
| `STAFF_HUMAN_STATE` | 22.443 | 366 | 16.997 |
| `STAFF_CULTURE_COHESION` | 9.420 | 363 | 10.256 |
| `STAFF_APPRAISAL` | — | — | 607 |

Con carga de *scouting* (1.056 asignaciones abiertas), el ciclo a 528 equipos sube a **85–332 s por día**.

## 4. Auditoría de complejidad

Por perfiles de CPU (`node --cpu-prof`, tiempo inclusivo por función):

| Función o patrón | Complejidad en `e75bbcf` | Complejidad en WSR2 |
|---|---|---|
| ayudas de responsabilidad (`getTeamResponsibilities`, `getResponsibilitiesHeldByStaff`, `getResponsibility`): ~53 % de la CPU del ciclo | O(R) por consulta, llamada por staff y por equipo → O(S·R) | O(1) amortizado (índice por colección) |
| ayudas de asignación (`getStaffAssignment`, `getTeamStaffAssignments`) | O(A) por consulta → O(S·A) | O(1) amortizado |
| `validateWorld`: 7 búsquedas anidadas | O(N·M) por validación (399 ms a 528 equipos) | O(N + M) (36 ms) |
| validación dentro de las fases | O(actualizaciones de la fase × mundo) | O(fases × mundo) |
| `buildStaffPoliticalInfluenceIndex` | reconstruido por contexto: O(C·mundo) | una vez por mundo |
| contratos y plantillas por jugador (reconciliación, integridad, autocuración) | O(P·K) y O(P·T) | O(P + K + T) |
| cultura, valoración y autonomía de carrera | `find` por contexto: O(C·colección) | O(C + colección) |
| `progressScoutingAssignments` | O(abiertas × colección) | O(colección) por día |
| último punto de control de carga (`lastRecordedBand`) | O(C × historial de reacciones), creciendo cada semana | O(C + historial) |
| `refreshNarratives` en cada partido | O(entrenadores × memorias) por partido | O(entrenadores + memorias) por partido |
| elegibilidad al preparar un partido | O(plantilla × perfiles) por partido | O(plantilla) |

Leyenda: S = staff, R = responsabilidades, A = asignaciones, C = contextos Human State, P = jugadores, K = contratos, T = equipos.
