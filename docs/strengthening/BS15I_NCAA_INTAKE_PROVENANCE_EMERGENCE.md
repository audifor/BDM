# BS15I NCAA Intake Provenance Emergence

**Status:** PASS — focused generation and recruiting-consumption gate\
**Date:** 2026-10-06\
**Worktree:** `C:\BDM-BS15I`

## Source selection

Provenance is established when `TalentSupply` materializes the canonical Player, before recruiting creates a `RecruitProfile`.

| World context | Generated pathway |
|---|---|
| U.S. Place, age 18 | `US_HIGH_SCHOOL` |
| U.S. Place, age 19 or older | Seeded choice of `US_HIGH_SCHOOL` or `JUCO` |
| JUCO choice | Records `US_HIGH_SCHOOL` at age 18, followed by `JUCO` at materialization; age under 19 is rejected |
| Non-U.S. Place with a local team in an active FIBA-like competition | Seeded choice of `INTERNATIONAL_CLUB` or `OTHER_PRECOLLEGE` |
| Place without one of those supported contexts | `OTHER_PRECOLLEGE` |
| Academy intake | `ACADEMY_YOUTH` |

An explicit request or cohort pathway source remains authoritative, except an academy-intake materialization always records `ACADEMY_YOUTH`. On the recruiting side, a canonical `PlayerRegistration` whose cause is not `RELEASE` takes precedence over pathway history. International provenance requires a local FIBA-like competition context; nationality by itself does not assign it.

The choices use `SeededRandomSource` with the cohort seed and candidate key. They do not read `PlayerTruth`, team evaluations, or recruiting outcomes. Recruiting does not assign or rewrite pathway history.

## Bounded NCAA smoke

The production world began on 2032-10-01. The canonical calendar advanced 90 days to 2032-12-30, opening one men's NCAA recruiting cycle. Its normal pool contained 36 generated candidates and profiles:

| Provenance | Generated | Recruitable | RecruitProfile |
|---|---:|---:|---:|
| `US_HIGH_SCHOOL` | 0 | 0 | 0 |
| `JUCO` | 0 | 0 | 0 |
| `INTERNATIONAL_CLUB` | 18 | 18 | 18 |
| `ACADEMY_YOUTH` | 0 | 0 | 0 |
| `OTHER_PRECOLLEGE` | 18 | 18 | 18 |

The generated game world uses the fictional Virelia context and has no U.S. or academy-youth supply context, so those routes do not appear in this pool. A separate bounded integration fixture provided the supported contexts and generated one representative candidate for each pathway; all five received NCAA RecruitProfiles, and their saved pathway histories stayed unchanged through pool generation. JUCO candidates carried the prior high-school event.

## Evidence

- 35 focused tests passed across TalentSupply, NCAA Recruiting, Recruiting RPG, and YouthPathwayEngine.
- Same cohort seed and context reproduced the same source sequence; a different seed changed the sequence.
- Changing an existing Player Truth rating did not change generated provenance.
- Candidate Player IDs and Person IDs remained unique.
- Save V4 round-trip preserved generated pathway histories and RecruitProfiles.
- `npm run typecheck` passed.
- `npm run build` passed. Vite reported the existing large-chunk advisory.
- `git diff --check` passed.
- No signing, commit, or five-year run occurred.

## Files changed for this gate

- `src/engine/world/TalentSupply.ts`
- `src/engine/recruiting/RecruitingEngine.ts`
- `src/engine/world/TalentSupply.test.ts`
- `src/engine/recruiting/RecruitingTalentBridge.test.ts`
- `src/engine/recruiting/RecruitingRpg.test.ts`
- `docs/strengthening/BS15I_POPULATION_SAVE_LONG_HORIZON_CERTIFICATION.md`
