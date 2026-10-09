# BS15 / BS16 / BS17 — Integration readiness

Fecha de auditoría: 2026-10-09. Alcance: refs, ancestry, certificaciones versionadas y diferencias de código; planificación de integración, sin ejecución de integración.

**Resultado global: REQUIRES_CONFLICT_RESOLUTION.** No existe entre los destinos inspeccionados una ancestry que contenga las tres líneas. BS15 está certificado completo; BS16 está certificado por entregas hasta K-C, pero su programa global continúa pendiente; BS17D sigue PARTIAL. La ausencia de procedimientos especializados Medical no se resuelve mediante un merge.

## 1. Bases verificadas y límites de evidencia

Se inspeccionaron refs locales y remote-tracking, sin fetch. `origin/main` significa el ref observado, no una comprobación del servidor remoto actual. `github/main` apunta todavía a `a6826469c78f8f948d73fd663e4996a99d30c678`; no debe confundirse con `origin/main`.

Identificadores usados en la matriz:

- **L — main local:** `8a0b359e9ae48fe372668241788c9d5aa7a33b03`. Worktree `C:/BDM`, limpio al inspeccionarlo. Contiene BS16C/D/E anteriores a la reconciliación canónica posterior.
- **O — origin/main y candidato integration-bs15-final-local:** ambos `94c077092224a9f75c861a853d9d52fceae526fe`. Worktree `C:/BDM-BS15-INTEGRATION`, limpio al inspeccionarlo. Contiene BS15 completo.
- **T — origin/bs15i-final y github/bs15i-final:** `a20ea256216d1256b707591103f7beceed27ea57`, commit `test(talent): certify population save and long horizon`.
- **C — bdm-stage2-bs16-finance-canonical:** `97c58b98b9192a569f30bdfd8b63565f0b02a744`, commit `test(finance): certify economic source policy closure`. Worktree `C:/BDM-BS16-CANONICAL`. Este informe fija ese commit como candidato certificado, sin incorporar su trabajo sin commit.
- **B — bdm-stage2-bs16-finance-strengthening:** `b5c43115b367b7627753909ba3782e74c1e3640c`. Worktree `C:/BDM-BS16-FINANCE`. Línea alternativa antigua, no fuente canónica acumulativa.
- **S — bdm-stage2-bs17d-medical-closure:** `6945cb90604bd349edd9d2333aa7d1861e9a311a`. Worktree `C:/BDM-BS17-FACILITIES`, limpio al inicio. Incluye P0 `db2c117b845e708c21dc5e805d2949842dcd1fc6`, BS17A/B/C y L.
- **A — ancestro común de L/O/C/S:** `a6826469c78f8f948d73fd663e4996a99d30c678`.

### Trabajo externo sin certificar

Durante la auditoría aparecieron cambios en C; no se editaron ni descartaron. Snapshot 2026-10-09 14:11:39 Europe/Madrid, HEAD todavía `97c58b9`:

- Modificados: `src/app/game/AcbDemoEconomicPolicy.ts`, `createAcbTestGame.ts`; `src/domain/finance/CompetitionEconomicProfile.ts`, `ContractFinancialSchedule.ts`, `EconomicSourceProvisioning.ts`, `RevenueEngine.ts`; `src/domain/staffContract/StaffContract.ts`; `src/engine/finance/ClubFinanceLifecycle.ts`; `src/save/GameWorldSaveV3.ts`.
- Sin seguimiento: `src/domain/finance/ReceivableCollection.ts`, `src/zz-probe.test.ts`.

Ese estado puede seguir avanzando. **BLOCKED_BY_DEPENDENCY** para usarlo como nueva fuente: su propietario debe completar validación y proporcionar SHA certificado. La mera existencia de `ReceivableCollection.ts` no certifica una política de cobro. B tiene además artefactos sin seguimiento `analyze.cjs`, `bs16c-branch-failures.txt`, `bs16c-branch.json`, que tampoco forman parte del candidato C.

## 2. Matriz de ancestry real

La fila es el origen; la columna es el destino. `1` significa `git merge-base --is-ancestor` verdadero, incluido el propio commit. O representa también `integration-bs15-final-local`, que tiene exactamente el mismo SHA.

```text
origen / destino   L O T C B S
L                  1 0 0 0 0 1
O                  0 1 0 0 0 0
T                  0 1 1 0 0 0
C                  0 0 0 1 0 0
B                  0 0 0 0 1 0
S                  0 0 0 0 0 1
```

Merge-base y número de commits exclusivos izquierda/derecha:

