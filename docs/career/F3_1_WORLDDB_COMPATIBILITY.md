# CAREER-F3.1 - WorldDB compatibility matrix

## Scope decision

F3.1 does not integrate WorldDB and does not cherry-pick or modify `feature/worlddb-global-playable-02`. The protected evidence file `docs/playable/evidence/f3/ab-comparison.json` is untouched.

| Shared boundary | F3/F3.1 relationship | Risk | Evidence / action |
|---|---|---|---|
| `GameWorld` construction | F3 consumes the canonical world produced by existing entry points | medium | F0B-F3 playable runs and CareerLoop pass; no constructor change in F3.1 |
| Save V4 | HRPG state and career identity are already optional/persisted by existing authority | medium | Save V4 tests and F3 D club-change round-trip pass |
| Calendar/day boundary | F0B/F2 training, scouting and F3 HRPG coexist on the existing boundary | medium | F0B 4/4, F2 24/24 and F3 3/3 pass |
| BootstrapApp / app entry | F3.1 changes none | low | no diff in bootstrap or app startup |
| WorldDB bootstrap | Shared performance fixture is expensive; no functional failure observed | high for runtime cost, low for F3 correctness | `advanceGameDay x100` 292338.6ms; document as PERFORMANCE, do not alter here |
| Sports categories / competition rules | no Career rule changes | low | no F3.1 source changes |
| HRPG / Staff / relationships | F3 consumes canonical authorities, not WorldDB-specific records | low | 201 focused tests pass |
| Import graph | F3 Home imports application HRPG service as UI -> Application | low | typecheck/build and boundary scan pass |

## Integration recommendation

Keep F3 Career changes isolated until the WorldDB performance fixture has its own budget and baseline. A future merge should be a normal Git integration with fresh typecheck, Save V4, Career and WorldDB smoke checks; no mass cherry-pick is justified by F3.1.
