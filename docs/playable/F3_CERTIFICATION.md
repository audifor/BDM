# F3 — mercado, contratos y finanzas: una plantilla construida y gestionada desde Courtside

Base: `26886bd0` (`origin/main`, F0 #162, F1 #163 y F2 #164 integrados, 2026-10-20). Rama: `playable/f3`.
Alcance: exclusivamente F3, incluido el **adendo** (mercado libre, negociación libre y traspasos entre clubes), dentro de la misma rama y la misma PR. El SHA final, la PR y los checks de CI se registran en la PR de F3.

Plan canónico: [PR #161](https://github.com/audifor/BDM/pull/161) (leído sin convertir propuestas en decisiones). Contratos F0/F1/F2 conservados:
[F0](F0_CERTIFICATION.md), [F1](F1_CERTIFICATION.md), [F2](F2_CERTIFICATION.md).

## Recorrido (ACB 2026/27, UCAM Murcia)

`Necesidad → Buscar → Evaluar (conocimiento legítimo) → Margen económico → Contactar → Respuesta → Oferta → Respuesta → Governance (consejo) → Firma → Plantilla → Rotación → Partido`
y, por la misma autoridad contractual: `Renovación (ventana, oferta, consejo, sucesor)`, `Liberación (obligaciones que sobreviven)` y `Staff (vacante, entrevista, oferta, contrato, rescisión)`.

Autoridades reutilizadas, sin subsistemas nuevos: BS10 (contacto → oferta formal → firma), OrganizationKnowledge/MarketKnowledge, Finance V2/BS16M
(`evaluateTeamGameplayFinancialDecision`, `bindTeamContractCapacity`), Governance (`PLAYER_CONTRACT_SIGNING`), Contract Retention (BS11),
`ContractReleaseService`, `StaffCareerService`, Save V4. Detalle de arquitectura en `docs/ARCHITECTURE.md` («Playable market v1»).

## Reconocimiento: qué funcionaba en `main` y dónde se rompía

Sobre la partida real de New Game (no sobre fixtures) el recorrido fallaba en **doce puntos encadenados**; ninguno era visible en las suites existentes porque
todas ellas parten de fixtures que inyectan agentes libres, autorización y concesiones de gobernanza (`authorizeTeamSalaryForTest`, `withGovernance`…).

| # | Primer punto de ruptura real | Causa | Reparación dentro de F3 |
|---|---|---|---|
| 1 | El universo ACB no tenía **ningún agente libre** | La fábrica sólo genera plantillas contratadas | 15 agentes libres **sintéticos identificados** (`acb-free-agent-player-*`, `[sintético]`) con las fábricas canónicas, sólo en la ruta New Game (`playableMarket`) |
| 2 | Un contacto **nunca recibía respuesta** | No existía `MarketReality` (verdad oculta) ni agentes; `initializeMarketAgents` no lo invoca ningún flujo de producción | `initializeFreeAgentMarketTruth` (términos de `getPlayerMarketTerms`, voluntad sembrada: algunos rechazan) + `ensureFreeAgentMarketTruthForPendingContacts` para liberados/vencidos |
| 3 | Las necesidades de UCAM (SG titular y suplente, MEDIA/PLANNED) **no abrían ninguna vía** de adquisición | `isImportantNeed` filtra por severidad/urgencia (umbral de la IA) | `assessGMDecisionContext(..., { includeAllDetectedNeeds: true })` sólo en la ruta dirigida por el usuario; el umbral de la IA no cambia |
| 4 | **Ningún club podía firmar ni renovar** (UCAM: autorizado 10,7 M€, comprometido 18,26 M€) | El compromiso salarial del ejercicio contaba **todo** año contractual que *solapa* el ejercicio (sep→ago); los contratos arrancan el 1 jul → dos años de sueldo | Atribución por fecha de reconocimiento (`effectiveOn`): cada año contractual en **un** ejercicio (9,13 M€ → margen 1,57 M€). Test de regresión en `BudgetForecasting.test.ts`; 376 tests de Finance siguen en verde |
| 5 | La oferta formal nunca podía prepararse (`CLUB_KNOWN_EXPECTED_TERM_UNKNOWN`) | Nada produce `expectedYears` | La señal de contacto positivo comunica salario **y** duración pedidos (la de rechazo sigue sin revelar nada) |
| 6 | La firma quedaba en `SIGNING_PROPOSER_OR_APPROVER_AUTHORITY_UNMAPPED` | El preset de gobernanza sólo concede `FACILITIES` y `CAPITAL_EXPENDITURE` | `PLAYER_CONTRACT_SIGNING` en `GAME_BALANCE_DELEGATED_DECISIONS` (propietario → ejecutivo propone/ejecuta, → consejo aprueba) |
| 7 | Nadie del consejo aprobaba | No existía el equivalente al consejo de instalaciones | `processBoardPlayerContractSigningDecisions` en la fase diaria `GOVERNANCE` (aprueba al día siguiente si Finance sigue permitiéndolo; rechaza si no) |
| 8 | Una firma ya ejecutada se leía como `APPROVED` | Rama del modelo de lectura sin guardia | `ALREADY_SIGNED` |
| 9 | La **renovación era imposible en toda la ACB** | Sin `SalaryRules`; los contratos vencen el 1 jul, fuera de cualquier ventana de temporada; y una garantía sin especificar se materializa con 0 € (contrato sin obligación → Finance se niega a firmarlo) | `AcbDemoSalaryRules` (sin tope; longitud 1–5 años = la que generan los propios generadores), `salaryRulesInForce` (las reglas de la última temporada rigen en la intertemporada), garantía completa por defecto en ligas sin tope, ejecución diaria de la renovación aprobada por el consejo |
| 10 | Los comandos fallaban **en silencio** | Los store actions ignoraban el estado devuelto | `marketNotice`: resultado o autoridad que rechaza, con motivo (Finance, Governance, ciclo de vida) |
| 11 | El staff no se podía rescindir desde Courtside | Sólo existía en el panel PCB antiguo | `StaffContractActions` sobre `fireStaffFromTeam`, con la advertencia de que no hay indemnización modelada |
| 12 | Faltaban en Courtside: necesidades, viabilidad económica, historial, cancelar, vida restante del contrato | — | `MarketNeedsStrip`, `MarketViabilityPanel`, historial de operaciones, «Cancel signing», «Remaining / ventana / años garantizados» en Contracts |

Los tres ajustes de tests existentes son consecuencia directa y no reducen cobertura: F0 (`unsigned` = exactamente los 15 sintéticos), `MarketEngine.test`
(la señal de contacto positivo lleva `expectedYears`; el rechazo sigue sin llevarlo) y `CalendarEngine.test` (la fase `GOVERNANCE` ya corre).

## Principios económicos aplicados

- **Presupuesto ≠ tesorería ≠ compromisos ≠ salary cap**, una línea cada uno en el panel de viabilidad. Un importe desconocido es «Desconocido», nunca 0 (el precio de un agente libre es desconocido hasta contactar).
- UCAM: caja 42 M€ (tesorería inicial **simulada y etiquetada** del preset, sin procedencia nueva), autorizado 10,7 M€, comprometido 9,13 M€, **margen 1,57 M€**. Se prueba que 1 € por encima del margen se rechaza con `INSUFFICIENT_AUTHORIZED_HEADROOM` aun habiendo caja de sobra.
- Ni se añadió dinero ni se crearon transacciones compensatorias: la firma no mueve la tesorería ni el libro mayor (se mide), sólo consume margen mediante la reserva atómica `CONSUMED`.
- **Una oferta no reserva nada** (decisión BS10/BS16M): el compromiso se consolida al firmar; por eso «cancelar una oferta» no tiene reserva que liberar y el test lo demuestra (el margen no se mueve). Dos acuerdos que individualmente caben se aprueban pero sólo se firman los que siguen cabiendo.

## Pruebas funcionales (suite F3)

| Archivo | Tests | Qué demuestra |
|---|---|---|
| [`PlayableF3.test.ts`](../../src/app/game/PlayableF3.test.ts) | 11 | Población sintética identificada; conocimiento sin PlayerTruth; necesidad → vía de fichaje; margen = autorizado − comprometido; rechazo por límite real; ciclo completo con Governance (propuesta, aprobación del consejo, una sola ejecución); contrato/plantilla/historial; efecto económico exacto (margen −salario, caja y libro mayor intactos, reserva `CONSUMED`); comando terminal repetido sin duplicar; el fichado juega minutos reales; Save V4 + continuar días |
| [`PlayableF3Contracts.test.ts`](../../src/app/game/PlayableF3Contracts.test.ts) | 15 | Ventana de renovación y reglas vigentes; renovación aceptada (sucesor continuo, sin solape, una ejecución, compromiso futuro en Finance, Save V4 y aplicación del nuevo periodo al vencer); oferta rechazada; renovación cuyo salario supera el margen (el consejo la rechaza con Finance); liberación (previa con obligaciones, idempotente, lineup limpio, no juega, vuelve a ser contactable); staff (contratar, responsabilidad, Save V4, rescindir una vez); rechazo por presupuesto de un candidato real; tres acuerdos simultáneos que no caben; contraoferta (rechazar/aceptar); cancelar la firma |
| [`PlayableF3AB.test.ts`](../../src/app/game/PlayableF3AB.test.ts) | 8 | Comparación A/B de 30 días (ver abajo) |
| Unitarias | 17 | `SalaryRulesInForce` (4), `FreeAgentMarketTruth` (4), atribución por ejercicio en `BudgetForecasting` (1), UI Market F3 (8: necesidades, viabilidad, expediente, aviso, historial) y Contracts F3 (1) |

Los escenarios que el mundo no produce solo se prueban con **fixtures canónicas complementarias identificadas en cada test**: salto de reloj a 2 jul 2027 para la
ventana de renovación, salto al vencimiento para la aplicación del nuevo periodo, autorización reducida (`authorizeTeamSalaryForTest`) para la concurrencia, y una
subida de la expectativa oculta del jugador para provocar la contraoferta.

## Comparación A/B de 30 días

Mismo `GameWorld` inicial (27 sep 2026) en dos copias Save V4 idénticas, mismos 4 partidos del usuario (3, 10, 17, 24 oct) y mismas semillas.
**A** no hace nada. **B** completa **una** operación legítima (un escolta libre con el ciclo completo) y lo coloca de titular. Detalle en
[ab-comparison.json](evidence/f3/ab-comparison.json).

| Área | A · sin operación | B · con operación | Causa verificable |
|---|---|---|---|
| Contratos | 241 | **242** | un contrato nuevo (230.000 €/año, 3 años, hasta 2029-09-30) |
| Plantilla | 16 | **17** | incorporación (`signedFreeAgent`) |
| Margen salarial | 1.570.000 | **1.340.000** | −230.000 exactos; autorización sin cambios; sin reserva abierta propia |
| Elegibilidad | — | disponible | `isPlayerAvailable` |
| Rotación | SG: titular previo | **SG: el fichado** | `setLineupSlot` |
| Partido | — | 26,9 / 28,3 / 28,6 / 39,9 min | el motor usa sólo atributos reales; **sin bonificación por fichar** |
| Historial | 0 operaciones | **1 `FICHAJE`** | una transacción, un evento de ejecución |
| Save V4 | — | diferencias conservadas | proyección de verdad persistente idéntica tras recargar ambos |
| Resto del mundo | idéntico hasta el primer partido con plantilla distinta | idem | después sólo puede divergir por la dinámica propia de la liga (clasificación) |

No se afirma que B gane más: los marcadores son un solo sorteo por partido y el cambio de plantilla desvía todo el partido.

## Prueba real Windows (`bdm.exe`, frontend embebido, sin Vite)

`npm run tauri -- build --debug --no-bundle -- --offline` y [`f3-windows-acceptance.mjs`](../../scripts/playable/f3-windows-acceptance.mjs).
Eventos reales de ratón y capturas en [evidence/f3](evidence/f3); resumen en [windows-acceptance.json](evidence/f3/windows-acceptance.json).
La partida nativa del usuario se respaldó antes y se restauró con SHA-256 idéntico.

**PASS (19 pasos, 0 errores de consola).** Carrera 1 = NEW GAME ACB 2026/27 con UCAM Murcia (pasos 1–15). Carrera 2 = Save V4 del 2 jul 2027 (pasos 16–19, ver limitaciones).

| # | Comprobado en el ejecutable | Capturas |
|---|---|---|
| 1 | NEW GAME ACB, UCAM Murcia, primer partido (26 sep); Save V4 nativo con 16 contratos y la verdad de mercado de los 15 libres | `01` |
| 2 | Roster: plantilla de 16 | `02` |
| 3 | Necesidad detectada («Titular/Suplente de nivel bajo · SG», con «Sin fichaje posible» para las que no tienen vía) y entrada en Mercado | `03` |
| 4 | Búsqueda de libres desde la necesidad (3 SG sintéticos), objetivo persistente, expediente con atributos «?» no observados, margen real **1,57 M** | `04` |
| 5 | Contacto con SG-01 (operación) y SG-03 (caro): diálogo con viabilidad y «READY_TO_CONTACT» | `05-*` |
| 6 | 3 oct: SG-01 acepta hablar; oferta preparada **230.000 × 3 años**, «Viable», margen tras la operación 1,34 M; se presenta | `06` |
| 7 | **Operación inválida por presupuesto**: SG-03 acepta hablar pero pide **1,61 M × 2** (margen tras la operación −40 K, «No viable»); la oferta se intenta y **Finance la rechaza** (`INSUFFICIENT_AUTHORIZED_HEADROOM`, con el motivo y la distinción autorización/caja); la negociación sigue `CONTACTED` | `07a`, `07b` |
| 8 | 10 oct: el jugador acepta (`Agreed terms`); se inicia la aprobación de Governance de la firma | `08` |
| 9 | 17 oct: el consejo aprobó el día siguiente; «Complete signing» → `SIGNED`; Save V4: 1 firma, 17 contratos del club | `09-*` |
| 10 | El jugador está en Roster y en Contracts; margen del Mercado **1,57 M → 1,34 M** (−230.000 exactos); contrato = condiciones acordadas | `10-*` |
| 11 | Rotación válida: titular SG (lineup guardado en Save V4) | `11` |
| 12 | Partido del 17 oct: el fichado juega minutos reales (`matchStatLogs`), el acta lo lista | `12` |
| 13 | Historial de operaciones: **un** `FICHAJE`, con salario y vencimiento | `13` |
| 14 | Guardar, cerrar BDM, cargar: payload idéntico (comparado como conjuntos de registros, igual que el orden de claves); Mercado conserva operación, historial y margen | `14` |
| 15 | Continuar el calendario (24 oct y siguientes): sin contratos, transacciones ni eventos duplicados; 1 transacción `signedFreeAgent` | `15` |
| 16 | Carrera 2: Contracts muestra duración restante («Remaining 0 a 11 m»), ventana abierta para los 4 contratos que vencen el 1 jul 2028 y cerrada para el resto | `16` |
| 17 | **Renovación** de Jonah Radebaugh (700.000, vence 2028-07-01): oferta a 2 años con garantía completa → el jugador acepta → solicitud de firma → el consejo aprueba y el sucesor se firma (**2028-07-01 → 2030-07-01, 700.000**), continuo con el vigente, sin solape | `17a`, `17b` |
| 18 | **Liberación** de Juani Marcos por el flujo existente: la vista previa explica el calendario garantizado que sobrevive; 1 transacción `released` | `18a`, `18b` |
| 19 | Guardar, cerrar, cargar la carrera 2 (payload idéntico) y continuar: renovación y baja existen exactamente una vez, sin contratos duplicados | — |

La partida nativa del usuario se respaldó antes y se restauró: SHA-256 idéntico (`userSaveRestored: true`).

## Adendo · mercado libre, negociación libre y traspasos entre clubes

Tres limitaciones del primer cierre de F3 se resuelven en la misma rama y la misma PR, sin subfases:

1. **Mercado global.** El manager busca, selecciona y contacta a **cualquier** jugador del universo cargado (nombre, club, posición, edad, nacionalidad, nivel conocido, situación contractual, vencimiento y disposición a negociar conocida). Las plantillas de los clubes de su competición son públicas (identidad direccionable); los atributos y la voluntad siguen llegando sólo por scouting y señales. Las necesidades detectadas son una **recomendación**, nunca un requisito (`contactFreeAgentDirectly`).
2. **Negociación libre.** Tras la respuesta al contacto, el manager escribe **su** oferta (salario, años, rol prometido); la fecha de inicio se declara no soportada (siempre la de la firma). La respuesta sale del motor de BS10: `derivePlayerTermsResponse` (verdad de mercado oculta + rasgos del agente) acepta lo que alcanza su mínimo real y contraoferta lo que no, **sin bajar nunca del mínimo del jugador**; antes una contraoferta podía quedar por debajo de lo que pedía. La oferta final pasa por Finance, Contracts y Governance.
3. **Traspasos negociados de jugadores con contrato** (no son agentes libres ni traspasos NBA): `Ficha/Mercado → situación contractual → contactar al club → proponer compensación → respuesta del club → acuerdo entre clubes → negociar con el jugador → Governance → ejecución → plantilla`. Política del vendedor `BDM_TRANSFER_POLICY_V1` (verificable: valoración = salario de mercado × años restantes × 0,5, prima del 25 % a sus dos mejores jugadores, acepta desde su precio, contraoferta a su precio desde el 70 %, rechaza por debajo, nunca vende por debajo de 10 jugadores). **Compensación al club vendedor ≠ salario ≠ comisión del agente ≠ compromisos futuros**: autorización propia `TRANSFER_FEE` (preset de balance, aparte del presupuesto salarial y de la tesorería); el comprador reconoce gasto `TRANSFER_FEE` y lo paga; el vendedor reconoce ingreso `TRANSFER_BUYOUT` y lo cobra; ni se crea ni se destruye dinero. La ejecución (`executePlayerTransfer`) es atómica en ambos clubes (contrato antiguo `transferred`, contrato nuevo, plantillas, rotaciones, historial `transferred` en los dos clubes, RolePromise, ambos libros, evento `EXECUTED`) e idempotente; un rechazo, una autorización denegada o un error de validación devuelven el mundo intacto.

Courtside (sin app ni sección redundante): Mercado → Buscar jugadores (filtros nuevos y panel «Compra a otro club» en el expediente), Ficha del jugador → Contrato (club propietario, vencimiento conocido, autorización de compensaciones; se retiraron las cuatro «rutas de contacto» de vista previa que no hacían nada), Mercado → Operaciones (traspasos: etapas, propuestas y contraofertas, condiciones con el jugador, autorizaciones pendientes, viabilidad económica y estado final) e historial de operaciones. Roster y Finance muestran el resultado con sus pantallas existentes (plantilla, gastos/ingresos y líneas de presupuesto por categoría).

### Tabla adicional de certificación (ambos clubes: comprador y vendedor)

| Escenario | Prueba | Resultado |
|---|---|---|
| Agente libre **sin necesidad** detectada recibe contacto, oferta válida, respuesta, autorización y firma | `PlayableF3DirectApproach.test.ts` (el sistema de recomendaciones devuelve siempre vacío) + A1 | PASS |
| Salario por debajo de lo pedido se evalúa de verdad (contraoferta ≥ su mínimo real, nunca aceptada al precio ofrecido) | `PlayableF3Transfer.test.ts` B1 | PASS |
| Oferta con años/rol distintos recibe respuesta válida y la firma respeta años y promesa de rol | B2 | PASS |
| La negociación con un jugador contratado puede empezar con su club; una propuesta no mueve nada ni se duplica | C1 | PASS |
| El vendedor rechaza → ningún cambio de plantilla, contrato ni dinero | C2 | PASS |
| El vendedor contraoferta → la propuesta se revisa; su precio sólo se conoce al responder | C3 | PASS |
| El club acepta pero el jugador rechaza → no hay traspaso | C4 | PASS |
| Ambos aceptan pero Finance rechaza al ejecutar → ni movimiento ni cargo | C8 | PASS |
| Governance no pedida / denegada por el consejo / retirada → no hay traspaso; la operación se cierra | C9 | PASS |
| Todo aceptado y autorizado → traspaso completo en ambos clubes (dos vendedores distintos) | C5 | PASS |
| Ejecución repetida → ni contratos ni movimientos económicos duplicados | C6 | PASS |
| Save V4 conserva estado (en curso y ejecutado) e historial de ambos clubes | C7 | PASS |
| Partido posterior → el jugador pertenece y juega (minutos reales) para el club nuevo y no para el vendedor | C10 | PASS |
| UI Courtside: mercado global, panel de compra, operación y retirada, acuerdo/autorización/completar, oferta a medida, ficha | `MarketWorkspace.transfer.test.tsx` (6) | PASS |
| Política del vendedor y calendario de Finance del contrato traspasado | `TransferPolicy.test.ts` (5) | PASS |

### Prueba Windows del adendo (`bdm.exe`, pasos 16–29, sobre la misma carrera de New Game)

Traspaso real de **Nate Reuvers** (Valencia Basket → UCAM Murcia), todo desde la interfaz de Courtside, con partidos jugados entre etapas; dos pasadas completas del script (la primera encontró un aviso médico que detiene CONTINUE y un fallo del propio script al leer el guardado, ya corregidos: el script ahora resuelve la revisión de alta como lo haría el manager). Evidencias: `docs/playable/evidence/f3/16…29*.png`, `windows-acceptance.json` (`transfer`).

| Paso | Qué se comprueba en el exe | Evidencia |
|---|---|---|
| 16 | Mercado global: jugadores con contrato de toda la liga (>100), filtros «Vence antes de» y «Disponibilidad para negociar» | `16` |
| 17 | Encontrar por nombre a un jugador contratado por otro equipo; el expediente ofrece «Compra a otro club» | `17` |
| 18 | Ficha → Contrato: club propietario, vencimiento conocido, autorización de compensaciones, sin acciones ficticias | `18` |
| 19 | Proponer 100.000 al club desde la ficha: la operación queda abierta; no cambia ningún contrato, transacción ni saldo | `19` |
| 20 | Tras el partido el club **contraoferta 133.000**; se acepta: acuerdo entre clubes | `20a`, `20b` |
| 21 | Oferta al jugador (110.000 × 2 años, rol de rotación; la fecha de inicio declarada no soportada) | `21a`, `21b` |
| 22 | El jugador acepta; condiciones, viabilidad del salario y de la compensación visibles; se solicita la autorización | `22a` |
| 23 | El consejo autoriza al día siguiente; **«Completar traspaso»**: ejecución | `23a`, `23b` |
| 24–25 | Está en la plantilla de UCAM y ya no en la de Valencia Basket (un único roster) | `24`, `25` |
| 26 | Contrato antiguo `transferred` y contrato nuevo (110.000); **caja del comprador −133.000, caja del vendedor +133.000**, nada más cambia; gasto `TRANSFER_FEE` e ingreso `TRANSFER_BUYOUT`; margen salarial 1,34 M → 1,23 M | `26` |
| 27–28 | Titular de su posición y partido siguiente: **7,4 minutos reales** con el club nuevo; ninguna línea de box score con el vendedor tras el traspaso | `27`, `28` |
| 29 | Guardar, cerrar, cargar: payload idéntico y el traspaso `EXECUTED` con su historial | `29` |

La carrera 2 (renovación y baja, ahora pasos 30–33) se repite íntegra y pasa. Partida nativa del usuario respaldada y restaurada (SHA-256 idéntico, `userSaveRestored: true`).

## Limitaciones reales (declaradas)

- **Liberación de jugadores**: no hay penalización ni indemnización calculable; las obligaciones garantizadas siguen en el calendario de Finance y se listan. **Staff**: el modelo no define indemnización; al rescindir se retira el compromiso restante del contrato y se dice explícitamente.
- **Renovación en Windows**: la ventana de la plantilla inicial se abre el 2 jul 2027 y «Simulate until date» se detiene en cada decisión médica pendiente. El Save V4 de ese día lo genera el arnés ([`PlayableF3RenewalFixture.test.ts`](../../src/app/game/PlayableF3RenewalFixture.test.ts), 9 meses de simulación diaria real con las altas médicas resueltas y el cambio de temporada), sin ninguna operación de mercado; la renovación, el consejo y la liberación se hacen después a mano en el ejecutable.
- Las partidas anteriores a F3 no reciben retroactivamente los agentes libres, las reglas salariales ni las concesiones de firma; sólo el New Game ACB.
- El desarrollo de atributos no se produce en 30 días (se aplica el 1 de julio): la prueba de consecuencias deportivas mide participación, minutos y rotación, no mejora de atributos.
- **Traspasos (adendo)**: no hay ventanas de traspaso ni requisitos de inscripción en el universo ACB de demostración y no se inventan reglas de federación; no se implementan traspasos NBA ni emparejamiento salarial NBA, buyouts internacionales generalizados, cláusulas de rescisión (el modelo no tiene ninguna: no se muestra ninguna), pagos aplazados, ni que un club de la IA compre jugadores al club del manager. Un traspaso sólo se ejecuta si el comprador es el club del manager.
- **Fecha de inicio del contrato**: el modelo de contratos no admite otra que la de la firma; el formulario lo declara. El rol prometido sí tiene consecuencia canónica (`RolePromise`, que se rompe al liberar al jugador).
- **Salario ya reconocido**: el modelo reconoce cada año de contrato en su fecha de inicio; en un traspaso a mitad de año el vendedor conserva el salario del año en curso ya reconocido (no se devuelve nada) y deja de deber los años futuros; el comprador reconoce el primer año de su nuevo contrato al firmar.
- **Voluntad del jugador**: la verdad oculta de voluntad de los jugadores (sembrada por identificador) hace que una parte de los contratados rechace cualquier traspaso; el manager lo descubre al ofrecerle condiciones, nunca antes.

## Validación

- Typecheck, build del frontend y compilación Tauri (`tauri build --debug --no-bundle --offline`): PASS. `cargo fmt --check` y `cargo check --offline`: PASS. Sin `Math.random(` en `src/`. Sin imports de React/Zustand/Tauri en `src/domain` ni `src/engine`. Sin cambios en BDM-DB.
- **Suite global con los parámetros de CI** (`--testTimeout=30000 --hookTimeout=30000 --maxWorkers=2`): **769 archivos y 5.692 tests PASS**, 46 archivos/51 tests omitidos como en `main` (largo horizonte y generador del Save de la prueba Windows, que sólo corre con `F3_RENEWAL_FIXTURE_OUT`), 0 fallos. Los 84 fallos de una primera pasada con los 5 s por defecto eran timeouts por carga; se reprodujeron aislados y pasan con los parámetros de CI, salvo tres regresiones reales (F0, `MarketEngine`, `CalendarEngine`) que se corrigieron en F3 como se explica arriba.
- Regresiones F0/F1/F2 (`PlayableF0/F1/F2*.test.ts`) y focales de Finance (376 tests de dominio y motor), Governance, retención, calendario, mercado y Save V4: PASS dentro de la suite global.
- Adendo: suite global con los parámetros de CI tras implementarlo: 769 archivos pasan (+ nuevos), 3 archivos con 5 tests desfasados por el propio cambio (mapa de acciones de Finance con `TRANSFER_FEE`; tres tests de la ficha que comprobaban las cuatro «rutas de contacto» de vista previa que se retiran; el cierre de la operación denegada) corregidos y re-ejecutados: subconjunto engine/domain/save/governance/mercado/transfer/ficha/finanzas **449 archivos y 3.631 tests PASS**. `tsc -b` limpio (el typecheck de `tsc --noEmit` sin `-b` no basta: el repositorio usa referencias).
- Tests F3: 11 + 15 + 8 (arriba) + 17 unitarias; adendo: `PlayableF3Transfer.test.ts` (14), `PlayableF3DirectApproach.test.ts` (1), `MarketWorkspace.transfer.test.tsx` (6), `TransferPolicy.test.ts` (5); arnés en `src/app/game/testSupport/PlayableF3*.ts`.
- Integridad de Contracts, Governance y Finance: una firma/renovación/baja existe exactamente una vez (contratos, transacciones, eventos `EXECUTED`, reservas), comprobado en el motor y en el Save V4 nativo; sin reservas abiertas propias; el libro mayor no se mueve al firmar.
- Suite global, CI de GitHub e integración en `main`: ver la PR.
