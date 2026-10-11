# BS17D Talent consolidation certification

STATUS: PASS · BS17D TALENT CONSOLIDATION

BS17D GLOBAL: PARTIAL.

## Scope and sources

This milestone consolidates already certified BS17D-T and BS17D-T1 on bounded convergence V2. No new product functionality or production implementation was added.

- V2 base: `fbe788ce01f1dd34fc40b360b4661ebaad63457c`.
- BS17D-T: `64abd26a50e93fd827f27dccabaa486e0e73dd04`.
- BS17D-T1: `582f517e178ae8a7159237fd3d75e2db4c9d8f87`.
- Explicit consolidation merge: `065e8e3ec7590679832fbc685ad84f1085b61605`.
- Final SHA: the local certification commit containing this report (`git log -1 --format=%H -- docs/integration/BS17D_TALENT_CONSOLIDATION_CERTIFICATION.md`).
- Branch/worktree: `integration/bs17d-talent-consolidated`, `C:/BDM-INTEGRATION-BS17D`.

## Git integration and ancestry

All three source commits were accessible; their source worktrees were clean at exactly those SHAs before integration. No uncertified source working-tree changes were imported. V2 is an ancestor of T, and T is an ancestor of T1.

The new branch was created from V2 and integrated only T1 using the authorized explicit local command:

```powershell
git merge --no-ff 582f517e178ae8a7159237fd3d75e2db4c9d8f87 -m "merge: consolidate certified BS17D talent on convergence v2"
```

The merge parents are exactly V2 and T1. No conflict occurred. The merge's complete tracked tree equals T1's tree; no intermediate T merge, rebase, cherry-pick or external merge was needed. The final milestone adds only the consolidation test and certification evidence/documentation; all production files still equal T1.

Frozen source authorities remain in ancestry: BS15 `94c077092224a9f75c861a853d9d52fceae526fe`, BS16 through K-C `97c58b98b9192a569f30bdfd8b63565f0b02a744`, and BS17D-M `6945cb90604bd349edd9d2333aa7d1861e9a311a`.

## Consolidated LIVE operations and boundaries

- Talent youth physical context: LIVE, read-only. Existing configured youth relations, organization-associated facilities, dated Team versus Organization rights, nominal capacity/unknown operating capacity and actual recorded Training attempts remain visible in Talent with Facilities navigation.
- Scheduled Academy Training: LIVE through the existing Training P0 owner acting on actual BS15 youth rosters. UNKNOWN retains continuity; a verified restriction affects only the required resource-dependent operation. No second Training engine, new formula or building intake quota.
- Recruiting physical demonstrations: LIVE as optional subordinate activities of the existing valid BS15 visit. Manager confirmation executes the activity, and the visit retains its canonical NCAA/Staff permissions, cost, RPG and outcome. A physical failure blocks only the demonstration. Retry/restoration/alternatives update the same activity; no extra visit or permission. Showing a medical capability is not executing a clinical procedure.
- CFI8 and BS17C remain the anatomy/capability/right/service/project-disruption authorities. Ownership or Organization rights do not imply Team access. Nominal capacity is not an operating allocation or a reservation.
- Source authority remains BS15 for supply/identity, youth pathways, Recruiting RPG/NCAA/Portal/Draft, and frozen BS16 K-C for FinancialAuthority, Treasury, Payroll and Finance contracts. No additional recruiting probability, psychological effect, cost, NIL/aid effect or economic obligation.

The original T certificate correctly described no independent Talent physical procedure at its own SHA. T1 subsequently added the specifically approved visit-demonstration consumer; its presence here does not retroactively rewrite T's certificate or make every Talent activity physically dependent.

## Same-world consolidation proof

`src/app/game/BS17DTalentConsolidation.test.ts` adds three tests, not new production functionality. The fixture uses the existing deterministic cohort seed `151617`, initial date `2032-10-01`, explicit testFixture NCAA contact calendar and existing owner commands.

One GameWorld contains a canonical Recruiting materialization of candidate 2 and youth intake/registration of candidate 1, explicit shared Team rights and a scheduled youth court session. Calendar executes Training/Recruiting/Finance phases once, and the manager confirms a valid recruiting visit with an optional demonstration. Both the youth context/recorded Training and the Recruiting activity/options are accessed from that same resulting world.

