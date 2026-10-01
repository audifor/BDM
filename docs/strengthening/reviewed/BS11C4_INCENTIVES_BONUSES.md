# BS11C4 · Incentives & Performance Bonuses

## Status

**BS11C4 PASS** after focused validation. C4 adds one structured, nonbinding retention incentive proposal: a games-played bonus scoped to a current team competition and proposed contract year. It does not evaluate whether the bonus was earned or create a payment.

**Branch/base:** `bdm-stage2-bs11c4-incentives-bonuses`, based on the C3 archive commit `27f87c1de2d49299fde480f547075c042c54a581`, which descends from validated C3 `1e996658e1021945d723d3aee116d0431218fc28`.

## 1. Reuse audit

The Master Capability Reuse Registry, Master Capability Audit, Contract Deep Audit and Reuse First directive were inspected from repository commit `67811994e48137ec77579ae3dcaa273e8a680c37`, together with the BS11A audits, BS11B implementation audit, BS11C1 product canon and decisions, BS11C implementation plan, and reviewed C2/C3 certifications.

| Area | Existing authority | C4 disposition |
|---|---|---|
| Contract compensation | `PlayerContract.compensation` contains annual salary and optional per-year cash, cap hit and guaranteed amount | Reuse for context only; C4 does not change PlayerContract |
| Conditional exposure | Finance V2 derives `CONDITIONAL` schedule entries from cash salary minus guaranteed amount | Not a trigger or bonus authority; no C4 Finance commitment is created |
| Bonus event vocabulary | Finance accepts the `CONTRACT_BONUS_DUE` event type | No incentive producer, recognition rule, or trigger evaluator was found; the event name alone grants no authority |
| Individual evidence | `MatchStatLog` has canonical competition, season, game, date, player line and seconds played; `secondsPlayed > 0` is the established appearance test | Reuse only as the future evidence source for games played |
| Team evidence | Competition rules, completed Games, standings/postseason engines and finalized season history produce scoped results | Available in principle, but contract-year aggregation, qualification semantics, and consequence rules are not owned here |
| Awards | No comprehensive canonical awards record was found | Awards incentives unsupported/deferred |
| Salary legality | `SalaryRules` and Salary Engine own salary/cap rules; no incentive treatment is defined | No legality or cap value inferred from the bonus amount |
| Negotiation/persistence | BS10 base terms and BS11C immutable retention rounds; Save V4 persists retention evidence | Extend only `RetentionTermSet`; preserve old C2/C3 records |
| Match stats | `MatchStatLog` is generated from completed MatchEngine results | No MatchEngine or stat expansion |

**Reusable:** MatchStatLog participation evidence, current team/competition relationships, retention rounds/counters/invalidation, Save V4 parsing, and existing Analysis / Club Strategy controls.

**Unsafe as authority:** Finance `CONDITIONAL` remainder, Finance event vocabulary without a producer, standings or award labels without a selected evaluation window, generated probability, and prose descriptions.

**Duplicate-authority risk:** adding bonuses to PlayerContract, treating conditional salary as a trigger, creating a C4 Finance schedule, or recording earned state in negotiation history. C4 avoids each.

**Exact gap:** retention proposals had no structured contingent compensation term, and no incentive lifecycle existed to define its amount, trigger, applicable contract year, persistence, and response effect.

## 2. Supported and deferred incentive families

Only **games played** is supported. Its canonical evidence is a selected competition's `MatchStatLog` player line with `stats.secondsPlayed > 0`. The definition records the selected current competition, proposed contract year, minimum games, and amount.

Games started, minutes thresholds, points/rebounds/assists, team position, postseason/playoff qualification, promotion/relegation, championship, awards, signing/loyalty bonuses, and other event bonuses are not implemented. Although some source facts exist, their aggregation window, cross-competition meaning, evidence binding, or economic consequence remains unresolved. Awards also lack a canonical authority.

No attainability classification or probability is calculated.

## 3. Proposal shape and validation

`RetentionTermSet.incentives` contains immutable `GAMES_PLAYED` records with `competitionId`, one-based `contractYear`, `minimumGamesPlayed`, and positive integer `amount`. C4 terms stay separate from annual base salary and the C3 guarantee/option fields.

Validation rejects unknown trigger types, missing/unknown competitions, competitions in which the negotiating team does not participate, years outside the proposed term, nonpositive or out-of-bound thresholds and amounts, and duplicate logical triggers. The current structural threshold bound is 1–200; amounts are bounded at 100,000,000. The engine performs the checks for commands made outside the UI as well.

One selected competition disambiguates the evidence source. At execution, the exact future SeasonId and the relationship between contract year and competition season still need to be resolved against the binding contract's effective date. A current competition is a proposal reference, not proof that a future season or bonus will exist.

## 4. Deterministic response and counter

