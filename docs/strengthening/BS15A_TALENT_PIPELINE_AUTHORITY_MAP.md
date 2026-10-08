# BS15A · Talent Pipeline Authority Map

This map defines who owns a fact and who consumes it. It is a design contract, not an implementation request. Preserve current domain boundaries and add only the smallest missing authorities after each product/rules decision.

## BS15I long-horizon lifecycle authority

| Fact | Canonical owner | Integration |
|---|---|---|
| Annual latent supply | `TalentCohort` + annual supply lifecycle | Creates deterministic, explicitly simulated yearly cohorts. It stores quantity/provenance only and materializes no Player by itself. |
| Career end | `Player.careerEnd` via `endPlayerCareer` | Preserves Player/Person and history while closing current membership, enrollment, registration, Portal, Recruiting and active contract state. Ended Players are not free agents or acquisition targets. |
| Future College rule carry-forward | `CollegeRuleset` | New seasons identify the source ruleset and `SIMULATED_CARRY_FORWARD` provenance. Rules remain season-effective; historical and official-source records are not relabeled. |
| Career-end persistence | Save V4 `playerCareerEnds` | Optional additive collection; pre-BS15I V4 payloads load with active careers and unchanged legacy Player shapes. |

## BS15G Draft and professional movement authority note

| Fact | Canonical owner | Integration |
|---|---|---|
| Draft cycle, rules, and annual dates | `Draft` + versioned `DraftRules` | Cycle-specific 2026 dates are source data; unsupported future annual dates are simulated carry-forward. |
| Declaration and withdrawal | `DraftEntry` nested in the Draft cycle | Holds professional-entry intent and deadline state around the same PlayerId; NCAA return is checked through BS15D eligibility where enrollment evidence exists. |
| Candidate pool | Existing Players + roster, age, enrollment, and entry evidence | Production season content projects the class from existing Players; no synthetic Player is made for a new cycle. |
| Pick and uncontracted rights | Existing `DraftPick` and `PlayerRights` | Selection records the existing PlayerId and creates tradeable Draft rights; employment is separate. |
| Pro employment/movement | `PlayerContract`, Team roster, `EcosystemTransition` | NCAA→NBA gateway preserves Player identity and college history. Full international eligibility and all undrafted/portal workflows remain open. |
| Scouting knowledge | `OrganizationKnowledge` + organization evaluation policy | AI boards remain team-specific and do not rank from hidden PlayerTruth. |

## BS15H UI consumer note

Talent Operations, Scouting, Recruiting, Portal, Draft and Player workspaces are consumers of the authorities below; they own no player ratings, knowledge, eligibility, interest, Portal/Draft state, compensation, promises or movement decisions.

| UI surface | Canonical reads / commands | Boundary |
|---|---|---|
| Talent Operations overview | Current user's org scouting assignments/awareness, recruiting board, authorized Portal entries, scheduled Draft state | A short, actionable projection. It does not materialize latent `TalentCohort` candidates or persist a duplicate alert state. |
| Scouting | `OrganizationPlayerAwareness`, `OrganizationKnowledge`, evidence, reports, assignments and existing Scouting application commands | Discovery is not represented as a completed evaluation; knowledge confidence is derived from organization-scoped evidence. |
| Recruiting | `RecruitProfile`, `RecruitingRpg`, permitted organization `RecruitingIntel`; existing Recruiting gateways | Relationship, priorities, promises and commitments remain Recruiting authority; do not reveal other programs' private relationship state. |
| Transfer Portal | `TransferPortalEntry`, effective Portal rulesets, team-specific `CollegeEligibilityAssessment`; `addTransferRecruitToCycle` | Only authorized entries in the user's college ecosystem are offered as external targets. The source institution's recruiting context is not read. Own pending/authorized entries link to the same Player profile. |
| Draft | `Draft`/`DraftEntry`, `DraftPick`, `PlayerRights`, contracts and team-specific organization knowledge; existing career/Draft gateways | Declaration deadlines, selection, rights and professional contract/roster state remain distinct canonical facts. |
| Player pathway | `buildTalentPlayerViewModel` projects Player identity/current roster context and the user's organization knowledge, active Recruiting target, same-ecosystem Portal record, Draft entry and team-specific eligibility; existing Player history provides transitions | History is a projection of canonical events. Navigation links may route to an owning workspace without creating a second event ledger; the summary never reads `PlayerTruth`. |

