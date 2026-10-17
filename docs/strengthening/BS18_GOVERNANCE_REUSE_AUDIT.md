# BS18 - Auditoria de reutilizacion de Governance V2

Fecha: 2026-10-17. Repositorio: `audifor/BDM`. Base auditada: `main` en `ceaa45529ce23c4e94bbc2cef17d9d0d987552b6` (2026-10-11).

## Veredicto

**BS18 REUSE AUDIT: PASS (inventario y delimitacion documental).**
**BS18 GLOBAL GAMEPLAY: PARTIAL / NO CERTIFICADO.**

Governance V2 no debe reconstruirse. BG1-BG8F ya implementa y certifica la base canonica institucional. MX0.7 proyecta una parte a Board. BS17E/F acredita decisiones de Facilities con Finance, Board e IA en partidas configuradas. No existe un programa BS18 formalmente implementado y certificado como tal en esta base. Una certificacion de BG8F no implica paridad de gameplay, cobertura universal ni Courtside.

Esta auditoria es **solo lectura de codigo, tests y certificaciones existentes**. No se han ejecutado Vitest, typecheck, build ni pruebas interactivas en esta revision. Las certificaciones historicas se citan como evidencia historica, no como ejecuciones nuevas.

## Matriz de reutilizacion y diferencias

| Capacidad prevista | Evidencia en `main` | Evaluacion BS18 | Diferencia no cubierta |
| --- | --- | --- | --- |
| Instituciones, organos, perfiles y estructuras por universo | BG1, BG6A-D; `src/domain/governance/` | REUTILIZAR / CANON CERTIFICADO | No duplicar entidades o autoridad |
| Objetivos, evaluacion del entrenador y seguridad laboral | BG2-BG3; `src/engine/board/BoardEngine.ts`; Board Overview | IMPLEMENTADO / INTEGRACION PARCIAL | Demostrar coherencia entre Board legacy y GovernanceManagerEvaluation ante decisiones reales |
| Derechos, aprobaciones, veto, ejecucion e historial | BG4, `BoardGovernanceCommands.ts`, tests MX0.7 | PARCIALMENTE JUGABLE | Acciones dependen del tipo y del comando canonico disponible |
| Reuniones, solicitudes y compromisos | BG5 domain; `BoardGovernanceReadModel.ts`, Board UI | PARCIAL | Las solicitudes son solo lectura, `responseCommandAvailable: false`; no flujo general de respuesta/cierre desde Board |
| Propiedad, inversion, multiclub y cambios regulatorios | BG8B-E + `BG8F_FINAL_INTEGRATION_CERTIFICATION.md` | CANON CERTIFICADO / UX NO CERTIFICADA | BG8C documenta expresamente que no incorpora IA ni UI; no confundir simulacion institucional con interaccion jugable |
| Persistencia de hechos institucionales | BG8F; Save V4 sobre runtime V3; pruebas MX0.7 de reload | REUTILIZAR | Falta cobertura integral de los escenarios BS18 en partidas reales nuevas |
| Board: vista, atencion, decisiones e historial | MX0.7, `BoardWorkspace.tsx` y tests | JUGABLE EN UI NG PARA TIPOS SOPORTADOS | No extrapolar a pantallas Courtside sin revision de su rama y conexion real |
| Gobernanza economica y de instalaciones | BS17E-A/B/C/F y preset `BDM_GAME_BALANCE_V1` | PROBADO EN ALCANCE BS17 | No extrapolar a todas las categorias de gasto ni a toda la gobernanza del club |
| IA institucional y decisiones autonomas | BS17F `processAiFacilityManagement` | PARCIAL | Demostrada solo para gestion de Facilities; no hay evidencia de IA institucional transversal |
| Resolucion temporal general de Governance | `src/engine/calendar/CalendarEngine.ts` | PENDIENTE | Fase `GOVERNANCE` declarada con `shouldRun: false`; el propio codigo indica ausencia de procesador automatico de reuniones/decisiones |
| Inicializacion institucional en carreras | `createConfiguredGame.ts` + `GameBalanceBootstrap.ts` | REACHABLE CON PRESET | El camino normal `createConfiguredGame*` incluye preset; creadores de bajo nivel sin `gameBalance` no lo incluyen. No proclamar cobertura universal |
| Alertas y navegacion hacia decisiones | `SimulationBreakpoints`, `breakpointRouting`, MX0.7 | PARCIAL | Enlaces profundos a decisiones y solicitudes implementados; notificaciones `IMPORTANT` no bloquean Continue y algunas acciones siguen sin resolver |

## Hallazgos contrastables (rutas y detalles)

