# BS15A · Talent Pipeline Authority Map

This map defines who owns a fact and who consumes it. It is a design contract, not an implementation request. Preserve current domain boundaries and add only the smallest missing authorities after each product/rules decision.

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
| Talent supply by cohort/place | **New latent cohort/population authority (recommended)** | Missing | Generate candidate counts/availability. Own supply, not named Players, rating truth, recruiting success or facility quality. Store versioned inputs and bounded historical cohort facts. |
| Individual materialization identity | Existing Player factory + deterministic materialization event/key (minimal addition if needed) | Current synthetic generators use deterministic IDs | Converts one latent candidate into exactly one Player, re-used across scouting/recruiting/pathways. Record source cohort/cause for provenance; never respawn same individual on another route. |
| Talent quality distribution | Player factory policy/configuration consuming seeded distribution | Generator exists, population calibration missing | Produces initial Player Truth distribution; separate from number of people and from later development. Rarity is cohort-level measured outcome, not scripted superstars. |
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
