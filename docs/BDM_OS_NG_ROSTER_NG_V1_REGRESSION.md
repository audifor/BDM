# BDM_OS_NG · Roster NG V1 · Regression Register (STEP 013 → 013D)

**Checkpoint base:** NG-012 Roster migration preservation audit (`8ca1cb2`)  
**Implementation:** STEP 013 Roster NG visual migration  
**Verification:** STEP 013A preserve-first · STEP 013B stable mount · STEP 013C product pivot · STEP 013D workspace navigation + session restore · **STEP 013E real-browser certification** · **STEP 014 scout-aware rating presentation (data honesty gate)**  
**Functional source:** `PlantillaPcbPage` → `CanonicalRoster` (`variant="ng"`) → `BDMDataGrid` (`visualMode="ng"`) **plus** ported capabilities from `SquadScreen` → `RosterSquadTable`

---

## Chronology

| Step | Finding / change |
|------|------------------|
| **013A** | Embedded panel remount reset preset; `replaceState` blocked Back; position filter + expiry gaps |
| **013B** | Stable split host fixed in-panel state preservation |
| **013C** | Product requirement changed: Roster → **PlayerWorkspace NG** (no embedded `PlayerProfileApp`) |
| **013D** | Embedded architecture **removed**; `navigateToPlayerFromRoster` + `useRosterWorkspaceSession`; position filter + EXP ported |
| **013E** | Real-browser certification PASS; scroll restore fixed (outer ScrollRegion + mousedown snapshot); `verify-step-013e-roster-browser.mjs` supersedes 013A parity script |

---

## Architecture path (STEP 013D — current target)

```
BdmOsNg
  NgWorkspaceNavigationProvider
  EntityContextMenuProvider (openEntity → navigateToPlayerFromRoster when app=roster)
    WorkspaceHost (?app=roster | ?app=player)
      RosterWorkspace
        useRosterWorkspaceSession (Zustand — presentation-only)
        ScrollRegion → CanonicalRoster (sessionBridge, variant="ng")
      PlayerWorkspace (?playerId=&playerView=overview)
```

**Removed (013D):** `?rosterPlayer=`, 62/38 split, `PlayerProfileApp` in NG Roster, `rosterPlayerId` prop chain.

**Production baseline (unchanged):** `DesktopAppHost` → `PlantillaPcbPage` → `CanonicalRoster` (`variant="legacy"`) → legacy entity window / `PlayerProfileApp`.

**Union target:** CanonicalRoster grid power **+** SquadScreen position filter **+** contract expiry (EXP). Scout-aware rating columns: **RESOLVED in STEP 014** (NG `variant="ng"` only).

---

## STEP 014 — Scout-aware ratings (RESOLVED)

| Item | Classification | Detail |
|------|----------------|--------|
| Scout-aware rating presentation | **RESOLVED (NG-only)** | `variant="ng"` uses `getOrganizationRatingEvaluation` + `formatRatingEvaluation` via `rosterRatingPresentation.ts` / `rosterScoutAwareColumns.tsx`. Legacy `variant="legacy"` unchanged (still shows raw canonical ratings). |
| Summary signals FIN/SHO/PMK/… | **RESOLVED (NG-only)** | Mapped to organization dimensions (`finishing`, `shooting`, `creation`, etc.) — no longer derived from hidden `legacyRatingSignals`. |
| Sort / CSV / custom columns | **RESOLVED (NG-only)** | `sortValue` = `intelligenceSortValue ?? 101`; `exportValue` = formatted evaluation; no raw `value` on rating columns. |
| Player Workspace Attributes / Overview | **BLOCKER BEFORE NG PLAYER/ROSTER CUTOVER** | `buildPlayerWorkspaceModel` still reads exact `player.basketball.ratings`. Roster NG may hide a rating, but opening PlayerWorkspace reveals underlying truth. Does **not** block NG-014 commit; **does** block final NG cutover. |

Browser: `scripts/verify-step-014-roster-scout-ratings.mjs` → `docs/verify-step-014-report.json` (**PASS**, 40-row fixture).