1. **BG8F ya certifica BG1-BG8E**: `docs/autopilot/BG8F_FINAL_INTEGRATION_CERTIFICATION.md`; commit `1fff9a507f2d22ae527554ae894146d9e2788812`.
2. **MX0.7 expone Board y permite actos reales limitados**: `src/app/governance/BoardGovernanceCommands.ts`. Tipos de registro de eventos: `PLAYER_CONTRACT_SIGNING`, `PLAYER_TRADE_COMMITMENT`, `FACILITIES`; ejecucion desde la superficie club: `COACH_FIRING`. Otros tipos quedan read-only en este borde, aunque otros sistemas puedan ejecutar sus propios flujos. Commit `96e2d6741cbb0bcd2660b9f75ad85debdc260d02`.
3. **Solicitud sin accion general**: `src/app/governance/BoardGovernanceReadModel.ts`, `responseCommandAvailable: false`; `BoardWorkspace.governance.test.tsx` afirma el comportamiento read-only.
4. **El ciclo diario no procesa Governance generica**: `src/engine/calendar/CalendarEngine.ts`, fase `GOVERNANCE` con `run(..., false, ...)`. Esto no invalida el procesador especifico de Facilities en `FACILITY_MANAGEMENT`.
5. **Bootstrap institucional realmente accesible desde el juego configurado**: `src/app/game/createConfiguredGame.ts` inyecta `BDM_GAME_BALANCE_V1` a prototipo, ACB, NCAA y ruta asinc de World DB Spain. `GameBalanceBootstrap.ts` crea estructura, appointments y grants donde faltan, etiquetados como simulados. `createNewGame()` directamente, sin opcion de balance, no es equivalente.
6. **BS17 prueba economia y AI en su ambito**: `docs/strengthening/BS17_GLOBAL_COMPLETION_CERTIFICATION.md`; el documento especifica limite de cobertura por universos y pruebas. `docs/strengthening/BS_ALL_FINAL_INTEGRATION_CERTIFICATION.md` registra integracion general con fallos heredados, no equivale a nuevo BS18 PASS.
7. **El cierre publicado de BS no incluyo BS18**: `docs/strengthening/BS_FINAL_MAIN_PUBLICATION.md` dice expresamente 'no new functionality, no BS18, no World DB V2'.

## Condiciones minimas para declarar BS18 completo sin reinventar BG

- **P0: Acciones Board reales**. Inventariar todos los tipos Governance ofrecidos al jugador; dar comandos canonicos para responder solicitudes y actuar en tipos aprobados que actualmente son solo lectura, o etiquetarlos fuera de alcance con producto aprobado. Test negativo de permisos y prueba Save/reload por accion.
- **P0: Resolucion y continuidad**. Probar los plazos, reuniones y cambios de decision desde partida real sin inventar una segunda autoridad. Si se habilita la fase diaria `GOVERNANCE`, conservar idempotencia y compatibilidad con Facilities, Finance y eventos.
- **P0: Manifestacion jugable**. Certificar Board y rutas de atencion en la UI efectiva, incluida Courtside una vez que su rama este integrada. Estado visible, accion autorizada, bloqueo, consecuencia e historial para cada caso anunciado.
- **P1: IA por tipos aprobados**. Separar claramente la IA de Facilities existente de cualquier IA institucional adicional que el alcance de BS18 apruebe. No fabricar propuestas, fondos ni votos.
- **P1: Continuidad y pruebas**. Smoke por prototipo, ACB, NCAA y World DB Spain con preset; comparar misma accion usuario/IA; certificar recarga y horizonte relevante. Comparar regresiones con baseline existente.

Estas condiciones son un **gate de cierre**, no autorizacion para construir sistemas nuevos ahora. Las implementaciones concretas deben limitarse a las brechas reales y al alcance acordado de BS18. Nada de cambios en MatchEngine ni WorldDB/generadores en esta rama.

## Decisiones operativas

- No abrir un nuevo dominio, calendario paralelo, modelo Board alternativo ni un sistema general de RPG para cerrar BS18.
- No declarar `BS18 COMPLETE` ni saltar a BS19 por simple equivalencia nominal BG8F = BS18.
- Mantener **WorldDB V2 y generadores** como prioridad de ejecucion activa; esta rama solo registra evidencia de reutilizacion.
- Una vez integradas las rutas pertinentes de Board Courtside, ejecutar las pruebas focales y registrar un veredicto real (`PASS` o `PARTIAL` con blockers exactos).

## Fuentes ancladas

- [BG8F final integration](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/docs/autopilot/BG8F_FINAL_INTEGRATION_CERTIFICATION.md)
- [MX0.7 Board commands](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/app/governance/BoardGovernanceCommands.ts)
- [MX0.7 Board read model](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/app/governance/BoardGovernanceReadModel.ts)
- [Board UI tests](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/ui-ng/applications/board/BoardWorkspace.governance.test.tsx)
- [CalendarEngine governance phase](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/engine/calendar/CalendarEngine.ts#L218)
- [Configured game bootstrap](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/app/game/createConfiguredGame.ts)
- [Game balance institutional foundation](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/src/app/gameBalance/GameBalanceBootstrap.ts#L219-L291)
- [BS17 global completion](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/docs/strengthening/BS17_GLOBAL_COMPLETION_CERTIFICATION.md)
- [BS final publication](https://github.com/audifor/BDM/blob/ceaa45529ce23c4e94bbc2cef17d9d0d987552b6/docs/strengthening/BS_FINAL_MAIN_PUBLICATION.md)