- L / O: A, **3 / 10**.
- O / C: A, **10 / 24**.
- O / S: A, **10 / 8**.
- C / S: A, **24 / 8**.
- B / C: `cedbb71398c4ca6dd96f8191a48d0fa4e9c31329`, **2 / 21**.

O es un merge real de dos padres: A y T. No contiene L ni C ni S. S contiene L, pero no O/T ni C. C no contiene L como commit, aunque incorpora trabajo equivalente de BS16C/D/E.

Los patches D `0c9b43e`/`0896a4a` y E `8a0b359`/`361b9b3` tienen respectivamente el mismo patch-id estable. C `e934cba`/`3628e17` no tiene patch-id idéntico; entre sus árboles también hay diferencias de Foundation y documentación. Equivalencia parcial de contenido nunca sustituye ancestry ni autoriza ejecutar dos veces una migración.

## 3. Estado de las líneas y clasificación

### BS15: certificado completo; candidato de integración O

**READY_TO_INTEGRATE como fuente certificada**, sujeto a resolución y certificación del destino combinado; no significa merge automático limpio.

La evidencia final es `BS15I_LONG_HORIZON_CLOSURE.md` en T/O:

- PASS · BS15I POPULATION, SAVE & LONG-HORIZON CERTIFICATION.
- PASS · BS15 GLOBAL TALENT PROGRAM COMPLETE.
- Y7 preservado; continuidad Y8–Y30, gates LIGHT anuales y DEEP Y10/Y20/Y30.
- Y30 `2062-10-01`: 4.226 Players, 3.217 activos, 1.009 con carrera finalizada; Save V4 exacto e idempotente, identidad y contratos conservados.
- Save documentado: `C:/Temp/BS15I-final-y30-save-v4.json`, 2.590.494.979 bytes, SHA256 `c98fd8d526afbaf4853e25ba3b1876ae74b5b84f0458413c01e56a550d04e0d9`.

Son resultados históricos versionados: esta auditoría no reabrió ni volvió a cargar ese artefacto, ni repitió Y1–Y30. El ledger inicial pendiente de `BS15I_POPULATION_SAVE_LONG_HORIZON_CERTIFICATION.md` no invalida el cierre posterior.

`BS15_FINAL_INTEGRATION.md` documenta 19 conflictos resueltos, 364 tests/42 archivos PASS en el conjunto focal, comprobaciones adicionales y typecheck/build/diff PASS. También documenta un fallo preexistente en MAIN: `StaffCultureCohesionPipeline.test.ts`, caso de cohesión invariable a través de varios lunes, cuya expectativa 50 contradice el efecto Training 54 ya en A. No equivale a una suite global totalmente verde ni debe esconderse al integrar.

### BS16: canónica C, programa incompleto

**READY_TO_INTEGRATE como snapshot certificado hasta K-C**, con **REQUIRES_CONFLICT_RESOLUTION** frente a O/S. **BLOCKED_BY_DEPENDENCY** para declarar BS16 global completo o usar cambios posteriores sin certificar.

Autoridad de roadmap: sección 16 de `BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md`, reconciliada 2026-10-09; prevalece sobre las recomendaciones antiguas de la sección 15.

- A/B/C/D certificados; E reconciliado por F.
- F: activación canónica, moneda y frontera Spain; G: cruce major/minor y periodo fiscal.
- H: apertura **PARTIAL**, cero veraz cuando falta fuente legítima de dinero inicial.
- I: ciclo financiero diario, payroll y procesamiento inicial exactamente una vez.
- J: Treasury settlement certificado.
- K/K-C: fuentes económicas y activación certificadas bajo **BDM DEMO ECONOMIC POLICY V1**; último SHA C.
- Pendientes canónicos: **BS16L → BS16M → BS16N**. L financiación/capital; M convergencia de consumidores y Financial AI; N certificación de horizonte, rollover fiscal, renovación y cierre.

Política demo aprobada: EUR 2,4 millones/club/año fiscal, doce cuotas de EUR 200.000; EUR 25.000 por partido local para operaciones. Ingresos reconocidos son receivables, no cash. Payroll no se sustituye por OPEX; no se inventa cobro, saldo inicial, cambio 1:1 ni renovación automática de presupuesto.

Riesgo de fecha inicial en C: el roadmap registra el arranque ACB que omite 576 ocurrencias de payroll Staff. El resto de entradas procesa la fecha inicial exactamente una vez. No declarar cerrada esta frontera por el trabajo externo observado: exigir prueba causal y certificado del SHA que la repare. Renovación de presupuesto sigue RENEWAL_NOT_MODELLED; cobro de receivables sigue sin modelar en C.

