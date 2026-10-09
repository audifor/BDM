# BDM · BS17D-C1 V1
## CANONICAL PHYSICAL OCCUPANCY, CAPACITY & RESERVATIONS

### MANDATO

Implementa BS17D-C1 V1 completo como ampliación canónica del sistema Facilities.

**DECISIÓN DE PRODUCTO: APROBADA.**

BS17D-C1 introduce la posibilidad de asignar recursos físicos a actividades deportivas mediante horarios, demanda verificable, capacidad compatible y reservas persistentes.

Debe existir una consecuencia real cuando dos operaciones intentan consumir simultáneamente un recurso cuya disponibilidad está acreditada.

No implementar un simulador paralelo de instalaciones.

No modificar Finance, Governance ni MatchEngine.

### MÉTODO DE EJECUCIÓN

Aplicar BDM Fast Loop en una única ejecución coherente:

1. Auditoría mínima.
2. Validación del contrato aprobado.
3. Diseño de integración.
4. Implementación.
5. Wiring de UI y gameplay.
6. Pruebas causales.
7. Autocorrección.
8. Certificación PASS/FAIL.
9. Commit local.

No detenerse para solicitar aprobación entre pasos cuando exista una regla aprobada suficiente.

Si falta una decisión imprescindible, documentar exactamente el bloqueo y no inventar esa regla.

---

# 0. ENTORNO Y AISLAMIENTO

Repositorio canónico:

`C:\BDM`

Fuente certificada BS17D-C:

`a5576a9b70552c896ef589438f21380e3234a6f2`

Worktree fuente:

`C:\BDM-BS17D-CAPACITY`

Crear nueva worktree:

`C:\BDM-BS17D-C1-ALLOCATIONS`

Rama:

`bdm-stage2-bs17d-c1-physical-allocations`

Verificar:

- Estado Git.
- SHA exacto.
- Ancestry de BS17D-T y T1.
- Convergencia V2.
- Worktrees existentes.
- Árbol de trabajo fuente limpio.
- Disponibilidad de la ruta nueva.

No reutilizar ni sobrescribir una worktree existente.

No modificar:

- `C:\BDM`
- `C:\BDM-BS16-CANONICAL`
- Worktrees Talent.
- Worktree de convergencia V2.
- Worktrees Facilities anteriores.

Sin fetch, pull, merge externo, rebase ni push.

Leer:

- AGENTS.md.
- ARCHITECTURE.md.
- PRODUCT_GUARDRAILS.
- BS17_FACILITIES_STRENGTHENING_ROADMAP.md.
- BS17D_P0_SPORTING_OPERATIONS_POLICY.md.
- BS17D_C_OPERATIONAL_CAPACITY_REPORT.md.
- BS17D_T_TALENT_FACILITIES_CERTIFICATION.md.
- BS17D_T1_RECRUITING_FACILITIES_CERTIFICATION.md.
- BS17D_TALENT_CONSOLIDATION_CERTIFICATION.md.
- Certificación de convergencia V2.

La información existente constituye la fuente de verdad. No reiniciar el sistema Facilities.

---

# 1. CONTRATO CANÓNICO BS17D-C1 V1

Persistir la aprobación en:

`docs/strengthening/BS17D_C1_PHYSICAL_ALLOCATION_POLICY.md`

## C1-01 · Demanda real

Cada actividad sometida a asignación física debe disponer de demanda verificable.

La demanda puede proceder de participantes seleccionados explícitamente por Training u otra fuente canónica autorizada.

Para demanda en jugadores simultáneos:

- Contar PlayerIds únicos efectivamente asignados a la actividad.
- No equiparar automáticamente plantilla completa con participantes.
- No utilizar asistencia estimada sin autoridad.
- No inventar participantes.
- Mantener demanda UNKNOWN cuando no pueda determinarse.

## C1-02 · Tiempo verificable

Dos actividades únicamente entran en conflicto temporal cuando sus intervalos conocidos se solapan.

Representar intervalos como:

`[start, end)`

El extremo inicial está incluido y el final excluido.

Las sesiones consecutivas sin solapamiento deben ser compatibles temporalmente.

Utilizar el calendario y las convenciones temporales canónicas existentes.

No inventar horas ni duraciones por defecto.

Las sesiones antiguas sin intervalo explícito mantienen continuidad P0.

Si la agenda existente solo dispone de fecha, ampliar mínimamente su contrato para permitir hora inicial/final explícitas, sin alterar automáticamente partidas antiguas.

## C1-03 · Capacidad operativa

Capacidad nominal y operativa son conceptos diferentes.

Derivar capacidad utilizable únicamente desde:

