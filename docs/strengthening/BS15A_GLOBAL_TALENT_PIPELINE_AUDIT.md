# BS15A · Global Talent Pipeline Audit

**Scope:** architecture and current-state audit only. No gameplay code, schema, UI, database, tests, NCAA rules, or generation behavior is changed in BS15A.

**Repository basis:** `C:\BDM-BS15`, branch `bdm-stage2-bs15a-global-talent-foundation`, starting SHA `c35b62796514696075a7aff2aee66eacf29a34bc`. The clean base already contains BS14 Scouting, 80-rating Player Truth, annual Player development, NCAA-like competition/recruiting/eligibility/academic/NIL systems, Draft, and explicit ecosystem gateways.

## Executive assessment

BDM already has several real acquisition and career mechanisms, but they currently operate on a small fixed prototype universe and isolated synthetic classes. There is **no global youth population**, no explicit academy or age-group roster model, and no continuous pathway that generates, develops, recruits, registers, and retires one shared cohort across countries and ecosystems.

The NCAA-like ecosystem is **more than competition data**: it has Teams, conferences and season memberships, a schedule, recruiting cycles and signings, eligibility, academic restrictions/support, NIL/collectives, enforcement, boosters, Staff roles, and NBA/FIBA transition operations. Its institutions and player acquisition model are still abstract: generated recruits are independent synthetic profiles, not sourced youth or international Players; some NCAA layers are initialized and simulated without the recruiting decision factors or rule history of a first-class college product.

The core design constraint for BS15 is therefore **connect and complete existing authorities before adding population machinery**. Keep one `Player` identity, keep ratings in Player Truth and beliefs in OrganizationKnowledge, keep Team rosters and contracts as current membership/contract authorities, keep NCAA acquisition in Recruiting, and treat youth pathway history, eligibility rulesets, and population supply as the genuine new boundaries requiring design.

## Current-state capability map

