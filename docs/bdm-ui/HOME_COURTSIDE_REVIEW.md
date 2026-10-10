# BDM UI / HOME: first functional Courtside preview

Source branches:
- `main` at `94c077092224a9f75c861a853d9d52fceae526fe`: NG HOME logic and all canonical data
- `docs/visual-proposal-courtside`: exact original Courtside visual reference imported as `docs/visual-proposal/`

This is the first **review candidate**, not a visually certified 1:1 build.

What is implemented:
1. HOME automatically selects Courtside skin on this branch, and other workspaces retain NG.
2. Source Courtside fonts and dark colors, 68 px fixed taskbar, 48 px icon tiles and compact top bar.
3. The NG component tree, live next game, match dynamics, upcoming fixtures, the four interchangeable slots, and the eight slot types remain intact.
4. Existing Continue, simulate-until, app navigation, inbox, club and standings links are reused.
5. No domain, engine, store or persistence files are modified.

Source-of-truth:
- `docs/visual-proposal/src/app.js` and `b.css` (fixed-taskbar rules towards the end, not the superseded floating dock).
- `docs/visual-proposal/src/screens/home.js`.
- `src/ui-ng/applications/home/{HomeWorkspace.tsx,HomeDashboardSlot.tsx,homeDashboardModules.ts}`.

To inspect: checkout `feat/bdm-ui-home-redesign`, run `npm run tauri dev`, load a save and open Home.
Inspect at 1920x1080, then 1280, tablet and mobile. The canonical screenshot set is in
`docs/visual-proposal/png/courtside/` (Git LFS). Record screenshots and compare
visually before declaring PASS. No layout/browser screenshot or typecheck has been run
in this environment.

**Known visual/behavioral deltas requiring review**
- Header logo text is real; team crest is an initials fallback when a real logo is absent.
- Taskbar maintains NG's navigation, adds pinned closed icons and overflow, but full Courtside drag-to-reorder/pin menu needs later integration.
- The current NG widget/module content is preserved, so the screen is not pixel-identical to the static Courtside Home concept by design.
- Light-theme and responsive 1:1 have not been certified.
- Numeric prediction widgets from the static concept have NOT been copied into the functional NG UI.

Nothing in this branch should merge to `main` without the user's visual approval.
