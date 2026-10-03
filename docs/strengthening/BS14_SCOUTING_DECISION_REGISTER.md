# BS14 Scouting Decision Register

Current closure dispositions through BS14H. This register replaces the historical audit snapshot.

| ID | Decision or gap | Disposition | Evidence / limit |
|---|---|---|---|
| D-01 | Sole mutable current evaluation authority | CLOSED | `GameWorld.organizationKnowledge`. |
| D-02 | Identity/discovery must not grant ability | CLOSED | `organizationPlayerAwarenessById` stores awareness separately; tests cover discovery without ratings. |
| D-03 | External PlayerTruth profile leak | CLOSED | `derivePlayerKnowledgeAccess` is the profile boundary; own roster alone receives exact ratings. |
| D-04 | Full Report rating coverage | CLOSED | Canonical 80 rating findings enter the standard evidence/report/consolidation pipeline. |
| D-05 | Skill Evaluation scope | CLOSED | Only the requested canonical family is emitted. |
| D-06 | Potential truth masking | CLOSED | Potential Evaluation emits estimates and never true development ceilings. |
| D-07 | Live Game provenance | CLOSED | Eligibility requires a scheduled player game; report evidence references that game. |
| D-08 | Staff role and employment suitability | CLOSED | Eligibility requires a live team assignment and employment; role proficiency, quality and workload stay separate signals. Advance Scouts may do broad opposition Full Reports and contextual Fit/Live Game missions. |
| D-09 | Human, delegated and advisory convergence | CLOSED | Requests use the canonical assignment pipeline; advisory recommendations remain `applied: false`. |
| D-10 | AI scouting and fairness | CLOSED | Bounded planner excludes user-controlled teams and uses public/contextual candidates plus shared operations; acquisition uses OrganizationKnowledge. |
| D-11 | Territory lifecycle | CLOSED | COUNTRY/COMPETITION operations resolve current membership, discover awareness only, stop when ended and preserve awareness. |
| D-12 | Save/load of runtime Scouting state | CLOSED | Targeted V2/V3/V4 and territory persistence regressions pass; legacy omission defaults are covered. |
| D-13 | Exactly-once completion and replay | CLOSED | Terminal-state filtering, stable IDs and same-date replay regression prevent duplicate report/evidence/knowledge. |
| D-14 | Season rollover | CLOSED | Added targeted test preserves knowledge, reports, evidence, assignments, awareness and territory operation. |
| D-15 | Adjacent season/calendar medical invariant | OUTSIDE | `startNextSeason.test.ts` has a pre-existing `advanceGameDay` failure: rehabilitation date precedes injury. Reproduced unchanged at the BS14G base SHA; no Scouting code is in that path. |
| D-16 | Tendency, personality and medical scouting | DEFERRED | Outside current mission and knowledge dimensions. |
| D-17 | Travel simulation and financial scouting cost | DEFERRED | Staff workload is the current operational capacity model. |
| D-18 | Richer evidence ingestion and authored report narratives | DEFERRED | Current synthetic evidence/report contract remains unchanged. |
| D-19 | Generated world seeded scouting knowledge | OUTSIDE | Fresh worlds start without invented observations; explicit ACB fixture baseline remains supported. |
| D-20 | Final visual smoke after BS14H | DEFERRED to BS14I | The new Recruitment Focus product flow replaces final certification as this milestone. BS14G full visual validation remains user-confirmed; BS14I owns end-to-end Scouting certification. |

The prior technical audit found no unresolved Scouting P0/P1 authority gap; the known red adjacent test D-15 is reproduced at the BS14G base and is outside Scouting. The previous BS14H certification effort is stopped. Recruitment Focuses, fog-safe Player Search and the end-to-end brief-to-candidate workflow are now open implementation scope; BS14I owns final certification.

| ID | Decision or gap | Disposition | Evidence / limit |
|---|---|---|---|
| D-21 | Canonical Recruitment Focus authority | IMPLEMENTED | `scoutingRecruitmentFocusesById` stores intent/lifecycle; candidates derive from existing territory, awareness and OrganizationKnowledge state. |
| D-22 | Focus discovery, workload and priority | IMPLEMENTED | Focus links to territory operations; those operations retain staff quality, capacity and awareness authority. Priority orders daily operation allocation. |
| D-23 | Focus current/potential thresholds | IMPLEMENTED | Candidate fit uses non-UNKNOWN `getOrganizationRatingEvaluation`; unknown evidence stays UNKNOWN and lowers confidence. |
| D-24 | Player Search and Search-to-Focus | IMPLEMENTED | Search only traverses `getAddressableScoutingPlayerIds`; addressable identity filters and known-evaluation thresholds are supported. |
| D-25 | Manual A-E gameplay validation | OPEN | Desktop UI is unavailable to the current computer-use surface; required manual visual acceptance has not passed. |
| D-26 | Full Centre, editable/resumable Focuses, automatic Quick Look and AI Focus convergence | DEFERRED | This tranche supplies create/priority/cancel/history, explicit deeper reports and the existing AI territory planner. |
