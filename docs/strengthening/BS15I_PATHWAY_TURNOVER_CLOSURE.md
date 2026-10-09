# BS15I Pathway turnover closure

Status: ACTIVE. Two integrated reruns failed Year 4 replacement; targeted correction/replay is in progress. No five-year pathway PASS claimed. No ten-year run authorized by this report. No commit created.

## Original five-year audit

The accepted NCAA continuity certification is preserved through 2037-10-01. Its zero pathway outcomes have different causes; zero alone is not a defect classification.

The individual audit of all 32 rights is in [BS15I_PATHWAY_BEFORE_AUDIT.json](BS15I_PATHWAY_BEFORE_AUDIT.json). Each row retains Player/Person, original and current rights owner, pick/round/year/date, source Team/ecosystem/contracts, canonical signing eligibility and retrospective AI invocation evidence. The original lifecycle created rights but never invoked professional signing. All 32 had no historical AI evaluation or attempt.

Prospective evaluation under existing configured terms and player/public organization decisions:

| Reason | Rights |
|---|---:|
| No configured rookie-scale terms for the pick | 16 |
| Player prefers college | 7 |
| Destination cannot afford salary | 4 |
| Eligible, affordable and willing to sign | 5 |

These are prospective classifications of the original snapshot, not invented historical offer outcomes. All 32 source Players are NCAA; none has an active source contract. Lack of configured terms is an explicit configuration limitation, not an expiry rule. Existing human gateway can accept explicit lawful terms; BS15I does not invent an automatic second-round scale.

Across the original annual snapshots there are no strong continuation leave candidates, low-trust relationships, coaching changes or broken persisted promises. Every assessed NCAA Player has fewer than five appearances in the compact schedule. Existing Portal windows overlap open recruiting cycles and rules are present. Thus original zero Portal is principally a fixture condition, not proof that notice/authorization/movement was broken.

## Production changes and authority

1. `AiProfessionalPathways.ts` evaluates rights after new Draft selections and at monthly follow-up in `CalendarEngine.ts`. It reuses Draft organization/public valuation, the player career choice, configured rookie terms, affordability and positional need. It calls `signDraftRightsToNba` or `signUndraftedPlayerToNba`; it never inserts contracts, rosters or enrollment outcomes directly.
2. Undrafted Players are evaluated for existing professional playable-roster deficits, using the existing Market quote and signing gateway. Draft depth scoring is not used to fill every professional position. No signing rate or turnover quota exists.
3. Unsigned rights remain active under existing semantics and are reevaluated monthly. Signed rights retain their canonical contract reference and are excluded from actionable unsigned state, including after contract expiry. No expiry/trade policy was invented.
4. `CollegeTransferAI.ts` continues with separately permitted pitch/offer/negotiation when contact is unavailable, as ordinary recruiting already does. Exhausted contact/action budget does not prohibit a separately legal offer. Permission, Staff capacity, maximum offers and commitment threshold are preserved.
5. `CollegeContinuationAssessment.ts` preserves a previously persisted broken role/playing-opportunity promise when current appearances are too sparse to reassess it. Existing trust consequences remain idempotent.
6. `DraftEngine.ts` exposes the existing AI Draft evaluation for selected Players; its ranking formula is shared. `MarketService.ts` exposes the same existing quote before atomic source exit. Neither creates a second valuation authority.

## Explicit certification inputs

`PathwayTurnoverCertification.ts` supplies recruiting memory for an existing NCAA Player after the ordinary class is generated: a previously assessed broken role promise, a low-trust relationship associated with a prior recruiting Coach and a known alternative Coach. No Player, completed transfer, authorization, offer, contract, enrollment exit, quota, budget refill, grades or rule change is supplied.

The short integrated fresh-game rehearsal uses canonical matches and daily calendar processing. It completed Portal movement on 2033-02-05 and passed Save/reload, reachable history and NCAA viability. Player: `generated-player-0145`; Person: `person:player:generated-player-0145`; source: `generated-team-0013`. The full rerun selects destination `generated-team-0022`, despite supplied familiarity with `generated-team-0014`: the input does not prescribe the destination.

