# BS15F final certification

Branch: `bdm-stage2-bs15f-college-continuation-transfer-portal`. Base: `eea04cd524b858fde1337861630e963e5c24ca98`.

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Baseline regression triage | PASS | Three selected `SeasonProgression.test.ts` failures reproduce on clean base with the same signatures; classified `PRE-EXISTING BASELINE FAILURE`. |
| A Continuation and exceptions | PASS | Separate stay/leave reasons; persisted, idempotent promise outcome/trust consequence; Head Coach and aid exceptions use canonical career/aid history. |
| B Compensation and Finance | PASS | Shared human/AI cap gateway; aid, benefits and NIL remain separate. Signed benefits create a Finance economic event, commitment, expense recognition, payable and balanced transaction. Agreement retains references. Late reporting creates one Enforcement violation; annual rollover carries ordinary overage but excludes verified incremental scholarship overage. |
| C Ghost transfer | PASS | Shared authorization guard covers aid, benefits, roster and athletic activity. Explicit prohibited action creates one violation/case, Head Coach Staff activity restriction for 16 championship contest equivalents from the versioned 32-contest limit, and one Finance fine at 20% of the latest Team-dimension sport budget. Recruiting, coaching and administrative availability read the restriction; replay is idempotent. |
| D Eligibility | PASS | Versioned CollegeRuleset and Enrollment evidence support earlier enrollment/age trigger, September–December birthday treatment, explicit transition selection, continuous clock across transfers, and undergraduate midyear competition delay without imposing it on postgraduate transfers. Old unknown evidence remains unknown. |
| E Movement | PASS | Authorized Portal Recruiting signs and moves the same Player and Person; historical source and active destination Enrollment, eligibility history and movement metadata survive replay and Save V4. |
| F AI | PASS | `runCollegeRosterContinuationAndTransferAI` performs risk assessment, cap-checked retention, Player notice/module/authorization, knowledge and roster-fit targeting, contact, pitch, offer, promise, negotiation, legal aid/benefits, signing and transfer. Hidden ratings changes leave its target decision invariant. |
| G Save and future | PASS | Save V4 round-trips new Finance, Enforcement, Staff, Enrollment, benefits, Portal and movement state. Old V4 defaults remain accepted. A controlled 2045–46 season fixture reaches a completed final, simulated Portal ruleset, simulated cap with provenance, AI compensation, eligibility, same-identity transfer and Save V4 round-trip. |
| H UI | PASS | Existing Recruiting screen now presents stay/leave reasons, role, trust, coach change, promise status, aid, benefits, NIL, Portal state, source, public production, OrganizationKnowledge count, roster need, cap room and eligibility uncertainty. UI tests cover read states and blocked-action feedback. Tauri launched. |
| I Realism | PASS | Controlled stay and leave outcomes use recorded continuation logic; three destination choices use prestige, role/trust and legal money. A role-focused Player prefers the trust destination; a compensation-focused Player responds to the legal package. The ghost path records real Staff and Finance remedies. |

## Authority and provenance

