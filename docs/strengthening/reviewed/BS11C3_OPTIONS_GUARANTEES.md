# BS11C3 · Contract Options & Guarantees

## Status

**BS11C3 PASS.** C3 extends predecessor-bound retention proposals with structured option and guarantee terms. Every accepted result remains an agreement in principle; no contract or economic execution is produced.

**Branch/base:** `bdm-stage2-bs11c3-options-guarantees`, based on `fc65c87ca38d2c229cb1d62c2c3e225218defef3`, the separate BS11C2 documentation archive commit. The validated BS11C2 implementation remains ancestor `fa0743092ed4e807468f0129e4f213c0f5affb66`.

## 1. Reuse audit

The historical Master Capability Reuse Registry, Contract Deep Audit, Master Capability Audit, and Reuse First directive were inspected from repository commit `67811994e48137ec77579ae3dcaa273e8a680c37`. The registry classifies `PlayerContract` and its yearly compensation as active canonical authorities, options as specified but not implemented, and guarantee amounts as partially connected. The BS11A archived audits, BS11C1 contract canon and decisions, BS11C implementation plan, and archived BS11C2 report were also reviewed.

| Area | Existing authority | C3 disposition |
|---|---|---|
| Options | No `PlayerContract` option field, option record, deadline, or exercise lifecycle | Add structured proposal terms only; do not create an option lifecycle |
| Guarantees | `PlayerContract.compensation.years[].guaranteedAmount`; Finance schedule splits guaranteed amount from remaining conditional exposure | Reuse amount meaning in negotiation proposals; do not treat conditional remainder as a trigger |
| Persisted contract | `PlayerContract` owns identity, parties, exclusive term dates, annual salary and optional yearly cash/cap/guarantee values | Remains contract authority; C3 never writes it |
| Salary legality | Season-scoped `SalaryRules` and Salary Engine | Reuse only existing contract-length checks available to retention; do not infer service years or salary legality |
| Finance | Finance V2 schedule and recognition derive from canonical contracts and explicit policy | No schedule, commitment, payable, recognition, or cash mutation |
| Negotiation | BS10 `NegotiationTermSet`, roles, representation and `agentCounter`; BS11C2 typed immutable retention history | Reuse base salary/years/role/fee and the existing counter helper; keep options and guarantees retention-specific |
| Governance | `PLAYER_CONTRACT_SIGNING` exists for binding signing paths | No Governance request or decision is created |
| Trade and release | Trade preserves contract identity and terms; release/termination have separate authorities | No option, guarantee, release, dead-money, trade, or retained-salary consequences |
| Saves | Save V4 explicitly persists world collections and C2 negotiation evidence | Add optional C3 proposal fields within existing retention terms; old payloads remain valid |

**Reusable:** base `NegotiationTermSet`, `NegotiationRole`, representation origin, the bounded BS10 `agentCounter`, the existing retention history/service, SalaryRules contract-length limits, Save V4 parsing, and existing breakpoint/UI routes.

**Unsafe to reuse as authority:** `MarketReality`, free-agent willingness or eligibility, free-agent signing effects, PlayerContract or Finance schedule as a proposal container, cap-hit calculations without canonical service years, or Governance signing execution.

**Duplicate-authority risk:** adding option or guarantee fields directly to `PlayerContract`, treating negotiations as Finance data, or adding a separate C3 invalidation lifecycle would duplicate existing authorities. C3 does none of these.

**Exact gap:** retention rounds previously carried only salary, years, role and optional club agent fee. No structured option or guarantee terms could be negotiated, displayed, validated, countered, or saved.

## 2. Canonical proposal model

`RetentionTermSet` retains the BS10 base terms and adds optional `options` and `guarantees` arrays. These fields are immutable proposed terms stored only in the parent BS11C2 retention negotiation, its rounds, counters, and accepted terms.

## 3. Supported options

The supported types are `TEAM`, `PLAYER`, and `MUTUAL`, matching the approved BS11C1 product canon. Each option identifies a one-based proposed contract `year`, a typed `type`, and explicit `decisionAuthority` (`TEAM`, `PLAYER`, or `BOTH`). The factory rejects type/authority mismatches and more than one option for a year. Option year salary uses the proposal's shared annual salary; C3 does not introduce a second per-year salary schedule.

No free-form option text, guarantee date, decision deadline, missed-deadline default, exercise, decline, or successor behavior is represented here. Those require the later binding lifecycle owner. Early-termination, player-only mutual control, and other option variants are unsupported.

## 4. Guarantee model

Each optional guarantee term identifies a proposed contract year and an integer `guaranteedAmount`. Zero means explicitly non-guaranteed; an amount between zero and annual salary is partial; an amount equal to annual salary is full. An omitted year is unspecified, preserving BS11C2 salary-only terms. Duplicate years, out-of-term years, negative values, and amounts above the proposed salary fail structural validation.

There is no guarantee date, vesting condition, or guarantee lifecycle. No date or trigger is invented. The proposal's annual salary is shared across years; variable yearly salaries are deferred until a canonical materialization shape is authorized.

## 5. Structural and SalaryRules validation

`validateRetentionTermProposal` is the single proposal validation path. It distinguishes:

- `STRUCTURAL_INVALIDITY`: malformed option/guarantee combinations or out-of-term years;
- `RULES_UNAVAILABLE`: no effective-date SalaryRules record;
- `RULES_ILLEGAL`: proposal years violate available current/effective contract-length rules;
- `VALID_NONBINDING_PROPOSAL`: structure and supported contract-length rules pass.