| Capability | State | Evidence and actual boundary |
|---|---|---|
| Human / Player identity | **REAL, PARTIAL** | `Person` is the canonical human root and `Player.personId` points to it. `createPlayer` supplies a deterministic person ID. However, generated prototypes primarily construct `Player` records; person profile linking and cross-profile continuity need to be verified and consistently materialized before multi-role/youth workflows. Never add a second youth/prospect root. |
| Player Truth and potential | **REAL** | Canonical 80-rating / 40-tendency truth, player-scoped development profile, derived legacy potential, rating history, and development engine exist. Truth is not the same as OrganizationKnowledge; Recruiting/Draft ranking should continue to use permitted public and organization knowledge. |
| DOB, age, nationality | **REAL, PARTIAL** | DOB and nationality are on `Player`; age is calculated from DOB and game date. `Person` can also hold DOB and multiple nationalities, but it is optional and may diverge from Player fields. The youth pipeline needs a single compatibility rule and a pathway/citizenship model, not a new age field. |
| Country and geography | **PARTIAL** | `Country` only has ID/name/code. `Place` supports country region, city, district, campus, coordinates, and parent nesting. Neither carries population, basketball participation, culture, historical production, or regional talent rates. |
| Organization / Team / roster | **REAL, PARTIAL** | Organizations, sections, Teams, country, coach, and `Team.rosterPlayerIds` are canonical. Competition/Season participant snapshots exist. There is no formal Team category, parent/affiliate Team relation, age eligibility band, player registration record, or player-to-Team membership history ledger. Organization sections are not academy/team affiliation authority. |
| Competition / season | **REAL** | Competition, ecosystem, season participant snapshots, conference memberships, schedule and game history are canonical. Competition rules describe game/league format, not player age-group eligibility, amateur status, youth registration, or recruitment windows. |
| Contracts / transactions / movement | **REAL, PARTIAL** | Professional contracts, market, trade, player transaction types and four ecosystem transition types exist. Transition history covers NCAA→NBA Draft, NCAA→FIBA, FIBA→NBA, NBA→FIBA. General youth movement, loan, academy release, NCAA transfer and international amateur movement are absent. Player transactions are not a complete registration history. |
| Youth Player creation | **MISSING** | No `youth`, `academy`, `newgen`, or retirement generator/lifecycle exists. `PlayerBioGenerator` is for initial playable rosters and creates ages 18–34. Recruiting and Draft generators create separate fixed-age synthetic entrants; these are not the global youth population. |
| Generated initial world | **PLACEHOLDER / REAL FOR PROTOTYPE** | `WorldGenerator` uses one fictional country, deterministic names, fixed-size Teams, fixed roster sizes, fixed NCAA/closed/FIBA-like competitions, and uniform synthetic cohorts. `createNewGame` constructs men’s and women’s worlds and initializes systems. It is appropriate for a deterministic test/playable fixture, not a believable global talent supply. |
| Talent quality generation | **REAL FACTORY, PLACEHOLDER DISTRIBUTION** | `CanonicalPlayerTruthGenerator` generates position-biased 80-key ratings and development ceilings from a seeded center/range. It does not condition quality on country/region, population, participation, coaching, academy infrastructure, competition, opportunity, or cohort rarity. Determinism is useful for repeatability but must not become deterministic annual nation dominance. |
| Annual development | **REAL** | World-day annual development consumes training stimulus once per annual cycle and appends rating deltas/history. It is player-wide and independent of season rollovers. It has no explicit age-group pathway, academy environment, promotion, loan, NCAA educational progress path, or retirement. |
| Club academy / age groups / reserve Teams | **MISSING as a dedicated authority** | A user could hand-construct ordinary Teams and competitions, but there is no Academy entity, youth-team relationship, age-band registration, academy intake, reserve/affiliate association, or pathway decision engine. A Team plus a name such as “U18” is not an executable academy model. |
| NCAA-like ecosystem | **REAL, ABSTRACTED** | `SportsEcosystem.kind === ncaaLike`, Conferences, season-bound memberships, NCAA schedule, and a valid-conference next-season lifecycle are implemented. This is a real competition ecosystem boundary, but not a detailed university/institution/student-athlete model. |
| NCAA recruiting | **REAL, PARTIAL** | Canonical Recruiting cycles, generated `Player` + `RecruitProfile`, board, interest, contact/pitch/visit/offer actions, commitments, signings, AI/advisories and roster arrival exist. Candidate pools are cycle-sized synthetic cohorts; “international”/“academy” origins are labels assigned by pool index, not actual provenance or current Players. |
| Eligibility / academics | **REAL, SIMPLIFIED** | Eligibility profiles, season appearance counts, four-season default, automatic consumption threshold, academic profiles/terms/support and dated restrictions feed the shared pre-match availability boundary. Eligibility rules are one ecosystem-wide default, not year/division/ruleset-specific. The stored automatic redshirt policy is not a player decision system. |
| NIL / college compensation | **REAL, ABSTRACTED** | Nil profiles, opportunity/deal lifecycle, collectives/resources, restrictions and recruiting appeal seam exist. A deal is not a professional PlayerContract and does not post athlete income/expenses through the Finance ledger. It is NIL-specific state with bounded gameplay consequences. |
| Transfer Portal | **MISSING** | No transfer portal domain, entry/window, transfer recruiting, destinations, retention/withdrawal, transfer credit/eligibility carry, or portal AI exists. Same-player low-level cross-ecosystem movement does not replace this college transfer lifecycle. |
| Draft | **REAL, PARTIAL** | NBA-like Draft, picks/order, selection, rookie contract and AI selection exist. Draft classes are currently generated as new generic 19-year-old Players, not drawn from NCAA and international Player pathways. NCAA→NBA gateway calls Draft selection but requires the Player already to be in that synthetic Draft’s prospect list. |
| Scouting | **REAL** | BS14 provides public/addressable Player identity, fog-safe OrganizationKnowledge, evaluation reports, Scouting assignments, Recruitment Focuses and organization shortlist. It is a valid knowledge bridge; it does not persuade a Player, create an offer, or enroll them. |
| Staff / recruiting operations | **REAL, PARTIAL** | Staff roles include NCAA-only recruiting coordinator and positional recruiter, college/international scouts, and responsibility/advisory workflows. Recruitment actions have capacity and AI/advisory paths. There is no full international recruiting territory/provenance/acquisition bridge. |
| Facilities | **REAL, NOT CONNECTED TO TALENT SUPPLY** | Facilities V2 supports type/purpose/capability, physical condition, usage, operators, teams, places, development and finance relationships. There is no academy-specific intake or player development quality consumer derived from real facility use. Do not add a second generic facility rating. |
| Retirement / population balancing | **MISSING** | No general player retirement, career end, durable post-retirement identity state, or cohort replacement policy was found. Undrafted/uncommitted generated Players persist; future rosters and long-horizon population have no explicit ceiling or sink. |
| Save / persistence | **REAL, GROWTH RISK** | Save V1–V4 persists Player/world domains and numerous histories. More materialized Players also expand Player Truth, history, scouting knowledge, and indexes. Any latent/population state needs an explicit versioned save boundary and bounded historical compaction; do not add tables before population architecture is settled. |

