# BDM · BS17D-T1
## RECRUITING FACILITY DEMONSTRATIONS

### MANDATO

Implementar la demostración opcional de instalaciones físicas como actividad integrada en las visitas de reclutamiento existentes del BS15 Recruiting RPG.

**Política de producto BS17D-T1: APROBADA.**

Ejecutar mediante BDM Fast Loop:

Auditoría focal → integración → wiring UI → pruebas causales → autocorrección → certificación PASS/FAIL.

No solicitar aprobaciones intermedias para las reglas ya aprobadas.

## 0. ENTORNO

Repositorio: `C:\BDM`

Fuente certificada:

`64abd26a50e93fd827f27dccabaa486e0e73dd04`

Worktree fuente:

`C:\BDM-BS17D-TALENT-FACILITIES`

Crear worktree independiente:

`C:\BDM-BS17D-T1-RECRUITING`

Rama:

`bdm-stage2-bs17d-t1-recruiting-facilities`

Verificar Git y ancestry antes de comenzar.

No modificar main, la convergencia V2, BS16 ni otras worktrees.

Mantener la certificación histórica V2 dentro de su alcance original.

## 1. AUDITORÍA FOCAL OBLIGATORIA

Inspeccionar únicamente los contratos existentes de:

- BS15 Recruiting RPG.
- Visitas oficiales y no oficiales.
- Contact periods / dead periods.
- Recruiting relationships.
- Promesas y decisiones.
- Visitas programadas y completadas.
- Manager recruiting UI.
- Recruiting AI.
- CFI8 y facilitiesSporting.
- YouthFacilitiesReadModel.
- Save V4.
- Calendar y processing exactly-once.

Determinar:

1. Qué entidad representa una visita.
2. Cómo se programa.
3. Cómo se ejecuta.
4. Qué decisiones permite.
5. Qué resultados persiste.
6. Cómo funciona su UI.
7. Qué puede extenderse sin crear otra autoridad.

**GATE:** solo implementar la actividad si puede vincularse legítimamente al flujo de visitas existente.

No crear un segundo motor de visitas.

No modificar el número, duración, elegibilidad, restricciones NCAA o calendario de visitas.

Si la integración requiere reemplazar una autoridad BS15, detener esa implementación y documentar BLOCKED_BY_ARCHITECTURE.

## 2. CONTRATO DE PRODUCTO BS17D-T1

La demostración es una actividad opcional dentro de una visita ya válida.

El manager podrá elegir incluir una demostración física cuando exista una instalación compatible.

Las posibles situaciones son:

**VERIFIED_AVAILABLE**

Instalación compatible, accesible y operativa.

La demostración puede ejecutarse y registrarse como completada.

**VERIFIED_LIMITED**

Existe una limitación acreditada.

Solo se permite la demostración si la actividad concreta es compatible con esa limitación.

**VERIFIED_UNAVAILABLE**

La instalación requerida está fuera de servicio, carece de acceso acreditado o tiene una restricción incompatible.

La demostración no se ejecuta.

La visita general continúa conforme al flujo Recruiting existente.

**UNVERIFIED_PHYSICAL_CONTEXT**

No hay información suficiente para acreditar disponibilidad o ausencia.

La visita mantiene su comportamiento anterior.

No registrar una demostración verificada ni aplicar penalizaciones ficticias.

**NOT_SELECTED**

El manager no ha incluido demostración física.

La visita funciona exactamente como antes.

## 3. DERECHOS Y DISPONIBILIDAD

Utilizar exclusivamente:

- Facility.
- FacilityComponent.
- Temporal Usage Rights.
- Team rights.
- Serviceability.
- Capabilities.
- Physical availability.
- BS17C project disruptions.
- CFI8 canonical context.

No inferir derechos Team a partir de propiedad Organization.

No inferir que el prospecto posee derechos de uso por haber sido invitado.

La comprobación de acceso corresponde al equipo u organización que realiza la actividad, conforme al contrato canónico.

Respetar las reglas purpose-agnostic existentes.

Si existen instalaciones alternativas legítimas, ofrecerlas sin duplicar la actividad.

No inventar capacidad operativa, reservas de espacios ni franjas horarias.

## 4. CONSECUENCIA REAL

Una demostración ejecutada debe producir una evidencia persistente de la actividad vinculada a la visita BS15.

Registrar, según las convenciones existentes:

- Visit ID.
- Prospect ID.
- Organization/Team.
- Facility ID.
- Component ID cuando corresponda.
- Fecha de actividad.
- Estado.
- Resultado.
- Razón de bloqueo, si existe.
- Evidencia física utilizada.

No duplicar el estado de disponibilidad derivado.

No introducir porcentajes de interés.

No alterar:

- Player potential.
- Player ratings.
- Recruiting affinity.
- Commitment probability.
- NIL.
- Scholarship rules.
- Recruitment costs.
- Visit eligibility.

