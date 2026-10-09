# BS15A · NCAA Rules and Eligibility Audit

## Finding

BDM has an executable NCAA-like competition ecosystem and several NCAA-specific subsystems. NCAA is **not merely a Competition record**, but the system remains a simplified prototype ruleset: there is no effective-date/division rule registry, admissions/enrollment authority, transfer-portal lifecycle, amateur-status history, or rules-versioned eligibility decision history. Competition-specific game format is correctly held in `CompetitionRules`; the analogous institutional/acquisition rules need equivalent versioned authority before real NCAA mechanics are expanded.

## Existing components and classification

| Capability | State | Existing authority / behavior | Limits |
|---|---|---|---|
| NCAA ecosystem | **REAL** | `SportsEcosystem.kind = 'ncaaLike'`, category, conference and recruiting configuration; ecosystem kind gates only where applicable. | One broad kind does not distinguish division, association, era, conference-specific regulation or academic year rules. |
| NCAA Teams and conferences | **REAL, PARTIAL** | Ordinary canonical Teams; Conference + season-specific ConferenceMembership and immutable season membership snapshot; valid NCAA-like schedule. | No canonical university/athletic-institution profile, school admissions or academic institution resource model. |
| NCAA season lifecycle | **REAL for valid configuration** | `CompetitionLifecycleCoordinator` checks valid conference snapshots; rollover generates NCAA conference schedule, binds prior recruiting class to successor season, initializes next Recruiting cycle and ensures eligibility/academic/NIL/booster/enforcement state. | Malformed conference snapshots can block future editions explicitly. Several rules have no reset/annual rule beyond current initialization. Older dormant-capability docs incorrectly say this is unsupported. |
| Recruiting cycle | **REAL** | Cycle stores ecosystem/source/target season, dates/status and `RecruitingRules`: pool/signing/offer/capacity/thresholds. Date progression generates the pool, actions, commitments and arrivals. | Default cycle dates/status model one general annual window; no phase calendars, early/regular signing boundaries or rule version snapshot. |
| Recruit identity/profile | **PARTIAL** | RecruitProfile refers to an existing canonical PlayerId and carries cycle, origin, public rank/tier, position, preferences and status. | Existing pool generator creates new canonical Players with generated names and ID; origin `international` / `academy` / `preCollege` is assigned by index and not sourced from history, scouting, geography, or a feeder ecosystem. |
| Recruiting decision | **REAL, ABSTRACTED** | Board, priority, interest, canonical action records, offers, visits, commitment/signing; deterministic AI uses the same operations; Staff advisory acceptance is explicit. | Preferences are four synthetic integers (opportunity/development/competing/coach); missing minutes/role, school/campus, academics, distance/home, relationships, proven coach/program, pathway/pro chances, roster, realistic costs or compensation choices. Player-side person decision is not a reusable authority. |
| Enrollment/arrival | **PARTIAL** | Signed Player is placed on the program Team roster at target season arrival and eligibility/academics/NIL state are initialized. | Enrollment is implicit as “add to roster”; there is no admission offer, accepted enrollment state, student lifecycle, academic standing transfer or formal registration record. |
| Eligibility profile | **REAL, SIMPLIFIED** | Player/program/ecosystem `EligibilityProfile`; seasons used; per-season appearance count/game IDs/resolution/consumption. Evaluation is used by common pre-game availability boundary. | A missing profile means invalid NCAA context. Default four-season/appearance threshold does not consult age, high-school history, prior college seasons, transfers, redshirts, waivers, calendar, or ruleset version. |
| Redshirt | **PLACEHOLDER POLICY** | Rules store `redshirtPolicy: 'automatic'`; season consumption derives from participation count > threshold. | No redshirt intent/decision, medical redshirt, waiver, registration status, declared redshirt, unused season carry, or separate rule-year logic. |
| Academic performance | **REAL, ABSTRACTED** | AcademicProfile, AcademicRules, term records, standing/risk, support plans/capacity/effectiveness, AI support; an ineligible term creates a dated EligibilityRestriction consumed by availability. | Synthetic profile seeded from PlayerId, simple term arithmetic, no admissions/credits/course/enrollment/payment or transfer-credit history. Default rules are broad ecosystem defaults. |
| NIL | **REAL, ABSTRACTED** | NIL profile, marketability, opportunities/deals/expiration, optional collective resources and NCAA restrictions, configured Recruiting appeal factor. | NIL is not a professional contract or player cash account; no offers/negotiation, collectives market dynamics, school-era rules or NIL agreement compliance details. |
| Enforcement/compliance | **PARTIAL** | NCAA enforcement rules/cases and restrictions; NIL restriction seam exists. | No eligibility/recruiting compliance ruleset integration, violations from recruiting event histories, investigation process policy coverage, or rule-year portability established by this audit. |
| Transfer Portal | **MISSING** | No Portal application, window, transfer candidate/status, destination Board, retained/waived eligibility, transfer reasons or AI handling. | Generic ecosystem move and professional gateway do not supply NCAA→NCAA transfer gameplay. |
| College compensation/scholarship | **MISSING / PARTIAL** | NIL deals/collective capacity; Recruiting action/resource capacity. | No scholarship allocation/limits, financial aid, institutional benefit authority, athlete revenue-share authority or reconciliation to player finances. Do not make NIL equal scholarship. |
| NCAA to professional | **PARTIAL, REAL GATEWAY** | NCAA→NBA Draft and NCAA→FIBA professional transitions move the same Player, preserve prior source records and create the destination roster/contract according to route. | NBA Draft currently materializes its own unrelated prospect class; the NCAA gateway cannot turn a normal NCAA roster Player into a prospect unless that Player is already in that Draft's prospect list. |
| International recruiting | **MISSING BRIDGE** | InternationalScout/collegeScout and `origin: 'international'` profile tag exist; Scouting has legitimate org-specific PlayerKnowledge. | No named international prospect from Scouting/Player identity can flow to RecruitProfile, Recruiting Board, offer, signed arrival and eligibility evaluation. Current origin tag is not evidence of country or prior career. |
| Saved rules/history | **PARTIAL** | EligibilityRules/AcademicRules/NilRules are saved per ecosystem; profiles/terms/restrictions/deals persist. | No `rulesetId`, effective date range, versioned decision snapshot, transition rationale or rule source on eligibility decision. Updating rules can reinterpret historical data without a record of the governing rules then applied. |

