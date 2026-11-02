# CAREER-F3 - Professional relationships

## Vertical slice

The vertical slice uses the real assistant assigned to the user's club:

1. F1 queues the first meeting when an eligible assistant exists.
2. `HumanSimulationService` exposes the existing meeting choices.
3. Home displays those choices as an A-tier attention item.
4. The selected button calls the store's `decideUserHumanSituation` command.
5. `StaffTrustMeeting` applies the canonical memories, morale, relationship events and personality history.
6. Save V4 retains the resolved situation and consequences.

If the club has no eligible assistant, no relationship is fabricated; the existing empty state remains authoritative.

## What is visible

Staff already exposes responsibilities, dynamics, memories, relationship facets and recent developments. Coach already exposes materialized relationships and career context. Home now exposes only open HRPG situations with real available actions. Inbox remains the source of legacy life decisions and is not duplicated.

## What matters

Relationship values matter where existing authorities read them: staff reaction magnitude, relationship events, morale, career requests and autonomy context. They are not converted into a universal MatchEngine multiplier. Sporting differences are attributed to training, tactics, lineup, fatigue or other recorded causes only.
