# BS14E · Scouting Operations, Discovery & Territory Coverage

## Result

BS14E adds persistent organization-level scouting operations over `COUNTRY` and `COMPETITION` territories. Territory membership comes from a team's `countryId`, or a competition's `participantTeamIds` and current team rosters. Player nationality is biography only.

An active operation belongs to an employed Scout assigned to its requesting team. Eligibility is centralized: head and regional Scouts can cover broad territories; international Scouts require a foreign context; college Scouts require an `ncaaLike` competition; pro Scouts require an `fibaLike` or `nbaLike` competition. Advance Scouts remain tactical specialists. Duplicate active operations for the same Scout and territory are no-ops.

Daily Calendar progression inspects the current territory roster, skips players already in organization awareness, knowledge, or an organization roster, then selects a bounded deterministic set. Operational quality derives from role proficiency, talent evaluation, analysis, adaptability, and evaluator experience. Daily discoveries are clamped to zero through three. Each active territory assignment costs two existing Scouting workload units; report assignments keep their existing mission costs. The cost reduces discovery throughput and can constrain report admission through the shared active-workload calculation.

## Knowledge and player access

`OrganizationPlayerAwareness` stores only identity awareness, discovery date, source, Scout, and territory provenance. Territory discovery never creates ratings or potential estimates. `OrganizationKnowledge` remains the sole evaluation authority.

The Scouting workspace candidate set includes own roster, organization knowledge and awareness, the next scheduled opponent, active drafts in the scheduled competition's ecosystem, the user's recruiting board, organization-specific market knowledge, and canonical free agents. These rows expose identity/public information while retaining unknown rating evaluations until scouting evidence exists. The player profile continues to derive ratings only from authorized organization knowledge and own-roster authority.

The existing `prioritizeRegions` responsibility ID is preserved for save compatibility. Its current delegated decision records the next scheduled game's competition as the territory focus. It no longer reads nationality. This does not create persistent AI territory assignments or broaden the existing bounded opponent scouting cadence; broader AI operations remain BS14F work.

## Persistence and lifecycle

V2 scouting runtime stores `territoryAssignments` and `playerAwareness` as optional additive collections. V2, V3, and V4 serializers round-trip both. Legacy runtimes default both to empty. Ended operations remain historical records and are not progressed. Awareness remains organization-specific and persists through player movement; current territory eligibility is always derived from current rosters.

The application service exposes create/end/list operations, organization awareness reads, and derived territory coverage. Store commands wrap create/end actions. No territory percentage is persisted.

## Boundaries

BS14E does not change the 80-rating evaluation model, add tendencies, introduce a global Player search, seed generated worlds with global awareness, or add travel, scouting finance, newgen creation, or final territory-management UI. Existing public acquisition and opponent surfaces remain addressable without granting evaluation knowledge. AI scouting cadence and broader territory choice remain BS14F work.

## Verification

Focused Vitest coverage certifies current-team geography versus nationality, deterministic/idempotent territory progression, discovery-to-Quick-Look knowledge flow, ended operation behavior, public opponent addressability without knowledge, `prioritizeRegions` competition-territory semantics, and V2/V3/V4 save/load with legacy empty defaults.
