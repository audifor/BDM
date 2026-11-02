# BDM consolidation report

**Status: PARTIAL.** The candidate preserves the F6 line and adds a read-only WorldDB DB-04 catalog source. The local branch is not yet published and no PR has been opened. Twenty-five current open PR heads are not ancestors of the candidate; their functional equivalence or supersession has not yet been established.

## Chosen base

- Remote main at audit start: `12d926241fda7f2ba3f198083cd61fd480c2fec8`.
- Candidate branch: `integration/bdm-unified-20261102`, based on F6 source commit `83c04b0f` (which includes F5 `4366b19d` and F4C `f17f3251`).
- F6 source already contains the current head of PR #186 (`7fd7742a`), plus the checked BS15/16/17 and HRPG integration heads. These were not merged a second time.
- Additional WorldDB source commit `853d1dbe` (read-only DB-04 catalog adapter) was cherry-picked as candidate commit `eccb26e5`; it was absent as a file/module on the F6 candidate and adds no generated save or database. This preserves the catalog reader as a read-only projection and does not claim to make DB-04 game-executable.
- Graph counts: candidate is 293 commits ahead of `origin/main` with no main-only commits (`0 / 293`). F6 contains PR #186 with 13 candidate-only commits over that PR head (`13 / 0`). The checked BS15/16/17 and HRPG integration tips are ancestors of F6 (their right-side unique counts are zero).
- PR #173 has 11 commits beyond the main merge base and is not an ancestor of F6. Its diff includes fiscal closing, staff/medical/roster/home-finance changes and native acceptance evidence, plus a 1.16 MB generated save and screenshots. The PR remains unchanged; code-level review is required before selective integration, and its generated save/evidence files are excluded from candidate history.

## Open PR head ancestry

Snapshot: 49 PRs. `Yes` means the exact head SHA is an ancestor of the current candidate; it is an ancestry check, not a behavioral acceptance test. `No` means the head still requires code/diff review or evidence of an equivalent implementation. No PR was closed or changed.