## How young Players appear today

1. Initial playable rosters are generated once by `src/engine/world/WorldGenerator.ts`: 8 FIBA-like teams, 4 NBA-like teams and 12 NCAA-like teams per gender when the prototype enables all ecosystems; professional teams get 12 players and NCAA teams 7. `generatePlayerBio` samples ages 18–34. These are fixture-world Players, not annual youth newgens.
2. Each NCAA recruiting cycle creates a deterministic `RecruitProfile` pool (default 72) when the cycle opens. It materializes canonical Players aged 17–19 with synthetic identity/rating/profile data. This cohort is cycle-unique, but not connected to a country population, high school, academy, AAU/JUCO, scouting identity, or prior person history.
3. After an NBA-like season finalizes, Draft lifecycle creates the required number of deterministic generic 19-year-old draft-prospect Players. The class is separate from NCAA Recruiting and international player rosters.
4. Signed recruits enter a program Team roster when their target season begins. Draft selections enter NBA-like Team rosters. Unsigned recruits and unselected draft prospects remain in `GameWorld.players`; there is no retirement or age-out cleanup.
5. Seasons and annual Player development now roll forward, and valid NCAA conference seasons create successor editions and recruiting cycles. This is a functioning simulation cadence, but not a balanced world-population model.

At present generated entrants are not assigned to a youth Team or Academy. Their first meaningful club/program membership is usually the sign/selection arrival. Recruiting and Draft put a specific existing `PlayerId` on an ordinary Team roster, preserving that identity from that point forward.

## Pathway reconstruction and single identity

The Player record has one ID and a Person reference. Existing sources can prove parts of a journey: current Team roster, active/expired contracts, market/trade records, NCAA Recruiting signings/arrival, season game/stat history, Draft picks/selections, and four cross-ecosystem transition types. A chronology can be approximated for those supported operations.

They are **not enough to reconstruct the requested full journey reliably**. There is no append-only `PlayerTeamRegistration` or membership interval for academy/youth, amateur/college enrollment, loans, releases, and roster changes; no generalized pathway event; no youth competition/registration snapshots; and no Portal event. Season participant snapshots record Teams, not each Player’s membership. `PlayerTransaction` covers a subset of pro market events, while `EcosystemTransition` covers only named pro gateways. Player game history proves participation in a game, not continuous registration or why the move occurred.

Minimal missing authority: a single-player **pathway/registration event history** (or an extension of a clearly chosen existing membership authority) recording PlayerId, source/destination Team or program, competition/ruleset, effective interval/date, route/reason, and cause record. It must be the historical record of one `Player`, never a replacement Player subclass. Current roster remains the fast current membership view; history explains how it changed. Only add this authority after BS15B confirms legal and product semantics.

## Global supply, talent quality and development quality

These are three different quantities and must remain separate:

- **Talent supply:** how many plausible people participate in basketball in a place/cohort and might be discovered. Existing inputs: countries and nested Places; organization/team density; competition and season coverage; Facilities and court/training/medical capabilities; coaching and Staff count. Missing: population, age-cohort size, basketball participation, culture, local access, socioeconomic access and measured regional retention.
- **Talent quality distribution:** the rare tail and broad shape of eventual basketball ability among people who participate. Existing: deterministic Player Truth generator, position biases, age-dependent development ceilings and Player potential compatibility. Missing: calibrated cross-country and cohort distributions, rarity targets, correlation between traits, and validation against long-run world outcomes. Do not multiply opportunity/supply into ratings.
- **Development quality:** how much a materialized Player improves in a particular environment. Existing: annual development, coaching/training effects, fatigue/injury/health, Staff quality/workload, competition and Facility condition/capabilities. Missing: youth participation/reserve/academy-specific environment and attribution of coaching/opportunity across pathway transitions.

Population, participation and infrastructure should primarily determine **number and access to candidates**; person-level variation should determine **quality**; actual coached competition, health and opportunity should determine **development**. Environment may influence realized growth, not grant a team/country a hidden preassigned star.

## Generational rarity and 30-year safety

The current center-uniform sample (`random.nextInt(minimum, maximum)` per canonical rating with position offsets) has neither an explicit rare-tail distribution nor cohort-level observation/controls. Development ceilings are age-based and seeded by player ID. The initial player age sampler is broad but unrelated to origin; Recruiting and Draft use narrow fixed-age bands and fixed pool counts. Repeated seeds are deterministic; repeated seasons are not drawn from changing culture/population conditions.

The code cannot substantiate a 30-year balanced save yet. NCAA rollover and year-based development exist, but generated classes are retained indefinitely and no retirement/roster-release/population sinks are present. Every year can materialize NCAA recruiting and Draft entrants; unselected people accumulate. Long-horizon CPU, memory, save-size, scouting-directory and event-history behavior has not been benchmarked. The first risks are **population growth and identity/history growth**, followed by roster accumulation and too many/elusive prospects, rather than inability to advance one valid season.

Future observability should measure age cohort inflow/outflow by place/ecosystem/pathway, materialized vs latent count, rostered/unrostered/retired state, player-years, national/region share, quality percentiles (including 90/95/99/99.9), NBA/NCAA/FIBA transitions, position mix, retention/retirement, and save-size/time per simulated year. Telemetry is diagnostic, not tuning authority.

## Materialized versus latent youth recommendation

| Option | Strength | Cost / failure mode | Assessment |
|---|---|---|---|
| A. Materialize every youth Player | Complete biographies and histories; simple scouting/competition identity. | PlayerTruth and history for people no system will ever see; high save/CPU cost; many fake roster/registration records; identity retention pressure. | Do not choose for the whole population. |
| B. Pure latent population, materialize only on discovery | Cheap long horizon; models supply independently from visible individuals. | Scouting named people, realistic recruiting and individual history are impossible before every candidate has an ID; materialization risks identity discontinuity and scripted discovery. | Too abstract as the only layer. |
| **C. Hybrid, recommended** | Keep cohort supply/distribution latent; materialize a stable canonical Player when a person enters a real competition, scouting/recruiting decision, academy intake, or other observable event. Preserve that Player forever with a durable identity and pathway events. | Requires transparent deterministic materialization keys and bounded records; latent cohorts need calibration. | Best fit for current performance, single identity, scouting, save size and historical continuity. |

Materialization must be deterministic for the same cohort/place/selection event, but produce variation across people and years. A Player already materialized must be re-used by all pathways; scouts and organizations see only legally/publicly available identity and their OrganizationKnowledge, not hidden Truth.

## Club academy and age-group architecture

There are no true Academy, youth registration or B-team authorities today. A future academy should not be a scalar “level” attached to Player or Facility:

- **Organization/Section:** owns the club program and optionally identifies affiliated subunits. Existing OrganizationSection is organizational structure, not a sports membership/sub-team link.
- **Team:** remains the sporting roster; add an explicit parent/affiliate/pathway relation and team category only when needed to distinguish academy, reserve, senior, school/prep or age-group teams.
- **Competition/Season:** defines the age band/ruleset and snapshots eligible Team participants; age bands belong to competition/rules data, not one global U14→U16→U18 ladder.
- **Player:** one Person/Player identity. Current roster is a projection of registration/membership; age, eligibility, pathway and competition participation derive from DOB, history and the governing competition ruleset.
- **Staff/Training/Facilities/Finance:** existing Coaches/Staff assignments, scheduled training, Facilities use and Finance should feed capacity and development quality through named consumers. Do not create AcademyCoach, FacilityLevel, or fake universal AcademyQuality as parallel authorities.
- **Academy intake:** future recruitment/signing/registration decision with a dated cause and destination Team. It must not teleport a youth person to a senior pro roster.

Examples U14/U16/U18/U20, reserve/B, school, prep and AAU are configurations/paths, not a hardcoded common ladder. Playing up, training with seniors, loan, academy transfer and promotion require explicit decisions and dated consequences.

## Current vs target gameplay completeness

**Current playable slices:** NCAA cycle → generated recruit → program Board/actions/offer → commitment/signing → roster arrival; NCAA roster → simplified eligibility/academic availability; NIL opportunity → deal state/limited appeal; NCAA roster → professional transition gateway; NBA season → separate generated Draft class → selection/rookie contract; world-day annual development; Scouting knowledge/report.

**Missing P0 loop slices:** global country/region cohort supply; source-backed named international prospects; club youth/academy intake and registration; NCAA recruitment of a real already-materialized European/academy Player; eligibility evaluation from age/history/ruleset; NCAA Portal transfer/retention; Draft entrants from NCAA and international Player career paths; general player career end/retirement and population balance; AI using the same cross-pathway authorities. There is also no formal athlete enrollment/student status or scholarship/admissions resource lifecycle.

## Simulation budget recommendation

| Fully simulated | Abstracted, with visible cause and outcome | Not simulated in early BS15 |
|---|---|---|
| Canonical Player identity; materialized roster/registration and transfers; recruiting Board, interest, offer, commitment and arrival; eligibility/season participation and restrictions; age/competition rulesets; academy promotion/loan/release decisions; annual development; Draft entry/selection; pathway and retirement history. | Country/region latent cohort supply; high school/prep/AAU calendar/events; travel distance; admissions decision detail; academic performance/credits; scholarship/aid allocation; NIL market discovery/collective budgets; compliance review and visa/work authorization with reason-coded outcomes. | Per-classroom academic simulation; every AAU game; real-time recruiting contacts; family life simulation; paperwork processing screens; every youth tournament if not part of a meaningful decision; exhaustive global census of non-basketball-playing children. |

The exact mechanics need product/legal research in later milestones. BS15A defines authority, not real-world regulatory numbers.

## Final questions