See the [BS15G authority audit](../research/DRAFT_INTEGRATION_AUDIT_BS15G.md) and [2026 Draft rule provenance](../research/NBA_DRAFT_PATHWAYS_2026.md). This note describes the current slice and does not certify the full BS15G gate.

## Canonical fact ownership

| Fact / decision | Canonical owner | Existing status | Consumers and guardrails |
|---|---|---|---|
| Human identity, legal name, DOB, nationality/citizenship source | `Person` plus current Player compatibility fields | Person root exists; Player DOB/nationality are also persisted, creating a consistency rule to document | Player, Staff, recruiting, eligibility, market. Do not create a YouthPerson. Future citizenship/visa details belong to ruleset/registration evidence as required; do not infer from one nationality ID. |
| Basketball Player identity | `Player.id` / `Player.personId` | Existing single Player root | All competitions and pathways. Academy/College/Prospect are statuses or memberships, never new root Player models. |
| True ratings, tendencies, development profile | Player Truth / `Player.development` | Existing canonical 80/40 truth, profile, potential projection and rating history | Match, development and transactions. Never make RecruitProfile, Scouting, Eligibility or AI own a second ratings object. |
| Organization belief/observed quality | `OrganizationKnowledge`, evidence and Scouting reports | Existing org-scoped coverage/confidence/freshness and evidence provenance | Recruiting/Draft/acquisition rankings. Recruiter sees their org knowledge and legal public signals, not hidden Player Truth. |
| Current sporting membership | `Team.rosterPlayerIds` (current projection) plus canonical roster/transaction gateway | Current roster is authoritative; no general historical Player registration interval | Match/eligibility/current squad. New registration history must not become a second competing current-roster list. |
| Competition eligibility/participants | `Competition`, `Season` participant snapshot, ConferenceMembership | Existing for team/season | Schedule/lifecycle. Future Player age-band/registration rule belongs to an explicit competition/ruleset path, not generic name matching or Player data. |
| Player pathway and historical registrations | **Missing minimal authority**; extend a chosen membership/transition event ledger | Four pro ecosystem transition types and partial PlayerTransaction history exist | Career history, international recruiting, Portal, youth promotion, eligibility, Draft. One append-only event with source/destination, date, cause and ruleset; current roster stays projection. |
| Country, region, city and place | `Country` / `Place` | Place supports hierarchy/coordinates; country has only name/code | Talent supply and travel. Demographics, participation and basketball culture need explicit source/data rather than deriving from Facility or club count alone. |
| Talent supply by cohort/place | **NEW, BS15B implemented** | `TalentCohort` in GameWorld with named, versioned population/participation/access inputs and a derived capacity capped at 100,000; test fixture values only | Own finite candidate counts, not named Players, ratings, recruiting success or facility quality. No real demographic dataset/calibration is present. |
| Individual materialization identity | **EXTEND, BS15B implemented** | Candidate-key-indexed `TalentMaterialization` resolves one stable PlayerId; reuses Player/Person factories and stores origin/cause/version/date | Idempotent single/batch materialization, no duplicate Player, roster, scouting knowledge or recruitment side effect. Save V4 round-trips mapping and canonical profiles. |
| Talent quality distribution | **EXTEND, BS15B implemented provisionally** | Existing canonical Player Truth generator has `globalTalentRareTailV1`; audit-only mean of 80 keys validates shape | Seeded bell-shaped cohort distribution, independent of supply inputs. Diagnostic bands are not persisted Overall/ranking or production calibration. |
| Development environment and realized growth | Existing annual PlayerDevelopment + Training, Staff, Facilities, competition, health | Strong current base; youth environment integration missing | DevelopmentEngine consumes named factors and logs attribution. No “Academy level” as sole development authority. |
| Academy / reserve affiliation and age-group path | **New thin Team/registration relationship only if confirmed necessary** | No dedicated Academy, youth Team type, affiliate relation or intake | Organization/Team/Competition/Staff/Facility. Relationship should be dated and configurable; age band owned by competition/ruleset, not one universal Ladder enum. |
| Recruitment profile, knowledge, interest and actions | Existing Recruiting domain/engine | Canonical NCAA cycles, profiles, board, interest, offer/commitment/signing | Consumes public identity + OrganizationKnowledge + rules; owns persuasion, never player registration or Player identity. Extend for feeder/international real Players. |
| Commitment/signing/arrival | Existing Recruiting lifecycle through signed RecruitSigning and roster arrival | Works for synthetic entrants | Convert accepted offer to one roster/membership transaction; do not independently mutate roster from UI/advisory/AI. Preserve idempotency. |
| NCAA governing rules | **New versioned ecosystem/ruleset boundary** extending existing ecosystem-specific config | Current Eligibility/Academic/NIL defaults by ecosystem; no season/version | Recruiting, enrollment, Eligibility, NIL/compliance and Portal. Store effective date/version and decision-time snapshot; avoid hardcoded global constants. |
| Eligibility assessment | Existing EligibilityEngine, extended to derive from pathway + ruleset + academics | Simplified profile/season counters and dated restrictions | Shared pregame availability boundary. Assessment is derived or an immutable explanation event; do not persist contradictory global `Player.eligible` booleans. |
| Academic progress/support | Existing Academic domain | Simplified deterministic profiles/terms and support | Eligibility restriction consumer. Keep course/credit detail abstract unless the gameplay loop requires it. |
| NIL opportunity/deal/collective | Existing NIL domain | Canonical separate deal/collective capacity, limited gameplay | Recruiting appeal, restrictions, Inbox and optionally approved Finance bridge. Keep NIL distinct from contract salary/scholarship/player cash. |
| Scholarship/aid | **Not present; defer design** | No canonical scholarship/fund allocation found | If gameplay requires it, use institutional/resource/Finance authority with NCAA ruleset limits; do not attach a fake salary to Player or duplicate NIL. |
| Transfer Portal | **New domain lifecycle** after registration/ruleset | Missing | Own entry/withdrawal/window/portal visibility/transfer intent. Reuse Recruiting actions and Person/Player identity; destination enrolls through shared membership/eligibility seam. |
| Professional contract | Existing `PlayerContract` | Canonical pro contract; NCAA does not create it | Market, roster, salary cap, Finance and movement gateways. No youth contract parallel unless rules research demonstrates a distinct agreement. |
| Player movement/pro signing | Existing Market/trade/contract plus `EcosystemTransition` gateways | Partial named movement; NCAA→FIBA/NBA routes exist | Require explicit cause and source/destination; current gateways already use one PlayerId. Extend route coverage, not a second transfer utility. |
| NBA Draft rules and pick ownership | Existing ecosystem DraftRules, Draft/DraftPick, Trade ownership | Real, classes are synthetic/disconnected | Draft owns declaration/selection/pick/rookie entry; consumes pathway-qualified NCAA and international prospects through explicit eligibility/entry contract. Do not put Draft rules on Player. |
| Staff role/workload/responsibility | Existing Staff V2 | NCAA recruiter and college/international scouting roles exist | Recruiting and Scouting operations. Add responsibilities only for a specific unresolved decision; do not introduce universal “RecruitingManager.” |
| Facility quality/availability | Existing Facility V2 at Place, usage and component/capability/condition | Real, no youth-supply/gameplay consumer | Facility use and actual condition may contribute to development/opportunity through named queries; no duplicate academy rating. |
| Finance cash, scholarship resources, NIL agreement, team budget | Existing Finance, NIL and Salary domains with distinct semantics | Finance V2 broad; scholarship absent; NIL separate | Keep ledgers/limits separate. A named event/settlement connector is needed if cash flows cross; do not collapse into a generic budget. |
| Governance and compliance decision | Existing Governance and Enforcement | Governance extensive; NCAA enforcement exists | Eligibility, NIL, transfer, recruiting action approvals only where product rules require. Preserve decision/event authority; no new approvals without a rule owner. |
| Historical competition result | Existing SeasonHistory, games, stat logs and match records | Real but selective | Career/pathway views may consume it; it does not prove continuous roster registration or school attendance. |
| Save/versioning | Existing Save V1–V4 + GameWorld | Canonical persistence and migration | Any cohort, pathway, enrollment or ruleset data requires backward defaults and explicit save compatibility. Avoid adding a database/table until its authority is approved. |
| World cadence and annual development | CalendarEngine, season lifecycle coordinator, WorldAnnualDevelopmentCycle | Daily cadence plus valid NCAA successor seasons exists | Population and cohort cadence should use deterministic date/checkpoint authority; avoid season-specific duplicate annual Player growth. |