**Cutover gate (Roster NG scout-aware):** resolved in STEP 014. **Remaining cutover blocker:** PlayerWorkspace NG must apply the same organization knowledge boundary before final NG player/roster cutover.

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **PRESERVED** | Same behavior as production CanonicalRoster path |
| **ADAPTED** | Same intent, different shell/mechanism |
| **INTENTIONAL IMPROVEMENT** | Deliberate shared fix or NG cleanup |
| **PREEXISTING GAP** | Missing in production `CanonicalRoster` before NG |
| **DUAL-IMPLEMENTATION CAPABILITY GAP** | Exists in `SquadScreen` / `RosterSquadTable`, not in production roster path |
| **TEMPORARY GAP** | Known deferral (Player NG bridge, etc.) |
| **PORTED FROM DUAL IMPLEMENTATION** | Capability brought from SquadScreen into NG Canonical path |
| **RESOLVED REGRESSION** | Previously broken NG behavior fixed |
| **REQUIRED BEFORE CUTOVER** | Documented blocker for legacy cutover, not NG-013 commit |

---

## INTENTIONAL IMPROVEMENT (shared legacy + NG)

| Item | Classification | Detail |
|------|----------------|--------|
| Injury status column | **INTENTIONAL IMPROVEMENT** | Shared `CanonicalRoster.tsx` — no `variant` guard. Replaced hardcoded `"OK"` with `getCurrentPlayerInjury`. Healthy → **OK**; injured → **Out** + tooltip. Affects **legacy PlantillaPcbPage and NG**. Previous hardcoded value was incorrect. Verified: unit test `CanonicalRoster NG variant › shows real injury status…` (legacy variant); NG runtime 12/12 OK on default world. |

**Legacy change audit:** **B — legacy + NG.** Do not claim legacy roster behavior is unchanged; claim the **injury presentation fix is intentional and shared**.

---

## PORTED FROM DUAL IMPLEMENTATION (STEP 013D)

| Item | Classification | Detail |
|------|----------------|--------|
| Position filter (ALL/PG/SG/SF/PF/C) | **PORTED FROM DUAL IMPLEMENTATION** | NG toolbar select; state in `useRosterWorkspaceSession`; filters via `player.basketball.primaryPosition` |
| Contract expiry (EXP) | **PORTED FROM DUAL IMPLEMENTATION** | Column `expiry` — `getCurrentPlayerContract(world, playerId)?.term.expiresOn ?? '—'`; included in General preset + custom view |

---

## ADAPTED (STEP 013D)

| Item | Classification | Detail |
|------|----------------|--------|
| Player open workflow | **ADAPTED** | Roster → `pushState` → `?ui=ng&app=player&playerId=&playerView=overview` → full `PlayerWorkspace` NG (replaces embedded panel + `?rosterPlayer=`) |
| Roster session | **ADAPTED** | `useRosterWorkspaceSession` survives WorkspaceHost unmount; grid sort/columns remain in `bdm:grid:plantilla-pcb-{preset}` localStorage |
| NG search / selection bridge | **ADAPTED** | Optional controlled props on `BDMDataGrid` + `sessionBridge` on `CanonicalRoster`; legacy uncontrolled by default |

### Obsolete after 013D (removed code)

- `PlayerProfileApp` import in `RosterWorkspace`
- `?rosterPlayer=` parse/sync
- `roster-workspace__split*` / player aside / close-panel action
- `rosterPlayerId` on `WorkspaceHost` / `NgWorkspaceNavigationProvider`
- Side-by-side capture case `05-roster-ng-player-side-by-side` → `05-roster-ng-player-workspace`

Historical 013A/013B findings **retained above** for audit trail.

---

## REQUIRED BEFORE CUTOVER

| Item | Classification | Affected columns / presets |
|------|----------------|----------------------------|
| ~~Scout-aware rating presentation~~ | **RESOLVED (STEP 014)** | NG `rating-*` (35 keys) + `summary-*` (7 signals) — see STEP 014 section above |

Jerseys / registration selectors: **FUTURE DOMAIN** — omitted in NG (not ported broken legacy sub-views).

---

## DUAL-IMPLEMENTATION CAPABILITY GAP (resolved in 013D)

| Item | Prior status | 013D status |
|------|--------------|-------------|
| Contract expiry column | GAP (SquadScreen only) | **PORTED** |
| Position filter pills | GAP (SquadScreen only) | **PORTED** |

---

## VISUAL-ONLY CHANGE

| Item | Detail |
|------|--------|
| Surfaces / borders | NG tokens via `roster-workspace.css` + `ng-data-grid.css` |
| Toolbar density | NG compact toolbar vs legacy PCB padding |
| Row height NG | 28px td / 24px th |
| Typography | Inter Tight + tabular numerics |
| Selection/hover | NG tokens |
| Broken sub-view selector | Hidden in NG only (`variant="ng"`) |

---

## PREEXISTING GAP (production CanonicalRoster baseline)

| Item | Classification | Detail |
|------|----------------|--------|
| Broken sub-view selector (jerseys/registration) | **PREEXISTING GAP** | Non-functional in legacy; omitted in NG V1 |

