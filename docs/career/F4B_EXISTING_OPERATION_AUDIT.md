# BDM Career · F4B · Auditoría de operaciones existentes

## Alcance

F4B parte de `f0754bea` en `feature/career-f4b-sporting-operations`. La auditoría se limita a las rutas necesarias para iniciar una operación desde una ficha de jugador; no sustituye la auditoría general de BDM.

| Acción | Pantalla existente | Comando/autoridad | Validación y consecuencia | Persistencia |
|---|---|---|---|---|
| Oferta profesional directa | `MarketWorkspace` + `TransferApproachPanel` | `contactFreeAgentDirectly`, `submitCustomFreeAgentOffer`; `DirectFreeAgentApproachService` | Market Intelligence, negociación, Governance de firma y Finance; la firma actualiza contrato, plantilla y transacciones | `GameWorldSaveV4` serializa negociaciones, contratos, transacciones y Governance |
| Propuesta de intercambio | `TradesWorkspace` | `createTradeDraft`, `addTradeMovement`, `proposeUserTradeNegotiation`; `TradePresentation` + `TradeEngine` | `resolveTradeSeasonAuthorityForTeam`, reglas de ventana, contratos, activos, salary matching y límites | Trade negotiation, revisión/ejecución y activos forman parte de Save V4 |
| Recruiting | `RecruitingWorkspace` | `addRecruitingTarget`, `performRecruitingAction`, `makeRecruitingOffer`, `signRecruit`; `RecruitingEngine` + `RecruitingPermission` | ciclo, calendario, capacidad, Staff y elegibilidad NCAA | ciclos, ofertas, compromisos, signings y enrollments en Save V4 |
| Transfer Portal | `TransferPortalWorkspace` | `completeTransferEducationModule`, `processTransferPortalEntry`, `addTransferRecruitToCycle`; `TransferPortalLifecycle` + Eligibility | autorización, módulo, deadline, destino y elegibilidad | entradas, profiles y downstream recruiting en Save V4 |

## Hallazgo ejecutable

Los motores no estaban duplicados ni faltaba una operación principal. El hueco era de entrada contextual: desde `PlayerWorkspace` no existía una acción primaria que llevara al candidato a la autoridad correcta. `TradesWorkspace`, además, no consumía un `playerId` profundo para inicializar el primer activo.

## Clasificación

- Motor completo y conectado: Market directo, TradeEngine/negociación, Recruiting y Portal.
- Motor existente pero desconectado de la ficha: los tres recorridos antes de F4B.
- Adaptador F4B: `playerSportingOperations.ts`, `PlayerSportingOperations.tsx` y navegación profunda.
- No implementado en F4B: nuevas reglas de mercado, trade, recruiting, eligibility, Finance, Governance o WorldDB.

