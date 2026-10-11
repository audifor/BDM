# BS15 + BS16 intermediate convergence gate

Status: PASS for the intermediate focal gate; this is not the final three-line certificate.

Frozen sources: BS15 `94c077092224a9f75c861a853d9d52fceae526fe`, BS16 `97c58b98b9192a569f30bdfd8b63565f0b02a744`. Merge-base `a6826469c78f8f948d73fd663e4996a99d30c678`. Isolated branch `integration/bs15-bs16-bs17-certified`, worktree `C:/BDM-INTEGRATION-BS15-BS16-BS17`.

Four real conflicts resolved:

- createNewGame: retain dated Talent, Portal and institutional NCAA policies; add canonical Finance foundation and initial-date processing after their initialization.
- Finance exports: retain ExpenseAccountMapping and FinanceFoundation together.
- Calendar imports: retain career-end, annual Talent and professional pathways alongside the single Finance processor. No duplicate phase.
- Save V4 compatibility extraction: retain all BS15 Talent strips, disable Staff backfill for current V4, and strip/restore FinancialReservations exactly once.

GameWorld automatic composition retains both collections and the BS15 validation scope. Focused review identified an additional missing dependency: financialReservationsById was mapped but never read by any validation block. A minimal reference-tracked block invokes its existing constructor, including when publication supplies a direct Record. Two full/incremental rollback tests cover valid dirty publication and malformed reservations, with no new economic policy.

Validation evidence (local .local-certification JSON/log files):

- Initial focal gate: 423 PASS / 431 tests. Coverage: Finance domain/engine, Save activation/reservations/Treasury, Calendar, Talent supply, world batching, daily validation/publication, BS15 final coexistence and WorldSim.
- Frozen BS16 archive reproduced seven of the eight failures: five CF4 fixtures delete accounts now referenced by legitimate initial payroll; Foundation expects no ledger after payroll; Opening expects no ledger/history. The eighth assertion rejects independent BS15 NIL budget lines for unknown Finance profiles.
- Corrections preserve contracts: CF4 tests use generated real contracts before daily payroll; Foundation/Opening require input-ledger preservation rather than false emptiness; Opening checks the actual prior-history status and zero cash for known profiles; salary activation assertions select the salary categories they own.
- Corrected four-file subset: 39/40 PASS before final Opening history expectation repair. Final Opening plus dirty-reservation subset: 15/15 PASS. Every initially failing case is now covered by a passing focused rerun; no assertion or test deleted.
- Typecheck and build PASS. The build retains the existing chunk-size advisory. Diff check PASS.

BS16 remains certified only through K-C. H opening sources remain PARTIAL, L/M/N remain pending, ACB initial-date and receivable collection boundaries remain documented. No Y1-Y30 rerun, new cash source, formula or consumer migration.

The containing two-parent merge is the intermediate integrated SHA (`git log -1 --format=%H -- docs/integration/BS15_BS16_INTERMEDIATE_CERTIFICATION.md`). BS17 may be integrated only after this gate.
