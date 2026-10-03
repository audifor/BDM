# BS15A · Global Talent Roadmap

**Purpose:** sequence the implementation work implied by the BS15A audit into independently reviewable gameplay slices. This roadmap is a proposal; BS15A itself changes documentation only.

**Baseline:** clean source SHA `c35b62796514696075a7aff2aee66eacf29a34bc`, worktree `C:\BDM-BS15`, branch `bdm-stage2-bs15a-global-talent-foundation`.

## Ordering principles

- Preserve one canonical `Player` identity across youth, scouting, recruiting, college, professional movement, and retirement.
- Reuse Player Truth, OrganizationKnowledge, Team rosters, Recruiting, Eligibility, Academic, NIL, Draft, Finance, Staff, Facilities, and save lifecycle where they own the needed facts.
- Keep talent supply, initial talent quality, organization knowledge, and realized development as separate inputs and outcomes.
- Make each milestone playable or observable end to end. Add no UI before the underlying decision and event flows work.
- Gate NCAA-specific mechanics and values on a product/legal rules decision. Keep rules versioned and effective-dated; do not bake current real-world rules into global constants.

## Milestones after BS15A

### BS15B · Global Talent Supply and Materialization

**Vertical slice:** a deterministic, place- and age-cohort supply input yields a bounded pool of latent candidates; a single candidate can be materialized through the existing Player factory when a real gameplay interaction needs a named person. Repeated discovery or recruiting references resolve to the same Player ID and retain source provenance.

**Build on:** `Place` hierarchy, seeded generation, `Player`/`Person`, Player Truth, current initial-world and recruiting generators. Do not create a parallel youth Player model or an unbounded annual dump of named free agents.

**Dependencies:** BS15A identity and authority decisions. Define a small supported geography/data fixture before adding demographic content.

**Exit gate:** deterministic same-seed outcomes; bounded cohort supply; no duplicate materialization for the same candidate; realistic rarity checks across cohort percentiles; identity, origin and save/load provenance survive a round trip; recruiting/scouting cannot read hidden Player Truth. Record counts and time for a long-run simulation harness without claiming 30-year balance yet.

**BS15B delivery:** implemented in the successor branch with `TalentCohort`, candidate-key materialization records, single/batch canonical Player creation, the provisional rare-tail Player Truth policy, a no-Player long-run diagnostic, and optional Save V4 persistence. See `BS15B_GLOBAL_TALENT_SUPPLY.md` for current measured results and limitations. Academy and recruiting consumers remain for BS15C/BS15E.

### BS15C · Club Youth, Academies and Registration

**Vertical slice:** one club operates a youth age-group team, registers a Player, plays a competition season, and promotes or releases that same Player into a senior/reserve destination with dated history.

**Build on:** Team, Organization, Competition/Season, Staff, Facilities, PlayerDevelopment, and BS15B materialization. Add only the minimum dated affiliation/registration authority needed; keep `Team.rosterPlayerIds` as the current roster projection.

**Dependencies:** BS15B identity and cohort provenance. Competition or ruleset owns age-band eligibility; avoid inferring age groups from Team names.

**Exit gate:** registration, eligibility at competition entry, season participation, development attribution and promotion/release are explainable from events; one Player ID survives every transition; current rosters and historical registrations cannot contradict; a non-academy senior-only save still loads.

**BS15C delivery:** `TeamPathwayRelation` configures Organization-scoped senior/reserve/youth Teams; optional Competition age bands validate registration; `PlayerRegistration` history and one atomic pathway gateway support bounded BS15B intake, upward promotion and release. Save V4 defaults older payloads to no pathway relations/history. Same-identity male/female tests and over-age rollback coverage are in `BS15C_CLUB_YOUTH_ACADEMY_REGISTRATION.md`. Youth competition continues through the existing generic Competition/Match/Training/Development systems. Age-out is surfaced for an explicit decision; loans, dual registration, youth-only staff/facility privileges and separate opportunity-based growth remain deferred.

### BS15D · NCAA Ruleset, Enrollment and Eligibility Core

**Vertical slice:** a college Team enrolls a Player under a dated ruleset; competition participation, academic term progress, eligibility assessment and availability use the same enrollment history and produce a reasoned decision.

**Build on:** existing NCAA-like competition/conference lifecycle, Eligibility, Academic, enforcement and shared pregame availability. Extend existing ecosystem defaults into versioned configuration and derive assessments from participation, academics and pathway evidence.

**Dependencies:** BS15C registration/event contract where shared; BS15A rules audit. Do not set real-world numeric rules until approved research/product decisions exist.

**Exit gate:** two effective-date rulesets can explain different decisions for the same facts; transfers/previous experience are not silently reset; academic or eligibility restrictions reach the existing match availability seam; next-season NCAA lifecycle and old saves remain valid.

**BS15D delivery:** `CollegeRuleset` resolves fixture-only academic thresholds by ecosystem and game date; `PlayerEnrollment` records college affiliation separately from Team roster and BS15C `PlayerRegistration`; explainable eligibility assessment consumes existing academic, participation, pathway and restriction evidence and filters the common pregame competition pool. Optional Save V4 fields preserve rules, enrollment and historical assessment provenance while older V4 payloads default safely. No official real-world numeric NCAA rules are asserted. See `BS15D_NCAA_RULESET_ENROLLMENT_ELIGIBILITY.md`. BS15E remains recruiting/international acquisition; BS15F remains college continuation, compensation and transfer portal.

### BS15E · Recruiting and International Acquisition

**Vertical slice:** a real materialized academy/international/eligible high-school or junior-college Player becomes visible through permitted public and organization knowledge, is evaluated on a recruiting board, receives an offer, commits, enrolls and arrives on a college roster.

