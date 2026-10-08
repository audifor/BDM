# BS15I WORLD-SIM SCALE FINAL CLOSURE

## Current authorized daily-validation closure: PASS

One new clean Y7: **273.383s** canonical simulation, **4.370s** final daily validation (previous339.241s /53.564s). Both7/30day comparisons match all211 persisted payload fields. New Save `C:/Temp/BS15I-final-y7-save-v4.json` is501,867,196bytes and byte-identical to the accepted Y7; exact reload and all lifecycle gates pass. Single artifact after forced GC:660.1MB heap,2100.2MB RSS.151focused tests, typecheck, build and diff check pass. No commit/push/merge/Y8+.

See [current detailed closure](BS15I_DAILY_VALIDATION_CLOSURE.md) and `dailyValidationClosure` in the results JSON for trace, paired phase tables, measured sub-costs, runtime scopes and memory. The following accepted report is historical evidence from the previous request; its PARTIAL performance status is superseded by this PASS.

---

# BS15I WORLD-SIM SCALE FINAL CLOSURE

## A. SAVE LOAD DEFECT

Current Save V4 reused the legacy V3 staff-contract backfill. The certified Y6 has 58 employed staff without a currently effective contract; the compatibility helper treated these as missing legacy structures and invented one contract per staff member (348 -> 406). An additional reload invented 58 more. V4 now preserves the authoritative persisted ledger by disabling that backfill. Direct legacy V3 retains its enrichment, and V3-to-V4 migration carries the enriched ledger into V4. Regression tests cover both formats; no ledger was manually fabricated.

The real `C:/Temp/BS15I-long-y6-save-v4.json` passes an initial deserialization plus two complete serialize/deserialization cycles, followed by another serialization. Every persisted payload field and all IDs remain exact. The two person-keyed maps (morale/personalities) are compared by canonical person identity, rather than factory insertion order. Counts remain: Persons 1,255; Players 1,135; player contracts 449; staff contracts 348; scheduled player contracts 0; rights 48; roster owners 316; NCAA enrollments 272; commitments 124; transactions 476; Drafts 12; picks 96; Portal entries 0. No entities are created by load. Full evidence: `C:/Temp/BS15I-clean-y6-baseline.json`.

## B. RECRUITING

In the comparable recruiting-active 30-day window, 19.009 s -> 7.316 s, **2.60x**. The original profile attributed 16.897 s of sampled CPU to repeated future-roster projection, mostly through per-offer choice evaluation. The commitment resolver now reuses each program's planning roster within its synchronous call. That call changes verbal statuses, offer state, story and negotiation terminal state; it does not change roster/eligibility, incoming signings, promises or preferences. The local cache is discarded on return. The next measured hotspot was repeated full-history match-stat scans; a WeakMap index now follows the immutable canonical log collection and preserves ordering and independent returned arrays/line objects. There is no new truth access, RNG stream, valuation formula, eligibility rule or cadence.

## C. TRAINING

In the same window, 7.364 s -> 4.036 s, **1.82x**. The profile measured 4.891 s in immutable world updates during training. A real 317,143-record history-copy benchmark measured spread 348.672 ms versus ordered key-copy 168.855 ms. Stimulus and scheduled-session maps remain complete immutable JSON-safe copies; their insertion order is preserved. Due sessions use the existing date index, and completion replaces same-date indexed entries in canonical order. Date moves and duplicate input IDs fall back to rebuilding the canonical index. Focused tests cover stale completion indexes and repeated batch IDs. Staffing quality, injury draws, participation, evidence and morale remain exact.

## D. COMPARABLE BENCHMARKS

Both sides start from the same clean, normally advanced Save on 2038-12-30, with seed 15015 resumed from completed-game draws. The fixture was prepared by canonical advancement from Y6; no date was fabricated. The 7-day end is 2039-01-06 and the 30-day end is 2039-01-29. CPU sampling is enabled on both sides; source loading and final audit/hash/GC reporting are outside the simulation wall measurement. Daily observers are included equally. The first 7-day baseline followed warmup; the 30-day comparison uses freshly loaded identical fixtures on both sides.

| Scope | Before | After | Speedup |
|---|---:|---:|---:|
| TOTAL_WORLD_7D | 13.951 s | 9.373 s | 1.49x |
| RECRUITING_7D | 4.755 s | 2.346 s | 2.03x |
| TRAINING_7D | 1.451 s | 0.832 s | 1.74x |
| TOTAL_WORLD_30D | 48.543 s | 31.772 s | 1.53x |
| RECRUITING_30D | 19.009 s | 7.316 s | 2.60x |
| TRAINING_30D | 7.364 s | 4.036 s | 1.82x |

| Window | Total s | Recruiting s | Training s | Match s | Scouting s | Validation s | Other s |
|---|---:|---:|---:|---:|---:|---:|---:|
| 7d before | 13.951 | 4.755 | 1.451 | 0.000 | 0.593 | 1.042 | 6.111 |
| 7d after | 9.373 | 2.346 | 0.832 | 0.000 | 0.642 | 1.077 | 4.477 |
| 30d before | 48.543 | 19.009 | 7.364 | 3.491 | 2.649 | 5.262 | 10.767 |
| 30d after | 31.772 | 7.316 | 4.036 | 2.749 | 2.590 | 5.538 | 9.542 |