La rama B contiene la antigua alternativa `FinancialDecision.ts`/`FinancialReservations.ts`; C usa `FinancialAuthority.ts`. B no es ancestro de C. **No añadir B íntegramente**: duplicaría autoridad y estructuras Save. Su Foundation común ya está en C; cualquier comportamiento perdido requeriría reconciliación explícita dentro del contrato canónico.

### BS17: fuente certificada S, global PARTIAL

**READY_TO_INTEGRATE como fuente certificada de A/B/C/P0/M**, con **REQUIRES_CONFLICT_RESOLUTION** frente a O/C.

- Training LIVE para el registro explícito de operaciones de cancha, preservando autoridad de efectos de Training.
- Medical especializado NOT_IMPLEMENTED: no existen procedimientos productivos materiales que Facilities pueda restringir. Advisory no es ejecución; Injury/Recovery/RTP y BS12C no cambian.
- Talent BLOCKED_BY_LINEAGE en S.
- Capacidad operativa sin allocator sigue desconocida; capacidad nominal no genera cuotas ni reservas.
- BS17E sigue BLOCKED_BY_DEPENDENCY respecto de BS16 y de políticas económicas/institucionales pendientes; decisiones no aprobadas siguen BLOCKED_BY_PRODUCT_DECISION.

Certificado M: 255 tests/25 archivos, incluidos ocho pares Medical negativos y regresión Training; typecheck/build/diff PASS. No constituye PASS global de BS17D.

## 4. Conflictos potenciales, no merges simulados

Método exclusivamente de lectura: paths modificados desde A, blobs de tips y rangos de hunks `git diff --unified=0`. Solapamiento indica riesgo, no resultado real de Git. No se ejecutó merge ni merge-tree. Hunks separados tampoco demuestran compatibilidad semántica.

- **O / C:** cinco paths compartidos. Hunks solapados en `createNewGame.ts`, `domain/finance/index.ts`, `CalendarEngine.ts`, `GameWorldSaveV4.ts`; cambios separados en `GameWorld.ts`.
- **O / S:** seis compartidos. Solapamiento en `createNewGame.ts`, `GameWorld.ts`, `ScheduledTrainingEngine.ts`, `GameWorldSaveV4.ts`; separados en `domain/finance/index.ts` y `GameWorldSaveV1.ts`.
- **C / S:** veinte compartidos. Diez blobs finales idénticos; cuatro archivos añadidos en ambos con contenido distinto (`FinanceActivation.ts`, `FinanceActivation.test.ts`, `FinanceActivationLoad.test.ts`, `FinanceActivationPersistence.test.ts`). Solapamiento en `ARCHITECTURE.md`, `createNewGame.ts`, `domain/finance/index.ts`, `GameWorld.ts`, `GameWorldSaveV4.ts`; cambios separados en `facilitiesPresentation.ts`.

No escoger un archivo completo por preferencia de rama. La resolución debe preservar las siguientes autoridades.

### GameWorld y ejecución diaria

BS15 conserva validación incremental por bloques sucios, rollback y publicación atómica, índices de Injury/validación histórica y copias por registro para grandes colecciones. BS16 conserva cuentas, payroll, reservas y moneda. BS17 conserva secuencia histórica física en el mismo día y evidencia de intento Training.

El ejecutor Training de O tiene batching, cache y flush de sesiones/evidencias. Incorporar el gate físico P0 en **ese ejecutor**, registrando bloqueos por sus vías existentes; no reemplazarlo con el ejecutor anterior de S. Un bloqueo no produce estímulo ni efectos deportivos, pero su causa sí debe persistir y entrar en validación incremental. La identidad inmutable de sesión completada excluye `physicalAttempt` conforme al contrato P0.

### Save V4 y compatibilidad

Unir colecciones, parsers y whitelist de claves: Talent/career-end/eligibility de BS15, reservas/periodos/fuentes financieras de BS16, status/condition/sequence/evidencia física de BS17. Preservar defaults legítimos para datos antiguos, validación estricta y reconstrucción de derivados.

`GameWorldSaveV1.ts` también requiere reconciliación semántica: migración Talent y copia por registro BS15 junto con parser opcional de `physicalAttempt`. No volver a aplicar backfill V3 a un V4 ya válido; cargar dos veces no crea Players, contratos, registros ni reservas adicionales. No persistir disponibilidad derivada como nueva autoridad.

### Calendar

Una agenda canónica: suministro anual Talent, fin de carrera y salidas/eligibilidad NCAA exactamente una vez; `CLUB_FINANCE_V2` procesa hechos financieros diarios y Treasury después de su reconocimiento; el gate Facilities se consume dentro de la fase Training existente.

