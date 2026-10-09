# BS15G · Pathway Movement, Draft Integration & Shared AI

## Audit and implementation

The baseline code-path audit is recorded in [DRAFT_INTEGRATION_AUDIT_BS15G.md](../research/DRAFT_INTEGRATION_AUDIT_BS15G.md). Production season completion now projects already-rostered NCAA/FIBA Players using recorded education and residence evidence. Missing CBA evidence remains `UNKNOWN`; nationality is not used as a substitute. The legacy synthetic prospect generator remains available to fixtures and older callers.

Draft cycles carry versioned rules and date provenance. Future cycle rules use `SIMULATED_CARRY_FORWARD`. `DraftEntry` history records consideration, declaration, withdrawal, final pool, drafted, and undrafted states. NCAA return and NBA withdrawal deadlines are evaluated separately. AI boards use organization knowledge, public production, policy, and roster position need. Selection creates rights without creating a contract or roster membership.

Professional entry now has separate rights-signing and undrafted Market routes, plus NCAA→NBA, NCAA→FIBA, FIBA→NBA, and NBA→FIBA transition authorities. These routes preserve the existing Player identity and retain history. The player history model includes Draft and transition events. Draft UI exposes an advisory outlook, eligibility/deadline information, entry actions, team board knowledge, and pick results.

## Closure run status

**PASS · BS15G PATHWAY MOVEMENT, DRAFT INTEGRATION & SHARED AI.** All four remaining certification gates are closed.

- **Game-backed professional decisions:** logged college production and actual enrollment, role, trust, compensation, and preference context drive return-versus-Draft recommendations. A second scenario separates a borderline public advisory from all NBA organizations' weaker scouting knowledge; four stronger Players are selected, the advised Player goes undrafted, and the canonical undrafted market signs that same PlayerId. A third scenario records a timely return, improved next-year production, a completed new scouting report, and a second Draft declaration. No universal `draftStock` authority was added.
- **Blocked-reason UI:** automated status/read-model coverage exercises ineligibility, passed declaration deadline, missed NCAA-return deadline, missed NBA withdrawal deadline, already-withdrawn and already-selected states, unsigned draft rights, signed/rostered states, and an active source contract. Lifecycle labels keep `DRAFTED`, `RIGHTS_HELD`, `UNSIGNED`, `SIGNED`, `ROSTERED`, and `UNDRAFTED` distinct.
- **2045–46 lifecycle:** existing Players only; simulated carry-forward Draft rules retain their source and the derived 2045 season. The final pool contains 168 existing eligible Players. The certification covers early entry, automatic NCAA eligibility, a qualifying international Player, withdrawal after the NCAA return deadline, at least three AI-owned picks, rights and contract signing, roster movement, an undrafted NBA route, and Save V4 reload/replay. Portal-to-College-B-to-2045-Draft-to-pro movement is certified on the same PlayerId in the integrated TalentCohort pathway scenario.
- **Long same-human pathway:** one materialized TalentCohort Player completes NCAA recruiting/signing/enrollment, a canonical Portal transfer to College B, 2045 Draft entry/selection, rights, NBA contract, roster placement, and V4 reload. PlayerId and PersonId remain stable. Readable history is derived from materialization, recruiting signing, enrollment, Portal, DraftEntry, pick, rights, contract, and ecosystem-transition records.

The production pool preserves the 456-player starting population through candidate projection, declarations, withdrawal, Draft day, contracts, and save replay. The focused pool test also records candidate counts of 0 initially, 3 after declarations, 2 after a timely withdrawal, and 1 on Draft day; each checkpoint has `playersAfter - playersBefore = 0`.

## Validation performed in this closure run

- `npx vitest run src/engine/career/ProfessionalDecisionRealism.test.ts src/engine/career/EcosystemTransitions.test.ts src/engine/season/ProductionDraftPool.test.ts src/engine/recruiting/RecruitingRpg.test.ts src/ui-ng/applications/draft/DraftUiBlockedReasons.test.tsx src/ui/screens/DraftScreen.test.ts src/engine/career/ProfessionalPathwayDecision.test.ts src/ui-ng/applications/player/data/buildPlayerHistoryModel.test.ts --reporter=dot` — 48 passed.
- `npx vitest run src/engine/draft/DraftEngine.test.ts -t "uses canonical reverse standings and configurable rounds" --reporter=verbose` — 1 passed in isolation. In a nine-file parallel batch the same 3.2-second case exceeded its 5-second shared-load timeout; the isolated run passes.
- `npm run typecheck`, `npm run build`, and `git diff --check` — passed. The Vite build reports its existing large-chunk advisory.
- `npm run tauri -- dev` — Vite and the Windows desktop executable started successfully; the process was stopped after startup confirmation.
- Known baseline debt remains excluded from BS15G product status: six `GameWorldSaveV1` failures and the `SeasonContentActivation` past-game failure reproduce on clean base.

No BS15G P0 or P1 gates remain. BS15H remains focused on the broader Talent Operations Gameplay UX vertical slice: prospect discovery and source/uncertainty comparison across academy, recruiting, and Portal workflows. This does not defer any of the four BS15G closure requirements.