Submission still rechecks user authority, predecessor integrity and C2 eligibility. Rules missing at the effective date continue to fail closed. Available SalaryRules do not provide a canonical service-years value or fully prove future salary/cap legality; accepted proposal terms therefore remain unusable for binding execution until BS11D revalidates them with sufficient authority.

Service years are never inferred from age. SalaryRules are not synthesized. C3 does not project future cap hit or choose a guarantee's release, cap, cash, or dead-money treatment.

## 6. Deterministic response and counters

No player-specific guarantee, option, or risk-tolerance preference source exists. A centralized, deterministic security adjustment is therefore conservative and bounded: player options improve the response band, team options reduce it, mutual options are neutral, and explicit guarantee amounts are evaluated relative to a neutral half-guaranteed baseline. The combined adjustment is clamped to five percentage points. Omitted guarantee terms are neutral. This does not use age, personality, family, geography, MarketReality, or hidden agent data; the derived score remains internal and is not persisted or displayed.

A counter remains one immutable round. It may convert the first team option to a player option; when no team option is present, it may raise the first partial guarantee to the counter salary. Otherwise it preserves the proposed clauses and uses the existing deterministic salary/agent counter behavior. It does not generate multiple clause alternatives.

Responses add structured reasons for player-option security, team-option control, and higher/lower specified guarantee amounts. No hidden score or preference data is exposed.

## 7. History, persistence and invalidation

Nested option and guarantee arrays are frozen along with each offer, response, revision and accepted term set. Prior rounds are preserved unchanged when later offers are submitted. C2 salary-only records retain their prior shape.

Save V4 serializes option/guarantee proposal values inside retention history. It stores no response scores, targets, legality projections, or future option decisions. No schema bump is needed. Existing Save V4 payloads without C3 fields and payloads without retention negotiations still load with the same compatibility defaults.

Predecessor, roster, contract-integrity, successor, expiry and stale-negotiation invalidation remain the parent C2 lifecycle. C3 adds no separate invalidation record.

## 8. UI and breakpoints

The existing Analysis / Club Strategy retention surface exposes per-year option type and guarantee amount in a compact expandable section. Round, counter and accepted summaries identify option year/type and guarantee percentage. The UI submits structured terms; the engine performs validation. It displays no internal response score, salary target, MarketReality, or hidden Agent fields.

`PLAYER_COUNTERED` and `ACCEPTED` continue through existing SimulationBreakpoints. No new breakpoint type is introduced.

## 9. Nonbinding and economic authority boundaries

C3 creates no successor `PlayerContract`, future activation, predecessor-history mutation, roster arrival, option exercise/decline, release effect, guarantee consequence, cap reservation, Finance obligation/payment, or Governance signing request. The existing contracts, roster, Finance, SalaryRules, Governance, Trade and release systems remain untouched by proposal acceptance.

## 10. Later handoffs

- **BS11D:** revalidate the exact predecessor, roster integrity, uniqueness, authority, current/effective SalaryRules and service-years/salary legality at execution. Materialize any accepted options/guarantees into canonical `PlayerContract` compensation and the approved Governance/Finance effects atomically. Define option exercise authority, dates and defaults before execution. Scheduled-contract activation and roster arrival remain explicit lifecycle work.
- **BS11E:** define release/termination, guarantee survival, dead money, retained salary, trade movement and other downstream consequences from binding contract facts.
- **BS11C4:** incentives and performance bonuses.
- **BS11C5:** clauses, consent, buyout and trade kicker.
- **BS11C6:** deeper player/agent preferences and AI ownership.

## 11. Findings and validation

- **P0:** None identified in the focused C3 surface.
- **P1:** Existing C2 gaps remain: current player data lacks canonical service years; some generated user-club seasons lack effective-date SalaryRules; future salary/cap legality cannot always be proven. Guarantee dates, vesting, option exercise deadlines/defaults, and downstream guarantee treatment are also not modeled. These remain BS11D/BS11E authority work and are not guessed here.

Focused regression commands were run separately to avoid resource contention:

```text
npm test -- src/engine/contractRetention/ContractRetentionEngine.test.ts
npm test -- src/engine/market/MarketEngine.test.ts
npm test -- src/save/GameWorldSaveV4.test.ts
npm test -- src/app/game/SimulationBreakpoints.test.ts
npm test -- src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx
```

Results: **5 files passed; 74 passed, 0 failed, 0 skipped.** Per-file durations were 15.52s (retention), 16.97s (BS10 MarketEngine), 92.69s (Save V4), 25.35s (SimulationBreakpoints), and 17.33s (Club Strategy); summed duration 167.86s. Coverage includes all three option types, invalid option/guarantee structures, deterministic security response, bounded option and guarantee counters, immutable prior terms, accepted nonbinding terms, C2 salary-only Save V4 compatibility, C3 Save V4 round-trip, reused BS10 agent behavior, breakpoints, and UI terms/privacy.

`npm run typecheck` passed. `npm run build` passed; Vite emitted its large-chunk advisory. `git diff --check` passed. The full suite and long-horizon simulation were not run.

An earlier focused attempt had one failed expectation that incorrectly required one counter to modify both a team option and a partial guarantee at once. C3 intentionally limits each clause counter to one bounded deterministic change. The assertion was corrected and a separate partial-guarantee counter test was added; those changes passed. A later parallel focused run timed out in nine existing test cases across MarketEngine, Save V4, breakpoints and Club Strategy, with no assertion failures in those cases; all five files passed when run individually. No production correction was needed for either test-run issue.
