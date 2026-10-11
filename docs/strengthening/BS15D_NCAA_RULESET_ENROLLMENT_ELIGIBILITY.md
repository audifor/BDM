# BS15D · NCAA-like Ruleset, Enrollment and Eligibility Core

## Lineage and scope

This milestone starts from BS15C `34db6a50ce1cddf86f58090d5eb3378a5e46fe12`. It adds the minimum NCAA-like rules, enrollment and eligibility authority needed before BS15E recruiting. It does not implement recruiting changes, the transfer portal, scholarships, NIL changes, contracts, or new match simulation rules.

No current real-world NCAA numeric rules are encoded. The two rulesets below are explicitly labeled `TEST / PRODUCT FIXTURE`; they exist only to demonstrate the effective-date architecture.

## Authorities

- `Player.id` remains the sole basketball identity; its existing `Person` remains the human identity root.
- `Team.rosterPlayerIds` remains the current sporting membership authority.
- BS15C `PlayerRegistration` remains the dated sporting/pathway history. Eligibility reads its IDs and dates as evidence but never changes it.
- `PlayerEnrollment` records a Player's dated affiliation with a college ecosystem, institution and Team. It does not mutate the roster or release a Player.
- `CollegeRuleset` owns effective-dated NCAA-like thresholds by ecosystem.
- Existing `AcademicProfile`, `AcademicTermRecord`, `EligibilityProfile`, and `EligibilityRestriction` remain canonical. There is no parallel academic or season counter.
- Eligibility is calculated from those sources and restrictions. No `Player.eligible` field or MatchEngine-only check was added.

## Ruleset and resolver

`resolveCollegeRuleset(world, ecosystemId, gameDate)` selects the unique ruleset whose effective interval contains the supplied game-world date. Team names, player age, computer date, UI route and season labels do not participate. Overlapping intervals and duplicate versions within an ecosystem are rejected by `GameWorld` validation.

Generated NCAA-like ecosystems receive two fixtures:

| Version | Effective interval | Minimum performance | Minimum progress | Maximum seasons | Games to consume a season |
|---|---|---:|---:|---:|---:|
| V1 | 0001-01-01 through 2035-06-30 | 60 | 55 | 4 | More than 3 |
| V2 | 2035-07-01 onward | 75 | 65 | 4 | More than 3 |

These are test/product fixtures only, not official or historical NCAA policy. The existing Eligibility defaults seed the fixture values when older worlds are enriched; date-specific NCAA assessments and season resolution then use the resolved `CollegeRuleset` as their one rules authority. The old ecosystem rules map remains as legacy migration/compatibility input and does not compete with the effective rulesets.

## Enrollment lifecycle

`enrollPlayer` checks that the Player and Team exist, the Team participates in the selected NCAA-like ecosystem, the Player is currently on that Team roster, a ruleset resolves for the game date, and no contradictory active enrollment exists for that Player/ecosystem. Repeating enrollment at the same Team is idempotent. A current BS15C registration is linked when one exists. Existing NCAA starter rosters and older saves are deterministically enriched with enrollment records, without changing their roster arrays.

`endPlayerEnrollment` marks the record ended and retains it. It does not delete Player, academic, registration, participation or restriction evidence, or mutate the roster. Transfer/dual-enrollment policies remain out of scope.

## Eligibility and explanation

`assessCollegeEligibility` is a deterministic read model. It exposes status, date, ruleset ID/version, stable reason codes, and supporting academic, enrollment, participation-counter and registration evidence. Reason codes are ordered as enrollment, academic requirement, participation limit, active restriction, or `ELIGIBLE`. Missing academic state fails the configured academic requirement. The assessment does not read Player Truth ratings.

`recordCollegeEligibilityAssessment` stores an immutable explanation keyed by date, context, Player and ruleset version, including a copy of the rule values used. Later effective rules do not rewrite prior assessment provenance or re-interpret its thresholds. Repeating an assessment with identical facts is idempotent; changed same-day facts create another historical entry. Current availability always derives a fresh assessment from current facts.

Prior participation is read from the existing `EligibilityProfile.seasonsUsed`; the applicable ruleset supplies the maximum and season-consumption threshold. This milestone does not create another experience counter. Pathway evidence is read from BS15C `PlayerRegistration`. Governance/Enforcement remains the owner of sanctions; active `EligibilityRestriction` records are consumed as eligibility reasons.

## Academic progress and shared availability

Existing academic term progression remains the only academic state transition. After `resolveAcademicTerm`, assessment reads the updated `AcademicProfile`; no UI patch is required. Academic failure is a direct assessment reason. Existing academic/enforcement restrictions remain consumed through the existing restriction path.

`getAvailablePlayersForCompetition` is the shared competition pregame filter used before MatchEngine preparation. It checks current eligibility and ordinary injury availability. Ineligible Players stay on the roster and are excluded from participation. Eligible Players proceed through the unchanged competition and match infrastructure.

## Season lifecycle and persistence

Eligibility profile counters, academic history, active enrollment, pathway registrations, restrictions and identity remain GameWorld state across successor seasons. Season rollover does not create a new Player or reset the old evidence; current rules resolve again from the relevant game-world date. Completed assessments retain their original ruleset version.

Save V4 adds optional `collegeRulesets`, `playerEnrollments`, and `collegeEligibilityAssessments`. Older V4 payloads without these fields load through existing NCAA enrichment, which supplies fixture authority and enrollment for NCAA rosters; no fields are required from non-NCAA saves. V1-V3 migration continues through the existing compatibility path. Player/Person identity, Academic state, Eligibility counters/restrictions, and BS15C registration history remain in their existing Save V4/V1 compatibility collections.

## Manual validation checklist

1. Select an enrolled NCAA-like roster Player. Resolve an assessment before and after 2035-07-01; confirm V1 then V2 and inspect reason/evidence.
2. Set the existing academic fixture state below threshold using an authorized test fixture, reassess, and confirm the Player is absent from `getAvailablePlayersForCompetition` while remaining on the roster.
3. Progress an academic term through `resolveAcademicTerm`, reassess and confirm changed evidence/result without editing an eligibility flag.
4. Record a V1 assessment, resolve V2, and confirm the saved V1 record still identifies V1.
5. Save/load V4 and confirm Enrollment, ruleset provenance, assessment, academic history, restrictions, `PlayerRegistration`, `PlayerId`, and `PersonId` remain linked. Remove the three optional properties from a V4 fixture and confirm it still loads.
6. Run the existing youth pathway and non-NCAA availability tests to verify they do not require college enrollment or rulesets.

## Baseline known failure

`CompetitionRulesPersistence.test.ts` is a known pre-existing BS15B failure. Exact-base reproduction at `fd6d7164dbaf77fad8ebb6b136fccf24805508fb` showed default FIBA game-clock settings being compared before canonical normalization (`null`/`both` vs default `120` seconds / `14` seconds / `nonScoring`). BS15D does not modify that normalization path, so the defect remains unchanged and must not be reported as a BS15D regression.

## Deferrals and handoff

- **BS15E:** recruiting and international acquisition; connect commitments to this shared enrollment gateway without changing scouting permissions or Player identity.
- **BS15F:** college continuation, compensation and transfer portal; define approved rules and carry existing enrollment, academic, participation and registration evidence forward.
- Official legal research and product approval are required before fixture values can be replaced with real-world NCAA rules.