## Current rule flow

```text
NCAA-like Season / Team roster
  → Eligibility profile + ecosystem defaults
  → Academic term calculation (when scheduled)
  → academic restriction, if ineligible
  → shared Player availability before a game
  → participation record at match resolution
  → completed-season eligibility consumption
```

Recruiting is a separate source path:

```text
Recruiting cycle → synthetic RecruitProfile + canonical Player
  → program Board / actions / offer
  → commitment → signing → season arrival on Team roster
  → initialize eligibility, academic, NIL, booster, enforcement state
```

These are real integrated slices, but eligibility authority is not currently a deterministic derivation from the Player’s whole pathway history and a named season ruleset. Current profile data itself accumulates participation within one Player/program/ecosystem profile.

## International and cross-pathway determinations

- **European established Player → NCAA today:** there is no complete user gameplay route. The low-level generic `movePlayerAcrossEcosystems` can move an uncontracted existing roster Player between ecosystems and record a generic transition, but this is not NCAA recruiting, admission, commitment, academic initialization or eligibility validation. It is a movement utility rather than a playable acquisition route.
- **NCAA program scouting/recruiting an international Player:** Scouting can identify/evaluate addressable Players using OrganizationKnowledge; Recruiting can recruit its own synthetic cycle profiles. No canonical conversion/bridge joins the two. A “RecruitProfile origin=international” is not a real international acquisition.
- **NCAA → Portal → NCAA:** unsupported; there is no Portal model. A generic cross-ecosystem move does not represent an intra-NCAA transfer and can bypass NCAA destination setup if used as a low-level operation.
- **NCAA → Europe:** the explicit NCAA-to-FIBA professional transition exists. It retains the same Player identity, source history and NCAA NIL history while transferring roster membership and creating a professional contract. It does not offer a player-driven career choice or common transfer rules for all routes.
- **NCAA → NBA:** explicit NCAA-to-NBA-Draft transition exists, but its Draft input must already contain the Player. Current automatic Draft class generation creates separate synthetic prospects, so the normal RecruitPlayer lifecycle is not connected to Draft eligibility/entry.
- **International → NBA Draft:** FIBA-to-NBA direct signing gateway exists, but that is direct professional entry, not Draft candidate sourcing or declaration.

