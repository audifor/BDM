# BS17D-M1-P0 Equipped Rehabilitation Policy

STATUS: DECIDED ? explicitly approved by the supplied BS17D-M1-P0 product mandate.
Base: a5c04bcf64cf74bc06e8fd2d5874313c0edb028f. The prior M1 audit is preserved as historical evidence; this approval authorizes the single act below.

# 1. CONTRATO CANÓNICO APROBADO

Crear:

`docs/strengthening/BS17D_M1_P0_EQUIPPED_REHABILITATION_POLICY.md`

Registrar las cinco decisiones.

## M1-01 · INDICACIÓN CLÍNICA

La operación autorizada es:

**EQUIPPED_REHABILITATION_SESSION**

Debe pertenecer a un plan de rehabilitación existente de un jugador cuya lesión se encuentre en estado `RECOVERING`.

La indicación es una decisión clínica explícita, independiente del modo del plan.

Prohibido generar sesiones automáticamente porque el plan sea:

- REST.
- STANDARD_REHAB.
- ACCELERATED_REHAB.

No presumir que todos los jugadores RECOVERING necesitan tratamiento equipado.

No inventar reglas clínicas específicas para lesiones sin evidencia.

Preservar las restricciones y contraindicaciones canónicas ya existentes.

## M1-02 · AUTORIDAD PROFESIONAL

Una sesión requiere:

- Profesional identificado.
- Asignación legítima.
- Elegibilidad profesional acreditada.
- Autoridad explícita para indicar o ejecutar la operación correspondiente.

Auditar Staff para comprobar si ya existen roles y cualificaciones suficientes.

No considerar que un Staff con capacidad de asesoramiento posee automáticamente permiso para prescribir.

No convertir el acceso USER/coach de MedicalActionAccess en autorización clínica.

Si falta un contrato técnico de autorización profesional, introducir solamente la autoridad mínima explícita aprobada, vinculada a Staff y Medical.

No asignar acreditaciones automáticamente a empleados existentes ni inferirlas de un cargo ambiguo.

Si los datos Staff no permiten acreditar al profesional, mantener la actuación pendiente con causa verificable y exponer el bloqueo.

Las credenciales clínicas y sus reglas deben poder validarse sin depender de etiquetas visuales.

## M1-03 · REQUISITO MATERIAL

La sesión necesita una instalación real con capability:

`PHYSIOTHERAPY`

Además debe existir evidencia de equipamiento compatible con la operación.

Una capability genérica no demuestra por sí sola presencia de instrumental especializado.

Verificar:

- Facility.
- FacilityComponent.
- Material/equipment evidence.
- Usage rights.
- Serviceability.
- Condition.
- Works.
- Interval.
- Occupancy.

No inferir derechos Team por propiedad Organization.

No inventar camillas, maquinaria, salas ni capacidad.

Solo usar control cuantitativo si la demanda y capacidad tienen unidades acreditadas y compatibles.

No equiparar pacientes con estaciones físicas sin un contrato que lo justifique.

Los recursos acreditadamente exclusivos deben respetar su exclusividad aunque las unidades cuantitativas no sean comparables.

## M1-04 · CUMPLIMIENTO

Cada acto tendrá identidad persistente y un ciclo de vida explícito.

El registro deberá distinguir:

- Indicación.
- Programación.
- Recurso solicitado.
- Reserva confirmada, cuando corresponda.
- Ejecución.
- Bloqueo.
- Cancelación.
- Reprogramación.
- Cumplimiento.

Una sesión realizada acredita únicamente la realización de esa actuación.

No modifica directamente:

- Injury duration.
- Recovery speed.
- Fatigue.
- Fitness.
- RTP.
- Relapse probability.
- Player ratings.
- Development.

No generar bonus de recuperación.

No considerar una reserva como tratamiento realizado.

## M1-05 · PROGRAMACIÓN

Utilizar intervalos explícitos:

`[start,end)`

El manager puede seleccionar o solicitar un horario permitido y gestionar recursos, respetando la indicación y autoridad profesional.

No inventar:

- Duración por defecto.
- Frecuencia semanal.
- Número de sesiones por lesión.
- Horarios profesionales.
- Regímenes terapéuticos.

Integrar con la autoridad Calendar y el allocator físico C1.

Confirmación, cancelación, reprogramación y ejecución serán persistentes e idempotentes.

---


## Technical representation within the approved boundaries

Clinical authorizations are explicit dated Staff evidence, scoped to one real TeamStaffAssignment, operation and INDICATE/PERFORM permissions. VERIFIED eligibility requires a nonempty credential evidence reference; no profession/credential is generated, no attribute threshold or job title grants permission, and no manager command grants credentials. These records represent supplied canonical evidence, not a new credentialing standard. Missing evidence fails the gateway. Existing Staff availability has no medical appointment agenda; it remains explicitly UNVERIFIED, and no conflicting work hours are manufactured.

An explicit clinical command records indication and required equipment references on an act in the original InjuryRecord/rehabilitation episode. No sessions are generated from rehabilitation modes. Completed acts provide operational fulfillment evidence only. Equipment compatibility/service evidence is separately dated on the physical component, with a source reference and explicit equipment tags; room type alone is insufficient. The tags are source references, not a fabricated machine catalog.

Medical reuses the C1 ledger with a typed MEDICAL owner. Legacy allocations default to TRAINING. A known exclusive component can reserve its explicit interval without converting patients to simultaneous players or claiming unknown quantitative capacity. Shared or unspecified capacity does not receive a fabricated confirmed quantitative booking. Known incompatible claims remain binding. Intervals use existing C1 minute precision and its 1-240 minute technical bounds; there is no default duration, frequency or regimen.

The manager may request a clinical decision from an accredited professional, schedule/reprogram resources and cancel; the clinical gateway independently validates the professional. Calendar records real execution after revalidation. Missing resources leave an indicated act pending/blocked without completing treatment or slowing natural recovery. Old saves and bootstrap never generate equipment, credentials or retroactive acts.

Historical indication retains the dated VERIFIED INDICATE grant and actual original Team assignment as accepted evidence on the same Medical act. Their identities, scope, credential reference and date must match the prescriber/Team/indication. This is historical source evidence, not a second clinical history or live permission. Staff departure may delete the active assignment; revocation or departure does not erase the accepted indication. Execution separately requires currently VERIFIED PERFORM authority over the interval. New scheduling is future-date only, consistent with the next-day Calendar executor. Replays of an accepted command preserve terminal outcomes without reactivation.