Conservar equivalencia sync/async y publicación final única. No añadir segunda agenda Training, doble payroll, segunda materialización ni transacción abierta a través de await. El texto antiguo de resumen de fase no sustituye al procesador financiero efectivo de C.

### Bootstrap

`createNewGame`: generación/cohortes y carry-forward fechado BS15 + Foundation/activación financiera BS16 + procesamiento de fecha inicial exactamente una vez.

`createAcbTestGame`: política demo económica explícita y mundo mixto; `WorldDbSpainGame`: frontera moneda/Foundation; `WorldDbGameBootstrap` y Rust: lectura física BS17 del DB. Son interacciones semánticas aunque algunos archivos no coincidan en un diff.

Las asociaciones de origen de activos no conceden derechos Team. Clasificación/anatomía desconocida sigue desconocida. No inventar dinero, assets, derechos o fechas para hacer verde un bootstrap.

### Finance, Facilities y UI

`FinancialAuthority`/reservas y ledger de C son autoridad financiera; CF5 salary cap continúa separado; CFI7 es la frontera Finance–Facilities. `legacyMajorUnitsToMoney` es el cruce major/minor aprobado, no una conversión FX.

Preservar precisión monetaria de C en Facilities y explicaciones/causas históricas, enlaces y comandos de reprogramación P0. El registro UI de O ya contiene Talent/Portal y otras aplicaciones: no sustituirlo por una lista antigua. UI y Zustand no absorben simulación.

## 5. Pruebas obligatorias para el futuro destino integrado

Esta auditoría no ejecuta tests de simulación: los PASS citados pertenecen a certificados históricos. Antes de certificar convergencia, ejecutar cobertura existente relevante y añadir pares cruzados donde ningún certificado individual cubre la interacción.

1. **World/Calendar/performance preservada:** `BS15FinalIntegration.test.ts`, `DailyWorldValidation.test.ts`, `DailyWorldValidationPublication.test.ts`, dirty blocks/rollback, sync/async y WSR1. Comparar mundos equivalentes en fechas de mes/año y 1 de julio mediante fixtures cortos. No repetir Y1–Y30 ni reabrir performance sin defecto patológico nuevo demostrado.
2. **Talent:** `TalentSupply.test.ts`, `YouthPathwayEngine.test.ts`, recruiting/materialización, NCAA eligibility/portal, Draft/rights y career-end. Mismo candidateKey da mismo PlayerId; ningún gate Facilities genera Players ni altera RNG o cohortes.
3. **Finance:** `ClubFinanceLifecycle.test.ts`, `ClubTreasuryLifecycle.test.ts`, `ContractFinancialSchedule.test.ts`, `TreasurySettlement.test.ts`, `EconomicSourceProvisioning.test.ts`, `CompetitionEconomicProfile.test.ts`, `CanonicalFinanceStack.integration.test.ts`, activación/persistencia y frontera Spain. Fecha inicial y repetida, payday con Talent/NIL, fiscal rollover y unidades minor sin doble asiento/cobro ni autorización confundida con cash.
4. **Facilities y Training:** CFI8/capabilities/access rights, `FacilityPhysicalOperations.test.ts`, `WorldDbPhysicalContent.test.ts`, `TrainingPhysicalConsequences.test.tsx`, `FacilitiesWorkspace.test.tsx`. Pares idénticos salvo recurso: funcional/limitado/OOS, derechos válidos/denegados/expirados, desconocido, alternativa y restoration. Training bloqueado conserva Finance/Governance y agenda financiera; restauración ejecuta efectos una sola vez.
5. **Medical/BS12C:** `MedicalPhysicalCompatibility.test.ts` y suites Injury/Rehabilitation/Advisory/RTP. Recursos físicos no alteran diagnóstico, duración, eficacia o RTP sin un procedimiento real aprobado.
6. **Save:** fixtures V4 de cada fuente y fixture combinado con Talent + hechos financieros + secuencia física + intento Training. Save/reload/reload, registros antiguos sin campos opcionales, errores de claves/IDs y preservación de identidad/contratos. `GameWorldSaveV4.Facilities.test.ts`, Finance activation/reservation persistence y `LargeSaveV4File.test.ts`; cubrir helpers de grandes colecciones sin repetir el horizonte certificado.
7. **Bootstrap y transacciones:** nuevo juego prototype/ACB/Spain con las tres autoridades; derechos desconocidos no penalizan; fallo de validación revierte también los hechos Finance y `physicalAttempt`; no omitir colecciones nuevas del conjunto dirty.
8. **Puerta final:** npm test, typecheck, build, cargo fmt/check para integración nativa, diff y fronteras de imports/RNG. Resolver o declarar expresamente el fallo heredado de cohesión conforme a su autoridad; nunca borrar cobertura ni presentar el fallo preexistente como nuevo defecto de escala. Cualquier regresión nueva bloquea el certificado de convergencia.

