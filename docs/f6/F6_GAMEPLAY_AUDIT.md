# F6 Gameplay Audit

**Scope:** F6 priority audit against the F5 base (`4366b19d`). Findings are repository evidence and focused engine tests; this is not a claim that the full GUI, three-season or ten-year scenarios were played.

| Route | Status | Finding / evidence |
|---|---|---|
| Free-agent signing | SHALLOW | Contact, offer, response and canonical signing/finance authorities exist. F6 adds a causal term-length and competing-guarantee response; role is recorded but has no consumer that would make it a binding preference. |
| Professional contract negotiation | SHALLOW | Prior response was salary-oriented. F6 package evaluation now considers annual salary × years and known competing offers; no demonstrated role, playing-time or club-attractiveness preference model. |
| Trade negotiation / rival response | BLOCKED | `TradeNegotiationService.tradeNegotiationResponseReadiness` explicitly returns `MORE_INFORMATION_REQUIRED` for non-user clubs (`NO_DEFENSIBLE_AUTONOMOUS_TRADE_RESPONSE_POLICY`). Trade legality/execution exist, but no autonomous rival acceptance/counter path. |
| Club autonomy | SHALLOW | Existing domain-specific AI exists (draft, recruiting, minimum-roster maintenance, some market actions). The reviewed BS0 matrix finds no unified goal/perception/planning/execution loop or broad season roster strategy. |
| Match / tactics / live adjustments | SHALLOW | MatchEngine executes deterministic basketball actions; user tactics and live adjustments exist. BS0 records incomplete persistence, opponent adaptation and broad match-to-world consequences. No F6 equivalent-match comparison completed. |
| Rotations / fatigue | SHALLOW | Bounded automatic rotations and availability checks exist. BS0 records transient match fatigue and limited deep-bench / repair behavior. |
| Training / development | SHALLOW | Scheduled training and PlayerDevelopment execute. Staff/facility quality and training-to-match feedback are incomplete in BS0; no F6 three-way causal comparison completed. |
| Staff delegation | SHALLOW | Responsibility delegation and staff workflows exist. Quality is not consistently wired into performance outcomes (BS0). |
| Scouting | MEANINGFUL (bounded) | OrganizationKnowledge, assignments, reports, uncertainty and valuation consumers exist. Staleness and quality effects remain partial (BS0); no full F6 signing comparison was run. |
| Finance / contracts | SHALLOW | Canonical finance constrains market offers; contracts and finance state persist. BS0 finds Finance V2 is not part of a full daily budget loop. |
| Medical | SHALLOW | Injury, recovery and availability authorities exist; persistent match fatigue/recovery and staff/facility effects remain incomplete (BS0). |
| Facilities | DISCONNECTED (gameplay) | Canonical V2 model/engines/save support exist, but the reviewed matrix reports no ordinary daily lifecycle and an unconsumed sporting query seam. |
| Governance | SHALLOW | Approval/authority paths exist and are auditable; general daily cadence and unnecessary-step review were not certified in F6. |
| NCAA recruiting / portal / draft | SHALLOW | Initial-cycle recruiting, eligibility, portal and draft authorities exist; BS0 records future NCAA edition lifecycle limitations. |
| HRPG / career / mobility | SHALLOW | F5 mobility was tested in a controlled scenario, but F5 is explicitly PARTIAL. F6 did not complete organic three-season career continuity or full HRPG consequence validation. |
| Season transition / save-load | SHALLOW | Season lifecycle and Save V4 exist; no F6 full-world multi-season round-trip was run. BS0 records ecosystem lifecycle limitations. |

## Priority decisions

1. Improve player offer evaluation with real available terms and actual concurrent offer records, preserving organization-scoped knowledge.
2. Do not claim rival trade autonomy: it is an explicit implementation gap, not a UI blocker.
3. Preserve existing canonical authorities and make no speculative consumers for role promises, facilities, or staff ratings.
4. Full F6 acceptance remains PARTIAL pending real New Game workflows, multi-season and ten-year evidence, native Windows GUI, and broader causal comparisons.

## Evidence references

- Prior gameplay status matrix: `docs/strengthening/reviewed/BS0_GAMEPLAY_MANIFESTATION_MATRIX.md` (audit base recorded there as `c23771ff...`; used as a gap index, not as a current F6 test result).
- Focused current evidence: `src/engine/market/MarketEngine.test.ts` and related market application tests.
- Trade readiness behavior: `src/app/trades/TradeNegotiationService.ts` and its tests.

## Consolidation update (2026-11-02)

The F6 native app was launched successfully, which verifies desktop startup only. The integration candidate also contains a read-only DB-04 catalog projection with its own integration test (3/3 passed); it does not create a second game-world authority or make source-only competitions executable. These checks do not change the market, trade-autonomy, or end-to-end gameplay classifications above.