---

## DUAL-IMPLEMENTATION CAPABILITY GAP (historical — pre-013D)

These existed in **`SquadScreen` → `RosterSquadTable`**, not in production **`PlantillaPcbPage` → `CanonicalRoster`**. **Position filter and EXP resolved in 013D.**

---

## TEMPORARY GAP

| Item | Detail | Follow-up |
|------|--------|-----------|
| Home/Scouting/Tactics/Medical tabs | Placeholder workspaces | Future apps |
| Scout-aware rating columns | Exact values shown in rating presets | **REQUIRED BEFORE CUTOVER** |
| `scripts/verify-step-013a-roster-parity.mjs` | Still references embedded panel | Rewrite for 013D acceptance |
| Global SystemBar search | Not wired to roster filter | By design |

---

## STEP 013D — session + navigation

**Session store:** `useRosterWorkspaceSession` — `activePreset`, `searchQuery`, `positionFilter`, `selectedRowIds`, `scrollTop`.

**Grid persistence (unchanged):** `bdm:grid:plantilla-pcb-{preset}` — primary/secondary sort, column order/width/hidden, custom views.

**Navigation:** `navigateToPlayerFromRoster` uses **`history.pushState`** → Back restores Roster URL + session store.

**PlayerWorkspace URL reactivity:** `popstate` + `bdm-ng-nav` sync `playerId` / `playerView`.

---

## State preservation matrix (STEP 013D)

| State | Result |
|-------|--------|
| Preset | **PASS** (session store + unit test) |
| Position filter | **PASS** |
| Primary sort | **PASS** (localStorage per gridId) |
| Secondary Shift sort | **PASS** (localStorage per gridId) |
| Search | **PASS** (session store) |
| Selected rows | **PASS** (session store) |
| Column width / order / hidden | **PASS** (localStorage) |
| Custom view | **PASS** (localStorage) |
| Vertical scroll | **PARTIAL** (session `scrollTop` implemented; full browser 25+ scroll not automated in CI) |
| Horizontal scroll | **PASS** (grid behavior unchanged) |
| ROT | **PASS** |
| Grid focus | **PARTIAL** (not explicitly persisted) |
| Browser Back Roster ↔ Player | **PASS** (pushState + popstate; unit/navigation tests) |
| Taskbar Roster ↔ Player | **PASS** (session store survives app switch) |

No blocking **FAIL**.

---

## FUNCTIONAL REGRESSION

| Item | Status |
|------|--------|
| Preset reset on Player open (STEP 013A) | **RESOLVED in STEP 013B** |

No open blocking functional regressions remain for STEP 013 commit.

---

## STEP 013B — stable mount architecture

**Root cause:** ternary branch swapped parent tree:

```
player closed: ScrollRegion → CanonicalRoster
player open:   SplitPane → ScrollRegion → CanonicalRoster   // remount
```

**Fix:** permanent host:

```
roster-workspace__split
├── ScrollRegion → CanonicalRoster   // identity stable
├── split-divider                    // 0px when closed
└── player-panel                     // 0fr column when closed
```

Toggle `roster-workspace__split--player-open` for 62/38 grid. No `key` on `CanonicalRoster`. Generic `SplitPane` removed from Roster path.

**Tests:** `RosterWorkspace.test.tsx` — preset, multi-select, search preservation across player panel open/close.

---

## State preservation (STEP 013B verified)

| State | Open Player | After Close | Result |
|-------|-------------|-------------|--------|
| Preset (psico) | PASS | PASS | **PASS** |
| Primary sort | PASS | PASS | **PASS** |
| Search grid | PASS | PASS | **PASS** (unit + runtime) |
| Multi-select (2 rows) | PASS | PASS | **PASS** (unit test) |
| Column width/order (localStorage) | PASS | PASS | **PRESERVED** |
| ROT | PASS | PASS | **PASS** |
| scrollTop | N/A (12 rows) | — | **N/A** |

---

| Metric | Value |
|--------|-------|
| Roster pane width | **~1190px** (62%) |
| Player pane width | **~730px** (38%) |
| Visible roster rows | **12 / 12** (full squad) |
| Visible roster columns (general preset) | **14 / 14** |
| Preset switch while split open | **Works** (toolbar accessible) |
| Search while split open | **PASS** |
| ROT inline edit while split open | **PASS** |
| Multi-select while split open | **PASS** (2 rows) |
| Context menu while split open | **PASS** |

**Usability verdict:** Split does **not** make Roster unusable. NG roster pane (**1190px**) is **wider** than legacy side-by-side squad window (**~860px**). No ratio change recommended in 013A.