| # | Title | Head → base | Head SHA | In candidate | Merge state | PR |
|---:|---|---|---|---|---|---|
| 62 | [BDM] Instantiate declarative World DB competitions into save runtime | `world-db-competition-instantiation-v1` → `main` | `7999d3e182a92ccfc118b168ff20f8ef8c78bed5` | No - review | DIRTY | https://github.com/audifor/BDM/pull/62 |
| 63 | [BDM] Realize completed Games into World DB competition instances | `world-db-game-result-realization-v1` → `main` | `3bbc3706fb982895443cba97195b53508a717236` | No - review | DIRTY | https://github.com/audifor/BDM/pull/63 |
| 64 | [BDM] Plan physical Games from World DB competition instances | `world-db-physical-game-plan-v1` → `main` | `7c7d3fdf0e5e69f599279bdb88a4580b7b77f6ed` | No - review | DIRTY | https://github.com/audifor/BDM/pull/64 |
| 100 | [BDM] Run World DB competitions through the daily game loop | `world-db-daily-runtime-v1` → `main` | `aa98a56f0841fd83f0ce50620b815f8c18c1f9a2` | No - review | DIRTY | https://github.com/audifor/BDM/pull/100 |
| 109 | [RWS] Expose all 80 Player Truth ratings in Player NG | `fix-rws-player-truth-ui` → `world-db-gameworld-bootstrap-v1` | `8ce6079b957794dde332f67108c55e29a439e3d0` | No - review | DIRTY | https://github.com/audifor/BDM/pull/109 |
| 111 | POC: Phaser 4.2 presentation layer for MatchEngine Next | `match-next-phaser-poc` → `main` | `767927e75b1be4689053c924cbe46fdaedffb0b3` | No - review | UNSTABLE | https://github.com/audifor/BDM/pull/111 |
| 114 | docs(visual-proposal): Courtside desktop catalog + QA certification | `docs/visual-proposal-courtside` → `main` | `ea93dc38ba5bd24ed2f55de2b6265c25b77c954e` | No - review | DIRTY | https://github.com/audifor/BDM/pull/114 |
| 116 | WorldDB PERSON 2.1–2.2: physical, birthplace, residence, languages and Save reload | `fix/worlddb-person-partial-physical-step2` → `main` | `db1b0602fdc422a9057e22d5c0a1313af93e12a0` | No - review | DIRTY | https://github.com/audifor/BDM/pull/116 |
| 117 | P0D: retain optional WorldDB person-name provenance through GameWorld and Save V4 | `feat/p0d-worlddb-name-provenance-consumer` → `main` | `7d971d33ddda4305d0b9a080a1e5ad8cfa445638` | No - review | DIRTY | https://github.com/audifor/BDM/pull/117 |
| 118 | P0E · Leer PERSON P0C persistidas en Tauri y conservarlas en Save V4 | `feat/p0e-persistent-name-consumer-smoke` → `feat/p0d-worlddb-name-provenance-consumer` | `471b0434fd6252f46f9720200d854f45786c9f4c` | No - review | CLEAN | https://github.com/audifor/BDM/pull/118 |
| 121 | Relationships P0 · conectar afinidad PERSON con eventos reales sin inventar amistades | `feat/relationship-compatibility-event-bridge-v1` → `main` | `94c83036974ff679029995524cd81874642e27d6` | No - review | DIRTY | https://github.com/audifor/BDM/pull/121 |
| 122 | WorldDB PERSON 50/50 → BDM GameWorld · moral, Save V4 y compatibilidad legacy | `feat/worlddb-personality-runtime-bootstrap-v1` → `feat/relationship-compatibility-event-bridge-v1` | `cd17ffc3184b6bd5c979220394856b9ba9e6ca4a` | No - review | CLEAN | https://github.com/audifor/BDM/pull/122 |
| 123 | PERSON 50 · afinidad real en eventos de relación usando las 50 dimensiones | `feat/personality-full50-live-relationship-events` → `feat/worlddb-personality-runtime-bootstrap-v1` | `03a26063f9dd81aca23b6dd8e12517aa22b82bf0` | No - review | CLEAN | https://github.com/audifor/BDM/pull/123 |
| 128 | PERSON 50 · experiencias reales evolucionan personalidad y quedan guardadas en Save V4 | `feat/person-50-observed-evolution-savev4` → `feat/personality-full50-live-relationship-events` | `cdd0e1a837f3e975d3083748bf937e979330dfda` | No - review | CLEAN | https://github.com/audifor/BDM/pull/128 |
| 129 | PERSON 50 · decisiones reales del STAFF alteran personalidad con historia Save V4 | `feat/person-50-staff-advisory-lived-events` → `feat/person-50-observed-evolution-savev4` | `a59b1d15eab0e4f98789e7d94f250e02bb5eaf03` | No - review | CLEAN | https://github.com/audifor/BDM/pull/129 |
| 130 | PERSON 50 · historial de experiencias verificadas con persistencia Save V4 | `feat/person-50-evidence-journal-savev4` → `feat/personality-full50-live-relationship-events` | `53963f9d63c97b85751095cee3b1ea8865d1722c` | No - review | CLEAN | https://github.com/audifor/BDM/pull/130 |
| 131 | PERSON 2.3-I · eventos reales → evolución de 50 dimensiones → diario Save V4 | `feat/personality-experience-journal-save-v4` → `feat/personality-full50-live-relationship-events` | `7eb57d6bf2a9d4bc4b735ae36e47d8b37ac4d3e2` | No - review | CLEAN | https://github.com/audifor/BDM/pull/131 |
| 132 | PERSON 50 · STAFF profesional real activa evolución y diario Save V4 | `feat/staff-observed-personality-events-v1` → `feat/personality-experience-journal-save-v4` | `7c326cd604c59c359daeb58c240ee9eb805a3710` | No - review | CLEAN | https://github.com/audifor/BDM/pull/132 |
| 133 | PERSON 50 · firmas reales de contratos PLAYER → experiencia y Save V4 | `feat/person-50-verified-contract-signings` → `feat/staff-observed-personality-events-v1` | `cb934ac147a047aac67f4dc4f9ff1c9eb9131106` | No - review | CLEAN | https://github.com/audifor/BDM/pull/133 |
| 135 | PERSON 50 P0 · unificar recomendaciones STAFF y 76 eventos en único historial Save V4 | `feat/person50-single-ledger-76-contract-staff` → `feat/person-50-verified-contract-signings` | `02a937cfbd6c7329858ea67d9a61498d9a5c75da` | No - review | CLEAN | https://github.com/audifor/BDM/pull/135 |
| 141 | BS18 P0: Governance request responses and reuse audit | `audit/bs18-governance-reuse-20261017` → `main` | `995c77ca1e5d4978bbe17a5c7e5910a36ac3f8f8` | No - review | DIRTY | https://github.com/audifor/BDM/pull/141 |
| 143 | BS19B · Core BDM Coach Creator, WorldDB, orígenes, ambiciones y Save V4 | `feat/bs19b-user-coach-creator-p0-20261017` → `audit/bs19-human-rpg-reuse-20261017` | `f8fc276ded9f358a0459c937ac66518b52e9e11c` | Yes | CLEAN | https://github.com/audifor/BDM/pull/143 |
| 144 | BS19C P0 · Decisión vital causal con economía, memoria y Save V4 · CI PASS | `feat/bs19c-debt-life-choice-20261017` → `feat/bs19b-user-coach-creator-p0-20261017` | `417652178a2aab6d288b0f402b14885474b02956` | Yes | CLEAN | https://github.com/audifor/BDM/pull/144 |
| 145 | BS19C P1 · Evidencias PERSON50 reales, moral y Save V4 · CI PASS | `feat/bs19c-person50-evidence-bridge-20261018` → `feat/bs19c-debt-life-choice-20261017` | `649d1d000af650434bcf1303729413b6eed7985c` | Yes | CLEAN | https://github.com/audifor/BDM/pull/145 |
| 146 | BS19 × PERSON50 · 50 dimensiones y evolución real del Coach · CI PASS | `integration/bs19-person50-real-20261018` → `feat/bs19c-person50-evidence-bridge-20261018` | `77a55dd07354ddc15f65f8d174e2eb3bf2fc1f43` | Yes | CLEAN | https://github.com/audifor/BDM/pull/146 |
| 147 | BS19C P2 · Relaciones Staff, confianza y PERSON50 con hechos reales · CI PASS | `feat/bs19c-staff-trust-meeting-20261018` → `integration/bs19-person50-real-20261018` | `1b9921983e2c6b3d3774e45e8cc0b4a803829882` | Yes | CLEAN | https://github.com/audifor/BDM/pull/147 |
| 148 | BS19C P3 · Rechazos Staff, confianza y seguimiento causal · CI PASS | `feat/bs19c-staff-request-repair-20261018` → `feat/bs19c-staff-trust-meeting-20261018` | `d3cea7848f0380031778d679a9527d1b268ec3a0` | Yes | CLEAN | https://github.com/audifor/BDM/pull/148 |
| 149 | BS19C P4 · Promesas Staff, vencimiento diario, cumplimiento y consecuencias · CI PASS | `feat/bs19c-staff-promises-p4-20261018` → `feat/bs19c-staff-request-repair-20261018` | `ce30925f3a6ba1f1170378375e2a975120e51a49` | Yes | CLEAN | https://github.com/audifor/BDM/pull/149 |
| 150 | BS19C P5 · Agravios persistentes y reconciliación basada en hechos · CI PASS | `feat/bs19c-longitudinal-trust-p5-20261018` → `feat/bs19c-staff-promises-p4-20261018` | `962742868370b42b21deb9391b84e9442ae5b655` | Yes | CLEAN | https://github.com/audifor/BDM/pull/150 |
| 151 | BS19C P6 · Lobbying autónomo y decisiones sociales en BDM · CI PASS | `feat/bs19c-political-lobby-p6-20261018` → `feat/bs19c-longitudinal-trust-p5-20261018` | `26f5994de55290aeb521824a3feb9fd089eb66ad` | Yes | CLEAN | https://github.com/audifor/BDM/pull/151 |
| 152 | BS19C P7 · Política staff → cohesión → desarrollo de jugadores · CI PASS | `feat/bs19c-p7-politics-training-consequences-20261018` → `feat/bs19c-political-lobby-p6-20261018` | `8b1e84abab601bb7ffb5cac857e8cf2935079f9d` | Yes | CLEAN | https://github.com/audifor/BDM/pull/152 |
| 153 | BS19C P8 · Relaciones Coach↔Player tras entrenamiento real · CI PASS | `feat/bs19c-p8-player-feedback-20261018` → `feat/bs19c-p7-politics-training-consequences-20261018` | `b05c890f99a35b947fb59a98d4f5a758563fa6bc` | Yes | CLEAN | https://github.com/audifor/BDM/pull/153 |
| 154 | BS19 HRPG Core: motor humano comun conectado a autoridades canonicas | `integration/bs19-hrpg-core-20261018` → `feat/bs19c-p8-player-feedback-20261018` | `e3545023fbe53b9846438bfb6c106d9b8a4bf109` | Yes | CLEAN | https://github.com/audifor/BDM/pull/154 |
| 161 | docs(playable): 7 fases cerradas para BDM V1, sin subfases | `plan/playable-core-v1-20261019` → `main` | `2aa616739687877a3e7824a35633239fe3a8eba3` | No - review | UNSTABLE | https://github.com/audifor/BDM/pull/161 |
| 166 | WORLDGEN P3 · Importación de universos, términos exactos y save independiente | `feat/worlddb-universe-import-p3` → `main` | `64b20a61d4745d0b0d27f80954ab0317e82c7a02` | No - review | DIRTY | https://github.com/audifor/BDM/pull/166 |
| 173 | BDM FINAL 01 — cierre fiscal y operaciones funcionales de la carrera PBM | `release/final-01-functional` → `main` | `cdd3c5050d5946e4444660c13220abc8ac0358fe` | No - review | CLEAN | https://github.com/audifor/BDM/pull/173 |
| 174 | WorldDB 102/102: generador seguro de 98 formatos de simulación candidatos (fase 1) | `playable/worlddb-102-final-01` → `main` | `cabb4e74ab8d70980a01609e5fc7560a899fa630` | Yes | UNSTABLE | https://github.com/audifor/BDM/pull/174 |
| 175 | WorldDB global: reutilizar formatos documentados antes del fallback simulado | `feature/worlddb-global-reuse-first-01` → `playable/worlddb-102-final-01` | `af6593db616b11df4773a588be5af69145f43b16` | Yes | CLEAN | https://github.com/audifor/BDM/pull/175 |
| 176 | BDM global: compatibilidad de género en mercado, scouting, traspasos y recruiting | `feature/bdm-global-player-category-01` → `playable/worlddb-102-final-01` | `dac2d7d6b13dedc06ec351bec37f4f2d06f45f19` | Yes | CLEAN | https://github.com/audifor/BDM/pull/176 |
| 177 | Make WorldDB competition families playable | `feature/worlddb-global-playable-02` → `feature/worlddb-global-reuse-first-01` | `cdb6adeb6ce2c213d7ebccb96b4160859d57cb7c` | Yes | CLEAN | https://github.com/audifor/BDM/pull/177 |
| 178 | WorldDB: Segunda FEB (28 clubs, two groups, simulated aggregate postseason) | `feature/worlddb-segunda-feb-01` → `feature/worlddb-global-playable-02` | `a4e91df0267acd9ad28398364ddc585c162c58f6` | Yes | CLEAN | https://github.com/audifor/BDM/pull/178 |
| 179 | WorldDB: reusable simulated fixed-matrix scheduler for NBA/NBL/G League shapes | `feature/worlddb-matrix-scheduler-01` → `feature/worlddb-segunda-feb-01` | `b4bdae9c51c4182efe487a7a84459e86505b9c06` | Yes | CLEAN | https://github.com/audifor/BDM/pull/179 |
| 180 | WorldDB: NBA 82-game matrix, real East/West source identities, conference Play-In and BO7 | `feature/worlddb-nba-01` → `feature/worlddb-matrix-scheduler-01` | `a0f249088c5d3b3a9f984c3cf31cddf74ee18dd2` | Yes | CLEAN | https://github.com/audifor/BDM/pull/180 |
| 181 | WorldDB: G League 2026-27 two-phase 14+36, real regions and conferences | `feature/worlddb-gleague-two-phase-01` → `feature/worlddb-nba-01` | `b4e5840fc4b264e70f4184e7572bf210ebb3b37f` | Yes | CLEAN | https://github.com/audifor/BDM/pull/181 |
| 182 | WorldDB NCAA 2026-27: keep all 112 official ASUN games and generate uncovered schedules | `feature/worlddb-ncaa-hybrid-schedule-01` → `feature/worlddb-gleague-two-phase-01` | `3ca610dc778c737f06fe4f37bf8b25b8d3dc4768` | Yes | CLEAN | https://github.com/audifor/BDM/pull/182 |
| 183 | WorldDB NCAA 2027: simulate 64 conference tournaments and both 76-team national brackets | `feature/worlddb-ncaa-postseason-2027-01` → `feature/worlddb-ncaa-hybrid-schedule-01` | `340f761bccc3b4656a258d1b5fee3b01a7a7e088` | Yes | CLEAN | https://github.com/audifor/BDM/pull/183 |
| 184 | WorldDB: connect NCAA 2026-27 men/women to NEW GAME and daily postseason | `feature/worlddb-ncaa-daily-newgame-01` → `feature/worlddb-ncaa-postseason-2027-01` | `6feb163db9ff61625e9bbc06672a1b9c0d5633d9` | Yes | CLEAN | https://github.com/audifor/BDM/pull/184 |
| 185 | WorldDB NCAA: compile Windows EXE and package verifiable acceptance smoke | `feature/worlddb-ncaa-windows-acceptance-01` → `feature/worlddb-ncaa-daily-newgame-01` | `288658d19cf2d47230de39509c117ca84d3b9dfe` | No - review | UNSTABLE | https://github.com/audifor/BDM/pull/185 |
| 186 | New Game UX: selección de ligas por país y creación de mánager en dos pasos | `feature/newgame-two-step-league-selector-01` → `feature/worlddb-ncaa-daily-newgame-01` | `7fd7742adc26cdc47b698e5fee1aab3a301eb91d` | Yes | CLEAN | https://github.com/audifor/BDM/pull/186 |

