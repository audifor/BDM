# BS FINAL PUBLICATION — main and GitHub

Integration and publication only: no new functionality, no BS18, no World DB V2.

## References

| | SHA |
|---|---|
| Local `main` before publication | `8a0b359e9ae48fe372668241788c9d5aa7a33b03` |
| Remote `main` before publication (`git fetch origin`, `git ls-remote origin refs/heads/main`) | `94c077092224a9f75c861a853d9d52fceae526fe` |
| R2 certified candidate | `1a0b220777483187d25fea22a91f17b543179cc1` |
| Published `main` | the commit that adds this document on top of the R2 candidate (documentation only; see *Remote verification*) |

Remote: `audifor/BDM` (`origin` and `github` both point to `https://github.com/audifor/BDM.git`).

## History reconciliation

- Local `main` (`8a0b359e`) is an ancestor of the candidate.
- Remote `main` (`94c07709`) is an ancestor of the candidate. Remote and local `main` had diverged (`94c07709` is not an ancestor of
  `8a0b359e`), but the candidate contains both histories (BS17 final already merged the BS15 line `94c07709`, and the integration
  branch was built from local `main`).
- No reconciliation merge was necessary; no conflict existed; no commit of either line is lost.
- Publication is a fast-forward of local `main` and a normal (non-force) push of remote `main`.

## Ancestry of the sources (all ancestors of the published commit)

`main` local `8a0b359e`, remote `main` `94c07709`, BS17 final `1559409`, BS16 final `680d7aa2`, BS17E-A `fdeaf817`, BS17E-0/P/P2 policy
records `dc63d604`, BS ALL R1 `76bd64bc`, R2 `1a0b2207`. BS0–BS14 and BS16C–E are ancestors of `main`; BS9–BS11 content is in `main` by
equivalence (see `BS_ALL_FINAL_INTEGRATION_CERTIFICATION.md`).

## Gates

| Gate | Result |
|---|---|
| `npm run typecheck` on `1a0b2207` | PASS |
| `npm run build` on `1a0b2207` | PASS |
| `git diff --check`, conflict markers | clean / none |
| Smoke (Save V4, STAFF-CONTRACT V4-01 policy, Facilities production gameplay, BS15/16/17 convergence V3.1, Calendar, Governance) | 6 files, 88/88 |
| R2 certification reused | the published code is byte-identical to the R2 candidate (only this document is added): 26 reconciled files 0 failures; global suite 5,286 tests, 5,138 passed, 51 failed (47 identical to `main`, 4 load timeouts passing alone); three seasons certified in R1 |

No three-season simulation was repeated: no causal change since R2.

## Inherited limitations

The 47 failures that also exist on `main` (match-engine audits, desktop host, World DB bootstrap, season content activation, 5 s timeouts
of heavy suites); heavy suites near the 5 s default under parallel load; duplicate "Overview" accessible name on the player workspace;
revenue profile only for the ACB demo; `BS15IFinalY5SaveAudit` NOT RUN without external evidence.

## Worktrees

No worktree was created, removed or moved by the publication. `C:\BDM` keeps `feat/home-courtside` with its uncommitted local changes
untouched. `main` was not checked out in any worktree, so the local fast-forward updated only the branch reference.
`C:\BDM-BS-FINAL-INTEGRATION` stays on `integration/bs-all-final`.

## Remote verification

Recorded after the push in the publication report (the published SHA is the commit containing this document).
