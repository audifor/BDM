# BS3 Competition Lifecycle Matrix

This matrix describes executable behavior at the BS3 branch. `COMPLETE` means the stage is generated or preserved by the current lifecycle path for a valid configuration. `PARTIAL` means only the named subset runs automatically. `UNSUPPORTED` means no automatic implementation exists. `NOT_APPLICABLE` means the stage does not belong to that competition family.

| Ecosystem | Finalizes | Next edition | Participants | Schedule | Annual setup | Current blocker |
|---|---|---|---|---|---|---|
| FIBA-like domestic round robin | COMPLETE | COMPLETE | COMPLETE: immutable season participants plus finalized promotion/relegation output | COMPLETE: deterministic round robin and season calendar roll forward | PARTIAL: expired contracts, AI minimum rosters and Board rollover; player development remains the BS1 world-day hook | None for a valid primary league with at least two teams |
| FIBA-like promotion/relegation tiers | COMPLETE | COMPLETE after both linked tier editions have history and a resolution | COMPLETE: derived from the exact historical upper/lower seasons | COMPLETE: each new edition receives a deterministic schedule | PARTIAL: shared FIBA annual setup; movement consequences are recorded at finalization | Rollover waits while the companion tier edition is unfinished |
| Domestic cup linked to a primary league | COMPLETE when its edition has a complete schedule | COMPLETE: one successor edition is created atomically with the primary; repeated rollover is idempotent | COMPLETE for configured `RANK_BASED` qualification: entrants are selected from the configured source Season at its reference matchday | COMPLETE for the supported single-game knockout format: the existing bracket engine generates the participant snapshot and dated fixtures when qualification completes | NOT_APPLICABLE | Other qualification methods and unsupported knockout formats remain format-owned work; invalid sources return a lifecycle diagnostic and leave the cup non-playable |
| Linked continental or other World DB edition | COMPLETE for loaded runtime fixtures and season history | PARTIAL: local successor metadata may be created; external next-edition fixtures are not fetched or invented | PARTIAL: source edition/runtime context applies only to loaded source editions | PARTIAL: loaded source fixtures retain their mappings; future fixtures require a new World DB materialization | NOT_APPLICABLE | New external edition data must be supplied through the existing World DB materialization boundary |
| NBA-like closed league | COMPLETE | COMPLETE | COMPLETE: static league participants are copied from the source season | COMPLETE: deterministic next regular-season schedule | PARTIAL: the Draft is created during source-season finalization; no retirement or population balancing occurs | No blocker for repeat regular seasons; roster population may accumulate over many years (BS15/BS22) |
| NCAA-like conference league | COMPLETE | COMPLETE for valid conference snapshots | COMPLETE: season participant snapshot is carried forward | COMPLETE: deterministic conference and non-conference schedule | PARTIAL: Recruiting cycle and existing eligibility, academics, NIL, booster and enforcement profiles are initialized idempotently; no annual reset rules are invented | Missing/invalid conference configuration or fewer than two participants remains unsupported |

## Evidence paths

- Finalization and history: `src/engine/season/SeasonProgression.ts`.
- Lifecycle classification and paired-tier readiness: `src/app/game/CompetitionLifecycleCoordinator.ts`.
- Next season, linked edition and schedule creation: `src/app/game/startNextSeason.ts`.
- Historical promotion/relegation resolution and participant derivation: `src/engine/competition/PromotionRelegation.ts`.
- NCAA conference schedule: `src/engine/competition/schedule/NcaaLikeSchedule.ts`.
- Recruiting pool identity and cycle actions: `src/engine/recruiting/RecruitingEngine.ts`.
- World DB fixture planning/bindings: `src/engine/competition/WorldDbPhysicalGamePlanner.ts` and `src/engine/competition/WorldDbGameFixtureBinding.ts`.

The lifecycle coordinator supports FIBA-like, NBA-like and valid NCAA-like primary seasons. A linked domestic cup is playable when its configured rank-based source reaches its reference point and its declared single-game knockout format is supported; qualification and fixture creation use the existing competition-format engine.