La consecuencia real de T1 es la ejecución o imposibilidad de la actividad física, no una modificación automática de la decisión del prospecto.

Cualquier efecto psicológico o de Recruiting RPG requerirá una futura política explícita.

## 5. INTEGRACIÓN RECRUITING

Añadir la demostración como actividad subordinada a la visita canónica.

Preservar:

- Autoridad del evento de visita.
- Restricciones NCAA versionadas.
- Periodos de contacto.
- Límites personales.
- Reglas oficiales/no oficiales.
- Recruiting staff.
- Determinismo.
- Commitments y promesas.
- Calendar.
- Recruiting AI existente.

No convertir una demostración en una nueva visita.

No consumir permisos de visita adicionales.

No crear una obligación económica.

No ejecutar una demostración dos veces tras reload o reprocesamiento del calendario.

Si la visita se cancela, la actividad pendiente no puede completarse automáticamente.

## 6. MX / UI

Integrar en el flujo Recruiting existente.

El manager debe poder:

1. Consultar las instalaciones que pueden demostrarse.
2. Seleccionar opcionalmente una demostración.
3. Ver restricciones conocidas.
4. Entender cuándo falta información.
5. Confirmar la actividad junto a la visita existente.
6. Consultar el resultado.
7. Navegar a Facilities.

No crear una nueva aplicación.

No exigir una demostración en todas las visitas.

No mostrar ventajas ficticias de instalaciones sobre Recruiting.

No declarar completada una actividad únicamente porque exista su registro planificado.

## 7. PRUEBAS CAUSALES

Crear pruebas con dos mundos idénticos salvo una propiedad física.

Comprobar:

- Demostración disponible y ejecutada.
- Componente OUT_OF_SERVICE.
- LIMITED compatible/incompatible.
- Derecho válido y denegado.
- Derecho caducado.
- Instalación alternativa.
- UNKNOWN.
- Visita sin demostración.
- Cancelación de visita.
- Reintento.
- Save/reload.
- Calendar exactly-once.
- No duplicación de visitas.
- Restricciones NCAA intactas.
- No modificación de potencial.
- No bonus Recruiting.
- Sin movimientos Finance.
- Sin nuevas acciones Governance.
- PlayerId y CandidateKey intactos.
- Regresión BS17D Training P0.
- Regresión de la convergencia V2.

Verificar expresamente que un fallo físico afecta a la demostración, no cancela automáticamente toda la visita.

Para certificar LIVE:

Facility → derechos → disponibilidad → elección del manager → visita BS15 → actividad ejecutada/bloqueada → resultado persistido → UI.

Las pruebas deben demostrar la cadena real, no únicamente un read model.

## 8. AUTOCORRECCIÓN

Corregir defectos estrictamente dentro del alcance.

No modificar:

- MatchEngine.
- Training formulas.
- Medical/Recovery.
- Finance.
- Governance.
- Talent materialization.
- NCAA rules.
- Recruiting probabilities.
- AI recruitment policy.

No reconstruir sistemas ya certificados.

## 9. CERTIFICACIÓN

Declarar:

`PASS · BS17D-T1 RECRUITING PHYSICAL DEMONSTRATIONS`

únicamente si:

1. Se utiliza el flujo de visitas existente.
2. La demostración es opcional.
3. Se preservan reglas NCAA.
4. Existe consecuencia física ejecutable.
5. Existe decisión/interacción real del manager.
6. Los derechos y disponibilidad proceden de CFI8.
7. La indisponibilidad afecta solamente a la actividad correspondiente.
8. UNKNOWN mantiene continuidad.
9. Save y Calendar son idempotentes.
10. No hay bonificaciones Recruiting inventadas.
11. La UI refleja ejecución real.
12. Las pruebas causales pasan.
13. Typecheck PASS.
14. Build PASS.
15. Diff check PASS.

Si la arquitectura actual no soporta legítimamente esta actividad:

`BLOCKED_BY_ARCHITECTURE`

Documentar el bloqueo sin crear otro motor de visitas.

No declarar BS17D global COMPLETE por superar T1.

## 10. GIT

- Commit local.
- Working tree limpia.
- Sin merge.
- Sin push.
- Main intacta.
- Convergencia V2 preservada.

## 11. INFORME FINAL

**BS17D-T1 RESULT**

- STATUS
- BASE / FINAL SHA
- VISIT AUTHORITY
- NCAA COMPATIBILITY
- PHYSICAL DEMONSTRATION OPERATION
- MANAGER ACTION
- CFI8 INTEGRATION
- RIGHTS / AVAILABILITY
- LIVE CONSEQUENCES
- RECRUITING EFFECTS
- SAVE
- CALENDAR
- MX / UI
- CAUSAL TESTS
- REGRESSION TESTS
- TYPECHECK
- BUILD
- DIFF CHECK
- BLOCKERS
- BS17D GLOBAL STATUS
- NEXT ACTION

No iniciar BS17E/F mientras BS16 siga pendiente.