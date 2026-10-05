# ME-LOCK1.2 · Arquitectura de ejecución exacta

Rama `match-next-me-lock1-2-exact-execution`, desde `6492794`. Este hito cambia **cómo** se ejecuta Match Next, no **qué** baloncesto simula: el resultado canónico de cada partido es idéntico al de `6492794` (ver `ME_LOCK1_2_PERFORMANCE_CERTIFICATION.md`).

## 1. Arquitectura anterior

- `MatchState` inmutable (versión 5, ~49 campos). Cada paso del motor devuelve un estado nuevo.
- Por tick: fatiga y tiempo en pista; balón; tres pases de `reconcileStructures` (estructura ofensiva, defensa, acciones, transición y rebote, balón suelto) intercalados con la integración de movimiento; reglas (tiros libres, presión, contacto, campo atrás); `advancePlayState`; `reconcileTacticalMemory`.
- La sesión (`MatchNextLiveController`) es la dueña del estado y ejecuta `stepState` por tick. FULL construye un `MatchFrame` por tick; FAST no.
- Historiales que solo crecen (eventos, acciones, posesiones) se copiaban enteros en cada anexado. Algunas vistas derivadas se recalculaban recorriendo el historial completo.

## 2. Qué se cambió y por qué no más

El perfil (`ME_LOCK1_2_EXECUTION_PROFILE.md`) descartó la premisa de un núcleo mutable:

- las copias del estado de primer nivel cuestan ~0,6 %;
- los tres pases por tick avanzan el partido (83 % de las llamadas cambia el estado), así que no se pueden fusionar ni saltar sin cambiar el baloncesto.

Lo que sí se encontró fueron recorridos de historial, recálculos de datos que no cambian y copias de historiales completos. Se cambió eso, paso a paso, con igualdad exacta comprobada y medida en cada paso. Lo que no mejoró se revirtió.

| Paso | Cambio | Igualdad | Tiempo (A/B, mediana) |
|---|---|---|---:|
| 1 | Resumen ofensivo por equipo arrastrado de un array de acciones al siguiente (`ActionIndex`) | 25/25 | ×0,877 |
| 2 | Clave de la intención táctica por partes; memo de los roles del quinteto; `jsonEqual` en lugar de `JSON.stringify` | 25/25 | ×0,898 |
| 3 | Registro de eventos de la sesión: anexado en sitio con prefijos inmutables | 25/25 + FULL | ×0,928 |
| 4 | Integración cinemática escalar, sin vectores temporales | 25/25 | ×0,98 en serie, peor en paralelo: **revertido** |
| 5 | Índice de jugadores por versión del array | 25/25 | ×1,04: **revertido** |
| | **Acumulado** | | **≈ ×0,73** |

## 3. Ejecución nueva

```text
CANONICAL INPUT  (MatchSetup)
      ↓  createMatchState / applyCommand (inmutable, sin cambios)
EXECUTION SESSION  (MatchNextLiveController)
      ├─ estado de baloncesto: MatchState inmutable, los mismos pases y en el mismo orden
      ├─ registro de eventos de la sesión (execution/EventLog)       ← efímero, de la sesión
      ├─ vistas de historial arrastradas (actions/ActionIndex)        ← efímeras, por versión del array
      └─ memos exactos (TacticalIdentity, OffensiveRoles)              ← efímeros, por equipo
      ↓  publishEvents: lo que sale de la sesión queda exacto y sellado
CANONICAL EVENTS / RESULT  (createMatchNextResult)
      ↓  completeMatchNext / applyDayResults (sin cambios)
CANONICAL OUTPUT  (GameWorld)
```

### 3.1 Registro de eventos de la sesión (`src/engine/match-next/execution/EventLog.ts`)

Antes, cada evento copiaba el historial entero (`[...events, event]`): ~12.500 eventos, ~1,5 GB de copias por partido.

**Invariante:** los eventos de un estado son los primeros `nextEventSequence − 1` elementos de su array. Ese prefijo nunca se modifica.

**Anexar** (`appendEvent`):

| Caso | Qué hace |
|---|---|
| El array es de la sesión y el estado es su dueño más nuevo (longitud = prefijo) | `push` en sitio |
| El array es de la sesión pero un estado más nuevo o descartado ya lo extendió | copia su prefijo y bifurca |
| El array no es de la sesión (pruebas o herramientas que llaman al núcleo directamente, o algo publicado) | copia, como antes |

**Lectura:** los lectores del motor usan `eventCount` o `eventsOf`, nunca `events.length`. Son `someEventSince`, `countEventsSince`, `findLastEvent`, `putbackQuality`, `playRead`, `reconcileTacticalMemory`, `classifyShotCreation` y `toFrame`.

**Frontera de la sesión** (`MatchNextLiveController`):

| Momento | Acción |
|---|---|
| Inicio de cada paso | `ownEvents`: la sesión toma un búfer propio (lo copia si no lo era) |
| Fin de cada paso | `trimEvents`: descarta lo que escribió una rama descartada |
| Cualquier estado que sale (accesor `matchState`, `result()`) | `publishEvents`: el array pasa a ser exactamente el suyo y se sella |

Los *frames* copian los eventos, así que un *snapshot* no necesita publicarse. FULL lee `isComplete` del *snapshot*, no del accesor, para no sellar en cada tick.

**Diagnóstico** (`execution/Diagnostics.ts`, nivel FULL): cada anexado comprueba que el prefijo del estado está intacto y que el evento lo continúa. En el corpus completo hubo 0 bifurcaciones y 0 recortes, porque el motor nunca anexa desde un estado viejo. Aun así, el caso está cubierto y probado.