Incentives add a centralized response adjustment capped at 0.02 to the term-security factor. It scales with proposed amount relative to base salary and proposed term length. It does not change the salary ratio, guaranteed amount, cap hit, or stored base compensation. A structured reason identifies contingent value; no hidden score is persisted or shown.

The deterministic counter preserves incentive trigger terms and raises at most one eligible incentive amount by 10%, capped at 100,000,000, after the existing option and partial-guarantee counter priorities. Prior round terms remain deeply frozen and unchanged.

This is bounded calibration, not an expected-value or player-risk-preference model. A bonus is not treated as guaranteed salary.

## 5. SalaryRules, Finance and Governance boundaries

SalaryRules do not define performance-incentive legality or cap treatment. C4 makes no such claim; BS11D must revalidate binding terms under the applicable rules. Canonical service years remain unavailable and are never inferred from age.

C4 does not create Finance commitment, conditional exposure, expense recognition, cash reservation, payable, payment, budget mutation, or cap usage. `CONTRACT_BONUS_DUE` is only an accepted event vocabulary item; no C4 code emits it.

C4 creates no Governance decision, including no `PLAYER_CONTRACT_SIGNING`. Acceptance is agreement in principle only.

## 6. Trigger and lifecycle handoffs

C4 defines only the negotiated trigger. A later incentive lifecycle must bind the signed incentive to the exact competition/season, count canonical `MatchStatLog` lines using `secondsPlayed > 0`, record immutable source evidence and an idempotent earned/not-earned result, then apply an explicitly approved Finance and Salary consequence. It must define season mapping, evaluation timing, failure/absence semantics, cash recognition, and cap treatment before execution.

No match statistic is added or synthesized. No games-played count is evaluated or stored by C4.

## 7. Save V4, invalidation, UI and breakpoints

Save V4 round-trips structured incentive records inside existing offers, counters, revisions and accepted terms. No schema bump or new earned-state fields are added. C2 salary-only and C3 option/guarantee saves remain valid.

Existing C2 invalidation remains the only invalidation authority. Invalidating a parent negotiation makes its incentives non-executable; C4 adds no status or lifecycle.

Analysis / Club Strategy has an expandable performance-incentive editor and readable games-played summaries. It submits structured terms and does not enforce legality. It shows no score, target salary, MarketReality, agent internals, or synthetic probability.

`PLAYER_COUNTERED` and `ACCEPTED` carry complete structured terms through existing breakpoints; no breakpoint type is added.

## 8. Preserved C3 and nonbinding boundaries

C3 option authority, guarantee amounts, validation, and persistence semantics are preserved. Offers can contain salary, role, fee, options, guarantees, and incentives together. Incentives do not alter those terms.

Acceptance creates no successor `PlayerContract`, Finance obligation, Governance signing, roster mutation, bonus earning result, or payment.

## 9. Handoffs and findings

- **BS11C5:** clauses, consent, buyout, and trade kicker.
- **BS11C6:** deeper player/agent preferences and AI ownership; no preference is inferred here.
- **BS11D:** revalidate and materialize accepted terms atomically; bind each incentive to exact future competition/season and applicable contract year, and approve its SalaryRules, Governance and Finance consequences.
- **Later incentive-evaluation milestone:** evaluate signed triggers from canonical evidence with idempotent immutable result evidence, then recognize/pay only under explicit Finance policy. Define season mapping, evaluation dates, no-log/partial-season handling, and cap treatment first.
- **P0:** none identified in the focused C4 surface.
- **P1:** contract-year-to-season mapping is not yet canonical; competition bonus aggregation and future competition existence require binding revalidation; incentive cap treatment, due dates, accounting, and evaluation/payment lifecycle remain undefined; service years remain unavailable; awards authority is absent.

## 10. Validation

Focused results, run individually:

| File | Result | Duration |
|---|---:|---:|
| `src/engine/contractRetention/ContractRetentionEngine.test.ts` | 19 passed, 0 failed, 0 skipped | 39.24s |
| `src/save/GameWorldSaveV4.test.ts` | 17 passed, 0 failed, 1 skipped (unrelated annual-development simulation) | 37.26s |
| `src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx` | 7 passed, 0 failed, 0 skipped (`--testTimeout=20000`) | 46.93s |

`npm run typecheck` passed. `npm run build` passed; Vite reported its existing large-chunk advisory. `git diff --check` passed. Package manifests were unchanged. The full suite and long-horizon simulations were not run.

The first full Save V4 file invocation included an unrelated annual-development simulation and timed it out at 120 seconds while 16 other tests passed. The final Save V4 command excluded that case; no simulation was rerun. The first Club Strategy invocation hit two existing 5-second per-test timeouts under load; the complete file passed with a 20-second per-test timeout. A targeted UI run also passed. No assertion failure in the C4 incentive behavior remained.
