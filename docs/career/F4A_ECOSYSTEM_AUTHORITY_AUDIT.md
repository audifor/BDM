# F4A · Auditoría de autoridad por ecosistema

Estado de la auditoría: **PARTIAL**.

## Hallazgo principal

La UI ya tenía autoridades canónicas para Trade, Recruiting, Eligibility y Salary, pero `resolveGameCapabilities` mezclaba dos conceptos:

- el club que dirige el entrenador;
- `world.currentSeasonId`, que es un puntero de selección de temporada.

Eso podía ocultar Recruiting/Portal de un programa NCAA o exponer una capacidad salarial equivocada cuando el puntero pertenecía a otra competición. La corrección deriva las capacidades desde las temporadas activas del club y conserva las validaciones de dominio como autoridad final.

## Matriz de autoridad

| Ecosistema | Fuente canónica | Capacidades reales | Superficie | Consecuencia |
|---|---|---|---|---|
| FIBA-like profesional | `SportsEcosystem`, temporada activa del club, Finance/Market | Market/contratos si existen reglas y autorización; no Trade NBA por nombre | Market, Contracts, Club | Signing/transferencia a través de Market/Finance existentes |
| NBA-like | temporada activa del club, `TradeSeasonAuthority`, `TradeRules`, `SalaryRules` | Trades y salary cap solo si las reglas están materializadas | Trades, Contracts, Talent/Draft | `TradeEngine` y validadores de salario |
| NCAA-like | temporada activa del programa, `RecruitingCycle`, `TransferPortal`, `CollegeRuleset` | Recruiting, Portal y Eligibility | Recruiting, Portal, Talent | acciones universitarias canónicas; no contrato profesional ordinario |

## Reutilización

Se reutilizan `resolveActiveCompetitionSeasonsForTeam`, `resolveTradeSeasonAuthorityForTeam`, `salaryRulesInForce`, `RecruitingEngine`, `EligibilityEngine`, `TradeEngine`, `GameWorld` y Save V4. No se añadió otro motor de reglas.

## Límites

Cuando varias temporadas activas ofrecen la misma operación y la autoridad no puede desambiguarse, la operación sigue cerrada. La UI no inventa una preferencia silenciosa.
