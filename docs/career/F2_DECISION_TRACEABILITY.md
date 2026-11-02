# CAREER-F2 · Trazabilidad de decisiones

| Visible en Home | Fuente de verdad | Consecuencia | Persistencia |
| --- | --- | --- | --- |
| `Partido listo para jugar` | `SimulationBreakpoint` `USER_GAME` | Abrir Match; el usuario decide jugar o instant-result | Game y MatchStatLog por MatchEngine |
| Breakpoint Medical/Market/Governance | `evaluateSimulationBreakpoints` | Abrir la superficie propietaria | Entidades de la decisión existente |
| Advisory aceptable | `DelegationOutcome` + `hasCanonicalAcceptanceSeam` | Seam Medical/Recruiting/Trade y evento de aceptación | `delegationOutcomesById` + dominio afectado |
| Informe rival | `OppositionScoutingReport` | `acceptOppositionScoutingReport` escribe `gamePlansByKey` | Save V4 incluye report y plan |
| Entrenamiento ejecutado | `ScheduledTrainingSession.execution` | Fatiga, estímulo, cohesión y posibles lesiones ya producidos | Sesión y eventos persistidos |
| Trabajo de staff | `DelegationOutcome.applied` | Consecuencia del outcome que produjo el staff | Outcome persistido |
| Contexto de riesgo | lesiones, cohesión y fatiga canónicas | Solo informa; no repara ni inventa | Se reconstruye desde el mundo |

No se presenta una victoria como consecuencia de aceptar una recomendación. La causalidad demostrable es la cadena de estado: decisión → plan/outcome → preparación o simulación → estado resultante.

