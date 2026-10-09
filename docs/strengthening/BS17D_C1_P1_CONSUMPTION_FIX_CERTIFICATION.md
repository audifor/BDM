# BS17D-C1 P1 consumption fix certification

**PASS · BS17D-C1 P1 CONSUMPTION CLOSURE**

**SAFE TO FREEZE: YES**, within the reviewed C1 scope. BS17D global remains PARTIAL.

## Base, contract and isolation

Base: `ece086779ad500833880bc47aad125f60dbc5a66`. Branch: `bdm-stage2-bs17d-c1-consumption-fix`. Worktree: `C:/BDM-BS17D-C1-CLOSURE`. Final SHA: local commit containing this certificate, supplied in delivery. This is a focal repair under the approved [C1 V1 contract](BS17D_C1_PHYSICAL_ALLOCATION_POLICY.md) and the supplied C1-FIX mandate, not another functional phase.

Base, C, T, T1 and V2 remain ancestors. Original C1 worktree and its clean HEAD are preserved. Main stays `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; origin/main stays `94c077092224a9f75c861a853d9d52fceae526fe`. No external commits were imported. No merge, rebase, fetch, push, installation or network step. Existing dependencies were copied locally into this isolated worktree.

The prior C1 PASS and audit FAIL are retained without rewriting. [Historical acceptance FAIL](evidence/BS17D_C1_FINAL_ACCEPTANCE_FAIL.md), [diagnostic reproduction source](evidence/BS17D_C1_P1_HISTORICAL_REPRODUCTION.txt) and [diagnostic results](evidence/BS17D_C1_P1_HISTORICAL_DIAGNOSTIC.json) are verbatim copies of the original preserved local review artifacts. Diagnostic PASS there means the defect was reproduced, not acceptance passed.

## Root cause and repair

Previously Training asked C1 only for CONFIRMED/PENDING/BLOCKED records. An operation with no reservation or only RELEASED history went through P0, which resolves capability/access/service but not confirmed occupancy. It could complete and receive stimuli despite RESOURCE_OCCUPIED from C1.

Three permanent F1 assertions were added before any production fix. The [red report](evidence/BS17D_C1_P1_FIX_EVIDENCE.json) records three failures against the original behavior: expected scheduled, received completed. They assert the correct required outcome; no diagnostic bypass expectation substitutes for the repair gate.

Training now checks unreserved consumption before sports effects. The new pure TrainingPhysicalConsumption helper calls the existing Facilities allocator/query and existing P0 resolver. It neither grants access, selects a resource, creates an implicit reservation nor writes a world. The allocator is unchanged. An earlier explicit component identity remains respected after release; without selection, candidate evidence is considered without automatic allocation. Known conflicting occupation persists VERIFIED_UNAVAILABLE with resource identity/reason, and the existing Training pending arrays carry that physicalAttempt through one batch publication.

Confirmed own requests retain the original effective-operation revalidation and priority. Pending/blocked requests retain the original confirmation gate. Cancelled sessions never enter execution. A known conflicting exclusive reservation of another Team blocks NONE/RELEASED consumption, including reload and partial overlap. Compatible alternatives remain manager choices in the existing UI. Rescheduling does not destroy the old history and retries the sporting session once.

Two simultaneously due known unreserved consumers have no accidental iteration priority. Exclusive conflicts and shared capacity overflow stay pending with PENDING_PRIORITY_DECISION. The check uses the actual due-session set, effective delegated physical requirements, real selected demand and half-open intervals. Sharing is allowed only for compatible identical physical scopes; released parent/child identities cannot be collapsed into the same shared component. Separately selected components are independent. No gender/category priority is introduced.

## F1 results and causal coverage

F1-A PASS: youth8 CONFIRMED exclusive10 10:00-11:00 completes; senior individual1 10:30-11:30 without a reservation stays scheduled, records RESOURCE_OCCUPIED, has no execution or stimulus event.

F1-B PASS: releasing youth's prior reservation permits another Team's legitimate confirmation, but does not permit youth to consume its occupied resource. Youth stays scheduled without effects; the other operation completes legitimately; released history survives.

F1-C PASS: Save V4/reload preserves reservation/source identities and released history. Training still blocks the incompatible session, while the confirmed session completes once. A repeated execution creates no duplicate completion/effects.

Complementary permanent cases cover NONE without conflict, absent infrastructure, independent modules, consecutive intervals, partial overlap, explicit sharing/insufficient shared capacity, exclusive competition in both iteration orders, dated rights, incompatible units, insufficient capacity, unknown demand, cancellation/replacement, restoration, explicit alternatives, legitimate rescheduling, later exactly-once execution, individual/team/youth and cache invalidation after confirm/release/move/reload. Parent/child and separate selected scope cases run both iteration orders. Existing allocator cases also preserve midnight rights, works, known condition changes, SAVE integrity, idempotence and prior-reservation atomicity.

## UNKNOWN, P0 and authorities

Missing information never becomes unavailable merely because no reservation exists. Missing infrastructure retains UNVERIFIED_PHYSICAL_CONTEXT and sporting P0 continuity. Where P0 already proves capability/access/service but quantitative demand/capacity is not known, its existing VERIFIED_AVAILABLE or VERIFIED_LIMITED capability evidence is retained; operationalCapacity remains null and no confirmed allocation is implied. This is the original P0 distinction, not a quantified occupancy guarantee. Explicit active C1 requests retain their existing UNVERIFIED semantics. Independent operations acquire no new physical requirement.

Facilities retains resources, rights, reservations, capacity and occupation authority. Training retains scheduling, participants, delegated choices, intensity, execution and sports effects. Calendar remains the only temporal processor; Save retains source facts/history. No persisted collection, parallel agenda, implicit booking, multiplier or formula is introduced. No Finance, Governance, Talent supply/PlayerId, Recruiting probability, NCAA, Medical/Recovery or MatchEngine production file changes. No costs, budgets or financial reservations are created.

## Batching, cache and manager flow

Existing date cache, pending evidence/session arrays, batch flush, dirty validation and atomic GameWorld publication remain unchanged. Consumption reads current Facilities occupation through the existing active WeakMap index, not the entire retained allocation history per session. Peer competition uses only the current executable due sessions. No GameWorld reconstruction occurs per check. Confirm/release/reschedule/reload query invalidation is tested. Effects remain downstream of the physical gate.

The existing UI is unchanged. A new real manager regression demonstrates released consumption blocked with RESOURCE_OCCUPIED/resource history after Save/reload, no false executed state, manager rescheduling and later exactly-once completion. Alternatives continue through existing C1 controls. No screen redesign, fixture data copied to production or generalized source-world capacity claim.

## Independent adversarial review and validation

[Independent post-fix review](evidence/BS17D_C1_P1_INDEPENDENT_REVIEW.md) inspected NONE, RELEASED, CANCELLED, PENDING, BLOCKED, CONFIRMED, effective delegation, rescheduling, Save/reload, batch publication and cache paths. It found a complementary released parent/child sharing defect in the initial repair; [red evidence](evidence/BS17D_C1_P1_ADVERSARIAL_RED.json) was independently reproduced, a minimal scope guard and permanent tests were added, and [green evidence](evidence/BS17D_C1_P1_ADVERSARIAL_GREEN.json) independently closed it. No unresolved demonstrated equivalent bypass remains in the reviewed approved scope. SAFE TO FREEZE is conditional on final gates for the reviewed production snapshot; file hashes are recorded.

Focused validation union: **216 tests PASS across 12 files**, with latest passing reruns replacing failed intermediate file results. Includes F1/new complementary tests, allocator C1, Training P0/scheduling/delegation, youth integration, Recruiting T1, Save V4 Facilities/operations, Calendar exactly-once, five V2 cross-system tests and manager/workspace UI. This is not a new whole-suite or longitudinal certification. [Assertion evidence](evidence/BS17D_C1_P1_FIX_EVIDENCE.json) lists each final result and raw hashes.

Autocorrection retained the initial three red failures. Intermediate failures exposed a P0-evidence regression in the first helper, corrected by preserving baseline capability evidence; the shared-capacity assertion was restricted to the dependent consumers instead of counting the independent session; UI fixture rights were made legitimately shared for its controlled two-Team scenario; cache move was changed to a genuinely collision-free test interval. No production rule was weakened, test deleted or timeout increased. All intermediate artifacts remain locally preserved and hashed.

Final typecheck and build completed with exit 0; the inherited Vite bundle-size advisory remains. Diff check and static guards PASS, with zero Math.random calls in src and zero production Domain/Engine React/Zustand/Tauri imports. The branded component-ID typing issue was corrected without changing runtime behavior and independently rechecked. Gate details are recorded in the evidence. Rust/Save/Calendar/schema/dependencies are unchanged. The milestone requires focused TypeScript gates; neither a global known-failure suite nor native unchanged-code checks were repeated.

## Scope and next action

BS17D GLOBAL remains PARTIAL for specialized Medical dependencies. Incomplete real-world Facilities datasets remain UNKNOWN. No specialized Medical, Facilities AI, Finance milestone, BS17E/F or generalized real utilization is certified. World DB2029 stays UNRESOLVED_HISTORICAL_CAUSE; no Y1-Y30 or historical run is repeated, explained or reclassified. Earlier bounded V2 and global baseline classifications are preserved.

Next action after final PASS: freeze the repaired local C1 consumption foundation within its certified scope. No merge to main, push or next phase in this execution.