## Target NCAA authorities

Use these boundaries in later milestones; names are conceptual and should be reconciled with current `GameWorld` and save architecture before implementation.

1. **Governing Ruleset** — NCAA/division/era and effective dates; owns recruiting periods, eligibility seasons, participation threshold, redshirt/waiver rules, transfer rules, scholarship limits, NIL/compliance constraints. Competition game format remains in CompetitionRules.
2. **Player Pathway Registration** — one canonical Player’s dated high school/academy/college Team or program memberships and enrollment state; carries the cause and previous pathway identity. It does not own DOB, ratings, or scouting beliefs.
3. **Recruiting** — organization-specific knowledge/interest/actions/offers and accepted commitment; owns persuasion and signing. It consumes identity/scouting inputs and ruleset-checked actions; it does not set eligibility rules or directly duplicate current roster membership.
4. **Eligibility Assessment** — derived from registration history + DOB + appearances + academic restrictions + effective ruleset. Persist only decisions needed for history/explanation, including ruleset/version and reasons, not a copied Player-wide `isNcaaEligible` truth.
5. **Enrollment / roster arrival** — accepted signed commitment creates current Team registration via a canonical membership boundary; initialize only subsystem state required for that pathway.
6. **NIL / athlete compensation** — NIL agreement is its own commercial object and market/rule boundary; scholarship, aid, NIL and salary are different semantics. A later connector can post approved cash flows without redefining NIL as a PlayerContract.
7. **Transfer Portal** — separately owns entry/withdrawal dates and transfer recruitment; destination enrollment still uses the same Recruiting/commitment/membership and Eligibility authorities. Portal must not mutate Player identity or override rules with a boolean.
8. **Professional entry** — Draft or professional signing consumes a real path-qualified prospect and applies existing Draft/Contract/Team roster gateways; Draft rules stay with Draft/NBA-like ecosystem.

## Governing-rule safeguards

- Do not hardcode “four years,” participation thresholds, age limits, scholarship caps, or Portal dates on `Player`; current values are illustrative defaults, not approved real-world rules.
- Do not infer NCAA eligibility from age or nationality alone. Keep ruleset decision separate from general Player truth and organization perception.
- Save the ruleset/version and assessment basis at decision time, or preserve an immutable decision event, so a later rules change cannot rewrite historical eligibility.
- Define transfer/recruiting windows on calendar/ruleset boundaries and keep the common match availability boundary as the enforcement seam.
- Keep academic, recruiting, enforcement, NIL/compensation and professional contract authorities distinct, with explicit named integration.
- Research legal/product requirements before specifying current/future real NCAA rules; BS15A intentionally defines no numerical NCAA policy.

## BS15A decision

NCAA systems should be **EXTENDED and connected**, not replaced. The first NCAA vertical slice should integrate a real materialized international/academy Player with Scouting knowledge → NCAA Recruiting → commitment/enrollment → ruleset-based eligibility/academic setup, while preserving current synthetic pool tests as a fallback/test fixture. Portal, NIL policy detail and scholarship finance follow only after the central registration/ruleset boundary is defined.
