# BS11A Contract and Roster Planning Foundation

## Findings and model

1. **Contract lifecycle:** `PlayerContract` and `getPlayerContractStatus` remain canonical. Expiry is exclusive; lifecycle reconciliation records expired contracts. No renewal/extension action exists for player contracts.
2. **Roster truth:** current membership comes from `Team.rosterPlayerIds`; future membership comes from dated contracts. Integrity repair remains isolated in `RosterContractIntegrity`.
3. **Horizons:** the read-only projection uses the requested as-of date, each active season's actual end date, and the next later season in that competition. It makes no fixed calendar or medium-term assumption.
4. **Expiry:** only contracts active as of the read date and expiring by the horizon are unresolved candidates. A continuous same-player/same-team successor contract suppresses the old expiry.
5. **Future commitments:** contracts active at the horizon determine retained players. A future-starting contract for a player not currently rostered is a scheduled arrival when active at that horizon. Expired contracts do not count as retained.
6. **Continuity:** per-position risk is reported from current primary-position roster counts and the contractually retained population. This is not a prediction that anyone will leave.
7. **Planning needs:** BS9 continues to own need categories. Existing `CONTRACT_CONTINUITY` covers key expiring players; `CONTRACT_CLUSTER` covers multiple key expiries. BS11A does not add speculative action categories such as release, renewal, or roster-space pressure when the required actions/rules are not modeled.
8. **BS9 integration:** `ClubNeedsAssessment.contractRosterPlanning` carries the projection. Existing continuity need detection shares the continuous-successor test, preventing a resolved expiry from remaining a need. No second needs engine is introduced.
9. **BS10 integration:** BS10 stays the market intelligence, offer, signing, and transaction authority. BS11A supplies evidence to current planning only; it does not invoke market mutations.
10. **Finance boundary:** season payroll context uses `getContractFinancialSchedule`, separating guaranteed and conditional player salary totals. The as-of horizon uses the active season when present. Missing Finance data stays unknown. Final-year salary is read from the expiring contract. No renewal demand or replacement salary is generated.
11. **Age/development:** expiry context uses age at the requested date and canonical development stage; it does not forecast player ratings.
12. **Role/rotation:** expiry context uses current lineup starters, bench slots, and rotation minutes to label starter, rotation, or rostered. Role promise status is included as context only; no satisfaction or retention behavior is added.
13. **Roster limits:** the five-player playable/emergency floor is not treated as a target or maximum. There is no configured general roster maximum in the current modeled competition rules. Therefore roster-space pressure is not asserted.
14. **Responsibilities:** recommendation responsibilities remain advisory; negotiation/offer/sign execution remains in market responsibilities. Release continues through its explicit existing action. No new responsibility is added.
15. **Governance:** existing `PLAYER_CONTRACT_SIGNING` remains the approval boundary for an actual signing. Planning evidence does not constitute an institutional action and changes no Governance record.
16. **Triggers:** existing daily expiry reconciliation, preseason, material roster/contract planning rechecks, and season rollover remain. Projection is derived on read; no persisted daily planner or new trigger is introduced.
17. **Observability:** Analysis shows current roster count and maximum configuration status, actual horizons, retained players, arrivals, unresolved expiries, roles/positions, and continuity risks. It adds no contract action controls.
18. **Persistence:** none. The projection is ephemeral and rebuilt from world truth whenever BS9 assesses a club.

## BS11B recommendation

BS11B should define the actual player contract review lifecycle before adding negotiation: canonical decision categories, timing/checkpoint ownership, user advisory versus AI authority, information boundaries, and how a completed extension resolves the existing need. Define contract options and resulting terms only against approved product rules. Preserve BS9 as need authority, BS10 as market/transaction authority, Finance as salary authority, and Governance as institutional approval. Add no universal renewal score; use role, strategy, age/development, continuity, actual contract horizon, and Finance context as evidence.

## Priorities

- **P0:** Establish a single deterministic, non-mutating contract/roster projection; honor exclusive expiry and continuous successor dates; use actual season horizons; expose genuine unresolved expiries to BS9; preserve Finance, market, and Governance ownership. Completed in BS11A.
- **P1:** Add explicit renewal/extension/non-renewal review workflows only after policy and responsibility semantics are decided. A competition-specific registered roster maximum should be modeled before any roster-space pressure is derived. Add an approaching-expiry planning checkpoint if current review checkpoints prove insufficient.