---

## State preservation test (STEP 013A)

| State | Open Player | After Close | Result |
|-------|-------------|-------------|--------|
| Preset (non-default) | **FAIL** — resets to general on open | general | **FAIL** |
| Sort | Not reliably detected in automation | — | **PARTIAL** |
| Column width/order | Persisted via localStorage keys | Should survive remount | **PRESERVED** (storage) |
| Multi-select | 2 rows with split | 0 after close | **PARTIAL** |
| scrollTop | 0 (no scroll needed, 12 rows) | 0 | **N/A** |

---

## Player open/close paths (STEP 013A)

| Path | Result |
|------|--------|
| Player name click | **PASS** — sets `?rosterPlayer=` |
| Row double-click | **PASS** |
| Enter (keyboard) | **PASS** |
| Close button | **PASS** — removes `?rosterPlayer=` |
| Duplicate navigation | **PASS** — no double-panel observed |
| Browser back from roster+player | Navigates away from NG roster URL |
| Browser forward | URL param restored; panel **PARTIAL** |

---

## Navigation regression (Player ↔ Roster)

| Check | Result |
|-------|--------|
| Player NG default (`?ui=ng`) | **PASS** — content renders, Player tab active |
| Switch to Roster | **PASS** — `?app=roster`, roster mounts, `rosterPlayer` cleared |
| Switch back to Player | **PASS** — Player workspace renders |
| Stale `rosterPlayer` on Roster exit | **PASS** — cleared when leaving roster app |
| Player deep link corrupted | **PASS** — no observed cross-contamination |

---

## playerStructuralData.ts change (STEP 013)

**Change:** Removed `active: true` from `TASKBAR_APPS` entry for Player.

**Reason:** Dead duplicate constant — runtime Taskbar uses `WORKSPACE_TASKBAR_APPS` from `workspaceApps.ts` with active state from `NgWorkspaceNavigationProvider`. Hardcoded `active: true` was incorrect once multi-app navigation landed.

**Impact:** **None at runtime** (`TASKBAR_APPS` is not imported elsewhere). Player tab active state comes from URL/app id.

**Belongs in STEP 013?** Tangential to Roster; valid **navigation cleanup** bundled with Taskbar work. Revert optional; keeping is harmless.

---

## Search behavior

| Path | Behavior | Classification |
|------|----------|----------------|
| Legacy `CanonicalRoster` | Toolbar `Buscar jugador` + grid search | **PRESERVED** on legacy |
| NG `CanonicalRoster` | Grid `Search grid` only | **ADAPTED** |

---

## Session / persistence

| State | Status |
|-------|--------|
| Column order/widths/sort/hidden | **PERSISTED** — `bdm:grid:plantilla-pcb-{preset}` |
| Active preset (React state) | **SESSION ONLY** — survives Player open/close within session (013B) |
| Selected rows | **SESSION ONLY** |
| Roster scroll position | **LOST ON REOPEN** (unchanged vs legacy) |
| Open player panel | **URL** `?rosterPlayer=` |

---

## Functional parity checklist (STEP 013A)

| Item | Result |
|------|--------|
| Display full team roster | **PASS** |
| All 8 column presets | **PASS** |
| 35 canonical rating columns | **PASS** |
| Summary + personality presets | **PASS** |
| Contract expiry column | **DUAL-IMPLEMENTATION CAPABILITY GAP** |
| Real injury/availability status | **PASS** (shared fix) |
| ROT inline editing | **PASS** |
| Context menu lineup/training | **PASS** |
| Open player (name/dblclick/Enter) | **PASS** |
| Player side-by-side intent | **ADAPTED — PASS** |
| Side-by-side exact OS window semantics | **ADAPTED — not identical** |
| Preset preserved while Player open | **PASS** (013B) |
| Preset preserved after Player close | **PASS** (013B) |
| Multi-select | **PASS** |
| Sort/resize/reorder/hide/persist | **PASS** |
| Search filter | **PASS** (NG grid) |
| Position filter pills | **DUAL-IMPLEMENTATION CAPABILITY GAP** |
| CSV / custom view | **PASS** |
| NG taskbar Roster entry | **PASS** |
| Visible row count ≥ baseline | **PASS** |
| Player NG not regressed by navigation | **PASS** |

---

## Density comparison (1920×1080)

| Metric | Production baseline | Roster NG V1 |
|--------|---------------------|--------------|
| Squad size | 12 players | 12 players |
| Visible rows | Full roster in window | **12/12** maximized |
| Row height | ~43px (legacy window) | **28px** |
| Side-by-side roster width | ~860px (entity bounds) | **~1190px** (split) |