- Capacidad física acreditada.
- Unidad compatible.
- Componente real.
- Disponibilidad.
- Condición/serviceability.
- Restricciones de obras.
- Derechos de uso.
- Ocupación confirmada.

No sumar magnitudes incompatibles.

No equiparar SEATS, BEDS, TREATMENT_STATIONS y SIMULTANEOUS_PLAYERS.

No utilizar courtCount como número de jugadores.

OUT_OF_SERVICE implica capacidad física utilizable cero para el componente afectado.

FULL permite considerar capacidad nominal conocida si las demás condiciones se cumplen.

LIMITED no implica automáticamente un porcentaje fijo de capacidad. Exige una limitación cuantitativa o funcional verificable.

UNKNOWN no equivale a capacidad cero.

## C1-04 · Asignación explícita

Una sesión Training podrá solicitar un componente físico compatible.

Priorizar la reutilización de la identidad y el calendario de la sesión existente.

La asignación deberá conocer:

- SessionId.
- TeamId.
- OrganizationId cuando proceda.
- FacilityId.
- ComponentId.
- Intervalo.
- Demanda y unidad.
- Estado de asignación.

No introducir una segunda agenda Training.

## C1-05 · Reserva vinculante

Una reserva confirmada consume disponibilidad física durante su intervalo.

No confundir reserva física con FinancialReservation.

Una reserva física:

- No representa dinero.
- No compromete presupuestos.
- No genera costes.
- No crea asientos.
- No concede derechos de uso.
- No modifica ownership.

Comprobar que la suma de asignaciones simultáneas compatibles no supera la capacidad operativa acreditada.

No asumir que dos grupos pueden compartir físicamente una pista solo porque su suma de jugadores sea inferior a la capacidad nominal.

La compartición simultánea del mismo componente requiere una semántica física autorizada de recurso divisible o compartible. En caso contrario, no autorizar una doble asignación incompatible.

## C1-06 · Prioridad y conflictos

Las reservas válidas confirmadas previamente conservan su asignación.

Una solicitud nueva incompatible no puede desplazarla automáticamente.

Ante conflicto:

1. Buscar alternativa compatible.
2. Ofrecer otro horario permitido cuando sea posible.
3. Permitir al manager reprogramar.
4. Mantener la solicitud pendiente si no existe solución autorizada.

No inventar prioridades por reputación, género, categoría, presupuesto o calidad deportiva.

No decidir arbitrariamente entre solicitudes simultáneas pendientes.

Si dos solicitudes necesitan una decisión de prioridad que ninguna autoridad ha resuelto, mantener el conflicto pendiente.

No adjudicar recursos mediante el orden accidental de iteración del código.

## C1-07 · Alternativas

Antes de bloquear una operación, buscar recursos alternativos:

- Existentes.
- Con capability compatible.
- Con derechos Team válidos.
- Operativos.
- Sin restricciones incompatibles.
- Con capacidad verificable suficiente.
- Disponibles durante el intervalo solicitado.

Las alternativas deben mostrarse al manager.

No cambiar automáticamente de instalación o horario sin una autoridad de asignación aplicable.

La elección explícita del manager debe registrarse y persistir.

## C1-08 · Datos desconocidos

Si la información necesaria es desconocida:

`UNVERIFIED_PHYSICAL_CONTEXT`

Mantener continuidad conforme a BS17D-P0.

No crear una reserva confirmada ficticia.

No afirmar disponibilidad física garantizada.

No penalizar automáticamente entrenamiento, desarrollo, fatiga o recuperación por ausencia de datos.

Distinguir siempre:

- Recurso inexistente acreditado.
- Recurso conocido pero inaccesible.
- Recurso conocido y ocupado.
- Recurso con capacidad insuficiente.
- Recurso conocido con datos incompletos.
- Infraestructura completamente desconocida.

## C1-09 · Persistencia e idempotencia

Asignación, confirmación, liberación, cancelación y reprogramación deben ser deterministas y Save-safe.

Repetir un comando con la misma identidad lógica no puede crear una segunda reserva.

Cancelar una sesión libera su ocupación futura sin destruir el historial legítimo.

Reprogramar debe comprobar la nueva disponibilidad antes de sustituir la reserva válida anterior.

Si falla la nueva asignación, no perder una reserva anterior legítima por una mutación parcial.

Las operaciones deben publicarse atómicamente en GameWorld.

## C1-10 · Autoridad única

Training conserva:

- Programación deportiva.
- Participantes.
- Módulos.
- Cargas.
- Estímulos.
- Ejecución.
- Resultados.

Facilities conserva:

- Recursos físicos.
- Derechos.
- Capacidad.
- Ocupación.
- Asignaciones.
- Disponibilidad.

Calendar conserva la ejecución temporal.

GameWorld/Save conserva el estado persistido.

Zustand/UI no puede crear una autoridad paralela.

---

# 2. AUDITORÍA FOCAL TÉCNICA

Inspeccionar solamente los contratos necesarios de:

- ScheduledTrainingEngine.
- TrainingPlanning.
- Training sessions.
- TrainingPhysicalConsequences.
- facilitiesSporting.
- CFI8.
- FacilityCapacityReadModel.
- FacilityUsageRight.
- FacilityComponent.
- FacilityCondition.
- FacilityPhysicalOperations.
- CalendarEngine.
- GameWorld.
- GameWorldSaveV4.
- Training Workspace.
- FacilitiesWorkspace.

Responder internamente:

1. ¿Existe un intervalo horario real en una sesión?
2. ¿Se conocen participantes seleccionados?
3. ¿Existe demanda comparable con capacidad?
4. ¿Se puede identificar un componente?
5. ¿Qué estados Training permiten asignación?
6. ¿Cómo se reprograma actualmente?
7. ¿Qué autoridad permite persistir reservas físicas?
8. ¿Qué debe ampliarse en Save?
9. ¿Qué operaciones tienen un flujo de manager realmente alcanzable?

No confundir una coincidencia de fecha con simultaneidad.

No crear campos redundantes cuando el modelo ya disponga de ellos.

---

# 3. MODELO CANÓNICO DE ASIGNACIÓN

Implementar el modelo mínimo necesario de asignación física dentro de la autoridad Facilities.

Conceptualmente debe representar:

- AllocationId estable.
- Source operation/session ID.
- FacilityId.
- ComponentId.
- TeamId.
- Start/end.
- Demand value/unit.
- Allocation status.
- Creation/cancellation history.
- Evidence/reason.
- Reference to the owning sporting operation.

Utilizar los tipos y convenciones existentes cuando sea posible.

Definir estados explícitos y mínimos para:

- Solicitud pendiente.
- Confirmación.
- Liberación/cancelación.
- Rechazo o bloqueo justificado.

No persistir como autoridad un porcentaje calculado de ocupación.

No generar estados incompatibles con las colecciones existentes.

IDs deterministas, sin Math.random ni dependencia del reloj real.

Verificar component hierarchy y alcance de obras para evitar dobles reservas de recursos físicos solapados.

---

# 4. MOTOR DE DISPONIBILIDAD Y OCUPACIÓN

Crear un resolutor puro o ampliar el existente.

Entrada:

- World.
- Fecha/intervalo.
- Team.
- Physical requirement.
- Component candidate.
- Demand.
- Existing allocations.

Salida:

- Resultado de disponibilidad.
- Capacidad verificable.
- Demanda acreditada.
- Ocupación confirmada.
- Motivo de bloqueo.
- Alternativas válidas.
- Referencias canónicas.

El resolutor debe ser determinista.

La evaluación y confirmación deben producir una única transición atómica, para evitar que dos comandos evaluados sobre disponibilidad antigua confirmen ocupación incompatible.

No permitir overbooking por reintento, concurrencia lógica o Save/reload.

Ante reservas antiguas y nuevas, conservar historial e identidad.

No crear un sistema de recursos genérico desconectado de FacilityComponent.

---

# 5. INTEGRACIÓN TRAINING

Integrar dentro del ejecutor optimizado existente.

Preservar:

- Batching.
- Cache.
- Flush.
- Validación incremental.
- Atomic publication.
- P0 physicalAttempt.
- Idempotencia de sesiones.
- Training ownership.

## Flujo

Sesión programada
→ participantes reales
→ requisitos físicos
→ intervalo
→ derechos
→ capacidad
→ asignación confirmada
→ revalidación en ejecución
→ entrenamiento realizado o bloqueado
→ evidencia persistida.

La confirmación previa no garantiza ejecución si el componente pierde disponibilidad por avería, obra o caducidad de derechos.

Revalidar las condiciones en el momento de ejecución.

Una operación bloqueada no recibe estímulo deportivo.

No introducir modificadores artificiales de intensidad o desarrollo.

Si los participantes cambian después de reservar, reevaluar la demanda antes de ejecutar.

Reprogramar mantiene las identidades legítimas y evita la doble ejecución.

---

# 6. EQUIPOS Y USO COMPARTIDO

Cubrir:

- Equipo masculino.
- Equipo femenino.
- Primer equipo.
- Cantera.
- Varios Teams.
- Complejos compartidos.
- Componentes múltiples.
- Derechos con fechas de inicio y fin.
- Obras parciales.
- Recursos alternativos.

