# BDM local repository inventory

Snapshot: 2026-11-02. Repository: `https://github.com/audifor/BDM`. This inventory records registered worktrees and local branch refs without changing existing worktree files.

## Snapshot

- `origin/main`: `12d926241fda7f2ba3f198083cd61fd480c2fec8`.
- F6 source: `feature/bdm-f6-final-gameplay` at `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41`; integration candidate `integration/bdm-unified-20261102` was created at that commit and later advanced with the DB-04 adapter.
- Registered worktrees: 106; existing: 65; missing/prunable: 41.
- At this inventory snapshot: 249 local branches; 246 tips reachable from an origin ref; 3 not reachable (the DB-04 source ref before its later publication and two refs containing generated saves). The pre-publication audit found 60 original local tips not reachable from origin; 59 safe tips were published and the save branch was retained locally.
- Stashes: 5; all left intact.
- Open GitHub PRs at snapshot: 49. Existing PRs and bases were left unchanged.

## Registered worktrees

| Path | Branch | HEAD | Filesystem | Worktree state |
|---|---|---|---|---|
| `C:/BDM` | `playable/f4` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | present | modified (27 porcelain entries) |
| `C:/BDM-BS-FINAL-INTEGRATION` | `integration/bs-all-final` | `ceaa45529ce23c4e94bbc2cef17d9d0d987552b6` | missing / prunable | not inspected |
| `C:/BDM-BS10` | `bdm-stage2-bs10a-market-candidate-intelligence` | `686a42770e59cb6169d3c54042dfb9bbeb8fa4c1` | missing / prunable | not inspected |
| `C:/BDM-BS10B` | `bdm-stage2-bs10b-market-feasibility-economics` | `7967acd1f2b05bab9174c3f37c94de666f8b2a95` | missing / prunable | not inspected |
| `C:/BDM-BS10C` | `bdm-stage2-bs10c-acquisition-proposal-intelligence` | `6b33227ac287374d97a7a7f1db0369c8f86903fd` | missing / prunable | not inspected |
| `C:/BDM-BS10D-A` | `bdm-stage2-bs10d-b-free-agent-contact` | `821744b27d8b686885ef373dd4e2d1f08365be0a` | missing / prunable | not inspected |
| `C:/BDM-BS10D-C` | `bdm-stage2-bs10d-c-contact-response` | `6d923da78bc67f7d47e1a8fa8b7da384d28d14c1` | missing / prunable | not inspected |
| `C:/BDM-BS10D-D` | `bdm-stage2-bs10d-f-negotiation-lifecycle` | `66d8b98088db73e6979a36704797aa9747e58a6b` | missing / prunable | not inspected |
| `C:/BDM-BS12A` | `bdm-stage2-bs12a-training-medical-convergence-audit-v2` | `282e0893e251aa0e149941cb29cfeadc19ae28c5` | missing / prunable | not inspected |
| `C:/BDM-BS12A-R` | `bdm-stage2-bs12a-main-reconciliation` | `50f487ddacf52ffee109f8fbab7807d04649091b` | missing / prunable | not inspected |
| `C:/BDM-BS12B` | `bdm-stage2-bs12b-training-ownership-load-convergence` | `b32c2a73c163e76808a2baee8fe0eece8fd4d33d` | missing / prunable | not inspected |
| `C:/BDM-BS12C` | `bdm-stage2-bs12c-medical-recovery-rtp` | `c52a21717a5973ee33d99a0df3000d405bcb9847` | missing / prunable | not inspected |
| `C:/BDM-BS14` | `bdm-stage2-bs14a-scouting-intelligence-audit` | `fb330b4f0dcee42de9f19edeed89a3f8ea125b63` | missing / prunable | not inspected |
| `C:/BDM-BS15-INTEGRATION` | `integration-bs15-final-local` | `94c077092224a9f75c861a853d9d52fceae526fe` | missing / prunable | not inspected |
| `C:/BDM-BS16-CANONICAL` | `bdm-stage2-bs16-finance-canonical` | `680d7aa25534a03f1ed10a6041be9543cb5470a8` | missing / prunable | not inspected |
| `C:/BDM-BS16-FINANCE` | `bdm-stage2-bs16-finance-strengthening` | `b5c43115b367b7627753909ba3782e74c1e3640c` | missing / prunable | not inspected |
| `C:/BDM-BS16C-BASE` | `(detached)` | `cedbb71398c4ca6dd96f8191a48d0fa4e9c31329` | missing / prunable | not inspected |
| `C:/BDM-BS17-FACILITIES` | `bdm-bs15-bs16-bs17-integration-readiness` | `4c33bec1266c645d7c0c509b228abb49263ebe88` | missing / prunable | not inspected |
| `C:/BDM-BS17-FINAL` | `bdm-stage2-bs17-global-completion` | `1559409751223f88353ff52e04a2d1444508e510` | missing / prunable | not inspected |
| `C:/BDM-BS17D-C1-ALLOCATIONS` | `bdm-stage2-bs17d-c1-physical-allocations` | `ece086779ad500833880bc47aad125f60dbc5a66` | missing / prunable | not inspected |
| `C:/BDM-BS17D-C1-CLOSURE` | `bdm-stage2-bs17d-c1-consumption-fix` | `43db0beb7da0336892ec1bda84952b6ca9a441c8` | missing / prunable | not inspected |
| `C:/BDM-BS17D-CAPACITY` | `bdm-stage2-bs17d-capacity` | `a5576a9b70552c896ef589438f21380e3234a6f2` | missing / prunable | not inspected |
| `C:/BDM-BS17D-GLOBAL-CLOSURE` | `bdm-stage2-bs17d-global-closure` | `8be14ef133dcddccf30d961bec0964a8dca69236` | missing / prunable | not inspected |
| `C:/BDM-BS17D-M1-IMPLEMENTATION` | `bdm-stage2-bs17d-m1-equipped-rehabilitation` | `65c2b2cdec4ec05f6d925a9e312c18d531824ebf` | missing / prunable | not inspected |
| `C:/BDM-BS17D-MEDICAL` | `bdm-stage2-bs17d-m1-specialized-medical` | `a5c04bcf64cf74bc06e8fd2d5874313c0edb028f` | missing / prunable | not inspected |
| `C:/BDM-BS17D-T1-RECRUITING` | `bdm-stage2-bs17d-t1-recruiting-facilities` | `582f517e178ae8a7159237fd3d75e2db4c9d8f87` | missing / prunable | not inspected |
| `C:/BDM-BS17D-TALENT-FACILITIES` | `bdm-stage2-bs17d-talent-facilities` | `64abd26a50e93fd827f27dccabaa486e0e73dd04` | missing / prunable | not inspected |
| `C:/BDM-BS17E-A` | `bdm-stage2-bs17e-a-maintenance-repair` | `fdeaf817f207a5fd23a2fedc45566f7334515484` | missing / prunable | not inspected |
| `C:/BDM-BS17E-P2-CONTRACTS` | `bdm-stage2-bs17e-p2-cost-governance-contracts` | `dc63d604723e81c7f09416ce8364efb67b88648f` | missing / prunable | not inspected |
| `C:/BDM-BS17E-POLICY` | `bdm-stage2-bs17e-policy-contract` | `9469478380f84a4e10432ba2d662a92204f987b6` | missing / prunable | not inspected |
| `C:/BDM-BS17E-READINESS` | `bdm-stage2-bs17e0-financial-readiness` | `cfa13c4b3808f24949620e8343615540acb1a671` | missing / prunable | not inspected |
| `C:/BDM-BS9` | `bdm-stage2-bs9e-b-planning-lifecycle-observability` | `719363fd04aac1c7428ea5a87654676bc68e70d6` | missing / prunable | not inspected |
| `C:/BDM-BT45-BASE` | `(detached)` | `66b7625ce0ee99bfb2a39cb32a5a881f016ca12b` | present | modified (1 porcelain entries) |
| `C:/BDM-BT6-BASE` | `(detached)` | `491a8779d5b26fd2c46f296b64c79549f33d3608` | present | modified (3 porcelain entries) |
| `C:/BDM-CAPABILITY-AUDIT` | `bdm-master-capability-reuse-audit` | `67811994e48137ec77579ae3dcaa273e8a680c37` | present | clean |
| `C:/BDM-CORE-ORG1` | `core-org1-canonical-organization-runtime` | `975d77a61a914a5c3b6bb622e68cd07c073dd496` | missing / prunable | not inspected |
| `C:/BDM-COURTSIDE` | `feat/bdm-ui-courtside` | `b7cf64402ee27311fdf24e67d83d3cc4aecd22f3` | present | modified (1 porcelain entries) |
| `C:/BDM-COURTSIDE-CANONICAL` | `integration/courtside-canonical-20261019` | `55abae9392931a4efbe1d501c39e0c9a3b3857ed` | present | clean |
| `C:/BDM-hrpg-baseline` | `(detached)` | `b05c890f99a35b947fb59a98d4f5a758563fa6bc` | present | clean |
| `C:/BDM-hrpg-core` | `integration/bs19-hrpg-core-20261018` | `e3545023fbe53b9846438bfb6c106d9b8a4bf109` | present | clean |
| `C:/BDM-INTEGRATION` | `bdm-integration-pre-bs12` | `2a3ab1c074c0473a641d1bc8fb7d1f70dacfbab6` | present | clean |
| `C:/BDM-INTEGRATION-BS15-BS16-BS17` | `integration/bs15-bs16-bs17-certified` | `fbe788ce01f1dd34fc40b360b4661ebaad63457c` | missing / prunable | not inspected |
| `C:/BDM-INTEGRATION-BS15-BS16-BS17-V3` | `integration/bs15-bs16-bs17-final-v3` | `8be14ef133dcddccf30d961bec0964a8dca69236` | present | clean |
| `C:/BDM-INTEGRATION-BS15-BS16-BS17-V3-1` | `integration/bs15-bs16-bs17-final-v3-1` | `67c61edc77198ca87579108379e41ab5bd1a1bc4` | present | clean |
| `C:/BDM-INTEGRATION-BS17D` | `integration/bs17d-talent-consolidated` | `eb12f9670b2c99a6cf3c8ddef0ae2d73fd5e78c9` | present | clean |
| `C:/BDM-MAIN-BASELINE-20261019` | `(detached)` | `159c888b60b461306342bad0af6039f327729479` | present | clean |
| `C:/BDM-MATCH-PHASER` | `match-basketball-truth-bt1` | `95b5aad2d7a8a59096e73ad00dd1e7a722d56950` | present | clean |
| `C:/BDM-ME-NEXT-0` | `matchengine-next-0-foundation` | `7a2eea34c5a77314d98157742c067e5e58e2c14b` | present | clean |
| `C:/BDM-ME-NEXT-1` | `matchengine-next-1-ball-possession` | `ee38b9282ffb63f78942a2ea01e262d4541651a9` | present | clean |
| `C:/BDM-ME-NEXT-2` | `matchengine-next-2-movement-offensive-structure` | `fcb0eaec41448ce31eb7baa55b7794a26e295651` | present | clean |
| `C:/BDM-ME-NEXT-3` | `matchengine-next-3-man-defense` | `aa59209f775b7f0ce148727f47a5029de96390ce` | present | clean |
| `C:/BDM-ME-NEXT-4` | `matchengine-next-4-actions-decisions` | `811df6cefbbd8833ea6914052eb4ff726b487ab7` | present | clean |
| `C:/BDM-ME-NEXT-5` | `matchengine-next-5-transition-rebounding` | `dfe80e09948d87f2a83c124d7a0bf2262e100952` | present | clean |
| `C:/BDM-ME-NEXT-6` | `bdm-stage2-bs11a-contract-roster-planning-audit` | `32493210db55a30a94a4cefb65bf2aadf5f4dd41` | present | modified (13 porcelain entries) |
| `C:/BDM-ME-NEXT-6-bs11b-stage` | `bdm-stage2-bs11b-contract-review-decisions` | `34dc2abcc5ffeec3e16a6c4160d6d3f236d52c56` | present | clean |
| `C:/BDM-MG8A` | `matchengine-v3-mg8a-defensive-authority-foundation` | `715efd33316e9727de17210ec08e97f522ac90b3` | present | clean |
| `C:/BDM-MG8B` | `matchengine-v3-mg8b-on-ball-defense-containment` | `617712dee5e48363320d5ec47ed9d3e1ef14525d` | missing / prunable | not inspected |
| `C:/BDM-MG8C` | `matchengine-v3-mg8c-spatial-intent-arbitration` | `0e4d1ee9aa8dc7300a983ff62828a6d0ad411712` | missing / prunable | not inspected |
| `C:/BDM-NEXT-BT2` | `match-next-basketball-core-bt2` | `e8254eb7be9585464b97937fb545cb04e1fa3611` | present | clean |
| `C:/BDM-NEXT-TRUTH` | `world-sim-wsr2-1-daily-result-batching` | `11b0d3bcd46f59dfcc205d5d192ece271a9ec548` | present | modified (1 porcelain entries) |
| `C:/BDM-P0E-GAME-BRIDGE` | `(detached)` | `aa9fbd6f7c95d95bac9e9203f670ea0f966b77d2` | missing / prunable | not inspected |
| `C:/BDM-PLAYABLE-F0` | `playable/f0` | `5667fd7839e50d6973ede46de1a4ac404abd991d` | missing / prunable | not inspected |
| `C:/BDM-PLAYER` | `(detached)` | `8361def5eb639a5012e8be80facee1b1683b153f` | missing / prunable | not inspected |
| `C:/BDM-PRE-MG8B` | `matchengine-v3-pre-mg8b-playback-timescale` | `18ee584041e1e7cf16692e392562a261733c592c` | present | clean |
| `C:/BDM-ROSTER-V4` | `feat/bdm-ui-roster-v4` | `227ed626f3f3e7f276fb336be808b6198d157205` | missing / prunable | not inspected |
| `C:/BDM-STAGE2` | `matchengine-next-7-match-center-feature-parity` | `38f17a7a5086f323d7cc44a630b2bd9a3eee41f2` | present | clean |
| `C:/BDM-STRENGTHENING` | `bdm-strengthening-bs4-self-healing-world` | `e7d8e67cdb8196a30ef345c2af332cbe7069320a` | present | clean |
| `C:/BDM-UI-HOME` | `(detached)` | `769477e253c95ae3dd6a7a2a0117d4fe1cde6117` | missing / prunable | not inspected |
| `C:/BDM-vp-wt` | `docs/visual-proposal-courtside` | `ea93dc38ba5bd24ed2f55de2b6265c25b77c954e` | present | clean |
| `C:/BDM-WDB2-1-1` | `wdb2-1-1-game-start-date` | `7b11bda5f3fb7d3ce6aec3c44e0c0243221b5a73` | present | clean |
| `C:/BDM-WDB2-1-2` | `wdb2-1-2-first-playable` | `a90ce8db0bb37f288bbdc8dcc1fa6ac37473a108` | present | clean |
| `C:/BDM-worktrees/bdm-f6-final-gameplay` | `feature/bdm-f6-final-gameplay` | `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41` | present | clean |
| `C:/BDM-worktrees/career-f0b-autonomous-club` | `feature/career-f0b-autonomous-club` | `5a0afcfad6f6d821bb6b0e6f989facc81b27a0ad` | present | clean |
| `C:/BDM-worktrees/career-f1-arrival` | `feature/career-f1-arrival` | `a6d8e7a7d32c3424c289ed1d541c88c4ae343fdf` | present | clean |
| `C:/BDM-worktrees/career-f2-director-hub` | `feature/career-f2-director-hub` | `a00b0d53f67f5b0378d234fc6ebaf9b7a3979ba5` | present | clean |
| `C:/BDM-worktrees/career-f3-1-integration-closure` | `feature/career-f3-1-integration-closure` | `bbf51a3a5ae1a59b945aa35f0a85f44ccc87a34f` | present | clean |
| `C:/BDM-worktrees/career-f3-human-experience` | `feature/career-f3-human-experience` | `a214d68aaa66f37323ba454f348b2237d3a162ed` | present | clean |
| `C:/BDM-worktrees/career-f4a-ecosystem-routing` | `feature/career-f4a-ecosystem-routing` | `f0754beaaaeaeeb2b2654620a573b750f96b040e` | present | clean |
| `C:/BDM-worktrees/career-f4b-sporting-operations` | `feature/career-f4b-sporting-operations` | `a399115cf0d0b4ccd4f24c11fa253064ee2e9400` | present | clean |
| `C:/BDM-worktrees/career-f4c-unified` | `feature/career-f4c-unified-world` | `f17f325175f6fc33b4e1f37e9baa2a47f9914106` | present | clean |
| `C:/BDM-worktrees/career-f5-complete` | `feature/career-f5-complete` | `4366b19df8646bce70ae9c159f737c49d1bb402f` | present | clean |
| `C:/BDM-worktrees/final-01` | `release/final-01-functional` | `cdd3c5050d5946e4444660c13220abc8ac0358fe` | present | modified (17 porcelain entries) |
| `C:/BDM-worktrees/integration-bdm-unified-20261102` | `integration/bdm-unified-20261102` | `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41` | present | clean |
| `C:/BDM-worktrees/leagues-final-01` | `playable/worlddb-102-final-01` | `cabb4e74ab8d70980a01609e5fc7560a899fa630` | present | clean |
| `C:/BDM-worktrees/newgame-preview-186` | `codex/newgame-preview-186` | `3e915511ea41891aded33a4e9a7fb3b048613906` | present | modified (6 porcelain entries) |
| `C:/BDM-worktrees/safe-worlddb-correct` | `backup/safe/worlddb-universe-v1-final` | `4ca1505fc129bf162ca960a7b0374883d0f38ded` | present | clean |
| `C:/BDM-worktrees/safe-worlddb-source` | `backup/safe-source/worlddb-universe-v1-20261102` | `853d1dbed19ce08f9795d68d3390846a706c822e` | present | clean |
| `C:/BDM-worktrees/safe-worlddb-universe-v1` | `backup/safe/worlddb-universe-v1` | `e049494446f42e47357417955505cb39aea30c3f` | present | clean |
| `C:/BDM-worktrees/worktreesleagues-final-01` | `feature/worlddb-global-playable-02` | `cdb6adeb6ce2c213d7ebccb96b4160859d57cb7c` | present | modified (1 porcelain entries) |
| `C:/BDM-worktrees/worlddb-global-astra` | `feature/worlddb-global-astra-01` | `af6593db616b11df4773a588be5af69145f43b16` | present | clean |
| `C:/BDM-worktrees/worlddb-suite-2064b744` | `(detached)` | `2064b744179b8e7bd7deed8d154edd4c1088e592` | present | modified (1 porcelain entries) |
| `C:/BDM-worktrees/worlddb-suite-a18ed35d` | `(detached)` | `a18ed35ddf1da71546449f4bb15900455e9b4f83` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-01` | `playable/worlddb-v2-01` | `0158086c17a2690a341ae5a7b51101b1ed4548c2` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-02` | `playable/worlddb-v2-02` | `3dc82d122ee162dbb2ef5a03bf44d64b676c111e` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-03` | `playable/worlddb-v2-03` | `bbe219700984136d2fd8144d3692b4cd81b69a1c` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-04` | `playable/worlddb-v2-04` | `64c8de7ad9a1c53b480849a4d71cd94e87a8d3c4` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-05` | `playable/worlddb-v2-05` | `64849345f3c1629d9148db28246cf3820a3d47fc` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-06` | `playable/worlddb-v2-06` | `75c87ee535f981b914cf2852eebba8c6be85e1ab` | present | clean |
| `C:/BDM-worktrees/worlddb-v2-baseline` | `(detached)` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | present | clean |
| `C:/BDM_DB/worktrees/bdm-worlddb-p3` | `feat/worlddb-universe-import-p3` | `64b20a61d4745d0b0d27f80954ab0317e82c7a02` | present | clean |
| `C:/BDM_DB/worktrees/db05-compat-20261025` | `(detached)` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | present | modified (1 porcelain entries) |
| `C:/BDM_DB/worktrees/db06-read-adapter` | `(detached)` | `e8e840560d9ba9c4803e478d18ceb84c857cd753` | present | clean |
| `C:/BDM_DB/worktrees/db08-acb-ranking` | `(detached)` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | present | modified (5 porcelain entries) |
| `C:/BDM_DB/worktrees/db09-pbm-universe` | `(detached)` | `e8e840560d9ba9c4803e478d18ceb84c857cd753` | present | modified (1 porcelain entries) |
| `C:/BDM_DB/worktrees/worlddb-universe-v1` | `feat/worlddb-universe-v1` | `c8099445df2affd8b0c7a28aa3a55e60974a8439` | present | clean |
| `C:/Temp/bdm-f4/main-baseline` | `(detached)` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | missing / prunable | not inspected |

