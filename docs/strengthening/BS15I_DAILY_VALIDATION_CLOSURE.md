# BS15I final daily-validation closure

PASS. One newly authorized Y7: 2038-10-01 -> 2039-10-01,365days, from certified Y6. No Y8+, commit, push or merge.

## Trace and implementation

`advanceGameDayWithResult -> withDailyWorldValidation -> withSingleWorldValidation -> validateUpdatedGameWorld -> validateWorld` publishes once per successful day. The canonical validator has112 constraint blocks plus6 financial boundary blocks. Previously its daily loops revisited growing historical scheduled sessions, stimulus evidence, staff reactions, scouting evidence and other ledgers. Certified Y6 contains55,596 scheduled sessions,1,072 completed-game logs,4,444 evaluator reports and4,484 scouting assignments.

Each canonical block records the immutable root collections/value dependencies actually read. A successful receipt is reusable only while every dependency remains identical; outer derived inputs have explicit dependencies. Dirty source collections, entity removals and affected cross-domain constraints run the same canonical formulas. Unknown or arbitrary replacements fall back to canonical traversal. Training validation indexes pending/changed sessions and affected date collisions, staff assignments and injury backlinks; date moves rebuild the index. Stimulus append revisions collapse across the owning synchronous batch, including direct intermediate worlds, so new evidence does not force a historical scan. Per-update append-only/immutability guards remain active.

Receipts and indexes are weak-keyed, contain canonical collection/record references or scalar revisions, and retain no old GameWorld or index-generation chain. No WeakRef workaround. Full creation/load validation remains; `validateGameWorld` runs all blocks with no previous-world fast path at explicit audits and the annual pre-save checkpoint. Reload reconstructs through the full canonical creation boundary. Debug daily reference mode runs every canonical block. Active contract ownership, retired ownership and permanent NCAA eligibility guards apply equally in both daily modes. No RNG, recruiting, training-engine, tier policy or cadence changed.

## Paired gates

Both sides load the unchanged certified Y6, seed15015 resumed from1,072 completed-game draws, and use normal production tier selection. Simulation wall timing excludes load and final hash/audit/GC; includes observers equally. CPU sampling disabled. All211 persisted payload fields match in both windows; no field is excluded.

| Window/mode | Total s | Final validation s | Recruiting s | Training s | Match s | Scouting s | Other s |
|---|---:|---:|---:|---:|---:|---:|---:|
| 7d reference | 5.669 | 1.210 | 0.001 | 0.827 | 0.997 | 0.542 | 2.092 |
| 7d incremental | 4.653 | 0.148 | 0.001 | 0.807 | 1.019 | 0.542 | 2.136 |
| 30d reference | 30.234 | 4.747 | 0.002 | 3.394 | 14.826 | 2.034 | 5.230 |
| 30d incremental | 26.435 | 0.597 | 0.002 | 3.473 | 14.658 | 2.062 | 5.643 |

Scouting combines intake and assignments; other is total minus these measured buckets. In30days, scheduled-history validation falls3,708.930ms ->22.906ms. Stimulus validation costs6.726ms ->6.504ms after correct append lineage; earlier diagnosis found a307,011-record fallback caused by a missing intermediate revision. Reports cost96.003ms ->77.205ms; staff reactions58.270ms ->56.533ms. Full per-block timings and dirty frequencies are preserved in the JSON. In30days, date/scouting-territory/training-aggregate/fatigue collections change30times; stimulus evidence23times, scheduled sessions19times, and game/report/person collections14times. Unchanged histories are reused. The prior annual projection, replacing only its measured publication cost, was292.940s, allowing the annual gate.

## One clean annual run

Canonical simulation: **273.383s <=300s**. Final daily validation: **4.370s <=15s**,365calls, maximum52.757ms. Prior clean Y7:339.241s; validation53.564s. Total improves1.241x, validation12.257x. The historical original slow path exceeded516.782s after360days, giving a descriptive ratio>=1.890x against the new365day run; that old run had a faulty loader and lacks an exact365day runtime, so it is not a paired annual certificate.

Runtime scopes: canonical simulation273.383s; certification observers0.032s excluded; driver before Save273.532s; complete certification including checks/Save/reload/GC305.419s; Vitest body312.970s; CLI duration317.300s. Full canonical checkpoint validation0.691s is outside daily simulation. Annual phases: recruiting39.131s, training38.705s, match46.172s, scouting28.734s, final validation4.370s, other116.272s.

Save: `C:/Temp/BS15I-final-y7-save-v4.json`, **501,867,196bytes**. Serialization3.139s; exact reload and verification16.473s. Full semantic payload/identity and separate load/serialize audit pass. It is byte-identical to accepted `BS15I-fast-y7-save-v4.json`: SHA256 `069a701064f8281ca1a9bc1e66563a0273ba0142dbbcae0e086fbb339c566d52`. No extra simulated day for artifact certification.

Persons1,388; Players1,268; player contracts478->478; staff contracts348->348; scheduled contracts0. All133 new Players have canonical materialization. Six canonical walk-on admissions,64 active rights,4 undrafted-continuation transitions. Team0017 has7 rostered/enrolled/eligible Players, zero permanent exhaustion; all NCAA teams have>=5eligible and zero deficits. Permanent exits, Draft rights, professional continuation, retired lineup/ownership cleanup and identity checks pass. Production resolves178 BACKGROUND games.

## Forced-GC memory and verification

Decimal MB, all explicit forced GC:

| Stage | heapUsed MB | heapTotal MB | RSS MB |
|---|---:|---:|---:|
| Y6 stable post-setup, one world |606.5|1116.0|1386.9|
| Y7 pre-save |686.6|943.7|1882.2|
| Original plus reload world live |1253.4|1759.9|3011.0|
| Reload temporary released |689.5|938.5|2989.0|
| Separate artifact, one world |660.1|1065.5|2100.2|

The immediate post-deserialize baseline is also retained in JSON (823.4MB heap): this earlier stage includes transient load allocations. Stable baseline uses the post-setup measurement. Heap drops after releasing the temporary reload world; RSS retains allocator capacity. Indexes do not retain obsolete world generations.

**151 focused tests in13files pass**, including30 atomic failure cases across full/incremental validation and FULL/STANDARD/BACKGROUND detail: duplicate roster ownership, invalid contract ownership, permanently exhausted NCAA roster, dangling Player and invalid lineup. Additional direct tests cover dangling contract references, training staff changes, new evidence and replacement-then-deletion of staff contexts. Paired7/30day payload gates, annual certification and standalone artifact pass. Typecheck, build and diff check pass; existing build chunk warning. Zero `Math.random(` and improper React/Zustand/Tauri imports in Domain/Engine. Focused independent review passes.

Detailed current evidence: `dailyValidationClosure` in `BS15I_WORLD_SIM_SCALE_RESULTS.json`. Earlier sections remain historical. Raw reports and logs: `C:/Temp/BS15I-validation-{reference,incremental}-{7,30}d.json`, `BS15I-final-y7-{runtime,metrics,artifact}.json`, and corresponding logs. Accepted changes preserved. No commit, push, merge, dependency installation or Y8+.