The separate focused default-threshold Portal test completes on 2033-02-13 with canonically exhausted action budgets, source `generated-team-0013`, destination `generated-team-0014`, the same Player/Person, ended source enrollment and active destination enrollment. Reload/retry adds no Portal entry, module, processing, profile, enrollment or movement.

## Professional regressions

On the accepted original Year 5 snapshot, production AI signs five rights through the shared gateway and leaves 27 explicitly blocked rights. Signed Players: `women-player-0169`, `women-player-0159`, `women-player-0271`, `women-player-0282`, `women-player-0217`. Source rosters and enrollments close; destination roster, rights contract and EcosystemTransition share the original Player/Person. Save/retry creates no duplicates.

Equivalent production undrafted regression: canonical contract expiry on 2037-10-08 creates a professional vacancy; the AI coordinator signs `women-player-0232` / `person:player:women-player-0232` to `women-team-0009`, through `ncaaToNbaUndrafted` and the canonical signedFreeAgent transaction. The test never calls the professional signing command itself. Save/retry is idempotent. Intact professional rosters produce zero undrafted acquisitions with an explicit coverage-satisfied reason.

One actual signable rights decision is invariant when hidden ratings are changed with OrganizationKnowledge/public evidence and configured terms fixed. This is the rights acquisition decision/ranking firewall; it does not claim that the existing Market asking-price generator is independent of canonical Player ratings.

The first, subsequently failed fresh rerun created 16 rights and signed two on 2036-06-23: `women-player-0162` from `women-team-0014` to `women-team-0009`, and `women-player-0282` from `women-team-0024` to `women-team-0010`. Its Year 4 continuity failure is documented below; these counts are not the corrected certification result.

The corrected rerun's first professional checkpoint is 2036-06-23: `women-player-0282` / `person:player:women-player-0282`, source `women-team-0024`, destination `women-team-0010`, `ncaaToNbaDraft`, with the rights-backed contract. Immediate integrated Save/reload and reachable history pass. Source viability and later replacement remain under certification. Different signing outcomes across the two executions reflect their changed recruiting context; none is inserted by the scenario.

BS15G's simulated 2045 regression covers the supported international Draft signing and undrafted gateway with Save/reload. The native five-year international route will be reported only if supported by its actual source eligibility and contracts; no release or foreign-education evidence is manufactured.

## Certification gates

| Gate | Result | Evidence |
|---|---|---|
| Draft rights lifecycle | PENDING full rerun | Focused signing, monthly Calendar invocation and retry pass |
| Pro exits | PENDING full rerun | Five original rights sign through production coordinator |
| Undrafted pathway | PASS equivalent production regression | Canonical expiry -> AI evaluation -> shared Market gateway |
| Portal movement | PENDING full rerun | Fresh integrated short run and focused default-threshold test pass |
| Replacement supply | FAIL latest integrated rerun | Quartz Harbor Rays has four eligible Players after three pro departures |
| Save/reload | PENDING five checkpoints | Both focused routes and short integrated Portal Save pass |
| Identity/idempotency | PENDING full rerun | Both focused route retries and Player/Person preservation pass |

Ten-year gate: CLOSED pending five-year correctness, annual Save integrity and measured performance decision.

## Files changed in this pathway closure

Production: `src/engine/career/AiProfessionalPathways.ts`, `src/engine/career/index.ts`, `src/engine/career/ProfessionalPathwayDecision.ts`, `src/engine/calendar/CalendarEngine.ts`, `src/engine/draft/DraftEngine.ts`, `src/app/market/MarketService.ts`, `src/engine/eligibility/CollegeTransferAI.ts`, `src/engine/eligibility/CollegeContinuationAssessment.ts`, `src/engine/recruiting/RecruitingEngine.ts`, `RecruitingRosterPlanning.ts`, and `RecruitingNegotiationEngine.ts`.

