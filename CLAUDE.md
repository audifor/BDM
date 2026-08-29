# BDM Claude Code Instructions

This repository is BDM / Basketball Dynasty Manager.

Before making changes, read and obey:

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/autopilot/PRODUCT_GUARDRAILS.md`
4. Any GitHub Issue, milestone document, or task explicitly supplied for the current run.

`AGENTS.md` is the shared cross-agent working contract and is authoritative for architecture, validation, stop conditions, commit discipline, and reporting.

Do not infer or change product decisions that are not already approved. Keep Domain/Engine framework-independent, preserve deterministic simulation rules, follow the repository Definition of Done, and keep each implementation scoped to one task.

When invoked through `scripts/bdm-issue-runner.ps1`, do not push or open a pull request yourself. The runner handles GitHub operations after a successful clean local commit.