## Canonical acquisition flow

```text
Place / cohort supply (latent)
  → deterministic named-Player materialization (canonical PlayerId)
  → public identity + permitted Scouting / OrganizationKnowledge
  → Recruiting decision and ruleset validation
  → commitment/signing/enrollment registration event
  → Team.rosterPlayerIds projection
  → competition participation / eligibility / academic history
  → development from coaching, Training, Facilities, competition and health
  → promotion / transfer / Portal / professional entry with recorded cause
  → retirement / career end; retain Person, Player and meaningful history
```

**Feedback separation:** place supply controls how many candidates are available; Player generation controls the initial quality distribution; development systems control realized growth; Organizations control observed knowledge and decisions; rulesets control legal eligibility. A single “country talent rating” must not own all five.

## Relationship to existing authorities (reuse / extend / rewire / replace / new)

| System | Decision | Rationale |
|---|---|---|
| Person + Player | **KEEP / EXTEND** | Preserve one identity. Resolve DOB/nationality duplication before multi-citizenship and pathways. |
| Player Truth / OrganizationKnowledge / Scouting | **KEEP / REWIRE** | Scouting truth boundary already solves visibility. Connect its legitimate knowledge to International/NCAA Recruiting and Draft; do not expose PlayerTruth. |
| Player generation factories | **EXTEND** | Keep one deterministic Player factory, add a seeded rarity-aware/cohort distribution policy when calibration data is approved. Replace fixed fixture use only in real-world setup after a vertical slice. |
| Country / Place | **EXTEND** | Place hierarchy is already canonical; add sourced demographic/participation inputs as versioned population data only after source/authority is defined. |
| Organization / Team / roster | **KEEP / EXTEND** | Current roster remains operational truth; add the minimal historical registration/affiliate relation, not a parallel roster model. |
| Competition / Season / Conference lifecycle | **KEEP / EXTEND** | NCAA and FIBA lifecycle code exists. Add age/ruleset constraints through competition snapshots; repair malformed config explicitly. |
| Training / PlayerDevelopment / Medical / Facilities / Staff | **KEEP / REWIRE** | Existing development mechanisms are substantial; add actual youth pathway consumers and attribution instead of creating AcademyLevel or a shadow PlayerGrowthEngine. |
| Recruiting | **KEEP / EXTEND** | Existing canonical acquisition engine is real; extend pool sources, actual Player linking, pathway rules and international knowledge bridge. Do not rewrite offers/actions. |
| Eligibility / Academic / NIL | **KEEP / EXTEND** | Real simplified systems exist; add versioned governing authority, pathway-derived assessment and explicit interface contracts. NIL remains separate from scholarship/salary. |
| Transfer Portal | **NEW** | No existing dedicated authority; build only after membership history + ruleset + NCAA recruiting bridge exist. |
| Draft | **KEEP / REWIRE** | Draft/pick/rookie contract authority is real; source its candidate IDs from NCAA/international career pathways rather than creating an independent synthetic class. |
| EcosystemTransition / PlayerTransaction | **EXTEND / REWIRE** | Keep route gateway and event identity; route youth, Portal, international amateur and player-choice causes through a sufficiently expressive shared history authority. |
| Academy | **NEW, THIN** | Only if the club gameplay slice proves it needs explicit affiliation/intake; build from existing Organization, Team, Competition, Staff, Training, Facilities and Finance. |
| Universal event log / newgen census table | **NOT APPROVED** | No need for a universal layer in BS15A. Add specific versioned records for cohort/membership/commitment decisions as required; preserve existing domain/event styles. |

