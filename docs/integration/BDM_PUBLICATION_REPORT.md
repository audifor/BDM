# BDM publication report

Snapshot: 2026-11-02. Repository: `https://github.com/audifor/BDM`. Publication is limited to non-destructive updates to the existing candidate branch and Draft PR #187. No PR was closed or merged.

## Policy and baseline

- `origin/main` before publication: `12d926241fda7f2ba3f198083cd61fd480c2fec8`; it remains unchanged.
- Integration branch `integration/bdm-unified-20261102` was pushed explicitly and Draft PR [#187](https://github.com/audifor/BDM/pull/187) was opened against `main`. Its head at PR creation was `57faf08cc4262969bc7ceee67e01983619286038`; the report refresh will advance it by a documentation-only commit.
- Owner-requested publication policy is isolated in commit `83c04b0f` on `feature/bdm-f6-final-gameplay`, permitting explicitly requested branch and PR publication while prohibiting force push, direct main push, deletion, rewrite, secrets, and automatic merge.
- Pre-publication audit found 60 local branch tips not reachable from any origin ref. 59 safe original tips were published: F6 at its original ref and 58 under the date-namespaced backup. The WorldDB save branch remains local.

## Verified remote references

Each remote SHA below was compared with the preserved local source SHA. The 60 refs in the backup namespace have zero SHA mismatches; F6 was verified separately at its original name.

| Local source ref | Remote ref | Remote SHA | Result | URL |
|---|---|---|---|---|
| `feature/bdm-f6-final-gameplay` | `feature/bdm-f6-final-gameplay` | `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41` | exact SHA | https://github.com/audifor/BDM/tree/feature/bdm-f6-final-gameplay |
| `integration/bdm-unified-20261102` | `integration/bdm-unified-20261102` | `57faf08cc4262969bc7ceee67e01983619286038` | exact SHA at PR #187 creation; report refresh follows | https://github.com/audifor/BDM/tree/integration/bdm-unified-20261102 |
| `backup/m7-local-wip-before-main-sync` | `backup/m7-local-wip-before-main-sync` | `456cf11d7deba6de2a23437b34da3e9139eabde6` | exact SHA | https://github.com/audifor/BDM/tree/backup/m7-local-wip-before-main-sync |
| `bdm-bs15-bs16-bs17-integration-readiness` | `bdm-bs15-bs16-bs17-integration-readiness` | `4c33bec1266c645d7c0c509b228abb49263ebe88` | exact SHA | https://github.com/audifor/BDM/tree/bdm-bs15-bs16-bs17-integration-readiness |
| `bdm-master-capability-reuse-audit` | `bdm-master-capability-reuse-audit` | `67811994e48137ec77579ae3dcaa273e8a680c37` | exact SHA | https://github.com/audifor/BDM/tree/bdm-master-capability-reuse-audit |
| `bdm-stage2-bs10a-market-candidate-intelligence` | `bdm-stage2-bs10a-market-candidate-intelligence` | `686a42770e59cb6169d3c54042dfb9bbeb8fa4c1` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10a-market-candidate-intelligence |
| `bdm-stage2-bs10b-market-feasibility-economics` | `bdm-stage2-bs10b-market-feasibility-economics` | `7967acd1f2b05bab9174c3f37c94de666f8b2a95` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10b-market-feasibility-economics |
| `bdm-stage2-bs10c-acquisition-proposal-intelligence` | `bdm-stage2-bs10c-acquisition-proposal-intelligence` | `6b33227ac287374d97a7a7f1db0369c8f86903fd` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10c-acquisition-proposal-intelligence |
| `bdm-stage2-bs10d-a2-negotiation-preconditions` | `bdm-stage2-bs10d-a2-negotiation-preconditions` | `587ee3a1b97ff24be7662fb4cac5429acd383887` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-a2-negotiation-preconditions |
| `bdm-stage2-bs10d-a3-contact-authority` | `bdm-stage2-bs10d-a3-contact-authority` | `c019390b4ffc0526b85f29f184ab42ef085a5363` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-a3-contact-authority |
| `bdm-stage2-bs10d-a-free-agent-offer-authorization` | `bdm-stage2-bs10d-a-free-agent-offer-authorization` | `3e95630b26bc8cfce13d672a49c2aa3d8eaac10f` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-a-free-agent-offer-authorization |
| `bdm-stage2-bs10d-b-free-agent-contact` | `bdm-stage2-bs10d-b-free-agent-contact` | `821744b27d8b686885ef373dd4e2d1f08365be0a` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-b-free-agent-contact |
| `bdm-stage2-bs10d-c-contact-response` | `bdm-stage2-bs10d-c-contact-response` | `6d923da78bc67f7d47e1a8fa8b7da384d28d14c1` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-c-contact-response |
| `bdm-stage2-bs10d-d2-offer-semantics-authority` | `bdm-stage2-bs10d-d2-offer-semantics-authority` | `9a74448a61b626c2444ba609bd2bae36f7b0ca3c` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-d2-offer-semantics-authority |
| `bdm-stage2-bs10d-d-formal-offer-preparation` | `bdm-stage2-bs10d-d-formal-offer-preparation` | `bc6b53e17460ca55d9a432d1223c90039c9cf81e` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-d-formal-offer-preparation |
| `bdm-stage2-bs10d-e-formal-offer-submission` | `bdm-stage2-bs10d-e-formal-offer-submission` | `64c0954df401bcaa3db517298cf0ff194525a37a` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-e-formal-offer-submission |
| `bdm-stage2-bs10d-f-negotiation-lifecycle` | `bdm-stage2-bs10d-f-negotiation-lifecycle` | `66d8b98088db73e6979a36704797aa9747e58a6b` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-f-negotiation-lifecycle |
| `bdm-stage2-bs10d-g-authorized-signing` | `bdm-stage2-bs10d-g-authorized-signing` | `9b82033984d5b36430e9330e93cbe93b3c4d2dd1` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-g-authorized-signing |
| `bdm-stage2-bs10d-h-signing-governance-workflow` | `bdm-stage2-bs10d-h-signing-governance-workflow` | `383d7e84993f34d92047acdfbbb1d2e3f4a6e199` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-h-signing-governance-workflow |
| `bdm-stage2-bs10d-i-free-agent-convergence` | `bdm-stage2-bs10d-i-free-agent-convergence` | `ca407ef307a18a12a668c4766ec0ffad043ca87b` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10d-i-free-agent-convergence |
| `bdm-stage2-bs10e-a-trade-canon-package-audit` | `bdm-stage2-bs10e-a-trade-canon-package-audit` | `ec2cc6aa40c1319738006ff706be6d54ea8c953f` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10e-a-trade-canon-package-audit |
| `bdm-stage2-bs10e-b-trade-execution-foundation` | `bdm-stage2-bs10e-b-trade-execution-foundation` | `362c7460ad8bc8e8c7bd2d5158efac8dd942665c` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10e-b-trade-execution-foundation |
| `bdm-stage2-bs10e-c-trade-negotiation` | `bdm-stage2-bs10e-c-trade-negotiation` | `cc4f5fa75eedfbb60dc620f3542a5e1450743251` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10e-c-trade-negotiation |
| `bdm-stage2-bs10e-d-trade-governance-execution` | `bdm-stage2-bs10e-d-trade-governance-execution` | `b3de0dfc8e85d6f5339f80f48da892be99058852` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10e-d-trade-governance-execution |
| `bdm-stage2-bs10-market-closure` | `bdm-stage2-bs10-market-closure` | `9de9948d69ab70135913c7337dd431ee9d107ad6` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs10-market-closure |
| `bdm-stage2-bs11a-contract-roster-planning-audit` | `bdm-stage2-bs11a-contract-roster-planning-audit` | `32493210db55a30a94a4cefb65bf2aadf5f4dd41` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs11a-contract-roster-planning-audit |
| `bdm-stage2-bs11b-contract-review-decisions` | `bdm-stage2-bs11b-contract-review-decisions` | `34dc2abcc5ffeec3e16a6c4160d6d3f236d52c56` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs11b-contract-review-decisions |
| `bdm-stage2-bs14a-scouting-intelligence-audit` | `bdm-stage2-bs14a-scouting-intelligence-audit` | `fb330b4f0dcee42de9f19edeed89a3f8ea125b63` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs14a-scouting-intelligence-audit |
| `bdm-stage2-bs16-finance-strengthening` | `bdm-stage2-bs16-finance-strengthening` | `b5c43115b367b7627753909ba3782e74c1e3640c` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs16-finance-strengthening |
| `bdm-stage2-bs9a-club-strategic-state` | `bdm-stage2-bs9a-club-strategic-state` | `a54f8d0d763a6553d8d3e78d9d54960f0251dcf7` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9a-club-strategic-state |
| `bdm-stage2-bs9b-club-needs` | `bdm-stage2-bs9b-club-needs` | `9df28639585548f9e24a9e58ca319e09e4288879` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9b-club-needs |
| `bdm-stage2-bs9c-gm-decision-context` | `bdm-stage2-bs9c-gm-decision-context` | `a4bfee3efffa1db8e3dd2a2db84a260916cec8a6` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9c-gm-decision-context |
| `bdm-stage2-bs9d-a2-plan-execution-boundary` | `bdm-stage2-bs9d-a2-plan-execution-boundary` | `281dcffe7dd05e6d2f85d6a0e2c28f5b32a6648c` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9d-a2-plan-execution-boundary |
| `bdm-stage2-bs9d-a-selection-safety` | `bdm-stage2-bs9d-a-selection-safety` | `c146987bed51556cbf4e93d617b8b48970cdc207` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9d-a-selection-safety |
| `bdm-stage2-bs9d-b-ai-option-selection` | `bdm-stage2-bs9d-b-ai-option-selection` | `bec1dc154e87aa9ef6c2dbf1c66532a8e21a8b9d` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9d-b-ai-option-selection |
| `bdm-stage2-bs9e-a-gm-workflow-orchestration` | `bdm-stage2-bs9e-a-gm-workflow-orchestration` | `e0dc1916d97d498eca3f7b5ebb0cf4cbe92a84b2` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9e-a-gm-workflow-orchestration |
| `bdm-stage2-bs9e-b-planning-lifecycle-observability` | `bdm-stage2-bs9e-b-planning-lifecycle-observability` | `719363fd04aac1c7428ea5a87654676bc68e70d6` | exact SHA | https://github.com/audifor/BDM/tree/bdm-stage2-bs9e-b-planning-lifecycle-observability |
| `canonical-human-runtime-v1` | `canonical-human-runtime-v1` | `bfd5e0c55ae6c2e971c29c2c3499082c9717495b` | exact SHA | https://github.com/audifor/BDM/tree/canonical-human-runtime-v1 |
| `codex/newgame-preview-186` | `codex/newgame-preview-186` | `3e915511ea41891aded33a4e9a7fb3b048613906` | exact SHA | https://github.com/audifor/BDM/tree/codex/newgame-preview-186 |
| `feat/home-courtside` | `feat/home-courtside` | `0eeb218a78c5f13aa1130eb53b889b4a4bb2df82` | exact SHA | https://github.com/audifor/BDM/tree/feat/home-courtside |
| `feature/career-f0b-autonomous-club` | `feature/career-f0b-autonomous-club` | `5a0afcfad6f6d821bb6b0e6f989facc81b27a0ad` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f0b-autonomous-club |
| `feature/career-f1-arrival` | `feature/career-f1-arrival` | `a6d8e7a7d32c3424c289ed1d541c88c4ae343fdf` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f1-arrival |
| `feature/career-f2-director-hub` | `feature/career-f2-director-hub` | `a00b0d53f67f5b0378d234fc6ebaf9b7a3979ba5` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f2-director-hub |
| `feature/career-f3-1-integration-closure` | `feature/career-f3-1-integration-closure` | `bbf51a3a5ae1a59b945aa35f0a85f44ccc87a34f` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f3-1-integration-closure |
| `feature/career-f3-human-experience` | `feature/career-f3-human-experience` | `a214d68aaa66f37323ba454f348b2237d3a162ed` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f3-human-experience |
| `feature/career-f4a-ecosystem-routing` | `feature/career-f4a-ecosystem-routing` | `f0754beaaaeaeeb2b2654620a573b750f96b040e` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f4a-ecosystem-routing |
| `feature/career-f4b-sporting-operations` | `feature/career-f4b-sporting-operations` | `a399115cf0d0b4ccd4f24c11fa253064ee2e9400` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f4b-sporting-operations |
| `feature/career-f4c-unified-world` | `feature/career-f4c-unified-world` | `f17f325175f6fc33b4e1f37e9baa2a47f9914106` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f4c-unified-world |
| `feature/career-f5-complete` | `feature/career-f5-complete` | `4366b19df8646bce70ae9c159f737c49d1bb402f` | exact SHA | https://github.com/audifor/BDM/tree/feature/career-f5-complete |
| `backup/safe-source/worlddb-universe-v1-20261102` | `feature/worlddb-db04-catalog-adapter-source` | `853d1dbed19ce08f9795d68d3390846a706c822e` | exact SHA | https://github.com/audifor/BDM/tree/feature/worlddb-db04-catalog-adapter-source |
| `backup/safe/worlddb-universe-v1-final` | `feature/worlddb-universe-v1-source-only` | `4ca1505fc129bf162ca960a7b0374883d0f38ded` | exact SHA | https://github.com/audifor/BDM/tree/feature/worlddb-universe-v1-source-only |
| `fix-date-progression-match-simulation` | `fix-date-progression-match-simulation` | `752b102d7a3e5ea9ee7ef734eec839ce3502787d` | exact SHA | https://github.com/audifor/BDM/tree/fix-date-progression-match-simulation |
| `match-basketball-truth-bt1` | `match-basketball-truth-bt1` | `95b5aad2d7a8a59096e73ad00dd1e7a722d56950` | exact SHA | https://github.com/audifor/BDM/tree/match-basketball-truth-bt1 |
| `matchengine-v3-mg8a-defensive-authority-foundation` | `matchengine-v3-mg8a-defensive-authority-foundation` | `715efd33316e9727de17210ec08e97f522ac90b3` | exact SHA | https://github.com/audifor/BDM/tree/matchengine-v3-mg8a-defensive-authority-foundation |
| `matchengine-v3-mg8b-on-ball-defense-containment` | `matchengine-v3-mg8b-on-ball-defense-containment` | `617712dee5e48363320d5ec47ed9d3e1ef14525d` | exact SHA | https://github.com/audifor/BDM/tree/matchengine-v3-mg8b-on-ball-defense-containment |
| `matchengine-v3-mg8c-spatial-intent-arbitration` | `matchengine-v3-mg8c-spatial-intent-arbitration` | `0e4d1ee9aa8dc7300a983ff62828a6d0ad411712` | exact SHA | https://github.com/audifor/BDM/tree/matchengine-v3-mg8c-spatial-intent-arbitration |
| `matchengine-v3-pre-mg8b-playback-timescale` | `matchengine-v3-pre-mg8b-playback-timescale` | `18ee584041e1e7cf16692e392562a261733c592c` | exact SHA | https://github.com/audifor/BDM/tree/matchengine-v3-pre-mg8b-playback-timescale |
| `match-presentation-v1` | `match-presentation-v1` | `d6be1f32a2f5c12f95194a37603d2e48799a3166` | exact SHA | https://github.com/audifor/BDM/tree/match-presentation-v1 |
| `player-model-mg4a0-80-rating-migration` | `player-model-mg4a0-80-rating-migration` | `e54b4d6f621f3adda152d8abfec23d08aafb03c5` | exact SHA | https://github.com/audifor/BDM/tree/player-model-mg4a0-80-rating-migration |
| `wdb2-1-1-game-start-date` | `wdb2-1-1-game-start-date` | `7b11bda5f3fb7d3ce6aec3c44e0c0243221b5a73` | exact SHA | https://github.com/audifor/BDM/tree/wdb2-1-1-game-start-date |
| `wdb2-1-2-first-playable` | `wdb2-1-2-first-playable` | `a90ce8db0bb37f288bbdc8dcc1fa6ac37473a108` | exact SHA | https://github.com/audifor/BDM/tree/wdb2-1-2-first-playable |
| `wip-bdm-local-before-bg8-integration` | `wip-bdm-local-before-bg8-integration` | `7ab4157baf9179892e1a8a485c5b5a439ff2f71a` | exact SHA | https://github.com/audifor/BDM/tree/wip-bdm-local-before-bg8-integration |

## Security and excluded material

- The original `feat/worlddb-universe-v1` tip `c8099445` contains generated `outputs/worlddb-universe-v1/liga-endesa-2026-10-25-seed-20261025.save.json`; it was not published. Its generated save and reports remain preserved locally. A derived source-only alternative (`4ca1505f`) was published without the `outputs/` tree.
- A temporary local inspection ref `backup/safe/worlddb-universe-v1` also contains the same generated output and was not published. No branch was deleted or rewritten.
- An additional unpublished source commit `853d1dbe` adds the read-only DB-04 catalog adapter and test, with no save/database outputs or secret-pattern matches. It was published under `backup/local-preservation-20261102/feature/worlddb-db04-catalog-adapter-source`, preserving its exact SHA; the integration candidate uses a cherry-picked commit `eccb26e5`.
- Secret-pattern scan of newly published commits found zero hits for common private-key, GitHub token, AWS key, and API-key patterns. Artifact path inspection found no `.env`, private key, SQLite database, dump, build output, or save among the published source commits.
- The push uploaded 211 Git LFS objects (62 MB); all 211 paths are PNG design captures under `docs/visual-proposal/png/`. No compiled binary or database was included in this LFS upload.

## Publication boundaries

- Used explicit branch refspecs only; no `--all`, `--mirror`, force push, branch deletion, prune, reset, or stash pop.
- Root `C:\BDM` remains on `playable/f4` at `c1905549` with its 27 pre-existing modified/untracked entries untouched. The five stashes remain intact.
- The F6 source worktree remains clean at `83c04b0f`; the remote F6 ref matches that SHA. Integration candidate validation is partial; Draft PR #187 is open for review only.
- The 49 pre-existing open PRs were left unchanged. Draft PR #187 is the only new PR from this work. No PR was merged and `main` was not pushed.

## Selective PR #173 update

- PR #173 (`release/final-01-functional`) was merged into the local candidate with manual conflict resolution and selective F6-compatible code. Its head remains `cdd3c5050d5946e4444660c13220abc8ac0358fe`; the PR itself was not edited or merged.
- The candidate retains F6/WorldDB V2 routing, player categories, user-coach identity and Save V4. Source staff are surfaced as original unemployed candidates across active competitions without a six-per-role cap or staff gender filter; hiring preserves source identity and avoids duplicate appointments or user-coach replacement. Fiscal closure is recorded in the canonical Finance ledger and is idempotent.
- Personal generated saves, screenshot evidence and snapshot-specific workflow artifacts from #173 are excluded. Snapshot-based acceptance tests are retained as opt-in and were not executed without their local input saves.
- Focused tests passed for WorldDB staff projection/hiring, cross-competition coach allocation, fiscal closing, staff contract lifecycle, finance/medical UI, roster currency, expiry and V4 persistence. `npm run typecheck`, `npm run build`, `cargo fmt --check`, and `cargo check` passed. The real WorldDB multileague test was skipped because its configured local SQLite database is absent. A long multi-season test batch was interrupted before a summary and is inconclusive; the complete suite has not been run.
- Candidate branch and Draft PR #187 are being advanced for review. This does not authorize or perform a merge to `main`; PR #173 remains unchanged.
