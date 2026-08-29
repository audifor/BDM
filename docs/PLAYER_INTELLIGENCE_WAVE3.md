# Player Intelligence — Wave 3

Management consumption is observer-specific. Match, development, training, official statistics and objective rule enforcement use PlayerTruth. Player Profile, squad/player grids, Draft AI, Recruiting AI, free-agent evaluation, trade evaluation and roster-management talent choices must use the Organization Player Evaluation gate.

The gate consumes organization knowledge, public context and a stable organization evaluation policy; it returns display-safe rating evaluations and derived, context-specific valuations. UNKNOWN has a deterministic public-context prior and never reads hidden ratings. Potential is never `EXACT`.

Sorting uses an organization's central estimate, with UNKNOWN grouped last. Filtering must use the same knowledge-derived evaluations. Derived valuations and view models are never persisted into PlayerTruth. OrganizationKnowledge remains sparse.

| System | Truth allowed | Knowledge required | Notes |
| --- | --- | --- | --- |
| Match | Yes | No | Physical simulation remains canonical-truth driven. |
| Development / training | Yes | No | Reality changes independently of observer knowledge. |
| Draft AI | No | Yes | Bounded draft pool, organization valuation. |
| Recruiting AI | No | Yes | Bounded recruit pool, organization valuation plus public rank/need. |
| Free Agency / roster AI | No for talent; contract data is objective | Yes for talent | Affordable free agents only; salary remains a cost. |
| Trade AI / valuation | No for talent; legality is objective | Yes for talent | Contextual trade valuation is perspective-specific. |
| Player Profile | No for subjective ratings | Yes | Public identity facts remain exact. |
| Squad | No for subjective ratings | Yes | Sorting uses intelligence estimates; UNKNOWN is last. |
| Draft UI | No for subjective ratings/potential | Yes | Potential is never exact. |
| Recruiting UI | Public recruiting context only | Yes when talent is shown | Current board has no canonical talent render. |
| FA UI | No for subjective ratings/potential | Yes | Uses intelligence cells and estimates. |
| Trade UI | No for subjective ratings | Yes | Receiving organization sees its own evaluation. |
| Salary-cap and trade legality | Objective data only | No | Rules do not depend on belief. |

Recruiting AI evaluates only its bounded recruit pool through the gate, then combines that result with public rank and position need. AI minimum-roster maintenance evaluates only affordable free agents through the same gate and retains objective salary cost. Trade legality remains in the Trade Engine; trade presentation and `tradePlayerValuation` use the receiving organization's intelligence view for player assets. There is no autonomous trade-offer planner in this milestone; the trade valuation boundary is ready for one without adding a Truth bypass.

Final acceptance coverage verifies that free-agency valuation changes with organization knowledge while objective asking price separately affects desirability; trade legality and salary matching are independent of organization knowledge; and contextual trade valuation changes with the receiving organization’s knowledge. Intelligence filters evaluate estimates, range bounds, confidence, and known state from the evaluation DTO, while sorting uses the central estimate and puts UNKNOWN last. Match simulation ignores OrganizationKnowledge. Save V2 round-trips organization policy and knowledge, deterministically upgrades older V2 runtime without a policy, and recomputes the same valuation without persisting it.