## Five architectural risks and mitigations

1. **Duplicate identity or registration:** RecruitProfile/newgen/Portal/academy begins to own a second Player or current roster. *Mitigation:* canonical PlayerId and one membership command/projection; migration and duplicate-identity assertions before rollout.
2. **Truth/knowledge leak:** hidden high ratings influence recruiter AI while UI hides them. *Mitigation:* organization-scoped knowledge/public data are the only candidate-evaluation inputs; prove invariance when hidden Player Truth changes.
3. **Supply/quality/development collapse:** country or Academy “quality” both creates more Players and assigns better ratings/growth. *Mitigation:* separate typed inputs, generators and metrics; measure cohorts before tuning.
4. **Rules/time hardcoding:** NCAA current constants and windows embedded in Player, calendar or UI, making future era support impossible. *Mitigation:* effective-dated Ruleset IDs and per-decision snapshots; keep competition game-format rules independent.
5. **Unbounded cohort/history / AI drift:** newgens/classes accumulate and AI bypasses human gateways. *Mitigation:* latent supply + explicit retirement and population metrics; make AI invoke same canonical Recruit/commit/register/transfer/Draft gateways; profile 10/25/30-year saves before broad expansion.

## P0 gameplay loops

1. **Source-backed global cohort:** plausible supply by place/age/season; discoverable, variation and rarity measured without scripted elite Players.
2. **Club youth pathway:** youth intake → age-group/reserve competition → development → promotion/loan/academy transfer → senior outcome with continuous identity/history.
3. **International NCAA acquisition:** Scouting/public identity → organization-specific RecruitProfile → real actions/interest/commitment → ruleset/academic check → signed enrollment and roster arrival.
4. **College continuation:** eligibility/academic term → retention/Portal transfer decision → NCAA destination Recruitment/enrollment → preserved remaining eligibility and identity.
5. **Professional entry and career end:** NCAA/international entrants → Draft/pro signing → contracts/rosters/transitions → retirement/career end and cohort replacement.
6. **Shared AI:** human and AI clubs/programs use the same knowledge boundary, decisions, rules validation, movement events, and roster authority.

