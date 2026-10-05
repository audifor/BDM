# WSR1 · Informe de rendimiento

**Entorno**: Intel i5-12400F (6 núcleos físicos, 12 hilos), Windows 11, node 24.12.0, *bundles* esbuild de producción (`import.meta.env.DEV = false`). Es el mismo entorno de ME-LOCK1.1 y ME-LOCK1.2.

## 1. Simulación BACKGROUND pura

| Medida | Valor |
|---|---:|
| Un partido BACKGROUND (rasgos + simulación) | **0,34–0,6 ms** |
| Rendimiento en un hilo | **~1.700–2.500 partidos/s** |
| Un partido FAST (referencia) | ~2,0 s |
| Relación | **~4.000–6.000× más rápido** |

Medido sobre 2.400 partidos en la certificación y sobre lotes de 50–500.

## 2. Lotes BACKGROUND con preparación y aplicación canónicas (un hilo)

`scripts/world-sim/wsr1Perf.ts bg <N>`, sobre el *fixture* de mundo grande (`wsr1WorldFixture.ts`). Partidos de días reales; preparación por `prepareMatchSetup` (disponibilidad, plan de rotación canónico); aplicación por la frontera única.

| Partidos | Equipos en el mundo | Preparar | Simular | Aplicar | **Total** |
|---:|---:|---:|---:|---:|---:|
| 50 | 144 | 0,39 s | 0,03 s | 0,14 s | **0,56 s** |
| 100 | 240 | 0,86 s | 0,06 s | 0,36 s | **1,28 s** |
| 250 | 624 | 2,60 s | 0,11 s | 2,43 s | **5,14 s** |
| 500 | 1.152 | 5,58 s | 0,20 s | 10,49 s | **16,26 s** |

**De dónde sale el coste.** La simulación es despreciable; el coste está en la preparación y la aplicación canónicas.

**Preparación** (8–11 ms por partido):

| Fuente | Peso |
|---|---:|
| Búsqueda de quinteto del plan de rotación canónico (`CoachRotationEngine`, la misma que usa FAST) | 24 % del perfil |
| Elegibilidad | 8 % |

**Aplicación** (3 → 21 ms por partido): crece con el tamaño del mundo, porque cada aplicación toca estructuras de todo el mundo:

| Fuente | Peso |
|---|---:|
| `applyDynamicConsequences` copia los mapas completos de fatiga y estímulo | 12 % |
| moral | 8 % |
| validación del mundo del día | 16 % |

## 3. Día de mundo mixto (la prueba de producto)

`wsr1Perf.ts mixed <copias> 12 worker 6`: el avance de día **asíncrono real**:

- `advanceGameDayWithResultAsync`, con el pool de 6 *workers*;
- todas las fases del ciclo diario.

El partido del usuario y su competición son exactos, más 12 exactos de presupuesto; el resto, BACKGROUND.

| Copias | Equipos | Partidos hoy | FAST | BACKGROUND | Resolución de partidos | Resto del ciclo diario | **Total del día** |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 48 | 22 | 16 | 6 | 12,2 s | 0,25 s | **12,4 s** |
| 3 | 144 | 66 | 16 | 50 | 12,5 s | 2,3 s | **14,8 s** |
| 6 | 288 | 132 | 16 | 116 | 13,2 s | 12,6 s | **25,7 s** |
| 11 | 528 | 242 | 16 | 226 | 15,6 s | **49,9 s** | **65,5 s** |

### Lectura

- **La resolución de partidos escala.** 242 partidos (1 del usuario + 15 FAST + 226 BACKGROUND) se resuelven en 15,6 s, de los que ~8–10 s son los 16 exactos en 6 *workers*. Cada partido BACKGROUND añade ~15 ms con preparación y aplicación. **Cientos de partidos en segundos: sí.**
- **El día completo no escala.** Fuera de los partidos, el resto del ciclo diario crece de forma aproximadamente **cuadrática** con el tamaño del mundo (0,25 → 2,3 → 12,6 → 49,9 s). En el mundo de 528 equipos:

| Fase | Tiempo |
|---|---:|
| `STAFF_HUMAN_STATE` | 22,7 s |
| `STAFF_CULTURE_COHESION` | 9,4 s |
| `MEDICAL_AND_ROSTER_ADVISORIES` | 5,4 s |
| `SCOUTING_INTAKE` | 5,3 s |
| `PRE_MATCH_SELF_HEALING` | 4,0 s |
| `EXPIRED_CONTRACT_RECONCILIATION` | 2,4 s |

Esos sistemas están fuera de WSR1 y de la simulación de partidos, pero son el siguiente bloqueo de escala del mundo.

## 4. Proyección

| Día | Antes de WSR1 (todo FAST, ME-LOCK1.2) | Con WSR1 (resolución de partidos) |
|---|---:|---:|
| 50 partidos | 24–28 s (6 núcleos) | ~10–11 s si 16 exactos; < 2 s si todo BACKGROUND salvo el usuario |
| 100 partidos | 47–56 s | ~11–12 s |
| 250 partidos | 2,0–2,3 min | **~15–16 s**, con 16 exactos y ~5 s de BACKGROUND |
| 500 partidos | — | ~25 s (la aplicación crece con el mundo) |

El componente exacto se fija con el presupuesto, no con el tamaño del mundo.

**En un portátil de 4 núcleos**, BACKGROUND va en un hilo (~×1,3), y los 16 exactos en 3–4 *workers* tardan ~12–16 s: un día de 250 partidos ronda los **~20–25 s de resolución**. Con un presupuesto Minimal (solo el partido del usuario exacto) baja a **~5–8 s**.

## 5. Determinismo y paralelismo

| Propiedad | Comprobación |
|---|---|
| Día mixto | mundo idéntico en línea y en un pool que responde en orden inverso (prueba) |
| BACKGROUND | se ejecuta en el hilo principal, intercalado con la espera de los *workers*; su resultado no depende del orden |
| Semillas | se extraen en orden de calendario antes de simular, y la aplicación es en orden de calendario |

## 6. Mejoras posibles, no hechas en WSR1

1. **Aplicación por lote del día**: un solo paso por día para los mapas de fatiga y estímulo, y para el índice de estadísticas, en lugar de por partido. Es exacto para días independientes; hoy cada partido copia mapas de todo el mundo.
2. **Solapar** la preparación y la simulación BACKGROUND con los partidos exactos que corren en los *workers* (~2–5 s de hilo principal en días grandes).
3. **Escala de los sistemas no deportivos del ciclo diario** (§3): fuera de WSR1, P0 para el mundo grande.