**Build on:** BS15B supply/materialization, BS15C pathway history, BS15D enrollment validation, Scouting/OrganizationKnowledge and the current Recruiting lifecycle. Replace origin labels-as-provenance with actual source history while retaining existing synthetic cohorts as fixtures where useful.

**Dependencies:** stable identity/materialization, recruiting permission boundaries, and eligibility checks at commitment/enrollment. Support the first end-to-end source route before expanding all routes.

**Exit gate:** scouting and recruiting use authorized information only; one candidate cannot be signed twice; offer, commitment, enrollment and roster arrival are idempotent and auditable; ineligible prospects receive an actionable explanation; the original NCAA recruiting cycle continues to work.

### BS15F · College Continuation, Compensation and Transfer Portal

**Vertical slice:** an enrolled Player may enter or withdraw from a transfer window, be recruited by another destination, carry applicable history for eligibility review, and enroll at the new Team. NIL and any future scholarship/aid resource remain separate from professional contracts and each other.

**Build on:** BS15D rules/enrollment and BS15E recruiting. Add a portal lifecycle only for the states and decisions demonstrated by the vertical slice. Keep current NIL profiles, deals and collectives as the NIL authority; connect Finance only for approved real cash settlements.

**Dependencies:** versioned rules that define transfer windows/credit decisions and product decisions on compensation/aid. This milestone must not disguise NIL or scholarships as Player salary.

**Exit gate:** entry, visibility, contact, destination, withdrawal and enrollment have explicit legal states; eligibility history survives transfer; NIL restrictions and compensation are explainable; one Player remains; save migration and old non-portal paths pass.

### BS15G · Pathway Movement, Draft Integration and Shared AI

**Vertical slice:** AI and user-controlled acquisition move qualified Players through at least academy-to-senior, international-to-NCAA, NCAA-to-NCAA, NCAA-to-Draft/pro, NCAA-to-FIBA and direct international-pro routes, with one shared eligibility/registration/contract gateway and recorded causes.

**Build on:** BS15C–F pathway events and rules. Reuse existing ecosystem transitions, Market, Draft, Contracts, Recruiting, Scouting and Staff responsibilities. Connect Draft classes to qualified existing Players rather than generating a disconnected parallel set.

**Dependencies:** route-specific rules and the enrollment/registration event contract. Implement routes incrementally behind shared validation, not through independent UI/AI mutations.

**Exit gate:** user and AI use the same valid action gateways; Draft and professional signing consume eligible sourced Players; each move updates current membership/contract projections exactly once and records a history event; AI decisions respect OrganizationKnowledge and never inspect hidden Player Truth for scouting decisions.

### BS15H · Talent Operations Gameplay UX

**Vertical slice:** users can discover a prospect, understand source and uncertainty, compare permitted evaluations, act through recruiting/academy/portal decisions, and see the resulting registration, eligibility and pathway history without bypassing domain rules.

**Build on:** stable, tested service/engine contracts from BS15B–G and existing scouting/recruiting UI conventions. UI is a consumer of actions and read models, not a new authority.

**Dependencies:** underlying flows must already be playable through application/domain actions and expose actionable outcomes. Prioritize the highest-frequency supported routes; defer optional dashboards.

**Exit gate:** each shown action maps to an authorized command and visible result; uncertainty/provenance is distinguishable from canonical truth; blocked actions explain the rule; keyboard/navigation and existing game workflows remain usable.

### BS15I · Population, Save and Long-Horizon Certification

**Vertical slice:** representative worlds can advance 10, 25 and 30 seasons with bounded population/history growth, stable roster supply and career turnover, while academy, college, international and professional routes remain active and persisted.

**Build on:** complete supply/movement/retirement paths from BS15B–G. Add retirement and population sinks only where measured cohort flows require them; retain meaningful career/person history while pruning or summarizing nonessential detail under explicit save policy.

**Dependencies:** end-to-end pathway flows and measurable cohort/materialization/event counters. This is a balance and reliability milestone, not a substitute for missing gameplay loops.

**Exit gate:** benchmark new and migrated saves for elapsed time, memory/save size, cohort inflow/outflow, unrostered prospects, age distribution, region share, position mix, rarity percentiles and ecosystem transitions; no runaway duplicate generation or dead-end cohort accumulation; results are reproducible by seed and documented.

## Cross-milestone acceptance contract

Every milestone that changes persisted data must include explicit save-version defaults/migration and same-identity checks. Every acquisition decision must use public signals or the acting organization’s knowledge rather than hidden Player Truth. Every movement must preserve one Player ID and update canonical current-state projections through one domain gateway. Generation tuning must report both supply counts and quality distributions; development tuning must report realized growth separately.

## Open decisions before implementation

1. Approve supported countries/regions and the source/version of any population, participation or basketball-culture data.
2. Define which competitions and routes are simulated in full, which are abstracted between user-facing interactions, and which are excluded from the product.
3. Decide the first supported youth entry ages and whether latent candidates are materialized at discovery, recruitment or another explicit event.
4. Commission and approve the product/legal source for NCAA rules and compensation/aid treatment before BS15D/BS15F encode values.
5. Set performance/save targets for 10/25/30-year certification and decide which historical detail may be summarized.

## BS15B recommendation

Start with the deterministic Global Talent Supply and Materialization slice. It establishes bounded candidate supply, source provenance and one persistent identity before any academy or international recruiting route depends on them. Keep the initial fixture small and measurable; do not expand geographic coverage or generate a world-sized list of named Players in the first pass.
