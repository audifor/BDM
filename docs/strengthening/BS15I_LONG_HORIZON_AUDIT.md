# BS15I Long-Horizon Lifecycle Audit

**Base:** `8d0e128181b39d1d0354ca3067b55a51428db213`\
**Worktree:** `C:\BDM-BS15I` (`bdm-stage2-bs15i-population-save-long-horizon`)

## Findings before certification changes

| Lifecycle | Existing authority | Long-horizon finding |
|---|---|---|
| Annual cohort creation | `TalentCohort` and `createTalentSupplyCohort` in `engine/world/TalentSupply.ts` | Cohorts are created only by explicit callers (for example, scouting/recruiting fixtures and simulated college-player creation). `CalendarEngine` has no annual cohort replenishment phase, so supply can silently stop. |
| Materialization | `materializeTalentCandidate(s)` and candidate-key index | Demand-triggered and idempotent by candidate key. It creates one Player and Person and does not assign a roster. Cohorts remain latent; no daily expansion is present. |
| Age and development | `Player.bio.dateOfBirth`, derived age, annual `ANNUAL_PLAYER_DEVELOPMENT` on 1 July | Age is date-derived; there is no stored age counter to drift. Annual development is guarded by the cycle ID. |
| Youth age-out | `PlayerRegistration`/pathway services and competition age-band checks | Age eligibility is checked at registration. The annual calendar has no universal age-out, release, or promotion cleanup pass. Audit needs to distinguish a closed registration from a stale current roster. |
| College entry/exit | `PlayerEnrollment`, eligibility assessments, movement gateways | Enrollments are historical and explicitly ended on supported transitions. NCAA season resolution closes consumed eligibility records; no global graduation cleanup was found. |
| Recruiting / Portal | Recruiting cycle/profile authorities; `TransferPortalEntry` lifecycle | Cycle states progress daily and entries have explicit authorized/withdrawn states. Need verify terminal entries and old active profiles do not persist pathologically in a multi-decade world. |
| Draft / pro movement | `Draft` + `DraftEntry`, rights, `PlayerContract`, `EcosystemTransition` | Draft candidates project from existing Players; pro employment is separate. No Player career-end/retirement authority was found in player/career services or the daily calendar. |
| Inactive Players and identity retention | `players`, `personsById`, `Person.profileRefs` | Player and Person are retained; materialization records enforce one Player per candidate and one Person root per Player. There is no canonical player inactive status today. |
| Save collections | Save V4 serializes Player/Person, registrations, enrollments, cohort/materialization, recruiting, Portal, Draft, rights, contracts and transitions | BS15 fields are optional and default to empty on older V4 payloads. Semantic long-run reference validation remains to be certified. |
| Rulesets | Dated CollegeRuleset; RecruitingCalendar carry-forward; Portal rules lifecycle; benefits-cap carry-forward; DraftRules | Recruiting, Portal and benefits already have future derivation paths. College fixture rules currently end at 2035 without automatic carry-forward. Draft rules need a future-cycle inspection. |
| AI cadence | `CalendarEngine` daily/weekly/monthly phases; recruiting and transfer AI in lifecycle | Existing AI is wired to calendar and canonical gateways. Need late-era parity and hidden-truth firewall evidence from the certification suite. |

## Certification risks to resolve

1. Add the smallest general annual supply and career-end authorities required by the measured lifecycle, without changing the BS15B-H ownership model.
2. Determine whether college, Portal and Draft future-cycle rules resolve for 2045/2055 and correctly label simulated carry-forward.
3. Establish a reproducible integrated simulation path and measure daily work before committing to the 30-year run.
4. Inspect the prior Save V4 stall using one isolated representative test before deciding whether it is product-relevant.
5. Re-evaluate known Save V1 and scheduled-game fixture failures separately from canonical Save V4 behavior.

This document records the pre-change audit. Final evidence and any corrections belong in `BS15I_POPULATION_SAVE_LONG_HORIZON_CERTIFICATION.md`.

## Changes under certification

- `ANNUAL_TALENT_SUPPLY` now creates one cohort for each represented Player nationality and gender on 1 July. Cohorts use the explicit `bs15i-simulated-supply-v1` fixture policy, a seeded input basis, birth year `generationYear - 16`, and inputs of 10,000 age-cohort population, 50 participants per thousand, and 8,000 opportunity basis points. These are synthetic gameplay inputs, not population claims. Creation is yearly and does not materialize Players.
- `PLAYER_CAREER_END` uses the shared career-end authority once each 1 July. It preserves Player/Person/history, removes current roster membership, closes registrations/enrollments and active contracts, withdraws active Portal state, and clears active Recruiting profiles. The structural age safeguard ends careers after age 45; callers can also end a career explicitly.
- Save V4 stores career ends in an optional `playerCareerEnds` collection. Earlier V4 files default to no career ends, and the V3 compatibility Player shape remains unchanged.
- College rules now create season-effective `SIMULATED_CARRY_FORWARD` records after the end of the current fixture coverage. The record identifies `basedOnRulesetId` and ends with the derived season; future rules are not represented as official sources.
- Retired Players are excluded from current competition eligibility, Scouting targets, free-agent availability, Transfer Portal actions, and Draft projections.

## Save V4 stall investigation

The prior broad test command including `GameWorldSaveV4.test.ts` did not finish within several minutes. The V4 suite by itself also remained CPU-active past three minutes, so that suite was stopped once rather than repeated. One representative V4 CollegeRuleset round-trip passed in 1.2 seconds; the new career-end V4 round-trip passed in the focused 3-test career suite. The evidence points to cumulative fixture creation and batch contention in the broad regression tests rather than a stalled Save V4 serializer. Full Save V4 suite performance remains a measured limitation and is reported separately from canonical V4 semantic behavior.
