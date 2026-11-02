# F4C career mobility

The existing Coach Career authority remains the mobility implementation:

- `CoachCareerService` handles openings, candidacies, interviews, offers, departure and appointment.
- `CoachCareerHistory` records the previous club and the new appointment.
- team head-coach assignments and staff employment are updated atomically by the canonical service.
- Save V4 retains the career collections through the existing persistence path.

F4C does not move players or staff automatically when the coach changes club. The old club loses the coach assignment, a vacancy is created, and the new club receives the coach only after the existing job offer flow accepts it.

The unified world makes a cross-ecosystem appointment structurally possible because all teams and ecosystems share one GameWorld. A full long-running cross-ecosystem acceptance pilot was not completed in this run, so this item is PARTIAL rather than a claimed PASS.