Focused coverage: `AiProfessionalPathways.test.ts`, `CollegePortalTurnover.test.ts`, `RecruitingTurnoverPlanning.test.ts`, and the arrival-date fixture in `RecruitingRpg.test.ts`. Certification support: `PathwayTurnoverCertification.ts`, `TalentLongHorizonCertification.ts`, `BS15IPathwayAudit.test.ts`, `BS15IPathway5YearProfile.test.ts`, `BS15IPathwayFinalAudit.test.ts`, and `BS15IRecruitingTurnoverReplay.test.ts` under `src/app/game/testSupport`. Existing `BS15IContractCheckpoints.test.ts` is reused for independent annual Save checks. This report and the before/final audit artifacts document the evidence. Other uncommitted BS15I work remains preserved and is not attributed to this pathway patch.

## Execution artifacts

- Five-year driver: `src/app/game/testSupport/BS15IPathway5YearProfile.test.ts`.
- New Save prefix: `C:/Temp/BS15I-pathway-save-v4`; accepted NCAA snapshots are preserved.
- Metrics: `C:/Temp/BS15I-pathway-five-year-metrics.json` (annual deltas, cumulative totals, NCAA continuity, phase time).
- Routes/decision evidence: `C:/Temp/BS15I-pathway-five-year-routes.json` (unsigned reasons, repeated evaluations, attempts, blockers, signs).
- First integrated route Saves: `C:/Temp/BS15I-pathway-integrated-portal-save-v4.json` and `C:/Temp/BS15I-pathway-integrated-professional-save-v4.json`.
- Focused regression log: `C:/Temp/BS15I-pathway-regressions-final.log`.

Validation completed before the full rerun: 94 focused tests PASS across 15 files; fresh integrated Portal rehearsal PASS; typecheck PASS; build PASS (existing bundle-size advisory); git diff --check PASS. The earlier simultaneous run had three preparation timeouts and a dated arrival fixture failure. Serial rerun and correction to the fixture's actual signing/start dates passed without increasing those test limits. The monthly rights test initially skipped a month of unrelated obligations and exceeded 90 seconds; replaying the preceding calendar boundary passed within the same limit.

The full fresh five-year run starts at 2032-10-01. Year 1 (2033-10-01) passed deep identity/roster checks, annual Save/reload and NCAA viability: 168 enrolled, 168 eligible, minimum 6; one authorized/completed Portal route; no Draft/pro route yet; elapsed 242,221 ms. New Talent arrivals are zero at this boundary and replacement remains pending subsequent recruiting seasons.

Year 2 (2034-10-01) passes: 181 enrolled/eligible, minimum 7, 13 new non-transfer arrivals, annual 641,109 ms. Portal source `generated-team-0013` receives `recruit:recruiting:generated-ecosystem-0003:generated-season-0005:23`, formally signed 2033-03-01 for successor season `generated-season-0011`, through the ordinary production recruiting-class supply and arrival gateway. This is an actual following-season source-Team replacement, not an immediate one-for-one mutation. The latent TalentCohort discovery chain is tracked separately: no cohort-materialized Player has a formal signing at this boundary. Recruiting-class arrivals must not be mislabeled as cohort arrivals.

Year 3 (2035-10-01) passes: 194 enrolled, 178 eligible, minimum 5 and no Team deficits; another 13 non-transfer arrivals, 26 cumulative; annual 1,411,452 ms, cumulative 2,294,783 ms. Annual Save/reload and deep identity checks pass. No Draft selections or professional exits have occurred yet; those gates remain pending.

## New departure-pressure regression and rerun

The first integrated rerun failed its Year 4 viability assertion on 2036-10-01. `generated-team-0018` (Quartz Harbor Rays) had four rostered/eligible Players against five required after three canonical undrafted departures that day: `generated-player-0210`, `generated-player-0211` and `generated-player-0208`. This was a new turnover regression, permitting investigation under the instruction to preserve the accepted NCAA rollover work. Academic eligibility was not its cause.

That execution created 16 rights, signed three, and completed eight undrafted professional acquisitions: 11 NCAA professional exits in total. The currently signed incoming recruit for the deficient source had a target-season start of 2036-12-30. Architecture requires arrival at the target-season start; bringing that Player forward to the September academic rollover would change the arrival authority.