- Finance V2 maps institutional benefits and Enforcement fines through semantic expense accounts, not Recruiting-owned ledger identifiers. Signed obligation is distinct from payment; Payable stays outstanding until cash settlement. Replays do not post duplicate expenses.
- Fictional NCAA worlds receive a Team-dimension Finance basketball budget for their most recent completed fiscal year, marked `SIMULATED_NCAA_SPORT_BUDGET`. The initial 2025–26 benefits ceiling cites the NCAA first-year source; later annual caps are explicitly `SIMULATED_CARRY_FORWARD`, not claims about future official NCAA values.
- Enrollment stores optional full-time term, first attendance, academic level, transfer source and transition evidence. No missing historical attendance is fabricated on old saves.
- NCAA authorities consulted: [House settlement-related rules](https://www.ncaa.org/news/media-center-di-board-of-directors-conditionally-approves-house-settlement-related-rules-changes/), [benefits cap accounting amendment](https://web3.ncaa.org/lsdbi/search/proposalView?id=109536), [age-based eligibility](https://web3.ncaa.org/lsdbi/search/proposalView?id=109394), [age timing clarification](https://www.ncaa.org/news/division-i-adopts-age-based-eligibility-model/), [ghost-transfer remedies](https://www.ncaa.org/news/media-center-di-cabinet-finalizes-process-for-ghost-transfer-violations/), and [basketball contest limit](https://web3.ncaa.org/lsdbi/search/proposalView?id=108525).

## Validation

- Focused connected regression: 140 distinct tests passed in the relevant eligibility/Portal/compensation, Recruiting/Staff/Enforcement, Finance, knowledge/NIL, Save and UI slices. The full `GameWorldSaveV4.test.ts` batch made no progress after repeated one-minute waits; the two BS15F-relevant Save tests passed separately, and integrated 2032 and 2045–46 Save V4 round-trips passed in `CollegeTransferAI.test.ts`. The interrupted batch is not counted as a pass.
- Exact successful commands:

```text
npx vitest run --maxWorkers=1 src/engine/eligibility/CollegeTransferAI.test.ts src/engine/eligibility/CollegeRealism.test.ts src/engine/eligibility/CollegeEligibilityClock.test.ts src/engine/eligibility/CollegeEligibility.test.ts src/engine/eligibility/EligibilityAvailability.test.ts src/engine/eligibility/CollegeContinuationAssessment.test.ts src/engine/eligibility/TransferPortalLifecycle.test.ts src/engine/eligibility/TransferPortalRulesLifecycle.test.ts src/domain/eligibility/TransferPortal.test.ts src/domain/collegeCompensation/CollegeCompensation.test.ts
npx vitest run --maxWorkers=1 src/engine/enforcement/EnforcementRemedies.test.ts src/engine/enforcement/EnforcementEngine.test.ts src/engine/recruiting/RecruitingEngine.test.ts src/engine/recruiting/RecruitingPermission.test.ts src/engine/recruiting/RecruitingLifecycle.test.ts src/engine/recruiting/RecruitingRpg.test.ts src/engine/recruiting/RecruitingRealism.test.ts src/engine/recruiting/RecruitingAdvisory.test.ts
npx vitest run --maxWorkers=1 src/domain/finance/EconomicEventAdapters.test.ts src/domain/finance/BudgetForecasting.test.ts src/save/FinancePersistence.test.ts
npx vitest run --maxWorkers=1 src/domain/knowledge/OrganizationKnowledge.test.ts src/engine/nil/NilEngine.test.ts src/ui/screens/RecruitingScreen.test.ts src/ui/screens/RecruitingScreen.college.test.tsx
npx vitest run --maxWorkers=1 src/save/GameWorldSaveV4.test.ts -t 'retains current scouting knowledge|round-trips NCAA carry-forward rules and defaults pre-BS15F'
npm run typecheck
npm run build
git diff --check
npm run tauri -- dev
```
- `npm run typecheck`: PASS. `npm run build`: PASS (existing Vite large-chunk warning). `git diff --check`: PASS (existing LF/CRLF warning on `RecruitingScreen.tsx`). `npm run tauri -- dev`: PASS; Vite served port 1420 and Tauri launched `target\debug\bdm.exe`; stopped after verification.
- External visual-inspection connector was unavailable in the prior environment check; UI is certified by integration tests and native launch.
- Known baseline debt: `SeasonProgression.test.ts` selected finalization/injury failure and two timeouts, all reproduced on clean base. No BS15F repair attempted.

## Closure

P0 remaining: none in the scoped product gates. P1 remaining: baseline `SeasonProgression` failures and full Save V4 batch performance investigation outside this scope.

PASS · BS15F COLLEGE CONTINUATION, COMPENSATION & TRANSFER PORTAL

College basketball now behaves as a continuous career ecosystem in which Players can rationally stay, enter the Portal, be recruited, negotiate legitimate and institutionally constrained compensation, transfer with preserved identity/history, and remain subject to real eligibility, Finance and Enforcement constraints.
