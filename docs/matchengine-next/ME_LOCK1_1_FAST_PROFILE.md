# ME-LOCK1.1 · Perfil de Match Next FAST (después de ME-LOCK1)

Rama `match-next-me-lock1-1-production-performance`, desde `8c81154`.

**Método:** igual que en ME-LOCK1 (`ME_LOCK1_PERFORMANCE_PROFILE.md`):

- perfil de muestreo de V8 sobre un *bundle* esbuild con *source map* (`scripts/next/melock1Build.mjs`, `melock1MapProfile.mjs`);
- tiempo inclusivo por etapa (`melock1Profile.mjs`);
- contadores de llamadas insertados solo en copias del *bundle*.

**Entorno:** Windows 11, node 24.12.0, 12 hilos lógicos (~6 núcleos físicos, según la saturación medida en §4), sin otra carga.

## 1. Un partido (`3498342002`, prototipo, 26.466 ticks)

| Fase | Tiempo |
|---|---:|
| `prepare` | 210 ms (24 ms tras ME-LOCK1.1) |
| `simulate` (FAST) | 3,36–3,73 s en esta medida; media de 10 partidos **2,2–2,3 s** |
| `complete` | 42 ms |

### Tiempo propio por fichero (perfil del partido)

| Fichero | Peso |
|---|---:|
| `ManDefense` | 9,5 % |
| `ActionCore` | 9,1 % |
| `ReboundTransition` | 9,0 % |
| `PlayerKinematics` | 5,6 % |
| `GameWorld` (validación, solo en `prepare`/`complete`) | 5,4 % |
| `ActionIndex` | 5,1 % |
| `TacticalIdentity` | 5,0 % |
| `CoachRotationEngine` (solo en `prepare`) | 4,9 % |
| `OffensiveStructure` | 4,7 % |
| `kernel` | 4,3 % |
| `DecisionCore` | 4,2 % |
| `OffensiveRoles` | 3,9 % |
| `OffenseFlow` | 3,7 % |
| recolector de basura | 3,6 % |
| `events` | 3,1 % |

Ninguna función supera el 6,2 % de tiempo propio (`reconcileManDefense`), y ninguna línea el 4,8 %.

**El perfil es plano.** La patología O(historial) de ME-LOCK1 ya no está, y la curva de coste por 1.000 ticks es plana (§2).

### Llamadas por tick (contadores)

| Llamada | Por tick | Nota |
|---|---:|---|
| `distanceBetween` | 158 | barato: 1,3 % del tiempo |
| `activeActions` | 67 | casi todas aciertan en caché |
| `tacticalIntent` | 26 | 3,4 recálculos reales por tick |
| `guardPosition` | 20 | |
| `roleTarget` | 13 | |
| `stepPlayerKinematics` | 13 | |
| `reconcileTransition` | 6 | |
| `reconcileOffenseFlow` | 6 | |
| `reconcileStructures` | 3 | |
| `reconcileManDefense` | 3 | |
| `reconcileActions` | 3 | |

Los tres pases de `reconcileStructures` por tick **hacen avanzar** acciones y decisiones: forman parte del comportamiento actual del baloncesto. Quitarlos cambiaría partidos, así que no se tocan (congelado).

### Por categoría

| Categoría | Peso | Comentario |
|---|---:|---|
| Posesión y acciones (`ActionCore`, `OffenseFlow`, `ActionIndex`) | ~18 % | |
| Defensa (`ManDefense`, `PointOfAttack`, `StealModel`) | ~11 % | |
| Transición y rebote | ~9 % | |
| Movimiento | ~7 % | cinemática e integración |
| Tácticas (`TacticalIdentity`, `OffensiveRoles`, `PlayCalling`) | ~10 % | |
| Decisiones | ~4 % | |
| Eventos | ~3 % | |
| Geometría | ~1–2 % | |
| Rotación, fatiga y reloj | < 1 % | |
| Recolector de basura | 3,6 % | la presión de asignaciones no domina |
| Validación del mundo | 5,4 % del partido aislado | fuera de la simulación: dentro de `prepare`/`complete`, ver §3 |

**Sin O(N²) residual.** Los recorridos de historial que quedaban (`activeActions` filtrando el historial en cada versión nueva del array de acciones) se hicieron incrementales en ME-LOCK1.1: la vista activa se deriva de la anterior al anexar o sustituir una acción.

El historial se sigue anexando, una sola vez (`events`, `actions`, `possessions`). Las copias de array por anexado (`[...events, event]`) quedan como coste lineal por evento: ~3 % del tiempo.

## 2. Curva por tick

El coste por 1.000 ticks es estable durante todo el partido, entre 120 y 250 ms. El 95 % del tiempo es juego vivo, a ~0,1–0,16 ms por tick. El balón muerto cuesta ~21 µs por tick.

## 3. Fuera de la simulación: preparación y aplicación de un día

Medido en el día ACB, 9 partidos (`scripts/next/melock11PrepApply.ts`).

| Fase | `8c81154` | Causa |
|---|---:|---|
| `prepare` (por partido) | **475 ms** | 100 % `selectContextualLineup`: el entrenador puntúa todos los quintetos ordenados, P(16,5) = 524.160, y cada puntuación recalculaba medias de atributos y construía dos cadenas de desempate |
| `apply` (por partido) | **242 ms** | 100 % `validateWorld`: cada `updateGameWorld` revalidaba el mundo entero (todos los dominios), varias veces por resultado |

Antes de ME-LOCK1.1, en un día ACB esto era **6,5 s** solo de preparación y aplicación.

## 4. Paralelismo

| Medida | Valor |
|---|---|
| Esta máquina | 12 hilos lógicos |
| Día ACB, pool de 6 *workers* | 8,6 s |
| Día ACB, pool de 9–11 *workers* | 8,2 s |
| Tiempo de un partido dentro de un *worker* con 9 en paralelo | ~4 s, frente a ~2,3 s en serie (contención por núcleos físicos y memoria) |
| Serialización: *setup* | ~25 KB |
| Serialización: resultado | 6,2 MB |
| `structuredClone` de un resultado | 33–46 ms |

Con 9–11 *workers* el tiempo deja de bajar: la máquina se satura en torno a ~6 núcleos físicos. La serialización no es el cuello de botella.

## 5. Conclusión del perfil

Las palancas grandes y exactas ya están usadas:

1. historial (ME-LOCK1);
2. preparación;
3. aplicación;
4. paralelismo por día.

Lo que queda es el baloncesto en vivo, con un perfil plano. Un orden de magnitud más exigiría cambiar la arquitectura de ejecución del motor (estado mutable encapsulado en lugar de copias inmutables por paso, menos pases de reconciliación por tick). Eso toca cómo avanza el baloncesto y requiere su propio hito con igualdad exacta como criterio.