The missing seam was recruiting planning: current upperclassmen occupied projected slots throughout the incoming class's first season, despite foreseeable automatic Draft exposure and the existing player career choice. `RecruitingEngine.ts` now derives a planning roster through that season's Draft using public age/education eligibility and `ProfessionalPathwayDecision.ts`'s existing choice with current public production held fixed. Needs, prospective role opportunity and negotiation use that forecast for ordinary incoming recruits. Transfers retain immediate roster needs. Forecasts do not move, declare, release or retain Players; actual exits still require the professional decision and canonical gateways. No acquisition cap, roster retention rule, grading change or earlier arrival is introduced.

The affected 48 focused tests pass, including forecast/ranking invariance under changed hidden ratings. A separate regression checks every opened cycle in the 2033 and 2034 checkpoints: planning rosters equal actual rosters, so the two accepted prefix years are retained. Years 3-5 are being repeated from the 2034-10-01 Save with the canonical RNG draw position restored from completed games. Reported elapsed time includes the measured two-year prefix plus the new remaining execution; discarded failed Year 3/4 timings will not be counted twice.

Failure evidence is preserved in `C:/Temp/BS15I-pathway-before-replacement-metrics.json` and `C:/Temp/BS15I-pathway-before-replacement.2035-10-01.json` / `.2036-10-01.json`. Corrected-run log: `C:/Temp/BS15I-pathway-replacement-five-year-run.log`. Typecheck after the planning and resume changes passes.

Final annual metrics, funnels and performance projections will be appended only after their executions finish.

Corrected-run Year 3 passes at 2035-10-01: 194 enrolled, 178 eligible, minimum five, no Team deficits, 13 further non-transfer arrivals (26 cumulative), annual Save/reload and deep identity integrity. Its measured annual runtime is 1,569,379 ms; cumulative runtime including the two-year prefix is 2,452,710 ms. This replaces the discarded first-run Year 3 timing, while matching its continuity/arrival counts.

Static validation on the current pathway code and final audit passes: typecheck, build, and `git diff --check` exit 0; log `C:/Temp/BS15I-pathway-static-final.log`. Build retains the existing bundle-size advisory. The annual timings are measured certification execution costs on this machine, not isolated benchmarks; bounded verification work also ran during Year 3.

The planning-only rerun also fails Year 4 (2036-10-01): 201 enrolled, 196 eligible, minimum four; the same `generated-team-0018` deficit remains. It increases annual non-transfer arrivals from nine to 17, but its only prior incoming source-Team recruit still fails the existing 75 performance requirement (recorded performance 65, progress 67). It signs two rights and eight undrafted Players: ten actual NCAA pro exits. Year 4 takes 2,620,601 ms; cumulative measured prefix plus rerun is 5,073,312 ms. Preserved artifacts: `C:/Temp/BS15I-pathway-before-role-facts-metrics.json` and `.2034-10-01.json` / `.2035-10-01.json` / `.2036-10-01.json` under prefix `C:/Temp/BS15I-pathway-before-role-facts`.

Tracing the deficient source's open offers finds two unresolved playing-opportunity negotiations. Their known preference confidence is 30 and 15; AI repeatedly redirects because factual role replies require 40. The program already knows its own roster plan. In addition, the shared human response gateway's factual support still counts the current roster, contradicting the incoming-class choice/visit forecast. `RecruitingRosterPlanning.ts` now provides the same derived role opportunity to choice, visits and factual response validation. AI can answer a known role concern from that program context without raising private-preference confidence or creating a promise. Transfers still use the immediate roster. A focused regression verifies low-confidence factual replies through the existing negotiation gateway and distinct transfer context; no signing, grade or enrollment outcome is supplied.

The bounded canonical replay starts from the preserved Year 2 world, with matching RNG draw position, and runs normal calendar/matches/recruiting through 2036-01-15. It checks actual source arrivals and eligible capacity against the three departures observed in the archived failure. This is diagnostic evidence, not an accepted five-year prefix: the factual-response correction can affect early years, so the final five-year certification must start fresh after this replay passes. Latest typecheck passes; focused regression and replay results remain pending.