## BS15C authority update

| Fact / decision | Canonical owner | BS15C status |
|---|---|---|
| Current youth/reserve/senior membership | `Team.rosterPlayerIds` | Remains the sole current roster; dual Team registration is rejected by the pathway gateway. |
| Club pathway affiliation and upward destinations | `TeamPathwayRelation` in `GameWorld` | Explicit per-Team Organization, senior destination, role, category and allowed targets; never inferred from names. |
| Dated youth/progression registration history | `PlayerRegistration` in `GameWorld` | BS15C causes cover intake, age-group/reserve/senior promotion and release. One action ID makes movement replay safe. |
| Competition player age band | `Competition.rules.playerAgeEligibility` | Optional min/max age validated against canonical DOB and game date at registration; no team-name age rule. |
| Age-out action required | Derived youth pathway read model | Reports `AGE_OUT_REQUIRES_DECISION`; no automatic movement. |
| BS15B candidate-to-academy acquisition | `TalentCohort` + materialization + youth registration gateway | Intake uses one bounded candidate index from the Organization primary Place and keeps the BS15B PlayerId; declined proposals do not materialize. |
| Academy/youth capability | Existing Team, Competition, Staff, Training, Facilities and PlayerDevelopment | Reused without a second Team/Player, academy quality score or parallel development engine. Youth-only staff/facility privileges and minutes attribution remain gaps. |

See `BS15C_CLUB_YOUTH_ACADEMY_REGISTRATION.md` for operation and Save V4 contracts.