1. **How are young Players generated today?** NCAA cycle pools create synthetic 17–19 year old canonical Players; Draft creates separate synthetic 19 year olds. Initial world rosters are 18–34. No global newgen process exists.
2. **Is current generation suitable for 30 years?** No evidence of that; deterministic annual entrants persist without a general retirement/retention/population budget. NCAA lifecycle rolls, but 30-year health is not certified.
3. **Do real youth Teams/academies already exist?** No dedicated entities or linked playable Teams. Ordinary Team/Competition could be hand-assembled, but age eligibility, affiliations and intake authority are missing.
4. **What is missing for European/FIBA cantera gameplay?** Age-group competitions/registration, academy/recruitment intake, affiliation between youth/reserve/senior Teams, promotion/loan/transfer causes, Staff/facility development attribution and coherent Player pathway history.
5. **What NCAA systems already exist?** NCAA-like ecosystem/conferences/schedule and season rollover, recruiting cycle/actions/AI/advisory/signings, eligibility, academics, NIL/collectives, boosters/enforcement, NCAA Staff roles and professional transition operations.
6. **Real ecosystem or competition data?** A real but simplified simulation ecosystem (Teams, rules boundary, conferences, roster, schedules, acquisition and eligibility). It is not yet a detailed institutional/student-athlete model.
7. **What Recruiting system exists?** Canonical cycle, synthetic recruit Player/Profile, board, interest, contact/pitch/visit/offer, commitments, signing, arrival, AI/advisory; international/academy origin is synthetic label only.
8. **Eligibility authority?** EligibilityEngine + per-Player/program profiles, ecosystem-level rule defaults, season participation records and dated academic/enforcement restrictions; no year/division-specific governing rulesets/history.
9. **NIL/college compensation authority?** NIL domain owns opportunities/deals/collectives/resources and a Recruiting appeal seam. It is not PlayerContract/payroll and does not settle to player Finance accounts.
10. **Transfer Portal?** None identified.
11. **Can an established European Player move to NCAA today?** No complete recruiting/registration path. There is a low-level generic cross-ecosystem mover for uncontracted Players, but it is not an NCAA transfer/recruitment workflow and does not establish NCAA admissions/eligibility/academic/NIL initialization as one decision.
12. **Can NCAA programs scout/recruit international Players?** Recruiting can process its synthetic class and Scouting can evaluate addressable Players. They are not joined by an international prospect identification→RecruitProfile/offer/signing/arrival bridge.
13. **Can Players move NCAA→Europe?** Yes, a named NCAA→FIBA professional transition moves the same Player, terminates/creates pro contract as applicable and retains prior NCAA records. It is a narrow explicit route, not general Portal/player-choice policy.
14. **Draft connected to NCAA and international Players?** Draft selection and an NCAA→NBA transition gateway exist, but current Draft classes are separately generated and do not source the NCAA/European cohorts. FIBA→NBA direct pro signing also exists, distinct from NBA Draft eligibility.
15. **Which systems must not be rebuilt?** Person/Player/Player Truth/OrganizationKnowledge; Team roster, Organization/Sections; Competition/Season/Conference and lifecycle; Staff/responsibility; Training/Development/Medical; Scouting; Recruiting mechanics; Eligibility/Academic/NIL/Finance; Draft/picks; Contracts/Market/transactions; Facilities/Places; Save and world-calendar cadence.
16. **Five biggest architecture risks?** (a) duplicate Player identity/pathway state; (b) hidden PlayerTruth leaking to Recruiting/AI; (c) talent supply, quality and development collapsed into one score; (d) NCAA rule constants and user-only flows hardcoded into Player/global logic; (e) unbounded Player/history/save growth and AI/player movement divergence.
17. **P0 loops?** Global cohort→materialization; European academy→senior; international Player→NCAA recruit→enrollment; NCAA season eligibility/retention/Portal; NCAA/international Player→Draft/pro career; player decision→cause-tracked pathway transition; shared AI execution on the same authorities.
18. **What should BS15B implement first?** Global Talent Supply Foundation: versioned cohort/population inputs and distribution contract + deterministic, rarity-aware materialization into the existing canonical Player; one meaningful playable entry slice for a test cohort. Do not start a full UI, NIL or Portal first.
19. **How many major milestones remain?** Eight after this foundation audit in the proposed roadmap (BS15B–BS15I); sequence may be adjusted after each vertical-slice review.
20. **Any blocker outside BS15?** No architectural blocker to designing BS15B. Cross-system consumers are present. Product/legal rules research is required before NCAA age/eligibility, Portal, NIL, scholarship or international compliance mechanics are implemented.

## Audit discrepancies and cautions

- `docs/strengthening/BDM_MASTER_CAPABILITY_AUDIT.md` / `BDM_DORMANT_CAPABILITIES.md` describes NCAA future-season generation as unsupported. At this audited HEAD, `CompetitionLifecycleCoordinator` explicitly supports valid NCAA conference snapshots, `startNextSeasonTransitionFor` creates the NCAA schedule and successor recruiting cycle, and `CompetitionLifecycleCoordinator.test.ts` verifies that behavior. The older audit note is stale; it is not the current blocker.
- BS15A is documentation only. No full suite was run because behavior is being mapped from code and existing tests. Specific existing behavior can be selectively proven in later implementation gates.
