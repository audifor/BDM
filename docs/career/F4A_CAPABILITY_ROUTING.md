# F4A · Routing de capacidades

## Correcciones aplicadas

- `resolveGameCapabilities` consulta las temporadas activas del club controlado.
- `isNcaa`, `hasDraft`, `hasTrades` y `hasSalaryCap` ya no se derivan accidentalmente del `currentSeasonId` global.
- Un salary rule uncapped (`capModel: none`, `capAccounting: NOT_APPLICABLE`) no se presenta como salary cap.
- Recruiting, Transfer Portal y Talent filtran por la temporada NCAA activa del club.
- Market Viability y Contracts consultan `salaryRulesInForce` y la temporada activa del club.
- El Start Menu y `WorkspaceHost` siguen usando la misma proyección de capacidades; no se creó un catálogo paralelo.

## Rutas verificadas

| Ruta | Comando/UI | Autoridad que decide | Resultado |
|---|---|---|---|
| ACB FIBA-like | Market/Contracts | Market + Finance + SalaryRules vigentes | disponible cuando hay autorización; sin Trades/Draft/NCAA |
| NBA-like | Trades | TradeSeasonAuthority + TradeEngine | disponible solo con `TradeRules` de la temporada del club |
| NCAA-like | Recruiting | RecruitingCycle + RecruitingEngine + Staff/Eligibility | disponible solo para programa NCAA activo |
| NCAA-like | Transfer Portal | Portal rules + Eligibility + Recruiting lifecycle | disponible solo para ciclo/ecosistema activo |
| cualquier ruta | botón visible | `isWorkspaceApplicable` | solo presentación; nunca sustituye validación de dominio |

## Residuo intencional

Algunas pantallas históricas de estadísticas y resumen siguen usando `currentSeasonId` como temporada de presentación. No se han tratado como autoridad legal de operaciones en F4A; su migración completa requiere una decisión de navegación de temporada, no un cambio silencioso de reglas.