No density regression on row count.

---

## Capability matrix (STEP 013D target)

| Capability | Status |
|------------|--------|
| Position filter | **PORTED** |
| Contract expiry (EXP) | **PORTED** |
| Player NG navigation | **PASS** |
| Roster session restore | **PASS** (013E browser — preset, sort, search, selection, columns, scroll) |
| Vertical scroll restore | **PASS** (013E — tolerance 48px; outer `.roster-workspace__scroll`) |
| Large roster (25+ fixture) | **CERTIFIED** (test helper `buildLargeRosterTestWorld`) |
| Scout-aware ratings | **REQUIRED BEFORE CUTOVER** |
| Legacy Plantilla path | **PRESERVED** (variant default legacy) |
| Embedded PlayerProfileApp in NG Roster | **REMOVED** |

---

## Screenshots (STEP 013)

| File | Content |
|------|---------|
| `docs/screenshots/step-013/01-roster-ng-populated-1920x1080.png` | Populated roster |
| `docs/screenshots/step-013/02-roster-ng-selected-1920x1080.png` | Row selection |
| `docs/screenshots/step-013/03-roster-ng-search-1920x1080.png` | Grid search |
| `docs/screenshots/step-013/04-roster-ng-context-menu-1920x1080.png` | Context menu |
| `docs/screenshots/step-013/05-roster-ng-player-workspace-1920x1080.png` | PlayerWorkspace NG (013D) |
| `docs/screenshots/step-013/07-roster-to-player-ng-1920x1080.png` | Roster → PlayerWorkspace navigation (013E) |
| `docs/screenshots/step-013/08-roster-ng-final-2560x1440.png` | 2560×1440 final validation (013E) |
| `docs/screenshots/step-013/06-roster-ng-populated-2560x1440.png` | 2560×1440 (013 capture script) |

---

## Files outside `src/ui-ng` (STEP 013D)

| File | Change |
|------|--------|
| `src/ui/pcb-migrated/plantilla/CanonicalRoster.tsx` | `sessionBridge`, NG position filter, EXP column, shared injury fix |
| `src/ui/dataGrid/BDMDataGrid.tsx` | Optional `searchQuery` / `selectedIds` controlled bridge |
| `vitest.config.ts` | Roster NG test include |

**DOMAIN:** NONE · **ENGINE:** NONE

---

## STEP 013E browser certification (2026-09-04)

**Script:** `scripts/verify-step-013e-roster-browser.mjs`  
**Report:** `docs/verify-step-013e-report.json`  
**Verdict:** **READY TO COMMIT NG-013**

| Gate | Result |
|------|--------|
| PlayerWorkspace NG navigation (4 paths) | **PASS** — name, Enter, double-click, context menu |
| Browser Back → Roster session | **PASS** — preset, position, search, primary + secondary sort, multi-select, columns |
| Vertical scroll restore | **PASS** — before 230px, after 230px, delta 0, tolerance 48px |
| Taskbar Roster ↔ Player | **PASS** — no state drift |
| Position filter ALL/PG/SG/SF/PF/C | **PASS** |
| EXP column | **PASS** |
| ROT after Player nav | **PASS** |
| Bulk Training (2) menu | **PASS** |
| Large roster fixture | **40 rows**, scrollHeight 1214 / clientHeight 920 |
| No PlayerProfileApp / no `rosterPlayer` | **PASS** |
| Player A → B → Back chain | **UNSUPPORTED** (no pushState player-to-player) |
| Scout-aware ratings | **REQUIRED BEFORE ROSTER CUTOVER** (does not block NG-013) |

**013E production fixes (browser-found):**

| File | Fix |
|------|-----|
| `roster-workspace.css` | NG scroll on outer `ScrollRegion`; disable inner `.bdm-data-table` overflow |
| `RosterWorkspace.tsx` | mousedown scroll snapshot before player open; rAF scroll restore; remove unmount persist that zeroed store |
| `CanonicalRoster.tsx` | `stopPropagation` on player link click (multi-select) |

**Superseded:** `scripts/verify-step-013a-roster-parity.mjs` (embedded panel architecture)

---

## STEP 013B verification scripts

- `scripts/verify-step-013e-roster-browser.mjs` — **013E** final browser certification (013D architecture)
- `scripts/verify-step-013a-roster-parity.mjs` — **OBSOLETE** (013A embedded panel; kept for audit)
- `scripts/compare-roster-density.mjs` — density metrics

---

*End of regression register.*