### 3.2 Vistas de historial arrastradas (`actions/ActionIndex.ts`)

ME-LOCK1.1 ya arrastraba la vista ACTIVE de cada array de acciones al siguiente. ME-LOCK1.2 hace lo mismo con el resumen ofensivo por equipo (`teamOffensiveActions`: última resolución, alguna acción activa, último *drive* con ventaja), que se recalculaba recorriendo todo el historial en cada tick.

| Constructor | Cómo arrastra el resumen |
|---|---|
| `appendAction` | pliega un elemento más, como el recorrido |
| `replaceActionAt` | lo actualiza cuando el resultado se deduce con certeza del anterior (máximos que solo pueden subir, desempate por índice); si no, deja el array sin resumen y se recorre en el primer uso |
| `copyActions` | lo comparte |

A nivel FULL, cada respuesta arrastrada (resumen y vista ACTIVE) se compara con el recorrido completo del mismo array.

### 3.3 Memos exactos

| Memo | Cómo es exacto |
|---|---|
| `tacticalIntent` | Se comparan las partes de la clave (quinteto en orden, marcador, periodo, reloj tardío, fatiga media, ajuste) con las de la última clave del equipo. Si todas son iguales, la cadena es igual y se reutiliza. La búsqueda en el mismo `Map`, con la misma clave y el mismo desalojo, no cambia |
| `lineupRoles` | Se reutiliza la última respuesta del equipo mientras sean iguales: el quinteto (id, fatiga, y la referencia de los objetos de valoración, que nunca se reconstruyen en el partido); el plan; el equipo local; y `offBall`/`crash` de la intención |
| `jsonEqual` | Reproduce la igualdad de `JSON.stringify`: orden de claves, miembros `undefined` omitidos, `null` en arrays, no finitos como `null`, −0 como 0. Prueba aleatoria de 4.000 pares |

## 4. Fronteras de autoridad

- **El registro, las vistas y los memos son maquinaria de ejecución**, no autoridades de dominio. No aparecen en `MatchSetup`, `MatchNextResult`, `GameWorld`, el guardado ni Zustand.
- El resultado canónico es el mismo objeto que antes, con `finalState` incluido. `finalState.events` es exacto y está sellado.
- El *worker* (`matchSimulation.worker.ts`) sigue recibiendo un `MatchSetup` y devolviendo un `MatchNextResult`. Nunca toca el `GameWorld`.
- El día sigue en tres fases (ME-LOCK1.1): preparar desde el mundo del inicio del día, simular de forma independiente, y aplicar en orden de calendario.

## 5. Vida del estado mutable

| Pieza | Vive | Se libera |
|---|---|---|
| Búfer de eventos de la sesión | dentro de un `MatchNextLiveController` | se sella al publicar y se recoge con la sesión |
| Vistas de historial | `WeakMap` por array de acciones | se recogen con el array |
| Memos de intención y roles | última entrada por equipo, en el módulo | acotados por número de equipos: +0,5 MB retenidos, planos a 20/50/100 partidos |

**Seguridad ante fallos:** una excepción dentro de la sesión descarta la sesión. El mundo no se ha tocado: la aplicación solo ocurre con todos los resultados del día. Se sigue cubriendo con la prueba de *worker* fallido de `matchResolution.test.ts`.

## 6. Protecciones de determinismo

| Riesgo | Protección |
|---|---|
| Orden del RNG | Ningún cambio toca una llamada a `draw` ni su orden. Los memos solo evitan recalcular funciones puras que no consumen RNG; un acierto o un fallo de caché no cambia el consumo |
| Orden de coma flotante | Las sumas reescritas siguen el mismo orden: la fatiga media se suma en el mismo orden que `reduce`. No se vectoriza ni se reordena |
| Identidad de objetos | `jsonEqual` decide exactamente lo mismo que `JSON.stringify`. Los memos devuelven objetos de igual valor, y el corpus lo certifica |
| Paralelismo dentro del partido | ninguno |
| Orden de los jugadores antes de decisiones estocásticas | sin cambios |
| Divergencia silenciosa de una proyección | nivel de diagnóstico FULL en pruebas y en el corpus |

## 7. FULL y FAST

Una sola autoridad: los dos modos pasan por el mismo `stepState` y los mismos pases.

- **FAST** no construye *frames* y no paga copias de historial.
- **FULL** construye su *frame* por tick, igual que antes (la copia de eventos y acciones del *frame* sigue en la lista de MP2).

Igualdad FULL = FAST: certificada en 6 casos del corpus y en la prueba de sesión.

## 8. Costura futura: resolución de simulación

```text
SimulationResolution = FULL | FAST | BACKGROUND
```

| Valor | Estado |
|---|---|
| FULL | soportado |
| FAST | soportado |
| BACKGROUND | **sin soporte, a propósito** |

`MatchExecutionMode` (`MatchNextEnginePort`) es hoy esa costura. Un modo BACKGROUND sería otro nivel de fidelidad con su propia certificación (estadística, no exacta) y una política de relevancia que decida qué partidos lo usan. Ninguna de las dos cosas existe ni se empieza aquí.

## 9. Motor legado

Sigue en cuarentena. El guardián de producción de `matchResolution.test.ts` está intacto, y ningún camino de este hito usa el legado: ni como *fallback* para máquinas lentas, ni para lotes, ni en pruebas.
