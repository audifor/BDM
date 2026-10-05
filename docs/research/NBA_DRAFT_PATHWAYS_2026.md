# NBA Draft Pathways · 2026 source baseline

This document separates NBA CBA rules, annual 2026 dates, NCAA eligibility decisions, and BDM's simulation policy. A real-world rule does not become an eternal date constant: annual league/NCAA dates are data attached to a Draft cycle. Unsupported later dates are simulated carry-forward, not official claims.

## Official source-backed rules and dates

| Topic | Source and effective period | Implementation mapping / status |
|---|---|---|
| NBA CBA | [2023 NBA–NBPA CBA](https://www.nbpa.com/cba/) effective July 1, 2023 through the 2029–30 season, subject to opt-out after 2028–29. | `OFFICIAL_SOURCE`; version Draft rules against the CBA term. After the term, BDM uses `SIMULATED_CARRY_FORWARD` pending a newer source. |
| Minimum age / one-and-done | CBA Article X: at least age 19 during the Draft calendar year; non-international Players must meet the post-high-school timing requirement. | `OFFICIAL_SOURCE`; evaluate by Draft year, age, and education evidence. Do not save an eligibility boolean on Player. |
| International definition | CBA Article X defines “international player” using residence, basketball participation, and U.S. education criteria; nationality alone is insufficient. | `OFFICIAL_SOURCE`; evaluate from available pathway/education/residence evidence. If evidence is missing, return unknown/ineligible for auto-entry rather than infer from nationality. |
| International automatic eligibility | CBA Article X makes a qualifying international Player automatically eligible when age 22 is reached during the Draft calendar year. | `OFFICIAL_SOURCE`; rule evaluator. |
| 2026 Draft schedule | [NBA 2026 Draft FAQ](https://www.nba.com/news/nba-draft-faq): first round June 23, second round June 24, 2026. | `OFFICIAL_SOURCE`; stored on 2026 cycle, not global constants. |
| 2026 early-entry dates | [NBA early-entry announcement](https://pr.nba.com/2026-nba-draft-early-entry-candidates/): application by April 24, 2026 at 11:59 p.m. ET; NBA withdrawal by June 13 at 5 p.m. ET. NCAA college-retention withdrawal deadline May 27. | `OFFICIAL_SOURCE`; separate NBA and NCAA deadlines on 2026 cycle. Future annual dates require a new official announcement. |
| Pre-enrollment opt-in | [NCAA DI Cabinet rule update, April 15, 2026](https://www.ncaa.org/news/media-center-di-cabinet-adopts-changes-to-eligibility-rules-for-prospects/), effective immediately for NBA/pro opt-in drafts on or after April 15, 2026. Applicable prospects may enter once before enrollment and retain eligibility if they withdraw by league deadline and are not drafted. | `OFFICIAL_SOURCE`; separate pre-enrollment entry path from enrolled-player testing waters; source rule carries a 2026 effective boundary. |
| NCAA testing waters and agent status | [NCAA Agent Certification](https://www.ncaa.org/division-i/governance/membership-and-institutional-resources/agent-certification/). NCAA-certified agents can advise eligible Division I men's basketball players seeking professional evaluation while preserving remaining eligibility. | `OFFICIAL_SOURCE`; BDM models only advisory/certification context, not agent negotiation simulation. |

## BDM implementation status

| Capability | Status | Mapping / boundary |
|---|---|---|
| Versioned NBA Draft rules and annual cycle dates | `IMPLEMENTED` | Rules carry version, validity, CBA provenance, age/timing criteria, annual declaration/withdrawal dates, round count, and future-data status. |
| NCAA eligibility authority remains separate | `PRODUCT_ABSTRACTION` | Enrollment records remain canonical. A full Draft withdrawal command that asks CollegeRuleset whether a Player can return is not yet connected. |
| CBA international definition | `VERIFIED_NOT_MODELED` | Current Player evidence does not encode all CBA residence and U.S.-education criteria. Nationality is not a proxy; automatic international eligibility is withheld until those facts are modeled. |
| 2026 deadlines | `IMPLEMENTED` | Separate NBA and NCAA calendar fields in the annual rules data. The NCAA return deadline is distinct from the NBA final withdrawal deadline. |
| Pre-enrollment opt-in state | `PRODUCT_ABSTRACTION` | DraftEntry can label the pre-enrollment route, but a complete NCAA once-only entry/withdrawal eligibility ledger is deferred. |
| Future annual dates and post-CBA rules | `SIMULATED_CARRY_FORWARD` | Configured from the previous supported structural rules; never represented as official source data. |
| Imperfect Player outlook | `PRODUCT_ABSTRACTION` | Qualitative draft bands, not a promised selection or exact future pick. |
| Team-specific evaluation | `IMPLEMENTED` | OrganizationKnowledge, public position, and organization evaluation policy; no raw PlayerTruth ranking. |
| International team release / buyout payments | `VERIFIED_NOT_MODELED` | CBA contains release-payment provisions. This vertical slice preserves active foreign contracts and blocks conflicting entry; full payment accounting is deferred. |
| Workouts/interviews/Combine | `VERIFIED_NOT_MODELED` | Existing scouting evidence can inform teams. No separate large Combine simulation is included in this slice. |
| NCAA agent business / contract negotiation | `VERIFIED_NOT_MODELED` | Certification context only; no Agent RPG or representation market is modeled. |
| Later CBA mechanisms | `VERIFIED_NOT_MODELED` | Second-round exception, two-way details, and other detailed CBA employment mechanisms remain outside the minimal pathway slice unless already covered by existing contract rules. |

## Provenance policy

The 2026 annual dates above are official source facts. Rules effective after the currently sourced CBA term and annual dates without an NBA/NCAA announcement are simulated carry-forward. DraftEntry refers to an existing PlayerId and never owns identity, ratings, or hidden ability. Draft selection, rights, professional contract, and roster arrival are separate lifecycle events.

## Simulation date precision and evidence status

NBA early-entry releases include meaningful clock times (April 24 at 11:59 p.m. ET and June 13 at 5 p.m. ET). The current simulation and `GameDate` type have whole-day precision. Product rule: each listed deadline remains open through the complete game date and expires when the simulation advances to the next date. The date fields therefore preserve calendar-day authority, not hourly enforcement.

CBA international classification now reads explicit residence and U.S.-education evidence from canonical recruiting education profiles. Missing evidence returns `UNKNOWN`, and nationality is never a proxy. Full CBA certification remains incomplete because the current canonical model does not capture basketball participation history.
