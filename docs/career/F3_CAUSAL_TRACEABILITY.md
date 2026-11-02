# CAREER-F3 - Causal traceability

| User-visible action | Canonical command | Evidence written | Later reader |
|---|---|---|---|
| Ask for input at first meeting | `decideUserHumanSituation` -> `decideFirstStaffMeeting` | meeting memories, morale event, directional relationships, personality history | Staff dynamics, Coach relationships, HRPG continuity |
| Set direction at first meeting | same HRPG seam | same canonical meeting authority with the alternate choice | Staff dynamics, Coach relationships |
| Delegate a responsibility | `setStaffResponsibility` | responsibility event, staff reaction record, relationship event where justified | Staff, delegation outcome, Home completed work |
| Accept actionable recommendation | `acceptStaffRecommendation` | accepted outcome and advisory acceptance event | Staff, Home, downstream canonical domain |
| Dismiss actionable recommendation | `dismissStaffRecommendation` | rejection event/reaction and possible existing pattern signal | Staff dynamics and relationship explanation |
| Dismiss informational scouting | same dismiss command | no staff reaction, no relationship penalty | report lifecycle only |
| Make a promise | existing CoachLife promise command | promise memory and follow-up situation | Inbox, HRPG continuity, Staff |

The Home component owns none of these consequences. It projects source state and delegates execution. A stale or expired situation is rejected by `availableHumanActions` / `resolveHumanAction`, so a visual card cannot bypass domain validation.
