# CAREER-F3 - Career continuity

## Persisted identity

Save V4 already persists the user coach, employment history, memories, relationships and optional `humanSimulation`. The F3 UI stores no derived human state. Rebuilding the Hub after load therefore reads the same canonical situation and relationship records.

## Club change

The continuity test uses `applyUserCoachForJob` and `acceptCoachJobOffer`, not a test-only mutation. The user coach keeps the same coach/person identity, the new employment points to the destination club, and the former club no longer owns the active coaching authority. Existing memories remain attached to their source; former staff are not copied into the new club.

## Boundary

The current test proves identity, employment, memory and Save V4 continuity. A full UI walkthrough of the post-change Director Hub and native Windows rendering remains pending because the native Computer Use pipe is unavailable in this environment.
