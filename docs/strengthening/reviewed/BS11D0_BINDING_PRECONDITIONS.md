# BS11D0 · Binding contract preconditions

## Approved decisions and service-time model

`ContractServiceTime` is a jurisdiction-scoped authority. It returns `KNOWN(n)`, `UNKNOWN`, or `NOT_REQUIRED`. A known value of zero is stored and remains different from a missing baseline. Contract evaluation never reads player age to infer service time.

SalaryRules may declare `PROFESSIONAL_APPEARANCE_SEASON` for an ecosystem jurisdiction. At completed-season finalization, one credit is recorded per player and jurisdiction/year when at least one completed official game has a canonical `MatchStatLog` line with `secondsPlayed > 0`. The record retains season, competition, date, and qualifying game IDs. Duplicate processing and multiple competitions in the same jurisdiction/year cannot create another credit. NCAA, youth, preseason, roster presence, and other ecosystems do not qualify under this policy.

Generated NBA-like players receive one stored baseline during world generation. A player-specific deterministic stream assigns zero through a bounded plausible maximum; age is used only to constrain the generated history, not to define contractual service. Generated FIBA-like and NCAA-like players receive no NBA service record. Imported players remain `UNKNOWN` until import supplies explicit `IMPORTED` evidence; contracts, age, and draft status are not substituted. Qualifying future credits are still retained as evidence for such a player, while total service remains unknown until the historical baseline is supplied.

Baselines and immutable credits are part of canonical `GameWorld` state and Save V1. Older saves load empty service-time collections. GameWorld validation checks player, ecosystem, season, competition, evidence, and jurisdiction/year uniqueness.

## Salary rules and cap treatment

SalaryRules remain season snapshots. Generated NBA-like rules explicitly set `BASE_SALARY` and the NBA-like service jurisdiction. FIBA-like competitions do not gain synthetic SalaryRules; binding salary-only materialization treats their cap accounting as `NOT_APPLICABLE`. Where rules exist, their `capAccounting` must be explicit. Old uncapped rules migrate as `NOT_APPLICABLE`; old capped rules migrate as `EXPLICIT_SCHEDULE`, which fails closed until a canonical schedule is available.

- `NOT_APPLICABLE`: materialized years carry the semantic policy and no numeric `capHit`.
- `BASE_SALARY`: the rules explicitly authorize `capHit = cashSalary`; the standard salary validator checks terms and cap legality.
- `EXPLICIT_SCHEDULE`: the materializer consumes a canonical RookieScale entry selected for the player and fails closed without that selection/entry or when the agreement does not match its schedule.

Guarantees are materialized per year from accepted guarantee proposals and do not alter cap treatment. An unspecified guarantee is zero. Incentives, options, clauses, and agent-fee terms currently return `UNSUPPORTED_BINDING_TERM`; no accepted term is silently discarded. BS11C4 games-played incentives have no approved binding cap/accounting treatment.

When a successor season is created, existing SalaryRules are cloned through the season lifecycle into a new snapshot with the successor `seasonId`, preserving cap and service policies. No rules are synthesized if the predecessor has none. This uses the existing start-next-season processor.

## Compensation materializer and scope

`materializeBindingContractCompensation` is a pure precondition query. It checks accepted salary/term data, resolves service time, validates salary under explicit rules, and returns immutable per-year cash, guarantee, and tagged cap treatment. Accepted base salary is repeated every year; no escalators are invented. Expected failures are structured: `RULES_UNAVAILABLE`, `SERVICE_TIME_UNKNOWN`, `ILLEGAL_SALARY`, `ILLEGAL_TERM`, `CAP_TREATMENT_UNAVAILABLE`, or `UNSUPPORTED_BINDING_TERM`.

The result is compensation only. It creates no `PlayerContract`, Governance request, Finance commitment, roster mutation, signing record, or activation. Finance remains untouched. Ordinary generated NBA-like and FIBA-like salary-only terms can reach this materializer successfully; NBA-like requires explicit SalaryRules and a known baseline, while FIBA-like needs no service years or numeric cap hit.

## Generated-world checks and handoff

The focused generated-world checks cover a normal NBA-like player/club with SalaryRules, deterministic known service time, and `BASE_SALARY`, plus a normal FIBA-like player/club with `NOT_REQUIRED` service time and no cap hit. The tested salary-only paths are ready for BS11D1 to consume.

Remaining P0 for this precondition milestone: none for salary-only NBA-like and FIBA-like materialization. Remaining P1 for later signing: binding options, incentive evaluation/payment, trade-consent enforcement, agent-fee Finance handling, and atomic Governance/Finance/contract execution remain intentionally unsupported here and must be resolved or fail closed in BS11D1. BS11D0 does not authorize signing.