A paired world differs only in component serviceability. FULL completes both physical operations. OUT_OF_SERVICE records the youth Training block and the demonstration's NOT_EXECUTED result while retaining the general visit. Players/persons, CandidateKey materializations, supply, rosters/registration, RPG/interest, Finance/Governance, injury and match source facts remain identical. The new demonstration is also compared with the general visit without demonstration from the same Calendar output.

Full Save V4 round-trip equality remains asserted. Reloaded confirmation is idempotent. The following Calendar day cannot replay the recorded demonstration. Existing T/T1 tests additionally prove UNKNOWN, LIMITED compatibility, access denial/expiry, alternatives, restoration, UI selection/cancellation, no extra costs/bonuses and exactly-once owner behavior.

Initial joint-fixture validation detected that adding a youth roster Player to the NCAA fixture needed the existing Save compatibility enrichment (`ensureNcaaEligibility` / academics) before comparison. The fixture now crosses that canonical boundary after setup and before paired execution. The full Save equality assertion was preserved and then passed. This corrected fixture setup only; no production repair or rule change was necessary. The first failure and corrected results remain visible in local diagnostic logs and evidence hashes.

## Validation

**246/246 tests PASS in 21 files**, with zero failed or pending:

- T1 causal Recruiting demonstrations: 14; manager UI: 4; existing Recruiting workspace: 6.
- T youth Facilities causality: 10; YouthPathwayEngine: 5; TalentSupply: 8.
- Joint same-world consolidation: 3.
- RecruitingEngine: 8; RecruitingRpg: 20; RecruitingPermission: 16; RecruitingLifecycle: 5.
- CFI8/Facilities rights/context: 42; Training P0: 17.
- Facilities Save V4: 30; physical operations Save: 9; Calendar: 25.
- V2 cross-system causal tests: 5, including incremental/deep validation, Talent supply with Finance/Payroll and scoped Training, repeated combined Save and sync/async immutable Calendar publication.
- Medical/BS12C compatibility: 8; Talent physical MX: 3; existing Talent workspace: 1; Talent projections: 7.

`npm run typecheck`: PASS (exit 0). `npm run build`: PASS (exit 0); Vite's existing chunk-size advisory remains visible. `git diff --check`: PASS. No `Math.random()` in src and no improper production React/Zustand/Tauri imports in Domain/Engine. Rust is untouched and was not rerun under the explicit focal validation contract.

No new unresolved regression was demonstrated in the tested consolidation scope. This is bounded evidence, not a full-system or longitudinal recertification.

[Machine-readable evidence](BS17D_TALENT_CONSOLIDATION_EVIDENCE.json) includes exact test paths/counts, joint test names, seed/fingerprint, verified ancestry/merge parents, protected HEADs and local raw report/log hashes. Original and corrected joint-fixture runs are retained under ignored `node_modules/.cache/bs17d-consolidation/`. Reproduce with provisioned dependencies:

```powershell
$bs17dEvidence = Get-Content docs/integration/BS17D_TALENT_CONSOLIDATION_EVIDENCE.json -Raw | ConvertFrom-Json
$bs17dTests = $bs17dEvidence.tests.files.path
npx vitest run @bs17dTests --maxWorkers=1 --reporter=verbose
npm run typecheck
npm run build
git diff --check
```

The focal set is the union of the exact tests recorded in T and T1 certificates plus the three new joint tests. No full suite, Y1-Y30, historical World DB 2029 or performance-program rerun was performed. No production dependency installation was required; already installed dependencies were copied into this independent worktree without sharing writable caches with source worktrees.

## Protected state, limitations and next action

Main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; origin/main remains `94c077092224a9f75c861a853d9d52fceae526fe`. The V2, T and T1 source worktrees remain clean at their original SHAs. No newer BS16 changes were imported. No merge to main or push occurred.

Historical 2029 remains **UNRESOLVED_HISTORICAL_CAUSE**. All original V2 historical evidence and baseline classifications remain unchanged. This consolidation neither explains that failure nor widens V2's bounded scope or claims a new longitudinal World DB certification.

No blocker remains within this consolidation's certified scope. BS17D GLOBAL remains PARTIAL: specialized Medical is NOT_IMPLEMENTED, and quantitative facility allocation requires its respective authorities/policy. Facilities AI and BS16 global completion are not certified. BS17E/F must not start while their BS16 dependencies remain unresolved.

Next action: use the consolidated branch as the local certified base for a separately authorized next milestone. A main merge requires its own explicit authorization; none is implied by this PASS. Do not start new functionality in this run.
