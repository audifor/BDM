# BDM Career - F3.1 final report

## Estado

**PARTIAL**.

The accumulated Career route is functionally green in controlled tests. The status cannot be upgraded to PASS because the historical global failure logs are absent, the new global run was interrupted after demonstrating a long WorldDB performance fixture, and native Windows acceptance could not start because the Computer Use pipe was unavailable.

## Branch and isolation

- Branch: `feature/career-f3-1-integration-closure`
- Worktree: `C:\BDM-worktrees\career-f3-1-integration-closure`
- Base: `a214d68a` (`feature/career-f3-human-experience`).
- No changes to `main`, `feature/worlddb-global-playable-02`, prior Career worktrees or `docs/playable/evidence/f3/ab-comparison.json`.
- F3.1 required no production-code correction; this commit contains closure evidence and a manual Windows procedure.

## Global failures and classification

1. Historical F3 `x` output: logs and final summary absent. Classification **UNKNOWN**; no attribution to Career.
2. New single-worker global run: `WorldDbGameBootstrap.test.ts` measured `advanceGameDay x100: 292338.6ms`. Classification **PERFORMANCE**; no Career failure observed. The run was interrupted without a final summary.
3. Computer Use native pipe error: `failed to connect native pipe ... os error 2`. Classification **ENVIRONMENT**; native visual acceptance remains pending.

The controlled Career-related run completed 19 files and 201 tests with zero failures, so no demonstrated F0B-F3 regression was available to fix.

## Regression results

- F0B: 4/4 PASS, 393.75 s.
- F1: 20/20 PASS, 179.89 s.
- F2: 24/24 PASS, 1214.91 s.
- F3 Human Career: 3/3 PASS, 360.39 s.
- Career/HRPG/Staff/Home/Save/Match focused set: 201/201 PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with existing large-chunk/circularity warnings.
- Cargo fmt/check: PASS.

## Accumulated playable route

The F0B-F3 tests cover ACB/UCAM Murcia creation, coach identity, arrival, staff responsibilities, autonomous training/scouting, Home/Director Hub decisions, HRPG relationship and memory consequences, MatchEngine execution, Save V4 and 30-day continuation. F3 D additionally verifies a valid club change preserves coach/person identity and memory while changing current employment authority.

No second Inbox, RPG, relationship system, counter, calendar or sporting multiplier was introduced.

## Windows result

Native acceptance is **PENDING**, not PASS. The reproducible manual procedure and evidence checklist are in [F3_1_WINDOWS_ACCEPTANCE.md](F3_1_WINDOWS_ACCEPTANCE.md).

## WorldDB risk

No WorldDB integration was performed. The compatibility matrix records the shared GameWorld/Save V4/calendar boundaries and the demonstrated WorldDB performance cost. A future merge should be isolated and revalidated; mass cherry-pick is not recommended.

## Recommendation for F4

Proceed with F4 only after scheduling a Windows acceptance session and deciding whether the WorldDB performance fixture has an acceptable budget. The Career core is not blocked: focused regressions, Save V4 and the 30-day route are green. F4 should not use the incomplete global run as a release gate until that performance baseline has a final, reproducible outcome.