Exact heads already present by ancestry: 24 (#143, #144, #145, #146, #147, #148, #149, #150, #151, #152, #153, #154, #174, #175, #176, #177, #178, #179, #180, #181, #182, #183, #184, #186).
Exact heads not yet contained: 25 (#62, #63, #64, #100, #109, #111, #114, #116, #117, #118, #121, #122, #123, #128, #129, #130, #131, #132, #133, #135, #141, #161, #166, #173, #185). Their separate branches and open PRs remain available on GitHub; this report does not discard or close them.

## Candidate validation

- DB-04 catalog integration test: **3/3 PASS** after changing its cold-build timeout from Vitest default 5 seconds to 120 seconds. First run took 82.8 seconds and reported two passes plus one 5-second timeout; warm rerun completed in 5 seconds.
- Market and Save V4 focused regressions: **88/88 PASS** across 6 test files (MarketEngine, free-agent contact/signing, TransferPolicy, Save V4 and round-trip).
- `npm run typecheck -- --pretty false`: PASS.
- `npm run build`: PASS; existing mixed static/dynamic import and chunk-size warnings remain.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: PASS.
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS.
- Architecture/determinism checks: zero `Math.random(` matches in `src/`; zero React, Zustand or Tauri imports in Domain/Engine; `git diff --check` PASS.
- `WorldDbGameBootstrap`, `WorldDbNewGameCatalog`, and `NcaaD1Real2027DailyNewGame` batch: INCONCLUSIVE; stopped at 180 seconds while one Node worker approached 900 MB. Vitest emitted no final summary, so no individual pass/fail is claimed for that batch.
- Full suite and New Game production scenarios (European, NBA, NCAA, NCAAW, shared world) have not been completed on this candidate. No global PASS is claimed.
- The native BDM window was launched from the F6 worktree. The app opened; the agent did not complete or visually certify New Game and signing workflows.

## Integration boundary and next work

- Candidate currently includes F0-F6/F5 ancestry represented by F6, the DB-04 read-only catalog adapter, and documentation.
- Branches whose exact refs are published but whose tips are not ancestors of the candidate remain preserved for later feature review; compare equivalent behavior before merging.
- A safe replay attempt of PR #173 stopped at conflicts in `src-tauri/resources/worlddb_v2_bridge.py`, `src/app/game/WorldDbV2Game.ts`, and `src/app/game/createConfiguredGame.ts`. The differences affect F6 multi-league/gender routing and original/free-staff/head-coach selection, so no `ours`/`theirs` resolution was chosen. The replay was aborted and the candidate worktree is clean; PR #173 remains preserved on its published branch.
- The F6 Market code from `7365013c` is preserved, but the immersive contact/people/decision/consequence UI requested for the next F6 work has not been implemented on this candidate.
- No integration conflicts remain from the DB-04 cherry-pick. No changes were made to `main`; no PR has been created while the 25 open heads and complete regression boundary remain under review.

Candidate code snapshot after the DB-04 adapter cherry-pick: `eccb26e555ca49931760d044242554572cf5a712`. A separate test-only commit `c102dcf5` raises the cold-build timeout for its CLI integration test; documentation commits follow.