## 6. Orden recomendado y decisiones pendientes

1. Fijar manifiesto con O/C/S. Si BS16 entrega un SHA posterior certificado, reevaluar su delta y reemplazar C explícitamente; no copiar su working tree activo.
2. En una **futura ejecución autorizada**, crear worktree/rama de convergencia aislada desde O. Integrar C primero y certificar World/Save/Calendar/bootstrap financieros con BS15. Esto no declara BS16L/M/N completados.
3. Integrar S sobre esa base, preservando la implementación BS15 batched y la autoridad financiera más reciente de C. S aporta además ancestry de L; no aplicar otra vez sus C/D/E ni integrar B.
4. Ejecutar pruebas cruzadas y publicar SHA/certificado del destino combinado. Solo entonces hay base certificable para BS17D-T. No avanzar main hasta una operación de integración expresamente autorizada y validada.
5. Implementar BS17D-T como milestone separado, sobre el SHA combinado; BS16L/M/N y BS17E mantienen sus dependencias propias.

**REQUIRES_CONFLICT_RESOLUTION:** O+C+S por los solapamientos y contratos compartidos anteriores.

**BLOCKED_BY_DEPENDENCY:** trabajo BS16 sin certificado; BS16 global L/M/N; BS17D-T en las bases actuales por ancestry; Medical especializado por ausencia de operación productiva; BS17E por cierre financiero pendiente.

**BLOCKED_BY_PRODUCT_DECISION:** políticas económicas todavía no aprobadas (apertura/funding, cobro en C, fuentes comerciales restantes, OPEX Facilities y otros costes), nuevos procedimientos clínicos o asignación cuantitativa de recursos si se pretendieran introducir. La integración no decide esos asuntos.

## 7. Viabilidad concreta de BS17D-T

**Sí, de forma condicional sobre una base integrada y certificada; no sobre S actual.** BS15 ya posee `acceptYouthIntake`, promociones y releases en `YouthPathwayEngine.ts`, cohortes/materialización canónica y registro idempotente. Son operaciones de identidad/registro, no prueba automática de una actividad física ejecutada.

P0 permite consumir su resolver puro con Team/date, operación, capability explícita y demanda/intervalo conocidos. Facilities devuelve evidencia; BS15 conserva la decisión de la operación propietaria y la identidad del Player. No se infieren cuotas de academia a partir de canchas o capacidad nominal, ni un derecho Organization se transforma en autorización Team.

Una vez eliminada la dependencia de ancestry, auditar la operación concreta y su requisito aprobado antes del wiring. Si no hay requisito aprobado para un consumidor real, registrar esa limitación o decisión pendiente, sin fabricar uno. Integrar ramas no basta para declarar Talent LIVE ni BS17D global PASS.

## 8. Siguiente acción ejecutable y cierre de esta auditoría

Preparar una ejecución separada de convergencia con O `94c0770`, C `97c58b9` y S `6945cb9` fijados, o esperar el siguiente SHA certificado de BS16 si se desea incluir su trabajo activo. Su primer paso ejecutable será crear un worktree aislado desde O y resolver O+C según las autoridades y pruebas de este informe; ningún paso de merge está autorizado por esta auditoría.

Se creó únicamente este informe en una rama documental aislada de Facilities desde S. No se modificaron implementaciones productivas, main, refs remotos ni otras worktrees. No se ejecutaron merge, cherry-pick, rebase, fetch ni push. La evidencia Git se contrastó con refs/merge-bases y el diff documental; no se certificó una integración inexistente.

### Fuentes versionadas

- O/T: `docs/strengthening/BS15I_LONG_HORIZON_CLOSURE.md`, `BS15_FINAL_INTEGRATION.md`.
- C: `docs/strengthening/BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md`, roadmap canónico sección 16 y certificados de sus entregas.
- S: `docs/strengthening/BS17D_P0_SPORTING_OPERATIONS_POLICY.md`, `BS17D_P0_SPORTING_OPERATIONS_CERTIFICATION.md`, `BS17D_M_MEDICAL_PHYSICAL_OPERATIONS_CLOSURE.md`.
- Ancestry: refs y objetos Git locales completos citados arriba; clasificación de conflictos mediante lectura de diffs, sin integración de prueba.
