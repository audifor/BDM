# BDM · BS17D-T
## TALENT PIPELINE / FACILITIES CANONICAL INTEGRATION

### MANDATO

Continuar BS17D sobre la convergencia V2 certificada.

Objetivo: conectar Facilities con las operaciones físicas legítimas del Talent Pipeline, preservando íntegramente BS15 y la política de realismo equilibrado BS17D-P0.

Usar BDM Fast Loop:

Auditoría focal → verificación de política → implementación permitida → wiring MX → pruebas causales → autocorrección → certificación.

No repetir la auditoría completa de BS15.

No ejecutar otra simulación de 30 años.

## 0. BASE

Repositorio: `C:\BDM`

Fuente certificada:

`fbe788ce01f1dd34fc40b360b4661ebaad63457c`

Worktree fuente:

`C:\BDM-INTEGRATION-BS15-BS16-BS17`

Crear una nueva worktree aislada:

`C:\BDM-BS17D-TALENT-FACILITIES`

Rama:

`bdm-stage2-bs17d-talent-facilities`

Crear la rama desde el SHA certificado, nunca desde un working tree modificado.

Preservar íntegramente la worktree de convergencia.

No modificar main, origin/main, BS16 ni otras worktrees.

Leer contratos BS15, BS17D-P0, certificación BS17D-M y convergencia V2.

## 1. AUTORIDADES

BS15 es la única autoridad para:

- PlayerId.
- CandidateKey.
- Talent generation.
- Youth intake.
- Materialization.
- Academy registration.
- Pathways.
- Recruiting.
- NCAA.
- Portal.
- Draft.
- Career progression y career-end.

Training conserva su autoridad de sesiones, estímulos y desarrollo.

Facilities aporta exclusivamente:

- Facility y Place.
- Componentes.
- Capabilities.
- Serviceability.
- Derechos temporales.
- Disponibilidad física.
- Capacidad conocida.
- Limitaciones verificables.

No crear una segunda autoridad.

## 2. CONTRATO DE PRODUCTO

Aplicar BS17D-P0: REALISMO EQUILIBRADO.

Reglas obligatorias:

1. Infraestructura desconocida no implica ausencia de instalaciones.
2. UNKNOWN conserva continuidad.
3. Restricción física demostrada afecta únicamente a una operación que exige el recurso.
4. OUT_OF_SERVICE impide usar el componente afectado.
5. LIMITED requiere compatibilidad concreta.
6. Ausencia acreditada de derechos impide utilizar un recurso conocido.
7. Derechos Organization no se convierten automáticamente en Team rights.
8. Capacidad nominal no implica disponibilidad operativa.
9. No inventar ocupación ni reservas.
10. Ninguna Facility crea Players.
11. No introducir multiplicadores de potencial, desarrollo o captación.
12. No modificar las reglas de registro, reclutamiento o elegibilidad de BS15.

### Política por operación

- Youth intake: no imponer cuotas derivadas de edificios sin contrato aprobado.
- Materialization: preservar identidad y generación canónica.
- Registration: no introducir requisitos arquitectónicos ficticios.
- Academy activities: condicionar únicamente operaciones físicas existentes que tengan requisitos aprobados.
- Academy training: reutilizar la autoridad Training y su gate Facilities si realmente consume operaciones de cantera.
- Accommodation: no imponer límites sin capacidad/demanda comparables y autoridad de asignación.
- Recruiting/Portal: no introducir ventajas automáticas por estándar físico.
- Development: no añadir multiplicadores de rendimiento.

Estas reglas son límites de integración. No constituyen autorización para inventar operaciones nuevas.

Si una operación concreta requiere una decisión de producto adicional, documentarla y mantenerla bloqueada.

## 3. AUDITORÍA FOCAL DEL PIPELINE REAL

Inspeccionar:

- YouthPathwayEngine.
- TalentSupply.
- Academy registration.
- Youth intake/materialization.
- Training consumers juveniles.
- College pathways cuando corresponda.
- Calendar phases relacionadas.
- BS15 Save V4.
- BS17 facilitiesSporting.

Localizar operaciones ejecutadas realmente por código productivo.

Clasificar cada candidato:

- PHYSICAL_OPERATION_EXISTS.
- PHYSICAL_REQUIREMENT_APPROVED.
- READ_ONLY_PHYSICAL_CONTEXT.
- NO_PHYSICAL_REQUIREMENT.
- BLOCKED_BY_PRODUCT_DECISION.
- NOT_IMPLEMENTED.

No interpretar la existencia de ACADEMY_CENTER como prueba de una sesión juvenil ejecutable.

No confundir la inscripción de un jugador con la utilización física de una instalación.