## BS15D authority update

| Fact / decision | Canonical owner | BS15D status |
|---|---|---|
| NCAA-like governing rules | `CollegeRuleset` in `GameWorld` | Versioned by ecosystem and effective date. Current V1/V2 values are explicitly `TEST / PRODUCT FIXTURE`, not official NCAA rules. |
| College enrollment affiliation/history | `PlayerEnrollment` in `GameWorld` | Dated player-to-institution/team affiliation with close history; enrollment does not alter the roster. One active enrollment per Player and ecosystem. |
| Current sporting membership | `Team.rosterPlayerIds` | Remains the only current team membership authority; BS15D enrollment commands require a rostered Player when opening enrollment. |
| Club/youth/pro pathway history | `PlayerRegistration` in `GameWorld` | Remains BS15C's sporting pathway history. Eligibility assessments read its IDs as evidence but never rewrite it. |
| Academic performance/progress | Existing `AcademicProfile` and `AcademicTermRecord` | Term progression updates the existing profile and recorded history; no college-specific duplicate academic profile. |
| Current legal participation decision | `assessCollegeEligibility` derived from enrollment, ruleset, academic state, existing participation profile, pathway history and restrictions | Stable reason codes and ruleset ID/version. Persisted assessments are historical explanations; availability re-evaluates current facts. |
| Shared pregame participation availability | Eligibility engine's `getAvailablePlayersForCompetition` / existing match preparation | The same competition filter excludes currently ineligible Players before match simulation; no MatchEngine NCAA rule or Player boolean. |

The distinction is explicit: `PlayerRegistration` = sporting/pathway history; `PlayerEnrollment` = college affiliation; `Team.rosterPlayerIds` = current roster; eligibility assessment = derived legal participation state; `CollegeRuleset` = governing authority. See `BS15D_NCAA_RULESET_ENROLLMENT_ELIGIBILITY.md` for the Save V4 and lifecycle contract.

## BS15E authority update

| Fact / decision | Canonical owner | BS15E status |
|---|---|---|
| Sporting identity and hidden ability | `Player` / `Person` and Player Truth ratings | Remains canonical; Recruiting board rank/tier no longer derive from hidden ratings. |
| Prospect motivations/dealbreakers | `RecruitProfile.recruitingRpg.preferenceProfile` | Multidimensional and distinct from basketball ability; legacy profiles materialize deterministic defaults when first acted upon. |
| What a program believes about motivations | `RecruitingIntel` within the recruit's RPG state, keyed by `programTeamId` | Organization-specific belief bands/confidence; conversations and visits update only the acting program's record. |
| Prospect relationship with humans | `RecruitingRelationship` | Separate head-coach, primary-recruiter and program records; former recruiter history is retained, and current choice value follows current assignment. |
| Outside influence | `RecruitingStakeholder` | Bounded stakeholder count/influence; preferences and attitudes influence but do not control the Player decision. |
| Role statements and promises | `RecruitingPromise` | Position/role promise strength and history persist in RecruitProfile; no cash promise authority. |
| Offer, verbal commitment, signing | Existing recruiting lifecycle collections | Kept distinct; deterministic choice projection uses motivations/context/relationships, and unsigned verbal commitments can change. |
| Recruiting period permission | `RecruitingCycle.calendar` | Every generated NCAA cycle receives a versioned calendar. Later seasons carry forward the latest supported authority as `simulatedCarryForward`, explicitly not official NCAA data; optionality remains for old saves and fixtures. |
| Recruiting action legality | `canPerformRecruitingAction` and versioned `RecruitingCalendar` | 2026-27 MBB/WBB baseline periods, dead/shutdown distinction, configured evaluation event filters, selected July visit restrictions, prospect contact-opportunity ceiling and signing-period formulas are represented. Communication thresholds, visit dates/lodging, and evaluation person-day accounting exist; actual season-scoped recruiter designations, full Staff workload, regular-signing policy setup and several context rules remain uncertified. Missing NCAA calendars fail closed. |
| Regular signing window anchor | Competition `Season` and its completed `FINAL` game records | Resolver reads the latest completed game keyed to the season format's `FINAL` stage; no NCAA championship date is duplicated in Recruiting. If the season does not expose a completed final, regular-period signing fails closed. |
| Institutional signing-period end | `RecruitingInstitutionalSigningPolicy` on the relevant `RecruitingCycle` | Per-program final aid-signing date remains distinct from NCAA opening authority. Successor cycles may carry it forward with `SIMULATED_CARRY_FORWARD` provenance; missing policy blocks regular-period signing. User-facing setup remains open. |
| Successor calendar authority | `RecruitingCalendar.template` + `RecruitingCycle` | Later cycles derive from latest valid supported template and identify source ruleset, source season, derived season and simulated provenance. They are not official NCAA data; there is no all-cycle production CONTACT fallback. |
| Recruiting concern/counterposition | `RecruitingNegotiation` nested in `RecruitProfile.recruitingRpg` | Human and AI share the negotiation response operation; AI starts from its own RecruitingIntel and selects actions from permitted context. A focused hidden-preference invariance test exists; full fairness coverage and bounded negative-recruiting/violation review remain open. |
| Latent recruit discovery | `TalentCohort` + bounded discovery/materialization engine route | User workspace and AI can discover one deterministic candidate per operation; materialization remains idempotent and uses the same PlayerId. End-to-end Scouting/OrganizationKnowledge certification remains open. |
| Basketball evaluation | `OrganizationKnowledge` + existing permitted valuation | Player Truth is not read directly for Recruiting evaluation/AI target ordering. |
| College enrollment/eligibility | BS15D `CollegeRuleset`, `PlayerEnrollment`, eligibility assessment | Signed NCAA arrival stages roster membership, invokes `enrollPlayer`, records the dated assessment, and rolls back roster arrival when enrollment/eligibility fails. |
| Persisted recruiting narrative state | Existing Save V4 `RecruitProfile` payload | RPG nested state round-trips as part of the existing collection; no Save version bump. |

