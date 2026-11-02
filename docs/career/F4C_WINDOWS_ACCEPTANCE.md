# F4C Windows acceptance

## Covered on Windows CLI

- Worktree and TypeScript tests run on Windows PowerShell.
- `npm run typecheck -- --pretty false` passes after the unified-world changes.
- WorldDB global, New Game, NCAA and F4C focused tests pass in the recorded runs.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes on Windows.
- `npm run build` passes on Windows.

## Manual checklist still pending

Native GUI acceptance was not claimed from CLI evidence. The exact manual checklist is:

1. Open BDM and choose `NEW GAME`.
2. In `WorldDB / PBM`, select at least one detailed or reduced competition.
3. Enable `Incluir NCAA masculina y femenina`.
4. Select a PBM/NBA/G League club or an NCAA male/female program.
5. Create the coach and start the career.
6. Confirm Courtside shows the correct ecosystem capabilities and the single world date.
7. Open the applicable Market, Trade or Recruiting/Portal workspace.
8. Advance one day, save with Save V4, reload and confirm the active club, teams and both NCAA categories remain.
9. If a valid vacancy exists, use the canonical Coach Career offer flow to change club and confirm the old club no longer has the coach.

No screenshot or visual PASS is claimed because the native GUI session was not run in this certification.