No suponer que los equipos pertenecientes a una misma Organization tienen automáticamente derechos compartidos.

No inferir permisos por propiedad.

No hacer que la prioridad dependa del género o categoría deportiva.

La resolución debe depender exclusivamente de derechos, recursos, intervalos y decisiones autorizadas.

---

# 7. MX · EXPERIENCIA DEL MANAGER

No basta con tener un allocator en backend.

Integrar en Training y Facilities un flujo jugable de asignación.

El manager debe poder:

1. Consultar el recurso previsto de una sesión.
2. Ver su demanda cuando sea conocida.
3. Seleccionar recurso compatible.
4. Indicar intervalo explícito cuando la agenda lo permita.
5. Solicitar confirmación.
6. Detectar conflictos verificables.
7. Consultar alternativas.
8. Elegir recurso/horario alternativo.
9. Reprogramar.
10. Cancelar o liberar una asignación.
11. Consultar resultado e historial.
12. Navegar a la Facility afectada.

Mostrar datos desconocidos de forma honesta.

No introducir una pantalla independiente si Training y Facilities permiten manifestar el workflow.

No mostrar porcentajes de ocupación sin capacidad y demanda compatibles.

No presentar acciones que todavía no puedan ejecutarse.

---

# 8. SAVE Y CALENDAR

## SAVE V4

Preservar:

- Identidades.
- Asignaciones.
- Historial.
- Relaciones.
- Compatibilidad de saves antiguos.
- Datos desconocidos.
- physicalAttempt.
- Referencias a sesiones.

Implementar defaults legítimos para saves previos sin asignaciones.

No reconstruir reservas confirmadas ficticias al cargar una partida antigua.

No duplicar asignaciones tras reload.

## CALENDAR

Conservar un único Calendar.

Evitar:

- Doble confirmación.
- Doble consumo.
- Doble sesión.
- Doble liberación.
- Ejecución de sesiones canceladas.
- Reprocesamiento de reservas históricas.

Las reservas físicas no ejecutan una segunda agenda deportiva.

---

# 9. PRUEBAS CAUSALES OBLIGATORIAS

Crear pruebas reales, no únicamente mocks de funciones.

## Capacidad

- Capacidad 10 frente a demanda 8, con semántica de unidad compatible.
- Capacidad 10 frente a demanda 12.
- Capacidad desconocida.
- Demanda desconocida.
- Unidades incompatibles.
- LIMITED sin reducción cuantitativa inventada.
- OUT_OF_SERVICE.

## Tiempo

- Dos sesiones simultáneas.
- Dos sesiones consecutivas.
- Solapamiento parcial.
- Intervalos desconocidos.
- Cambio de horario.
- Caducidad de derechos durante el intervalo.
- Avance de fecha y recarga.

## Uso compartido

- Masculino/femenino.
- Primer equipo/cantera.
- Dos Teams diferentes.
- Recursos distintos.
- Recurso no divisible.
- Recurso explícitamente compartible cuando esté autorizado.
- Alternativa disponible.
- Ninguna alternativa disponible.

## Reservas

- Confirmación.
- Solicitud duplicada.
- Reintento.
- Cancelación.
- Reprogramación.
- Conflicto entre solicitudes pendientes.
- Reserva confirmada anterior.
- Fallo de nueva asignación sin perder reserva anterior.
- Cambio de participantes.
- Avería posterior a la reserva.
- Restauración.
- Save/reload.
- Atomicidad.

## Deportes

- Sesión ejecutada.
- Sesión bloqueada.
- Sin estímulo por sesión bloqueada.
- Reprogramación y ejecución posterior exactamente una vez.
- Training juvenil.
- Training adulto.
- Recruiting T1 sin regresión.
- BS15 PlayerId/materialization preservados.

## Integración

- Cinco pruebas cruzadas V2.
- Facilities CFI8.
- Save V4.
- Calendar.
- Training batching.
- UI manager.
- Sin Finance/Governance writes.

Un test que solo compare read models no certifica asignación LIVE.

---

# 10. PRODUCCIÓN Y DATOS REALES

Distinguir:

- Funcionalidad ejecutable en producción con datos legítimos.
- Escenario artificial controlado de test.
- Dataset real con atributos físicos incompletos.

El World DB ACB actual puede contener Facilities sin componentes o capacidades documentadas.

No completarlas con valores ficticios.

La funcionalidad debe quedar disponible en el flujo productivo para clubes con recursos legítimamente conocidos, pero los mundos sin datos suficientes seguirán mostrando UNKNOWN.