## BS15F authority update · in progress

| Fact / decision | Intended canonical owner | Current implementation status |
|---|---|---|
| NCAA transfer rule version/provenance | `TransferPortalRuleset` in `GameWorld` | Implemented as a distinct effective-dated versioned rules authority. 2026-27 cites current NCAA LSDBi; successor seasons are labelled simulated carry-forward and link to their parent ruleset. |
| Ordinary basketball notification period | Current competition's completed championship final + `TransferPortalRuleset` | Completed-final lookup opens the 15-day period; ordinary notice and AI lifecycle use that authority. |
| Notice, education module, institutional processing | `TransferPortalEntry` in `GameWorld` | Notice and module dates plus the two-business-day deadline persist; entry does not alter source roster. Institution processing is explicit. |
| Destination contact permission | BS15E `canPerformRecruitingAction` extended with Portal authorization | Contact, offers, negotiation and signing use Portal permission; unauthorized action is blocked. |
| Continuation, lived role, trust and promises | Derived `CollegeContinuationAssessment` from season stats, BS15E promises/relationships, Staff history and financial context | Implemented with measured promise persistence and separate stay/leave reasons. No transfer-probability scalar. |
| Athletics aid, institutional settlement benefits and cap | Separate aid and settlement-related agreements plus Organization cap context, connected to Finance V2 | Implemented with signed Finance event, recognition, payable, ledger, reporting and annual carry. Third-party NIL stays separate. |
| Ghost-transfer finding/sanction | Existing Enforcement, Staff availability, Governance and Finance | Shared guard applies a canonical case, contest-equivalent Staff restriction and sport-budget Finance fine for deliberate prohibited actions. |
| Destination eligibility and movement | BS15D `CollegeRuleset`, enrollment/eligibility and one transfer movement gateway | Versioned clock/midyear evidence and one same-Player movement preserve source history. |
| Save compatibility | Save V4 additive college collections and existing Finance/Enforcement collections | Old V4 defaults, integrated transfer, penalties and 2045–46 round-trip are tested. |
