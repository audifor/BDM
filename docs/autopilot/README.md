# BDM Codex Autopilot

This package turns the current BDM workflow into a controlled local Codex pipeline.

It automates milestones:

- 016B.1 - enforce valid MatchEngine lineups
- 016C - show real players in MatchViewer
- 017 - derived player boxscore v1
- 018 - rebounds and assists v1
- 019 - fouls and free throws v1

It intentionally STOPS after 019 for a human architecture checkpoint before rotations/fatigue.

## Safety model

The runner:
- operates only inside the BDM repository with Codex `workspace-write` sandbox
- executes one milestone per fresh Codex run
- requires a clean Git working tree before every milestone
- requires each successful milestone to create its own commit
- stops on BLOCKED, dirty working tree, failed Codex execution, or missing commit
- records runtime state under `.codex-autopilot/` (gitignored)
- never pushes

Codex reads the repository-root `AGENTS.md` automatically.

## Model policy

Default milestone policy in `docs/autopilot/milestones.json`:
- narrow work: `gpt-5.6-terra` medium
- deeper simulation work: `gpt-5.6-terra` high
- foul/free-throw architecture milestone: `gpt-5.6-sol` high

You can override the model/reasoning for the whole run with script parameters if desired.

## One-time setup

1. Extract this ZIP into the root of `C:\BDM`.
2. Open PowerShell in `C:\BDM`.
3. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-and-run-bdm-autopilot.ps1
```

The installer:
- checks that commit `f676d25` is an ancestor of the current repository
- checks there are no tracked local modifications
- appends `.codex-autopilot/` to `.gitignore`
- commits the autopilot infrastructure
- launches the runner

If Codex CLI is not installed/authenticated, the script stops without touching game code.

## Later runs

If an autonomous run stops or your weekly allowance is exhausted, run again later:

```powershell
.\scripts\bdm-autopilot.ps1
```

Completed milestone IDs are remembered in `.codex-autopilot/state.json`.

## Inspect status

```powershell
.\scripts\bdm-autopilot.ps1 -StatusOnly
```

## Limit how much work one launch can do

```powershell
.\scripts\bdm-autopilot.ps1 -MaxMilestones 2
```

## Override model

```powershell
.\scripts\bdm-autopilot.ps1 -ModelOverride gpt-5.6-sol -ReasoningOverride high
```

## If it blocks

Look at:
- `.codex-autopilot/last-result.json`
- `.codex-autopilot/logs/`

Then bring the BLOCKED result back to the architect instead of asking Codex to improvise around the stop condition.