No declarar utilización real generalizada únicamente porque un fixture de test posea capacidad y horarios.

El gate LIVE requiere tanto lógica causal real como un camino de manager alcanzable.

---

# 11. RESTRICCIONES ABSOLUTAS

Prohibido:

- Modificar Finance.
- Crear FinancialReservations.
- Introducir costes.
- Modificar presupuestos.
- Crear saldos ficticios.
- Modificar Governance.
- Crear Facilities AI.
- Alterar MatchEngine.
- Introducir multiplicadores de desarrollo.
- Inventar asistencia.
- Generar Players.
- Alterar Recruiting probabilities.
- Alterar Medical/Recovery.
- Inventar duraciones u horarios.
- Inventar derechos de uso.
- Suponer capacidad operativa desconocida.
- Repetir certificaciones de 30 años.
- Resolver la incidencia histórica World DB 2029 fuera de alcance.

No incorporar cambios de BS16.

---

# 12. FAST LOOP DE AUTOCORRECCIÓN

Ejecutar implementación y tests en la misma iteración.

Si aparece:

**CURRENT_DEFECT:** corregir dentro del alcance.

**STALE_TEST:** actualizar únicamente cuando la nueva autoridad aprobada invalide una expectativa anterior.

**BLOCKED_BY_PRODUCT_DECISION:** documentar la regla exacta que falta.

**PREEXISTING_BASELINE:** conservar evidencia.

**UNRELATED_FAILURE:** no ampliar artificialmente el milestone.

No borrar pruebas para conseguir PASS.

No ampliar timeouts para ocultar defectos de rendimiento.

---

# 13. CERTIFICACIÓN

Crear:

`docs/strengthening/BS17D_C1_PHYSICAL_ALLOCATION_CERTIFICATION.md`

## PASS GATE

Emitir:

`PASS · BS17D-C1 PHYSICAL OCCUPANCY & RESERVATIONS`

únicamente si:

1. Existen operaciones reales con demanda y horario explícitos.
2. Se usa capacidad física con unidades compatibles.
3. Los derechos se respetan.
4. Las reservas son vinculantes y persistentes.
5. No hay doble asignación incompatible.
6. La prioridad de reservas previas se conserva.
7. Los conflictos pendientes no se resuelven arbitrariamente.
8. Existen alternativas y reprogramación legítimas.
9. UNKNOWN conserva continuidad P0.
10. Training consume la asignación en producción.
11. El bloqueo produce una consecuencia deportiva real.
12. Las asignaciones son deterministas e idempotentes.
13. Save/reload PASS.
14. Calendar exactly-once PASS.
15. La UI permite acciones reales del manager.
16. Training juvenil y Recruiting T1 preservados.
17. Talent/Finance/Governance sin regresiones.
18. Pruebas causales PASS.
19. Typecheck PASS.
20. Build PASS.
21. Diff check PASS.
22. La funcionalidad es alcanzable desde el juego y no solo desde fixtures.

Si faltan fuentes o contratos indispensables:

`PARTIAL · BS17D-C1`

o

`BLOCKED_BY_PRODUCT_DECISION`

con evidencia exacta.

No declarar BS17D global COMPLETE.

Medical especializado continúa fuera del alcance.

---

# 14. GIT

Trabajar únicamente en la nueva worktree.

Crear commit local con el trabajo validado.

Preservar ancestry.

No hacer merge ni push.

No modificar main.

No modificar Finance.

No actualizar las ramas anteriores.

Terminar con working tree limpia.

---

# 15. RESULTADO OBLIGATORIO

**BS17D-C1 RESULT**

STATUS:

BASE / FINAL SHA:

CANONICAL POLICY:

REAL DEMAND SOURCES:

TIME INTERVAL MODEL:

CAPACITY UNITS:

OPERATIONAL CAPACITY:

PHYSICAL ALLOCATION AUTHORITY:

SHARED RIGHTS:

RESERVATION LIFECYCLE:

CONFLICT RESOLUTION:

ALTERNATIVES / RESCHEDULING:

TRAINING INTEGRATION:

YOUTH TRAINING:

RECRUITING T1 REGRESSION:

UNKNOWN BEHAVIOR:

GAMEPLAY / MX UI:

CAUSAL TESTS:

SAVE V4:

CALENDAR:

CROSS-SYSTEM REGRESSIONS:

FINANCE / GOVERNANCE DIFF:

TYPECHECK:

BUILD:

DIFF CHECK:

PRODUCT DECISIONS REMAINING:

BS17D GLOBAL STATUS:

NEXT ACTION:

No iniciar BS17E/F.

No integrar en main.

No declarar BS17D completamente certificado por cerrar C1.