## Local branch refs

`In candidate` indicates the branch tip is an ancestor of F6 integration candidate. Worktree state is based on the registered checkout when one exists; branches without a checkout are marked accordingly.

| System / branch | HEAD | On origin ref | In candidate | Associated worktree | Tip subject | Destination / decision |
|---|---|---:|---:|---|---|---|
| Other / `backup/m7-local-wip-before-main-sync` | `456cf11d7deba6de2a23437b34da3e9139eabde6` | Yes | No | not checked out | wip: preserve local tactics changes before main sync | remote already contains tip |
| WorldDB / playable / `backup/safe-source/worlddb-universe-v1-20261102` | `853d1dbed19ce08f9795d68d3390846a706c822e` | No | No | clean | feat(worlddb): add read-only PBM DB04 catalog adapter | published later under backup/local-preservation-20261102/feature/worlddb-db04-catalog-adapter-source |
| WorldDB / playable / `backup/safe/worlddb-universe-v1` | `e049494446f42e47357417955505cb39aea30c3f` | No | No | clean | feat(worlddb): add PBM universe without generated outputs | local only; history includes generated save outputs |
| WorldDB / playable / `backup/safe/worlddb-universe-v1-final` | `4ca1505fc129bf162ca960a7b0374883d0f38ded` | Yes | No | clean | feat(worlddb): build PBM universe without generated outputs | remote already contains tip |
| Management systems / `bdm-bs15-bs16-bs17-integration-readiness` | `4c33bec1266c645d7c0c509b228abb49263ebe88` | Yes | No | missing | docs(integration): assess BS15 BS16 BS17 convergence | remote already contains tip |
| Management systems / `bdm-integration-pre-bs12` | `2a3ab1c074c0473a641d1bc8fb7d1f70dacfbab6` | Yes | Yes | clean | Integrate approved non-MatchEngine work before BS12 | remote already contains tip |
| Other / `bdm-master-capability-reuse-audit` | `67811994e48137ec77579ae3dcaa273e8a680c37` | Yes | No | clean | docs(strengthening): establish master BDM capability registry | remote already contains tip |
| Other / `bdm-os-ng` | `adbebbaea7c4363043c1138b4b5d57515e390b1f` | Yes | Yes | not checked out | Merge origin/main into bdm-os-ng to absorb governance and staff politics waves. | remote already contains tip |
| Management systems / `bdm-stage2-bs10-market-closure` | `9de9948d69ab70135913c7337dd431ee9d107ad6` | Yes | No | not checked out | docs(strengthening): archive reviewed bs10 market closure | remote already contains tip |
| Management systems / `bdm-stage2-bs10a-market-candidate-intelligence` | `686a42770e59cb6169d3c54042dfb9bbeb8fa4c1` | Yes | No | missing | docs(strengthening): archive reviewed BS10A market intelligence | remote already contains tip |
| Management systems / `bdm-stage2-bs10b-market-feasibility-economics` | `7967acd1f2b05bab9174c3f37c94de666f8b2a95` | Yes | No | missing | docs(strengthening): archive reviewed BS10B market feasibility | remote already contains tip |
| Management systems / `bdm-stage2-bs10c-acquisition-proposal-intelligence` | `6b33227ac287374d97a7a7f1db0369c8f86903fd` | Yes | No | missing | docs(strengthening): archive reviewed BS10C acquisition proposals | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-a-free-agent-offer-authorization` | `3e95630b26bc8cfce13d672a49c2aa3d8eaac10f` | Yes | No | not checked out | docs(strengthening): archive reviewed BS10D-A offer authorization | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-a2-negotiation-preconditions` | `587ee3a1b97ff24be7662fb4cac5429acd383887` | Yes | No | not checked out | docs(strengthening): archive reviewed negotiation preconditions | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-a3-contact-authority` | `c019390b4ffc0526b85f29f184ab42ef085a5363` | Yes | No | not checked out | docs(strengthening): archive reviewed contact authority | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-b-free-agent-contact` | `821744b27d8b686885ef373dd4e2d1f08365be0a` | Yes | No | missing | docs(strengthening): archive reviewed free agent contact | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-c-contact-response` | `6d923da78bc67f7d47e1a8fa8b7da384d28d14c1` | Yes | No | missing | docs(strengthening): archive reviewed contact response | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-d-formal-offer-preparation` | `bc6b53e17460ca55d9a432d1223c90039c9cf81e` | Yes | No | not checked out | docs(strengthening): archive reviewed formal offer preparation | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-d2-offer-semantics-authority` | `9a74448a61b626c2444ba609bd2bae36f7b0ca3c` | Yes | No | not checked out | docs(strengthening): archive reviewed formal offer semantics | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-e-formal-offer-submission` | `64c0954df401bcaa3db517298cf0ff194525a37a` | Yes | No | not checked out | docs(strengthening): archive reviewed formal offer submission | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-f-negotiation-lifecycle` | `66d8b98088db73e6979a36704797aa9747e58a6b` | Yes | No | missing | feat(strengthening): complete free agent negotiation responses | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-g-authorized-signing` | `9b82033984d5b36430e9330e93cbe93b3c4d2dd1` | Yes | No | not checked out | docs(strengthening): archive reviewed authorized signing | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-h-signing-governance-workflow` | `383d7e84993f34d92047acdfbbb1d2e3f4a6e199` | Yes | No | not checked out | docs(strengthening): archive reviewed signing governance workflow | remote already contains tip |
| Management systems / `bdm-stage2-bs10d-i-free-agent-convergence` | `ca407ef307a18a12a668c4766ec0ffad043ca87b` | Yes | No | not checked out | docs(strengthening): archive reviewed free agent convergence | remote already contains tip |
| Management systems / `bdm-stage2-bs10e-a-trade-canon-package-audit` | `ec2cc6aa40c1319738006ff706be6d54ea8c953f` | Yes | No | not checked out | docs(strengthening): archive reviewed trade package intelligence | remote already contains tip |
| Management systems / `bdm-stage2-bs10e-b-trade-execution-foundation` | `362c7460ad8bc8e8c7bd2d5158efac8dd942665c` | Yes | No | not checked out | docs(strengthening): archive reviewed trade execution foundation | remote already contains tip |
| Management systems / `bdm-stage2-bs10e-c-trade-negotiation` | `cc4f5fa75eedfbb60dc620f3542a5e1450743251` | Yes | No | not checked out | docs(strengthening): archive reviewed trade negotiation | remote already contains tip |
| Management systems / `bdm-stage2-bs10e-d-trade-governance-execution` | `b3de0dfc8e85d6f5339f80f48da892be99058852` | Yes | No | not checked out | docs(strengthening): archive reviewed trade governance execution | remote already contains tip |
| Management systems / `bdm-stage2-bs11a-contract-roster-planning-audit` | `32493210db55a30a94a4cefb65bf2aadf5f4dd41` | Yes | No | dirty (13) | feat(strengthening): establish contract roster planning intelligence | remote already contains tip |
| Management systems / `bdm-stage2-bs11b-contract-review-decisions` | `34dc2abcc5ffeec3e16a6c4160d6d3f236d52c56` | Yes | No | clean | feat(strengthening): add contract review decision lifecycle | remote already contains tip |
| Management systems / `bdm-stage2-bs12a-main-reconciliation` | `50f487ddacf52ffee109f8fbab7807d04649091b` | Yes | Yes | missing | docs(strengthening): reconcile bs12 audit with canonical main | remote already contains tip |
| Management systems / `bdm-stage2-bs12a-training-medical-convergence-audit-v2` | `282e0893e251aa0e149941cb29cfeadc19ae28c5` | Yes | Yes | missing | docs: record successful pre-BS12 push | remote already contains tip |
| Management systems / `bdm-stage2-bs12b-training-ownership-load-convergence` | `b32c2a73c163e76808a2baee8fe0eece8fd4d33d` | Yes | Yes | missing | feat(training): add ai planning and load convergence | remote already contains tip |
| Management systems / `bdm-stage2-bs12c-medical-recovery-rtp` | `c52a21717a5973ee33d99a0df3000d405bcb9847` | Yes | Yes | missing | feat(medical): add recovery and return-to-play lifecycle | remote already contains tip |
| Management systems / `bdm-stage2-bs14a-scouting-intelligence-audit` | `fb330b4f0dcee42de9f19edeed89a3f8ea125b63` | Yes | No | missing | docs(strengthening): complete scouting intelligence audit | remote already contains tip |
| Management systems / `bdm-stage2-bs16-finance-canonical` | `680d7aa25534a03f1ed10a6041be9543cb5470a8` | Yes | Yes | missing | docs(finance): close BS16 global finance program | remote already contains tip |
| Management systems / `bdm-stage2-bs16-finance-strengthening` | `b5c43115b367b7627753909ba3782e74c1e3640c` | Yes | No | missing | test(finance): certify decision authority and reservation safety | remote already contains tip |
| Management systems / `bdm-stage2-bs17-global-completion` | `1559409751223f88353ff52e04a2d1444508e510` | Yes | Yes | missing | docs(strengthening): BS17 global completion certification | remote already contains tip |
| Management systems / `bdm-stage2-bs17a-facilities-audit` | `8847045efb04313ff39c0f7d10119b167d1242bb` | Yes | Yes | not checked out | docs(facilities): close BS17A system truth audit | remote already contains tip |
| Management systems / `bdm-stage2-bs17b-facilities-provisioning` | `9158d0272763759a12078ba301022bd934ff4507` | Yes | Yes | not checked out | feat(facilities): certify source-backed physical existence | remote already contains tip |
| Management systems / `bdm-stage2-bs17c-physical-operations` | `aa6a061d7ad5f905f0677936995e7adadc7ea2a3` | Yes | Yes | not checked out | fix(facilities): certify physical operations and availability | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-c1-consumption-fix` | `43db0beb7da0336892ec1bda84952b6ca9a441c8` | Yes | Yes | missing | fix(training): enforce confirmed physical occupancy | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-c1-physical-allocations` | `ece086779ad500833880bc47aad125f60dbc5a66` | Yes | Yes | missing | feat(facilities): enforce physical training reservations | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-capacity` | `a5576a9b70552c896ef589438f21380e3234a6f2` | Yes | Yes | missing | feat(facilities): project capacity and shared training evidence | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-global-closure` | `8be14ef133dcddccf30d961bec0964a8dca69236` | Yes | Yes | missing | docs(strengthening): audit BS17D global closure | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-m1-equipped-rehabilitation` | `65c2b2cdec4ec05f6d925a9e312c18d531824ebf` | Yes | Yes | missing | feat(medical): integrate equipped rehabilitation with facilities | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-m1-specialized-medical` | `a5c04bcf64cf74bc06e8fd2d5874313c0edb028f` | Yes | Yes | missing | docs(medical): record BS17D-M1 clinical policy blockers | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-medical-closure` | `6945cb90604bd349edd9d2333aa7d1861e9a311a` | Yes | Yes | not checked out | test(medical): certify physical operation boundaries | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-sporting-consequences` | `db2c117b845e708c21dc5e805d2949842dcd1fc6` | Yes | Yes | not checked out | feat(facilities): enforce approved sporting operation constraints | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-t1-recruiting-facilities` | `582f517e178ae8a7159237fd3d75e2db4c9d8f87` | Yes | Yes | missing | feat(recruiting): add optional canonical facility demonstrations | remote already contains tip |
| Management systems / `bdm-stage2-bs17d-talent-facilities` | `64abd26a50e93fd827f27dccabaa486e0e73dd04` | Yes | Yes | missing | feat(talent): expose youth facilities context and certify shared training | remote already contains tip |
| Management systems / `bdm-stage2-bs17e-a-maintenance-repair` | `fdeaf817f207a5fd23a2fedc45566f7334515484` | Yes | Yes | missing | feat(facilities): BS17E-A authorized maintenance and repair economic gameplay | remote already contains tip |
| Management systems / `bdm-stage2-bs17e-p2-cost-governance-contracts` | `dc63d604723e81c7f09416ce8364efb67b88648f` | Yes | Yes | missing | docs(strengthening): ratify BS17E-P2 V1 principles | remote already contains tip |
| Management systems / `bdm-stage2-bs17e-policy-contract` | `9469478380f84a4e10432ba2d662a92204f987b6` | Yes | Yes | missing | docs(strengthening): ratify BS17E-P V1 principles | remote already contains tip |
| Management systems / `bdm-stage2-bs17e0-financial-readiness` | `cfa13c4b3808f24949620e8343615540acb1a671` | Yes | Yes | missing | docs(strengthening): audit BS17E financial readiness | remote already contains tip |
| Management systems / `bdm-stage2-bs5-player-dynamic-state` | `b0cc5916293c621c99c7c5efee27d3ea8b2a96ad` | Yes | Yes | not checked out | feat(strengthening): connect player dynamic state across matches | remote already contains tip |
| Management systems / `bdm-stage2-bs8-coach-rotation-ai` | `811e8d87390b2cb34b49e9cb84a0b51f40ffe433` | Yes | Yes | not checked out | docs(strengthening): archive reviewed BS8 coach rotation | remote already contains tip |
| Management systems / `bdm-stage2-bs9a-club-strategic-state` | `a54f8d0d763a6553d8d3e78d9d54960f0251dcf7` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9A strategy | remote already contains tip |
| Management systems / `bdm-stage2-bs9b-club-needs` | `9df28639585548f9e24a9e58ca319e09e4288879` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9B club needs | remote already contains tip |
| Management systems / `bdm-stage2-bs9c-gm-decision-context` | `a4bfee3efffa1db8e3dd2a2db84a260916cec8a6` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9C decision context | remote already contains tip |
| Management systems / `bdm-stage2-bs9d-a-selection-safety` | `c146987bed51556cbf4e93d617b8b48970cdc207` | Yes | No | not checked out | fix(strengthening): establish safe GM selection boundaries | remote already contains tip |
| Management systems / `bdm-stage2-bs9d-a2-plan-execution-boundary` | `281dcffe7dd05e6d2f85d6a0e2c28f5b32a6648c` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9D selection safety | remote already contains tip |
| Management systems / `bdm-stage2-bs9d-b-ai-option-selection` | `bec1dc154e87aa9ef6c2dbf1c66532a8e21a8b9d` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9D GM planning | remote already contains tip |
| Management systems / `bdm-stage2-bs9e-a-gm-workflow-orchestration` | `e0dc1916d97d498eca3f7b5ebb0cf4cbe92a84b2` | Yes | No | not checked out | docs(strengthening): archive reviewed BS9E workflow routing | remote already contains tip |
| Management systems / `bdm-stage2-bs9e-b-planning-lifecycle-observability` | `719363fd04aac1c7428ea5a87654676bc68e70d6` | Yes | No | missing | docs(strengthening): archive reviewed BS9 planning lifecycle | remote already contains tip |
| Other / `bdm-stage2-feature-completion` | `f66f78a0767dfb7efd5aa05417c340516cfe17b7` | Yes | Yes | not checked out | Merge commit '0062d780b30811c33d9692037c0f9e92f0d4fc96' into bdm-stage2-feature-completion | remote already contains tip |
| Management systems / `bdm-strengthening-bs0-game-loop-audit` | `34e9b6925be30aca8d591eb182c259ef5642801b` | Yes | Yes | not checked out | docs(strengthening): audit BDM gameplay manifestation and lifecycle | remote already contains tip |
| Management systems / `bdm-strengthening-bs1-world-lifecycle` | `0a9192ddbb6878285ea0d1305ac1427a5a43624c` | Yes | Yes | not checked out | fix(strengthening): preserve canonical BS1 lifecycle order | remote already contains tip |
| Management systems / `bdm-strengthening-bs2-breakpoint-engine` | `8f27d6033b2ab7289134f4826e742af33aba6e1f` | Yes | Yes | not checked out | fix(strengthening): avoid unresolvable simulation breakpoints | remote already contains tip |
| Management systems / `bdm-strengthening-bs3-season-lifecycle` | `b34a711146b76f2e41960acdf926aff60d5dbf10` | Yes | Yes | not checked out | fix(strengthening): complete linked cup season lifecycle | remote already contains tip |
| Management systems / `bdm-strengthening-bs4-self-healing-world` | `e7d8e67cdb8196a30ef345c2af332cbe7069320a` | Yes | Yes | clean | docs(strengthening): clarify BS4 lineup repair authority | remote already contains tip |
| Other / `bg8-base-integrate-bg7-core-org1` | `3035eaf679fe74b6deda669e07c3dc408f11a17e` | Yes | Yes | not checked out | Merge commit '8ad0a62a86f3b398acafbe21a952026a801592a6' into bg8-base-integrate-bg7-core-org1 | remote already contains tip |
| Management systems / `board-club-governance-v2-bg1-governance-domain-foundation` | `ff4ed759f6cc49c1cf6583022909dc81855bb47a` | Yes | Yes | not checked out | Board / Club Governance V2 - BG1: Governance Domain Foundation | remote already contains tip |
| Management systems / `board-club-governance-v2-bg2-board-objectives-expectations` | `8db236ece99aaa5a08851318e9fc60fc19adf1b0` | Yes | Yes | not checked out | Board / Club Governance V2 - BG2: Board Objectives & Expectations | remote already contains tip |
| Management systems / `board-club-governance-v2-bg3-manager-evaluation-job-security` | `dce1e32420b86d2ecb3ede52ae83f5f863630a19` | Yes | Yes | not checked out | NG-018 Update workspace navigation tests for Home default | remote already contains tip |
| Management systems / `board-club-governance-v2-bg4-governance-decisions-decision-rights` | `5a04400d9d4ef9648bd891f76d3639f24a3bb431` | Yes | Yes | not checked out | Update BDM workspace dashboards and staff flows | remote already contains tip |
| Management systems / `board-club-governance-v2-bg5-board-meetings-requests-commitments` | `a55241d55593acae4322f2ca40dda9b0b3dc9783` | Yes | Yes | not checked out | Merge remote-tracking branch 'origin/main' into board-club-governance-v2-bg5-board-meetings-requests-commitments | remote already contains tip |
| Management systems / `board-club-governance-v2-bg6a-universe-profile-foundation` | `7d95df7906c0ad8dd268cfd3e97acc568a7d57c0` | Yes | Yes | not checked out | feat(governance): add BG6A universe governance profiles | remote already contains tip |
| Management systems / `board-club-governance-v2-bg6b-institutional-structure-defaults` | `9da0296946e19ebcdbecd3c99183a0d619ee795c` | Yes | Yes | not checked out | feat(governance): add profile-driven institutional structures | remote already contains tip |
| Management systems / `board-club-governance-v2-bg6c-structure-instantiation-variants` | `0b93f95d992e6f81a7b412f1c8097dd3c7907d85` | Yes | Yes | not checked out | feat(governance): add explicit institutional structure instantiation | remote already contains tip |
| Management systems / `board-club-governance-v2-bg6d-resolution-final-certification` | `187130fed80dc5bb81f6e0c9382da13dc557db6e` | Yes | Yes | not checked out | feat(governance): add institutional structure resolution | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7a-donor-booster-collective-foundation` | `b8e784b8c77eda741a9574b96c9c752319777886` | Yes | Yes | not checked out | feat(governance): add donor booster and NIL collective foundation | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7b-funding-contribution-flows` | `b9e1dc5c280a2c138114c72f1fb24bb8f5be4044` | Yes | Yes | not checked out | feat(governance): add canonical supporter funding ledger | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7c-nil-collective-governance` | `7bb15edafa0cbec051acfcd31ecc80595c1937dd` | Yes | Yes | not checked out | feat(governance): add NIL collective institutional governance | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7d-influence-pressure-expectations` | `31e31d6f73df68500ec96b0e810088cefb227fac` | Yes | Yes | not checked out | feat(governance): add supporter influence pressure and expectations | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7e-compliance-conflicts-consequences` | `8ad0a62a86f3b398acafbe21a952026a801592a6` | Yes | Yes | not checked out | feat(governance): add supporter compliance conflicts and consequences | remote already contains tip |
| Management systems / `board-club-governance-v2-bg7f-final-integration-certification` | `8ad0a62a86f3b398acafbe21a952026a801592a6` | Yes | Yes | not checked out | feat(governance): add supporter compliance conflicts and consequences | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8a-ownership-control-foundation` | `8ad0a62a86f3b398acafbe21a952026a801592a6` | Yes | Yes | not checked out | feat(governance): add supporter compliance conflicts and consequences | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8a-ownership-control-foundation-v2` | `56cf16a80b254b2c112fe6940d6815859a324e49` | Yes | Yes | not checked out | feat(governance): add BG8A ownership and control foundation | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8b-ownership-transactions-approval` | `70fe0e3792684d6c7e26c9995ba1cd13054c7a62` | Yes | Yes | not checked out | feat(governance): add ownership transactions and approval workflow | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8c-investment-capital-investor-search` | `c8b9e8db3d736777afb0c0156eaaa1eb3656f528` | Yes | Yes | not checked out | feat(governance): add investor interest and equity capital workflow | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8d-multi-club-ownership-conflicts` | `f3629cbbe3e395bf82711ea8fd4c9a19899b3dc2` | Yes | Yes | not checked out | feat(governance): add multi-club ownership conflict engine | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8e-structural-regulatory-change` | `77a36d9d2adef3cc2295110003cea6eba7c67a71` | Yes | Yes | not checked out | feat(governance): add structural and regulatory change foundation | remote already contains tip |
| Management systems / `board-club-governance-v2-bg8f-final-integration-certification` | `1fff9a507f2d22ae527554ae894146d9e2788812` | Yes | Yes | not checked out | test(governance): certify final integration | remote already contains tip |
| HRPG / people / `canonical-human-runtime-v1` | `bfd5e0c55ae6c2e971c29c2c3499082c9717495b` | Yes | No | not checked out | feat(player): rework player workspace | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi1-domain-foundation` | `5470ac2f980deb05908b331a3cf70921c690c9bd` | Yes | Yes | not checked out | docs(facilities): add CFI1 certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi2-ownership-access-rights` | `ada39e76072a43c558aea62bf45ae6507f4f8a2a` | Yes | Yes | not checked out | docs(facilities): record CFI2 final commit SHAs in certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi2s-save-persistence` | `a5365e1d77eabdbc0f593a29fcffb97a4734979c` | Yes | Yes | not checked out | docs(facilities): record CFI2S final commit SHA in certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi3-anatomy-capabilities` | `9eeea5a1c6e824f7abe55fadbd1db44890486302` | Yes | Yes | not checked out | docs(facilities): record CFI3 final commit SHA in certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi4-condition-standard-serviceability` | `38a5fbebae885751d7b5b5a282fca04064fa7b09` | Yes | Yes | not checked out | docs(facilities): record CFI4 final commit SHA in certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi5-operations-maintenance-deterioration` | `6078bd3196fb5a315632d4c8feff7682c21b1ddc` | Yes | Yes | not checked out | docs(facilities): add CFI5 operations/maintenance/deterioration certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi6-construction-renovation-development` | `ba0b0bf913845b4178ee5b58f652471022a8afc4` | Yes | Yes | not checked out | docs(facilities): add CFI6 construction/renovation/development certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi6a-lifecycle-restoration-fix` | `6aa100430678e4c4c37c6d0c5c42fb88d8ff2ccb` | Yes | Yes | not checked out | docs(facilities): add CFI6a lifecycle restoration certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-cfi7-finance-integration` | `41028ee542f7239b795252bfb36f3291d5609ea7` | Yes | Yes | not checked out | docs(facilities): record CFI7 final commit SHAs in certification report | remote already contains tip |
| Management systems / `club-facilities-infrastructure-v2-fi1-domain-foundation` | `1fff9a507f2d22ae527554ae894146d9e2788812` | Yes | Yes | not checked out | test(governance): certify final integration | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf1-finance-domain-foundation` | `6984737fe1ca71f6ea012bd758d920fc5e009de9` | Yes | Yes | not checked out | feat(finance): add canonical finance domain foundation | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf10-financial-regulation-economy-simulation` | `a489b21bf7fc876544ec84d263cc8cdbad9d9273` | Yes | Yes | not checked out | feat(finance): add financial regulation and economy simulation | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf11-valuation-financial-health-ai` | `d72f50c251d4fcaf8d2a6e593a5f9cff81984fce` | Yes | Yes | not checked out | feat(finance): add valuation financial health and finance ai | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf12-ui-integration-final-certification` | `169b649e7da4c740216765adb05b8ecd7c73c4ee` | Yes | Yes | not checked out | feat(finance): complete club finance economy v2 | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf2-treasury-cash-flow` | `e9aec82a159e4486e6f724970939528826e10bf6` | Yes | Yes | not checked out | feat(finance): add treasury and cash flow | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf3-recognition-commitments` | `31f249ce005e1ac3fce894e95751e3a2b8508633` | Yes | Yes | not checked out | feat(finance): add revenue expense recognition and commitments | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf4-economic-event-adapters` | `dbd617ad4e5b02018532ed0fe9cbbbb34b52d2ee` | Yes | Yes | not checked out | feat(finance): add canonical economic event adapters | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf5-contract-financial-scheduling` | `b1431cf7d51c99491f91299dd1c757a525b8bebf` | Yes | Yes | not checked out | feat(finance): add contract financial scheduling | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf6-budget-forecasting` | `526c84f2e63da31464d61ad854b88b155ce4abfa` | Yes | Yes | not checked out | feat(finance): add budgeting and forecasting | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf7-revenue-engine` | `2818165b58c3c1a309517026078765b1526ef888` | Yes | Yes | not checked out | feat(finance): add canonical revenue engine | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf8-operating-cost-engine` | `17cf7458b28334b32a5af580b962b4db20a21576` | Yes | Yes | not checked out | feat(finance): add canonical operating cost engine | remote already contains tip |
| Management systems / `club-finance-economy-v2-cf9-debt-capital-competition-economy` | `706dced9b6c8fbd002347d5b9b67498c63ddf7a9` | Yes | Yes | not checked out | feat(finance): add debt capital and competition economy | remote already contains tip |
| Management systems / `club-finance-economy-v2-fe1-financial-domain-foundation` | `1fff9a507f2d22ae527554ae894146d9e2788812` | Yes | Yes | not checked out | test(governance): certify final integration | remote already contains tip |
| Other / `coach-rpg-screens` | `eed5138ca6443935dfb27b77a3bf1743bb38c769` | Yes | Yes | not checked out | feat(coach): rebuild the coach RPG screens as a dense character workstation | remote already contains tip |
| Other / `codex/newgame-preview-186` | `3e915511ea41891aded33a4e9a7fb3b048613906` | Yes | No | dirty (6) | Merge remote-tracking branch 'origin/feature/newgame-two-step-league-selector-01' into codex/newgame-preview-186 | remote already contains tip |
| Other / `core-org1-canonical-organization-runtime` | `975d77a61a914a5c3b6bb622e68cd07c073dd496` | Yes | Yes | missing | feat: add canonical organization runtime | remote already contains tip |
| UI / Courtside / `docs/visual-proposal-courtside` | `ea93dc38ba5bd24ed2f55de2b6265c25b77c954e` | Yes | No | clean | docs(visual-proposal): add Courtside desktop catalog, layout fixes and QA certification | remote already contains tip |
| UI / Courtside / `feat/bdm-ui-courtside` | `b7cf64402ee27311fdf24e67d83d3cc4aecd22f3` | Yes | Yes | dirty (1) | fix(courtside preview): auto-build the Windows EXE for every Courtside change, including Finance | remote already contains tip |
| Other / `feat/bdm-ui-roster-v4` | `227ed626f3f3e7f276fb336be808b6198d157205` | Yes | Yes | missing | feat(roster): courtside v4 full-height squad grid and FM-style saved views filters | remote already contains tip |
| UI / Courtside / `feat/home-courtside` | `0eeb218a78c5f13aa1130eb53b889b4a4bb2df82` | Yes | No | not checked out | docs(visual-proposal): version Courtside desktop catalog with layout fixes and QA certification | remote already contains tip |
| WorldDB / playable / `feat/worlddb-universe-import-p3` | `64b20a61d4745d0b0d27f80954ab0317e82c7a02` | Yes | No | clean | feat(worlddb): import generated universes through the canonical BDM session | remote already contains tip |
| WorldDB / playable / `feat/worlddb-universe-v1` | `c8099445df2affd8b0c7a28aa3a55e60974a8439` | No | No | clean | feat(worlddb): build PBM-backed game universe | local only: generated personal save |
| Career / `feature/bdm-f6-final-gameplay` | `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41` | Yes | Yes | clean | chore: authorize owner-requested branch publication | remote already contains tip |
| Career / `feature/career-f0b-autonomous-club` | `5a0afcfad6f6d821bb6b0e6f989facc81b27a0ad` | Yes | Yes | clean | feat: certify career f0b autonomous club | remote already contains tip |
| Career / `feature/career-f1-arrival` | `a6d8e7a7d32c3424c289ed1d541c88c4ae343fdf` | Yes | Yes | clean | feat: integrate career f1 arrival briefing | remote already contains tip |
| Career / `feature/career-f2-director-hub` | `a00b0d53f67f5b0378d234fc6ebaf9b7a3979ba5` | Yes | Yes | clean | feat: add career f2 director hub | remote already contains tip |
| Career / `feature/career-f3-1-integration-closure` | `bbf51a3a5ae1a59b945aa35f0a85f44ccc87a34f` | Yes | Yes | clean | chore: close career f3.1 integration | remote already contains tip |
| Career / `feature/career-f3-human-experience` | `a214d68aaa66f37323ba454f348b2237d3a162ed` | Yes | Yes | clean | feat: connect human career experience | remote already contains tip |
| Career / `feature/career-f4a-ecosystem-routing` | `f0754beaaaeaeeb2b2654620a573b750f96b040e` | Yes | Yes | clean | feat: route career capabilities by ecosystem | remote already contains tip |
| Career / `feature/career-f4b-sporting-operations` | `a399115cf0d0b4ccd4f24c11fa253064ee2e9400` | Yes | Yes | clean | feat: connect career sporting operations | remote already contains tip |
| Career / `feature/career-f4c-unified-world` | `f17f325175f6fc33b4e1f37e9baa2a47f9914106` | Yes | Yes | clean | feat: unify worlddb and career new game | remote already contains tip |
| Career / `feature/career-f5-complete` | `4366b19df8646bce70ae9c159f737c49d1bb402f` | Yes | Yes | clean | feat: certify partial F5 career mobility | remote already contains tip |
| WorldDB / playable / `feature/worlddb-global-astra-01` | `af6593db616b11df4773a588be5af69145f43b16` | Yes | Yes | clean | Remove temporary WorldDB focused workflow after successful acceptance | remote already contains tip |
| WorldDB / playable / `feature/worlddb-global-playable-02` | `cdb6adeb6ce2c213d7ebccb96b4160859d57cb7c` | Yes | Yes | dirty (1) | Correct Liga Sudamericana evidence label | remote already contains tip |
| MatchEngine / `fix-date-progression-match-simulation` | `752b102d7a3e5ea9ee7ef734eec839ce3502787d` | Yes | No | not checked out | fix(game-loop): prevent match date progression stalls | remote already contains tip |
| Management systems / `integration-bs15-final-local` | `94c077092224a9f75c861a853d9d52fceae526fe` | Yes | Yes | missing | merge: integrate BS15 global talent program | remote already contains tip |
| Other / `integration/bdm-unified-20261102` | `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41` | Yes | Yes | clean | chore: authorize owner-requested branch publication | remote already contains tip |
| Management systems / `integration/bs-all-final` | `ceaa45529ce23c4e94bbc2cef17d9d0d987552b6` | Yes | Yes | missing | docs(publication): record BS final publication to main and GitHub | remote already contains tip |
| Management systems / `integration/bs15-bs16-bs17-certified` | `fbe788ce01f1dd34fc40b360b4661ebaad63457c` | Yes | Yes | missing | docs(integration): certify bounded convergence v2 | remote already contains tip |
| Management systems / `integration/bs15-bs16-bs17-final-v3` | `8be14ef133dcddccf30d961bec0964a8dca69236` | Yes | Yes | clean | docs(strengthening): audit BS17D global closure | remote already contains tip |
| Management systems / `integration/bs15-bs16-bs17-final-v3-1` | `67c61edc77198ca87579108379e41ab5bd1a1bc4` | Yes | Yes | clean | test(save): give the annual development cycle round-trip a 15s local timeout | remote already contains tip |
| Management systems / `integration/bs17d-talent-consolidated` | `eb12f9670b2c99a6cf3c8ddef0ae2d73fd5e78c9` | Yes | Yes | clean | test(integration): certify BS17D talent consolidation | remote already contains tip |
| Management systems / `integration/bs19-hrpg-core-20261018` | `e3545023fbe53b9846438bfb6c106d9b8a4bf109` | Yes | Yes | clean | feat(hrpg): integrate canonical human simulation core | remote already contains tip |
| UI / Courtside / `integration/courtside-canonical-20261019` | `55abae9392931a4efbe1d501c39e0c9a3b3857ed` | Yes | Yes | clean | fix(courtside): preserve NG routes and finance authority | remote already contains tip |
| MatchEngine / `integration/matchengine-next-worldsim` | `e06003f4860b6f7aade9d7dac0aa992f92ff99e4` | Yes | Yes | not checked out | merge: integrate MatchEngine Next and scalable world simulation | remote already contains tip |
| Staff / `issue-26-acb-real-staff` | `40195796701976481ff445aa023e3a94a82a8033` | Yes | Yes | not checked out | Fix Training staff V3 save restoration | remote already contains tip |
| Staff / `issue-27-staff-v2-wave-4c1-staff-core-ui` | `91c2d00aa745755607bed1873c55179e272211b3` | Yes | Yes | not checked out | fix: repoint DesktopAppHost club test at ClubPcbPage default view | remote already contains tip |
| Other / `issue-6-global-context-menu` | `e4ef7cd67367edbcad0feea13518afa40157e1eb` | Yes | No | not checked out | Add global entity context menu infrastructure | remote already contains tip |
| Other / `main` | `b41c223c9c2bbeec7bbd434492656efd691503d7` | Yes | Yes | not checked out | Merge pull request #162 from audifor/playable/f0 | remote already contains tip |
| Other / `main-ci-repair-20260906` | `b2dedf90c51c5720fb7606d15a455cb6fd2cb317` | Yes | Yes | not checked out | test(game): allow canonical simulation equivalence CI budget | remote already contains tip |
| MatchEngine / `match-basketball-truth-bt1` | `95b5aad2d7a8a59096e73ad00dd1e7a722d56950` | Yes | No | clean | feat(match-basketball-truth-bt1): canonical-vs-rendered audit, segment presentation, targeted engine truth fixes | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg1-canonical-match-audit` | `8b02606972b5ff85ddeca045a71637e4a3eb1951` | Yes | No | not checked out | docs(match): audit canonical match runtime for gameplay v3 | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg2a-lineup-authority` | `5b2d3bce733562708a0a767175b796dfe4efa7c4` | Yes | No | not checked out | fix(match): make configured lineup authoritative for user games | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg2b-live-coaching-contract` | `7f5c678f330bb80d4cd8cb511e3272d3b428336d` | Yes | No | not checked out | feat(match): establish live coaching command boundary | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg2c-rotation-authority-cleanup` | `c3ea885ef4a69c437f81c943a1edc9aa61d5455c` | Yes | No | not checked out | refactor(match): remove hidden overall from rotation authority | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg2d-completed-match-persistence` | `f936d1a06f8fd3219853c1697adcf5484ac7aa16` | Yes | No | not checked out | fix(match): persist completed live matches through save v3 | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg3-prematch-match-contract` | `f8d25921b469b96aa42d0f1f4ebf4c12eeba42b6` | Yes | No | not checked out | refactor(match): establish canonical prematch input boundary | remote already contains tip |
| MatchEngine / `match-gameplay-v3-mg4a-player-rating-signals` | `f8d25921b469b96aa42d0f1f4ebf4c12eeba42b6` | Yes | No | not checked out | refactor(match): establish canonical prematch input boundary | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt2` | `e8254eb7be9585464b97937fb545cb04e1fa3611` | Yes | Yes | clean | feat(match-next): BT2 possession economy and half-court basketball (flow phases, utility decisions, zones, ball screens, cuts, rebounding v2, ball continuity) | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt3` | `25821d7ef69a621b98977203e14d13d1d4467f96` | Yes | Yes | not checked out | feat(match-next): BT3 contact, fouls, free throws, blocks, steals, turnovers and dead-ball lifecycle | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4` | `af2fb8266944e0c0f3105ba2c1fd6ee53ddb848a` | Yes | Yes | not checked out | feat(match-next): BT4 pace accounting, shot ecology and player identity | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4-1-pace` | `aa942a1cc8199c002f68cbdaac54d79668e51cc7` | Yes | Yes | not checked out | feat(match-next): BT4.1 pace closure, backcourt rule, standard jump ball and free-throw lane | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4-2-flow` | `fc8c5d867dc69acc38b3606180ec74ba82d9b392` | Yes | Yes | not checked out | docs(match-next): second pass of the BT4.2 match analysis (possession structure) and its audit | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4-3-logic` | `9039015a805ae298271169411f45783c7e78b35d` | Yes | Yes | not checked out | BT4.3: logica baloncestistica (jugadas en lugar de espera) | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4-4-pace-causality` | `66b7625ce0ee99bfb2a39cb32a5a881f016ca12b` | Yes | Yes | not checked out | BT4.4: causalidad del ritmo (ledger de posesiones y arreglo de ciclo de vida) | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt4-5-pass-ecology` | `8d14f81e68ab8991712b3ed13f9c09b9e01c47ce` | Yes | Yes | not checked out | BT4.5: ecologia del pase (seleccion, ejecucion e intercepcion separadas) - PARTIAL | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt5-tactical-identity` | `491a8779d5b26fd2c46f296b64c79549f33d3608` | Yes | Yes | not checked out | BT5: identidad tactica de equipo, entrenador y plan (capa tactica derivada) - PARTIAL | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt6-1-drive-ecology` | `c86dd3b0a38044bae83ae38a06c1346cd57950ab` | Yes | Yes | not checked out | fix(match-next): close drive ecology and advantage conversion | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt6-defensive-truth` | `be4b579cd43cc38203705b4f5611b307c3f4da16` | Yes | Yes | not checked out | feat(match-next): close defensive truth and possession economy | remote already contains tip |
| MatchEngine / `match-next-basketball-core-bt7-full-integration` | `3408a4e9c78fb4c52f5eab8d78b5d10092d0ff00` | Yes | Yes | not checked out | feat(match-next): complete full basketball integration | remote already contains tip |
| MatchEngine / `match-next-me-lock1-1-production-performance` | `6492794ebdb30d3d586c8f9101697a16cb7fd04e` | Yes | Yes | not checked out | perf(match-next): close production simulation performance gap | remote already contains tip |
| MatchEngine / `match-next-me-lock1-2-exact-execution` | `4da33d1227d60ea6e17df5bf5f2e24ba78d360f2` | Yes | Yes | not checked out | perf(match-next): optimize exact match execution architecture | remote already contains tip |
| MatchEngine / `match-next-me-lock1-fast-simulation` | `8c811543bc1ca4c2273256bb1453daab48e70b0d` | Yes | Yes | not checked out | feat(match-next): unify production simulation with fast mode | remote already contains tip |
| MatchEngine / `match-next-phaser-poc` | `767927e75b1be4689053c924cbe46fdaedffb0b3` | Yes | No | not checked out | feat(match-phaser-poc): add isolated Phaser 3D-free vertical slice for MatchEngine Next presentation | remote already contains tip |
| MatchEngine / `match-next-phaser-truth` | `4b900deff5e216a68fa6aa7835f0095458c4b3f1` | Yes | Yes | not checked out | feat(match-next-phaser-truth): Phaser 4.2 presentation for MatchEngine Next + Basketball Truth audit + 3 proven Next fixes | remote already contains tip |
| MatchEngine / `match-presentation-v1` | `d6be1f32a2f5c12f95194a37603d2e48799a3166` | Yes | No | not checked out | feat(match-presentation-v1): natural locomotion, ball states, intent-driven offense/defense visuals, sequencing, camera, debug tooling | remote already contains tip |
| MatchEngine / `matchengine-next-0-foundation` | `7a2eea34c5a77314d98157742c067e5e58e2c14b` | Yes | Yes | clean | feat(match-next): establish match engine foundation | remote already contains tip |
| MatchEngine / `matchengine-next-1-ball-possession` | `ee38b9282ffb63f78942a2ea01e262d4541651a9` | Yes | Yes | clean | feat(match-next): establish ball and possession authority | remote already contains tip |
| MatchEngine / `matchengine-next-2-movement-offensive-structure` | `fcb0eaec41448ce31eb7baa55b7794a26e295651` | Yes | Yes | clean | feat(match-next): establish movement and offensive structure | remote already contains tip |
| MatchEngine / `matchengine-next-3-man-defense` | `aa59209f775b7f0ce148727f47a5029de96390ce` | Yes | Yes | clean | feat(match-next): establish man-to-man defensive authority | remote already contains tip |
| MatchEngine / `matchengine-next-4-actions-decisions` | `811df6cefbbd8833ea6914052eb4ff726b487ab7` | Yes | Yes | clean | feat(match-next): implement action core and vertical slice | remote already contains tip |
| MatchEngine / `matchengine-next-5-transition-rebounding` | `dfe80e09948d87f2a83c124d7a0bf2262e100952` | Yes | Yes | clean | feat(match-next): establish transition and rebounding | remote already contains tip |
| MatchEngine / `matchengine-next-6-integration` | `0062d780b30811c33d9692037c0f9e92f0d4fc96` | Yes | Yes | not checked out | fix(match-next): resolve contested passes at reception | remote already contains tip |
| MatchEngine / `matchengine-next-7-match-center-feature-parity` | `38f17a7a5086f323d7cc44a630b2bd9a3eee41f2` | Yes | Yes | clean | feat(match-next): restore match center feature parity | remote already contains tip |
| MatchEngine / `matchengine-v3-mg8a-defensive-authority-foundation` | `715efd33316e9727de17210ec08e97f522ac90b3` | Yes | No | clean | feat(matchengine): establish defensive authority | remote already contains tip |
| MatchEngine / `matchengine-v3-mg8b-on-ball-defense-containment` | `617712dee5e48363320d5ec47ed9d3e1ef14525d` | Yes | No | missing | fix(match): correct live playback time scale | remote already contains tip |
| MatchEngine / `matchengine-v3-mg8c-spatial-intent-arbitration` | `0e4d1ee9aa8dc7300a983ff62828a6d0ad411712` | Yes | No | missing | refactor(matchengine): arbitrate player movement intents | remote already contains tip |
| MatchEngine / `matchengine-v3-pre-mg8b-playback-timescale` | `18ee584041e1e7cf16692e392562a261733c592c` | Yes | No | clean | fix(match): correct live playback time scale | remote already contains tip |
| Career / `mx0/mx0-1-career-loop-recovery` | `60494224af1381041bc4f94375cb098c73e9d81c` | Yes | Yes | not checked out | ﻿fix(mx0): recover canonical career progression loop | remote already contains tip |
| Career / `mx0/mx0-2-career-loop-closure` | `dbeb216f67a8c3e68a05d8fd68c2dbc0353fd57b` | Yes | Yes | not checked out | fix(mx0): close career loop integration audit | remote already contains tip |
| Other / `mx0/mx0-3-product-state-integrity` | `96f77c18b7f926ea7fe4e69401f9330b2239d4df` | Yes | Yes | not checked out | ﻿test(mx0): certify annual development exactly once | remote already contains tip |
| Other / `mx0/mx0-4-canonical-workspace-runtime-truth` | `f92696dbb0cabc060cab996f8dc03adad6a1fd0c` | Yes | Yes | not checked out | ﻿test(mx0): certify NG runtime truth | remote already contains tip |
| Other / `mx0/mx0-5-trade-activation-closure` | `a2d3956790eeba51b665951a315774a600357c47` | Yes | Yes | not checked out | test(mx0): certify ecosystem-scoped trade activation | remote already contains tip |
| Other / `mx0/mx0-5-trade-negotiation-gameplay` | `f47e6806b479d82b681c5d4806aa2f7360579c82` | Yes | Yes | not checked out | ﻿test(mx0): certify trade negotiation resolution | remote already contains tip |
| Other / `mx0/mx0-6-facilities-gameplay` | `7038c30bd054a57ffdced530d51b446013fccdd6` | Yes | Yes | not checked out | test(mx0): certify production career reachability | remote already contains tip |
| Management systems / `mx0/mx0-7-governance-board-gameplay` | `b1ea5c23cc18059a93430822f73fb9c8d710924b` | Yes | Yes | not checked out | test(mx0): certify board governance product loop | remote already contains tip |
| Other / `ng-typography-gt-america` | `6ac9a6760df2e3fff48f018504c70b898c658170` | Yes | Yes | not checked out | Merge pull request #53 from audifor/slowchanges | remote already contains tip |
| UI / Courtside / `ng018-home-default-test-fix` | `0b34b69809b0e629d2cb11f45016588808bc16a9` | Yes | No | not checked out | test(ui-ng): complete NG-018 Home default alignment | remote already contains tip |
| WorldDB / playable / `playable/f0` | `5667fd7839e50d6973ede46de1a4ac404abd991d` | Yes | Yes | missing | docs(playable): link final F0 certification to PR checks | remote already contains tip |
| WorldDB / playable / `playable/f1` | `b697b185db57d2ba9a1ff757fb0bf42eb94979f0` | Yes | Yes | not checked out | docs(playable): certificacion F1 y evidencia de la prueba real Windows | remote already contains tip |
| WorldDB / playable / `playable/f2` | `7ef2623c77ba7bcd7520aacb723f4cf11e334327` | Yes | Yes | not checked out | feat(playable): F2 gestion diaria funcional y comparacion A/B de 30 dias | remote already contains tip |
| WorldDB / playable / `playable/f3` | `1e306cf025fbd0d58dcd00bdfdbe0195bb2d0fb5` | Yes | Yes | not checked out | test(worlddb): presupuesto de 40 min para la simulacion completa de 365 dias (varianza del runner, sin cambiar lo que se afirma) | remote already contains tip |
| WorldDB / playable / `playable/f4` | `c1905549d87ca1a11797ae5cadc348e2ccf557c9` | Yes | Yes | dirty (27) | Merge pull request #165 from audifor/playable/f3 | remote already contains tip |
| WorldDB / playable / `playable/worlddb-102-final-01` | `cabb4e74ab8d70980a01609e5fc7560a899fa630` | Yes | Yes | clean | Initialize NCAA athletes and retain generated schedule policies | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-01` | `0158086c17a2690a341ae5a7b51101b1ed4548c2` | Yes | Yes | clean | feat(playable): start and resume WorldDB V2 careers | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-02` | `3dc82d122ee162dbb2ef5a03bf44d64b676c111e` | Yes | Yes | clean | feat(playable): PBM contracts and certified season continuity | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-03` | `bbe219700984136d2fd8144d3692b4cd81b69a1c` | Yes | Yes | clean | fix(worlddb): compose French play-in and certify full PBM season | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-04` | `64c8de7ad9a1c53b480849a4d71cd94e87a8d3c4` | Yes | Yes | clean | Connect WorldDB competition families and certify batch coverage | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-05` | `64849345f3c1629d9148db28246cf3820a3d47fc` | Yes | Yes | clean | Enable WorldDB V2 shared four-league careers | remote already contains tip |
| WorldDB / playable / `playable/worlddb-v2-06` | `75c87ee535f981b914cf2852eebba8c6be85e1ab` | Yes | Yes | clean | feat(playable): certify WorldDB V2-06 fluidity and Windows session | remote already contains tip |
| MatchEngine / `player-model-mg4a0-80-rating-migration` | `e54b4d6f621f3adda152d8abfec23d08aafb03c5` | Yes | No | not checked out | feat(coach): rebuild the coach RPG screens as a dense character workstation | remote already contains tip |
| Other / `release/final-01-functional` | `cdd3c5050d5946e4444660c13220abc8ac0358fe` | Yes | No | dirty (17) | Document certification and remaining limits | remote already contains tip |
| Other / `repair-wave-5c` | `2f2f367dd0503c63da7fdb21542252babad8b6bb` | Yes | Yes | not checked out | fix: align Wave 5C culture and cohesion catalogs with canonical model | remote already contains tip |
| Other / `slowchanges` | `8d0dacd4a26a3560d685bb60a824bed77f82d991` | Yes | No | not checked out | Add canonical Team detail screen (TEAM DETAIL V1) | remote already contains tip |
| Staff / `staff-system-v2-wave-4b2-basketball-ops-advisory` | `32a21bfae5f1f868566d75f74c369db8216a53d6` | Yes | Yes | not checked out | fix: stop at first legal outgoing per incoming candidate in tradeRecommendation | remote already contains tip |
| Staff / `staff-system-v2-wave-4c2-responsibilities-ui` | `a53199dbb99dadd647e771fa3a7ba1aee7f831d7` | Yes | Yes | not checked out | fix: honor real target mode for responsibility candidate eligibility | remote already contains tip |
| Staff / `staff-system-v2-wave-4c3-advisory-center` | `6115056419059b6f855821e16c822c27c9055ebb` | Yes | Yes | not checked out | test: add ACB oppositionScouting advisory end-to-end regression coverage | remote already contains tip |
| Staff / `staff-system-v2-wave-5a-human-state` | `a1bc4c5fb7e74209d7c85c1c32bb32a32c9b07c7` | Yes | Yes | not checked out | fix: avoid literal Math.random() text tripping the CI determinism grep | remote already contains tip |
| Staff / `staff-system-v2-wave-5b-working-relationships` | `f16910ddbb2b3cf61ed124b62e5bbbee8158ff9e` | Yes | Yes | not checked out | fix: enforce strict relationship directionality and add real informational-dismiss regression | remote already contains tip |
| Staff / `staff-system-v2-wave-5c-units-culture-cohesion` | `7c7d2705bdd2939e0799b787034062c34f28d81f` | Yes | Yes | not checked out | fix: finalize staff culture and cohesion semantics | remote already contains tip |
| Staff / `staff-system-v2-wave-5d-conflict-system` | `49932bb10e0ab0e782bf8692371d2ec1390e24a4` | Yes | Yes | not checked out | fix: harden staff conflict actor and cooldown boundaries | remote already contains tip |
| Career / `staff-system-v2-wave-5e-career-autonomy` | `631755076f087522f8d6e382c1899956f44f00e1` | Yes | Yes | not checked out | test(staff): complete Wave 5E certification | remote already contains tip |
| Staff / `staff-system-v2-wave-5f-organizational-politics` | `026bb4e9519f4db097f9dace4291fec7b7a827dc` | Yes | Yes | not checked out | Merge PR #37: Staff System V2 - Wave 5E: Career Autonomy & Staff Agency | remote already contains tip |
| Staff / `staff-system-v2-wave-5f1-political-influence-foundation` | `f777ffb8cff341fff84806977bbfc1be8664b463` | Yes | Yes | not checked out | Staff System V2 - Wave 5F1: Political Influence Foundation | remote already contains tip |
| Staff / `staff-system-v2-wave-5f2-political-cases-actions` | `25ef94e28b49f0f4981414569bba6844788fa6f9` | Yes | Yes | not checked out | Merge pull request #38 from audifor/staff-system-v2-wave-5f1-political-influence-foundation | remote already contains tip |
| Staff / `staff-system-v2-wave-5f2a-political-case-foundation` | `f6279b6da264638c3063f34513150fe911db5597` | Yes | Yes | not checked out | Staff System V2 - Wave 5F2A: Political Case Foundation | remote already contains tip |
| Staff / `staff-system-v2-wave-5f2b-political-positions` | `edf1e33480e4a6e222b6466eee32c2cc79f91687` | Yes | Yes | not checked out | Staff System V2 - Wave 5F2B: Relevant Actors & Political Positions | remote already contains tip |
| Staff / `staff-system-v2-wave-5f2c1-political-actions-foundation` | `ba5b2b889ed6bdc00a82f243cfb849b8397d20d7` | Yes | Yes | not checked out | Staff System V2 - Wave 5F2C1: Political Actions Foundation | remote already contains tip |
| Staff / `staff-system-v2-wave-5f2c2-political-action-consequences` | `de1da76fdba7c46512df07afb8e54470b7676208` | Yes | Yes | not checked out | Staff System V2 - Wave 5F2C2: Political Action Consequences | remote already contains tip |
| Staff / `staff-system-v2-wave-5f3-alliances-factions-power-blocs` | `7dd86a8e8c2e4d41b3960ceac57771dbbd9b631f` | Yes | Yes | not checked out | feat(staff): add political alliances and factions | remote already contains tip |
| Staff / `staff-system-v2-wave-5f4-politics-ui-integration-certification` | `8b280ed259452c0424f8c844d543faf7d4cca3bf` | Yes | Yes | not checked out | Staff System V2 - Wave 5F4: Politics UI, Integration & Certification | remote already contains tip |
| Other / `ui-v3-foundations` | `ca9b09cb902b2fbe5e778eb0970003ee624cca03` | Yes | Yes | not checked out | Merge pull request #33 from audifor/staff-system-v2-wave-5a-human-state | remote already contains tip |
| Other / `ui-v3-screen-redesigns` | `de1a696cd682face016e679d14aa77d94f98f6b7` | Yes | Yes | not checked out | ﻿feat(staff): add staff assignments workstation with quick assign | remote already contains tip |
| WorldDB / playable / `wdb2-1-1-game-start-date` | `7b11bda5f3fb7d3ce6aec3c44e0c0243221b5a73` | Yes | No | clean | fix(worlddb): start careers on July 1 and pin database | remote already contains tip |
| WorldDB / playable / `wdb2-1-2-first-playable` | `a90ce8db0bb37f288bbdc8dcc1fa6ac37473a108` | Yes | No | clean | feat: start WorldDB ACB careers in 2026-27 | remote already contains tip |
| Other / `wip-bdm-local-before-bg8-integration` | `7ab4157baf9179892e1a8a485c5b5a439ff2f71a` | Yes | No | not checked out | wip: preserve local BDM work before BG8 integration | remote already contains tip |
| Other / `worktree-agent-a446c6f4d97fb3996` | `f6d677fcecc5f51a82811d8ad3a3e0901afe1083` | Yes | Yes | not checked out | Merge pull request #34 from audifor/staff-system-v2-wave-5b-working-relationships | remote already contains tip |
| Other / `worktree-agent-a957c3f19ed53cb01` | `3f84e4aca22d29ef4e895c829eefe5a94f833df4` | Yes | Yes | not checked out | Merge branch 'club-facilities-infrastructure-v2-cfi8-sporting-impact-basketball-integration' | remote already contains tip |
| Other / `worktree-agent-ad38d2d15c8de30ce` | `2850847ce37b712b73c4fcac7f87f657c76ae8aa` | Yes | Yes | not checked out | feat: add staff culture and unit cohesion | remote already contains tip |
| Other / `world-db-gameworld-bootstrap-v1` | `52f1ce2f5e60244b70fe7d69dc4cc57f9d6cf9ec` | Yes | Yes | not checked out | ci: shard unit tests in GitHub Actions | remote already contains tip |
| Other / `world-db-selection-catalog-v1` | `64435f744068ba4304f990ad41a9ad62733ce692` | Yes | Yes | not checked out | [BDM] Add canonical World DB selection catalog (#105) | remote already contains tip |
| Other / `world-sim-wsr1-background-resolution` | `e75bbcfcc9ace4dd985b71d812030e2de16f1829` | Yes | Yes | not checked out | feat(world-sim): add adaptive background match resolution | remote already contains tip |
| Other / `world-sim-wsr2-1-daily-result-batching` | `11b0d3bcd46f59dfcc205d5d192ece271a9ec548` | Yes | Yes | dirty (1) | perf(world-sim): batch daily match result application | remote already contains tip |
| Other / `world-sim-wsr2-daily-lifecycle-scaling` | `5915331e4fc4d73f5c04d499ff33e2dccf0e0ef0` | Yes | Yes | not checked out | perf(world-sim): scale daily lifecycle processing | remote already contains tip |

## Dirty or unavailable working directories

Dirty worktrees were preserved. Missing/prunable worktrees were not pruned. The root `C:\BDM` contains F4 work in progress and remains untouched.

- `C:/BDM` (`playable/f4`): 27 modified/untracked entries; left untouched.
- `C:/BDM-BT45-BASE` (`(detached)`): 1 modified/untracked entries; left untouched.
- `C:/BDM-BT6-BASE` (`(detached)`): 3 modified/untracked entries; left untouched.
- `C:/BDM-COURTSIDE` (`feat/bdm-ui-courtside`): 1 modified/untracked entries; left untouched.
- `C:/BDM-ME-NEXT-6` (`bdm-stage2-bs11a-contract-roster-planning-audit`): 13 modified/untracked entries; left untouched.
- `C:/BDM-NEXT-TRUTH` (`world-sim-wsr2-1-daily-result-batching`): 1 modified/untracked entries; left untouched.
- `C:/BDM-worktrees/final-01` (`release/final-01-functional`): 17 modified/untracked entries; left untouched.
- `C:/BDM-worktrees/newgame-preview-186` (`codex/newgame-preview-186`): 6 modified/untracked entries; left untouched.
- `C:/BDM-worktrees/worktreesleagues-final-01` (`feature/worlddb-global-playable-02`): 1 modified/untracked entries; left untouched.
- `C:/BDM-worktrees/worlddb-suite-2064b744` (`(detached)`): 1 modified/untracked entries; left untouched.
- `C:/BDM_DB/worktrees/db05-compat-20261025` (`(detached)`): 1 modified/untracked entries; left untouched.
- `C:/BDM_DB/worktrees/db08-acb-ranking` (`(detached)`): 5 modified/untracked entries; left untouched.
- `C:/BDM_DB/worktrees/db09-pbm-universe` (`(detached)`): 1 modified/untracked entries; left untouched.
- `C:/BDM-BS-FINAL-INTEGRATION` (`integration/bs-all-final`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10` (`bdm-stage2-bs10a-market-candidate-intelligence`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10B` (`bdm-stage2-bs10b-market-feasibility-economics`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10C` (`bdm-stage2-bs10c-acquisition-proposal-intelligence`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10D-A` (`bdm-stage2-bs10d-b-free-agent-contact`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10D-C` (`bdm-stage2-bs10d-c-contact-response`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS10D-D` (`bdm-stage2-bs10d-f-negotiation-lifecycle`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS12A` (`bdm-stage2-bs12a-training-medical-convergence-audit-v2`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS12A-R` (`bdm-stage2-bs12a-main-reconciliation`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS12B` (`bdm-stage2-bs12b-training-ownership-load-convergence`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS12C` (`bdm-stage2-bs12c-medical-recovery-rtp`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS14` (`bdm-stage2-bs14a-scouting-intelligence-audit`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS15-INTEGRATION` (`integration-bs15-final-local`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS16-CANONICAL` (`bdm-stage2-bs16-finance-canonical`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS16-FINANCE` (`bdm-stage2-bs16-finance-strengthening`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS16C-BASE` (`(detached)`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17-FACILITIES` (`bdm-bs15-bs16-bs17-integration-readiness`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17-FINAL` (`bdm-stage2-bs17-global-completion`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-C1-ALLOCATIONS` (`bdm-stage2-bs17d-c1-physical-allocations`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-C1-CLOSURE` (`bdm-stage2-bs17d-c1-consumption-fix`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-CAPACITY` (`bdm-stage2-bs17d-capacity`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-GLOBAL-CLOSURE` (`bdm-stage2-bs17d-global-closure`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-M1-IMPLEMENTATION` (`bdm-stage2-bs17d-m1-equipped-rehabilitation`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-MEDICAL` (`bdm-stage2-bs17d-m1-specialized-medical`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-T1-RECRUITING` (`bdm-stage2-bs17d-t1-recruiting-facilities`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17D-TALENT-FACILITIES` (`bdm-stage2-bs17d-talent-facilities`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17E-A` (`bdm-stage2-bs17e-a-maintenance-repair`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17E-P2-CONTRACTS` (`bdm-stage2-bs17e-p2-cost-governance-contracts`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17E-POLICY` (`bdm-stage2-bs17e-policy-contract`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS17E-READINESS` (`bdm-stage2-bs17e0-financial-readiness`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-BS9` (`bdm-stage2-bs9e-b-planning-lifecycle-observability`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-CORE-ORG1` (`core-org1-canonical-organization-runtime`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-INTEGRATION-BS15-BS16-BS17` (`integration/bs15-bs16-bs17-certified`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-MG8B` (`matchengine-v3-mg8b-on-ball-defense-containment`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-MG8C` (`matchengine-v3-mg8c-spatial-intent-arbitration`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-P0E-GAME-BRIDGE` (`(detached)`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-PLAYABLE-F0` (`playable/f0`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-PLAYER` (`(detached)`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-ROSTER-V4` (`feat/bdm-ui-roster-v4`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/BDM-UI-HOME` (`(detached)`): registered but missing/prunable; branch ref preserved; not pruned.
- `C:/Temp/bdm-f4/main-baseline` (`(detached)`): registered but missing/prunable; branch ref preserved; not pruned.

## Publication and artifact decisions

- 59 safe local-only branch tips were published through explicit refspecs. The F6 branch kept its original name; other original refs use `backup/local-preservation-20261102/<branch>`.
- `feat/worlddb-universe-v1` remains local because its history contains a generated personal save under `outputs/worlddb-universe-v1/`. A source-only alternative was published at `backup/local-preservation-20261102/feature/worlddb-universe-v1-source-only` after excluding generated outputs.
- The read-only DB-04 adapter commit `853d1dbe` was later published at `backup/local-preservation-20261102/feature/worlddb-db04-catalog-adapter-source` and cherry-picked into the candidate as `eccb26e5`. Its integration test passes 3/3 after a cold-build timeout adjustment.
- No direct main push, force push, branch deletion, pruning, reset, or stash pop was used. Five stashes remain preserved.

## Subsequent candidate review

- Candidate branch advanced from `83c04b0f` to `eccb26e5` by cherry-picking the read-only DB-04 adapter. This preserved functional source absent from F6 without bringing over generated outputs.
- The ancestry audit of the 49 open PRs found 24 exact heads already in the candidate and 25 exact heads not yet contained. The full list and bases are in `BDM_CONSOLIDATION_REPORT.md`; non-ancestry is not treated as proof that behavior is absent.
- After the initial preservation publication, 60 backup namespace refs were SHA-verified. The one original generated-save branch remains local. The integration candidate has not yet been published.
