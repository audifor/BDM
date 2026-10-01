# BS11C5 · Contract Clauses, Consent, Buyout & Trade Kicker

## Status

**BS11C5 PASS.** C5 adds one proposal-only clause supported by the approved contract canon: future player trade consent. It does not create a current consent decision or affect any movement lifecycle.

**Branch/base:** `bdm-stage2-bs11c5-clauses-consent-buyout-kicker`, based on C4 archive commit `29382b997c2e0444c0b60c74089b2003acb0c12b`, which descends from validated C4 `a418601f86c8e63e217ec1dc3280a63028732d0d`.

## 1. Reuse audit

The Master Capability Reuse Registry, Master Capability Audit, Contract Deep Audit, and Reuse First directive were inspected at repository commit `67811994e48137ec77579ae3dcaa273e8a680c37`, together with BS11C1 product canon/decision register, reviewed C2–C4 documentation, BS11B audit, BS10 trade audits, and current Trade, Release, Finance, Governance, and Save V4 source.

| Area | Existing authority | C5 disposition |
|---|---|---|
| Contract | `PlayerContract` contains identity, dates, compensation, and released termination; no clauses | Keep C5 rights only in retention proposal terms |
| Trade movement | TradeEngine validates ownership, contracts, rules, salary, and atomically moves rosters/contracts/history | Reuse unchanged; it does not read retention proposals or consent terms |
| Trade restrictions | No contract no-trade, consent, veto, or restriction model/consumer | Add only the approved future player-consent proposal; no enforcement |
| Release | `releasePlayer` immediately terminates the active contract and removes roster membership under its existing integrity checks | Keep unchanged; no buyout or release clause is added |
| Retained salary/dead money | Separate trade obligation and salary charge types | Not reused as clause or buyout amounts |
| Finance | Finance V2 recognizes explicit contract events/commitments; event names include `CONTRACT_BUYOUT_DUE` but there is no clause producer | No payable, commitment, payment, or ledger mutation |
| Governance | `PLAYER_CONTRACT_SIGNING` and separate trade commitment authority exist | No signing, trade, or release Governance decision is created |
| Save/negotiation | BS11C2 rounds; C3 options/guarantees; C4 incentives; Save V4 | Add optional clauses to the existing immutable terms/history |
| Competition/Salary rules | TradeRules and SalaryRules exist but define no clause legality, kicker, or buyout semantics | No ecosystem-specific legality is inferred; binding execution must revalidate |

**Reusable:** typed retention terms and frozen history, Save V4 parser, current trade validation/execution, current release authority, and existing Club Strategy controls.

**Unsafe reuse:** treating Trade approval as player consent; treating `CONTRACT_BUYOUT_DUE` as a buyout policy; treating retained salary or dead money as buyout/kicker amounts; changing Release or Trade because a nonbinding proposal exists.

**Duplicate-authority risk:** adding clause truth to `PlayerContract`, creating a second trade validator, or using proposal terms as Trade/Release/Finance/Governance state. C5 does none of these.

**Exact gap:** retention rounds could not carry a typed future movement right, and no contract lifecycle owns player consent, buyout terms, or kicker settlement.

## 2. Supported and deferred families

### Supported: future player trade consent

The only supported proposal is `TRADE_CONSENT_REQUIRED`, with `decisionAuthority: PLAYER`. It describes a future right: before a future trade under an authorized binding contract, the player must give affirmative consent for the exact trade proposal. It is not a consent or waiver to any current trade.

The proposal is not scoped to a year, does not list permitted teams/geographies, and is not an absolute no-trade prohibition. An agent is not represented as the right holder. Whether an authorized agent may convey a player's decision is deferred to the future consent lifecycle.

### Unsupported/deferred

- **Absolute no-trade prohibition:** distinct from affirmative player consent; no contract term or waiver process exists.
- **Partial/team-list/geography restrictions:** no canonical restriction language or rule support.
- **Buyout and release clause:** no approved holder, trigger, payer/payee, amount basis, timing, guarantee, cap, or Finance meaning exists. The decision register's recommendation is not a product decision. The current unilateral `releasePlayer` behavior is not a buyout.
- **Trade kicker / assignment bonus:** no approved fixed-amount or percentage basis and no cash/cap/Finance treatment. Contract canon explicitly requires accounting rules before implementation.
- **Transfer fee:** transfer routes and settlement are unsupported.