## 4. IMPLEMENTACIÓN CANÓNICA

Si existe una operación física real con requisitos aprobados:

Facility → component → usage right → CFI8 → requisito → operación BS15/Training → consecuencia real.

Aplicar restricciones físicas únicamente en ese consumidor.

Preservar:

- RNG.
- CandidateKey.
- PlayerId.
- Idempotencia.
- Elegibilidad.
- Materialización.
- Save.
- Procesamiento Calendar.
- Validación incremental.
- Rendimiento batching.

Si la operación pertenece a Training, el resultado pertenece a Training.

Si la operación pertenece a BS15, el resultado pertenece a BS15.

Facilities no muta directamente Players.

Si no existe una operación legítima que conectar, no fabricarla para conseguir PASS.

En ese caso, implementar únicamente el contexto informativo que aporte valor real y documentar el bloqueo del consumidor deportivo.

## 5. MX / UI

Las pantallas Talent podrán mostrar:

- Infraestructura asociada.
- Disponibilidad física conocida.
- Derechos.
- Limitaciones.
- Estado desconocido.
- Operaciones afectadas cuando existan.
- Navegación a Facilities.

No mostrar:

- Bonos ficticios de academia.
- Porcentajes de captación inventados.
- Incrementos automáticos de potencial.
- Capacidad operativa no conocida.
- Penalizaciones por falta de datos.

Cualquier consecuencia mostrada deberá estar respaldada por una operación productiva.

## 6. PRUEBAS CAUSALES

Probar como mínimo:

1. Identidad PlayerId estable.
2. Materialización idempotente.
3. UNKNOWN conserva continuidad.
4. Derecho válido y ausencia acreditada de derecho.
5. Componente operativo frente a OUT_OF_SERVICE.
6. Restauración física.
7. Disponibilidad compartida.
8. No generación adicional de Players.
9. No alteración arbitraria de potencial.
10. No efectos globales de Facilities.
11. Save/reload.
12. Calendar exactly-once.
13. Talent y Finance preservados.
14. Training P0 preservado.
15. Ausencia de escrituras nuevas Finance/Governance.

Para declarar un consumidor LIVE, añadir al menos un test causal que demuestre una diferencia real de operación con dos mundos que solo difieren en infraestructura.

No declarar LIVE por representar información en una pantalla.

## 7. CERTIFICACIÓN

Separar claramente:

- TALENT PHYSICAL CONTEXT: LIVE/PARTIAL/ABSENT.
- TALENT PRODUCTIVE CONSUMER: LIVE/BLOCKED/NOT_IMPLEMENTED.
- TRAINING ACADEMY CONSUMER: LIVE/BLOCKED/NOT_IMPLEMENTED.
- PLAYER SUPPLY AUTHORITY: PRESERVED/FAIL.
- SAVE/CALENDAR: PASS/FAIL.
- MX: PASS/PARTIAL.

No declarar BS17D global COMPLETE únicamente por completar este trabajo.

Si no existe consumidor Talent con requisito físico aprobado:

`PASS · BS17D-T INTEGRATION AUDIT`

para el análisis validado, pero:

`TALENT FACILITIES CONSUMER: NOT_IMPLEMENTED`

y BS17D permanece PARTIAL.

Si existe consumidor real implementado, exigir causalidad productiva y pruebas completas antes de emitir PASS de dicho consumidor.

## 8. VALIDACIÓN

- Tests focales Talent.
- Tests Facilities.
- Training P0.
- Save V4.
- Calendar.
- Convergence cross-system.
- Typecheck.
- Build.
- Diff check.

No repetir World DB longitudinal de 2029.

No reabrir BS15 Y1-Y30.

Mantener la limitación histórica de convergencia V2.

## 9. GIT

Commits locales únicamente para cambios validados.

Sin merge ni push.

No modificar la rama certificada de convergencia.

Worktree nueva limpia al finalizar.

## 10. RESULTADO

BS17D-T RESULT

- STATUS
- BASE / FINAL SHA
- TALENT OPERATIONS AUDITED
- APPROVED PHYSICAL REQUIREMENTS
- LIVE PHYSICAL CONSUMERS
- READ-ONLY CONSUMERS
- PLAYER SUPPLY AUTHORITY
- TRAINING INTEGRATION
- RIGHTS / CAPACITY
- CAUSAL TESTS
- SAVE
- CALENDAR
- MX / UI
- FINANCE / GOVERNANCE DIFF
- TESTS
- TYPECHECK
- BUILD
- DIFF CHECK
- PRODUCT DECISIONS STILL REQUIRED
- BS17D GLOBAL STATUS
- NEXT ACTION

No iniciar BS17E/F mientras sus dependencias BS16 permanezcan abiertas.