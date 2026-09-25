# MatchEngine Development Acceleration Tools V1

These PowerShell tools support MatchEngine milestones MG8–MG14. They use the repository's Git, npm, Vitest, and Cargo commands; they add no dependencies and do not modify gameplay.

## New-MGMilestone

Create a branch and sibling worktree from an existing commit:

```powershell
.\scripts\matchengine\New-MGMilestone.ps1 `
  -Milestone MG8A `
  -Slug defensive-onball `
  -BaseSha <BASE_SHA>
```

The branch is `matchengine-v3-mg8a-defensive-onball`; the worktree is derived from the repository's parent directory as `C:\BDM-MG8A`. The script validates the repository, milestone/slug, commit, branch, and path before creation. It refuses collisions and never deletes or overwrites existing work.

Preview without creating anything:

```powershell
.\scripts\matchengine\New-MGMilestone.ps1 `
  -Milestone MG8A `
  -Slug defensive-onball `
  -BaseSha <BASE_SHA> `
  -DryRun
```

Worktree creation does not run tests.

## Get-MGTestPlan

Plan checks for staged, unstaged, and untracked changes in the current worktree:

```powershell
.\scripts\matchengine\Get-MGTestPlan.ps1
```

Include a committed milestone range as well:

```powershell
.\scripts\matchengine\Get-MGTestPlan.ps1 -Since <BASE_SHA>
```

The planner combines changed files with explicit rules in `scripts/matchengine/test-impact-map.json`, discovers direct sibling tests such as `Foo.test.ts`, deduplicates test paths, and prints reasons for its recommendations. T0 covers local changes, T1 a focused mechanic, and T2 a shared authority. A changed `src/engine/match` file with no matching rule is labeled `UNKNOWN MATCHENGINE IMPACT` and requires manual review, even when a sibling test exists.

Planning never runs tests. T3 is the final MG certification, handled separately by `Invoke-MGCertification.ps1`. To run only the deduplicated focused tests and any typecheck required by a matched rule:

```powershell
.\scripts\matchengine\Get-MGTestPlan.ps1 -Since <BASE_SHA> -Run
```

The planner does not recommend a full suite or build for ordinary subdivisions.

## Invoke-MGCertification

Run the final MG certification once, in order:

1. Focused MatchEngine tests.
2. MatchEngine regression suite.
3. Full test suite.
4. Typecheck.
5. Build.
6. `git diff --check`.
7. Rust formatting check.
8. Rust check.

```powershell
.\scripts\matchengine\Invoke-MGCertification.ps1
```

It stops after the first failed stage by default and reports the failed step, command, and exit code. Use `-ContinueOnFailure` only when gathering diagnostic results. Each stage and the total run are timed. To save a JSON summary, pass `-ReportPath reports\mg-certification.json`; its parent directory must already exist. No report is created by default.

Preview the exact stage order, commands, and working directories without executing them:

```powershell
.\scripts\matchengine\Invoke-MGCertification.ps1 -DryRun
```

## MG8–MG14 workflow

```text
START SUBDIVISION
New-MGMilestone
→ implement the change
→ Get-MGTestPlan
→ run the minimum focused checks
→ commit

FINAL SUBDIVISION
Invoke-MGCertification
→ PASS
→ integrate into main
```

The tools do not commit, merge, push, reset, clean, or delete branches/worktrees.
