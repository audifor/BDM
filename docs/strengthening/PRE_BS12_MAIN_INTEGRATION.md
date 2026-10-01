# PRE-BS12 Main Integration

## Baseline and strategy

- Original local `main` and `origin/main`: `c23771ff51146ff7ce7a738504d54c443438b3ca` (both clean of tracked changes and equal; the canonical `C:\BDM` checkout has a separate pre-existing untracked `docs/DDSPB4_PORTING_GUIDE.md`, which was preserved).
- Integration branch: `bdm-integration-pre-bs12`, created from `origin/main`.
- Validated cumulative BS11F source: `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`.
- `origin/main` is an ancestor of `f22c44d`; the source adds 108 commits beyond main (95 first-parent commits). The BS0–BS4, BS5, BS8, BS9, BS10, and BS11A/B/C/D0/D1/E/F milestone heads are ancestors of `f22c44d`.
- A raw merge of `f22c44d` is unsafe: its ancestry contains MatchEngine Next 0–6 through merge `f66f78a0767dfb7efd5aa05417c340516cfe17b7` / integration `0062d780b30811c33d9692037c0f9e92f0d4fc96`. Therefore the integration uses the cumulative source tree filtered against `origin/main`, preserving the approved non-MatchEngine tree while omitting contaminated MatchEngine ancestry. This is the smallest safe tree integration; no milestone commits were replayed individually.

## Included and already present

- Newly integrated from the cumulative BS11F tree: BS0–BS5, BS8–BS11F approved non-MatchEngine implementation, including lifecycle/self-healing, player dynamic state, coach rotation, Club/GM AI, market/trade intelligence, contract hub/review/retention/signing/release, save and UI integration.
- Master Capability Reuse Audit: added the 12 documentation files from docs-only commit `67811994e48137ec77579ae3dcaa273e8a680c37` (not an ancestor of main or `f22c44d`).
- Already ancestors of `origin/main`: Finance V2 final `169b649e7da4c740216765adb05b8ecd7c73c4ee`; Governance V2 final `1fff9a507f2d22ae527554ae894146d9e2788812`; Facilities V2 CFI8 final `e9fb71686e179a73d0e5dfde8cd39fa569507a7d` and integration `3f84e4aca22d29ef4e895c829eefe5a94f833df4`; Core Org1 `975d77a61a914a5c3b6bb622e68cd07c073dd496`.
- Representative newly integrated source heads include BS0 `34e9b6925be30aca8d591eb182c259ef5642801b`, BS1 `0a9192ddbb6878285ea0d1305ac1427a5a43624c`, BS2 `8f27d6033b2ab7289134f4826e742af33aba6e1f`, BS3 `b34a711146b76f2e41960acdf926aff60d5dbf10`, BS4 `e7d8e67cdb8196a30ef345c2af332cbe7069320a`, BS5 `b0cc591`, BS8 `811e8d87390b2cb34b49e9cb84a0b51f40ffe433`, BS9A–E `a54f8d0` through `719363f`, BS10A–E and closure `686a427` through `9de9948`, and BS11F `f22c44d290e29f9df1dbaafe0ecd9d3badeef441`.

## MatchEngine exclusion and shared boundaries

- Explicitly excluded MatchEngine Next 0–7, Basketball Truth (`match-basketball-truth-bt1`), Match Presentation (`match-presentation-v1`), Phaser POC/truth (`match-next-phaser-poc`, `match-next-phaser-truth`), and MatchEngine V3/MG8 development branches.
- No changed path under MatchEngine, `match-next`, match presentation, Phaser, or dev-match areas. MatchEngine-specific paths compare byte-for-byte equal to the original `origin/main` baseline.
- Shared files such as `GameWorld`, calendar, save, player state and app routing were reviewed. Approved generic/non-match hunks were retained. Coach rotation and post-match player consequences were retained; the candidate's MatchEngine starting-fatigue input and debug route were removed. `src/engine/match/MatchEngine.ts`, `src/engine/match/Fatigue.ts`, match UIs, and all `matchNext` paths remain unchanged.
- Conflict resolutions: no Git merge conflicts (filtered tree integration). Two focused test expectations were updated to match approved behavior: calendar phase expectation now includes retention invalidation/AI negotiation; release-related retention tests use an explicitly uncapped contract fixture because capped release intentionally fails closed. The MatchEngine behavior was not modified.

## Validation

- Focused tests: 26 existing files, 320 tests passed. Coverage included daily lifecycle, Club/GM AI, Market/Trade, Contract Hub/retention/signing, Finance, Governance, Facilities, Save, Player Dynamic State, and MatchEngine smoke (`src/engine/match/MatchEngine.test.ts`). Two lifecycle/facility cases were rerun serially after first timing out under parallel load; all passed.
- `npm run typecheck`: PASS.
- `npm run build`: PASS (Vite emitted its existing large-chunk advisory).
- `git diff --check`: PASS.
- `MATCHENGINE_CHANGED_FILES`: none.

## Merge and push record

- Integration branch final HEAD: recorded by `git log -1` for this report's containing integration commit.
- Normal main integration merge SHA: 4352e6287f41b284175e94c4f1e46e84d0d5b2b3.
- Push status: pending final validation and normal push to `origin`.