Scouting combines intake and assignment execution. Validation combines pre-advance validation and final daily publication. Other is the remaining measured total, including other lifecycle phases and transient instrumentation. Every persisted payload fingerprint matches before/after in both windows. Public world updates remain 986 plus 332 batch-internal updates in 7 days, and 1,340 plus 1,412 in 30 days. No behavior was skipped. The active-window games select BACKGROUND naturally (0 weekly, 6 monthly).

Historical October numbers are separate scopes: **MATCH_RESOLUTION_7D = 4.195 -> 1.102 s (3.81x)**; **TOTAL_WORLD_7D after = 6.934 s**. Those are not compared with the December/January active window. The old 360-day annual heartbeat is not a comparable complete-year baseline.

## E. CLEAN Y7

Exactly one newly authorized clean annual run: 2038-10-01 -> 2039-10-01, 365 days, from the unchanged certified Y6 with the corrected loader. The accepted production detail route resolves 178 BACKGROUND games; no forced tier, reduced cadence or alternative basketball engine was used.

**TOTAL_WORLD_ANNUAL = 339.241 s**. This sums actual canonical simulation batches and excludes 0.023 s of certification observers. Driver elapsed before Save is 339.346 s. The full certification block is 373.280 s, with approximately 34.039 s outside canonical simulation (checks, digest, Save, reload verification, GC and driver bookkeeping). These scopes are separate from the entire Vitest body (381.240 s).

Save: `C:/Temp/BS15I-fast-y7-save-v4.json`, 501,867,196 bytes; serialization 3.419 s; exact-file reload plus integrity/digest verification 17.760 s. Complete semantic digest and identity match. Player contracts **478 -> 478**, staff contracts **348 -> 348**, scheduled player contracts **0 -> 0**. The exact artifact also passes a separate load/serialize all-payload check without simulating another day. The previous uncertified artifact is preserved as `C:/Temp/BS15I-previous-uncertified-fast-y7-save-v4.json`.

All memory below follows forced GC; units are decimal MB.

| State | heapUsed MB | heapTotal MB | RSS MB |
|---|---:|---:|---:|
| Y6 single loaded world | 576.4 | 1186.1 | 3288.6 |
| Y7 pre-save (annual driver) | 685.4 | 1116.2 | 1966.3 |
| Y7 reload while original world remains live | 1250.1 | 1780.5 | 2904.8 |
| Y7 after temporary reload world leaves stack | 687.4 | 1039.8 | 2877.9 |
| Y7 standalone exact artifact reload | 659.5 | 1068.2 | 2187.5 |

The temporary reload helper returns only scalar evidence; its world leaves the stack before retained-heap GC. The drop from 1,250.1 MB to 687.4 MB verifies release. RSS retains allocator capacity and is reported separately. The standalone artifact check retains one loaded Y7 world only.

## F. INTEGRITY

Y7 has 1,388 Persons, 1,268 Players and 133 new Players, all backed by canonical talent materializations: zero synthetic/emergency replacements. Six canonical walk-on admissions; Team 0017 ends with seven rostered/enrolled/eligible Players and no deficit. Every NCAA team meets its minimum. Permanent eligibility-exit checks pass, including Team 0017's September departures; ended enrollments retain identity/history. Four new undrafted continuation transitions and 64 active rights preserve existing identities. Contracts match roster ownership and no duplicate active professional signing exists. No career ends occur in this Y7; focused career-lifecycle tests exercise retirement cleanup, and the artifact has no retired active roster/contract/right/enrollment ownership.

121 distinct focused system tests pass across the selected recruiting, training, history, daily publication, Save, career-ending and walk-on files. The initial realism failure was an outdated assertion listing an obsolete `balanced` style; it now checks the six already canonical styles, with all realism behavior assertions retained. The real-Y6 idempotency test, both benchmark windows, clean annual test and exact-artifact audit also pass. `npm run typecheck`, `npm run build` and `git diff --check` pass. No `Math.random(` in src and no improper React/Zustand/Tauri imports in Domain/Engine. Focused review found two cache/diagnostic edge cases, fixed and covered; final review found no correctness regression.

## G. STATUS

**PARTIAL: one remaining blocker:** the clean annual runtime is 339.241 s, **39.241 s (13.08%) above the required 300 s**. All persistence, integrity, short-window speedup and focused validation gates pass.

The measured new dominant subsystem is final daily publication: **53.564 s** annually. The final active-window CPU profile identifies historical scheduled-session and development-stimulus validation scans plus general world validation as its main cost. `C:/Temp/BS15I-remaining-validation-profile.json` records sampled functions separately from wall measurements. There is no claimed extrapolated speedup or unverified broad optimization. No production code changed after the annual certification; no second annual run, Y8+, commit, push or merge was performed. Accepted prior worktree changes are preserved.