These terms are rejected structurally rather than represented with ambiguous fields. No buyout semantic or kicker value format is chosen in C5.

## 3. Structural validation and rules boundary

`RetentionTermSet.clauses` uses a compact typed array. The freeze/normalization path accepts only the supported consent type and player decision authority; it rejects unknown payloads, unsupported authority, and duplicate consent clauses. The same canonical proposal-validation path runs at the engine command boundary, including for values supplied outside the UI.

No current CompetitionRules or SalaryRules define clause legality. A structurally valid consent proposal is therefore retained only as a **nonbinding proposal**; no league-law claim is made. BS11D must revalidate any binding term against the applicable ecosystem and approved execution rules. Service years remain unavailable and are never inferred from age.

## 4. Deterministic response, counters and history

Player-held consent adds a centralized bounded `0.02` adjustment to the existing response term factor and a structured reason code. It does not change salary ratio, guarantees, incentives, or any player-specific preference. No hidden score or likelihood is persisted or displayed.

A deterministic counter may add the player-consent clause when the offer has no existing clause, after the existing option/guarantee/incentive counter priorities. It makes no second clause rewrite. Existing offers and nested clause arrays/records are frozen; a later revision cannot alter prior terms.

## 5. PlayerContract, Trade, Release, Finance and Governance boundaries

C5 does not add clause fields to `PlayerContract`. `RetentionTermSet` is proposal evidence and is not binding contract truth.

TradeEngine remains unchanged and does not inspect C5 terms. An accepted consent proposal does not block, approve, or otherwise affect current Trade validation/execution. A future trade lifecycle must read a materialized binding clause, request a decision for the exact proposal revision, invalidate consent when that revision changes, and block pending/no-consent execution under approved default rules.

Release remains unchanged. C5 creates no buyout/release term and does not terminate a player. No successor contract, roster movement, buyout, transfer, kicker, retained-salary, dead-money, Finance, or Governance effect is created.

## 6. Save V4, invalidation, UI and breakpoints

Save V4 round-trips clause proposals in offers, counters, revisions, and accepted terms. C2 salary-only, C3 option/guarantee, and C4 incentive shapes remain backward-compatible. No consent decision, trade result, exercise result, or payment status is saved.

C2 invalidation remains authoritative; C5 introduces no separate status or lifecycle.

Analysis / Club Strategy includes a compact Contract clauses section. It labels the consent right as proposed and explicitly says it is not active and is not consent to a current trade. The engine, not UI controls, validates terms.

Existing `PLAYER_COUNTERED` and `ACCEPTED` breakpoints carry the complete term set. No new breakpoint is added.

## 7. Handoffs and findings

- **BS11C6:** deeper player/agent preference and AI ownership; C5 uses no hidden preference data.
- **BS11D:** authorize signing, revalidate the exact predecessor and roster/contract integrity, and choose any approved binding contract representation for consent. Do not materialize unsupported buyout or kicker terms.
- **BS11E:** define release/termination consequences and any separately approved mutual buyout/exit right. Preserve current `releasePlayer` semantics until then.
- **Future Trade consent lifecycle:** specify player/authorized-agent actor, exact proposal revision binding, deadlines/defaults, no-response treatment, Governance interaction, decision history, and pre-mutation TradeEngine enforcement. Define kicker accounting before adding it.
- **P0:** none identified in the focused C5 surface.
- **P1:** no current binding contract clause model; future consent actor/deadline/default/Governance semantics unresolved; buyout and release-clause meaning/accounting unresolved; kicker basis and cash/cap treatment unresolved; ecosystem-specific legality absent; service years unavailable.

## 8. Validation

Focused results, run individually:

| File | Result | Duration |
|---|---:|---:|
| `src/engine/contractRetention/ContractRetentionEngine.test.ts` | 21 passed, 0 failed, 0 skipped | 18.69s |
| `src/save/GameWorldSaveV4.test.ts` | 17 passed, 0 failed, 1 skipped (unrelated annual-development simulation) | 19.12s |
| `src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx` | 7 passed, 0 failed, 0 skipped | 18.46s |
| `src/engine/trade/TradeEngine.test.ts` (direct C5 trade-authority case) | 1 passed, 0 failed, 7 name-filtered | 5.07s |

`npm run typecheck` passed. `npm run build` passed; Vite emitted its large-chunk advisory. `git diff --check` passed. Package manifests are unchanged. No full suite or long-horizon simulation was run; the unrelated annual-development Save V4 test was explicitly skipped.
