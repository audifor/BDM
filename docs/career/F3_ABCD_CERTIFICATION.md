# CAREER-F3 - A/B/C/D certification

## Same-state scenarios

The F3 temporal test starts from one deterministic F2 day-zero world and runs 30 calendar days with the same match salt and fixtures.

- **A - neutral:** no human choice and no optional intervention.
- **B - collaboration:** accepts the real first-meeting `seekInput` choice and uses the existing managed sport policy.
- **C - alternate direction:** chooses the real `setDirection` meeting action and uses the existing sport policy without the delegated responsibility change.
- **D - continuity:** applies for a real open coaching job, accepts the real offer, then round-trips Save V4.

The test asserts identical calendar/game identifiers, records B/C HRPG commands, verifies human memories/relationships only in the arms that acted, and does not attribute equal/different match scores to the human choice. Existing `StaffHumanState.integration.test.ts` separately certifies actionable rejection, informational dismissal, repeated pattern detection and responsibility reactions.

## Evidence

- `src/app/game/PlayableF3HumanCareer.test.ts`
- `src/ui-ng/applications/home/DirectorHubPanel.test.tsx`
- `src/app/hrpg/HumanSimulation.test.ts`
- `src/app/staffHumanState/StaffHumanState.integration.test.ts`
- `src/app/game/PlayableF0B.test.ts` for the prior three-arm 30-day autonomy/scouting/MatchEngine regression.

The D case verifies coach identity, employment at the new club, old-club detachment and preserved memory count after Save V4. It does not transfer the former assistant as a new-club employee.
