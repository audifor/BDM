# BDM_OS_NG · Roster Migration Audit (STEP 012)

**Checkpoint:** `4fdcace` — NG-011 Player Workspace final audit  
**Branch:** `bdm-os-ng`  
**Date:** 2026-09-04  
**Scope:** Audit current Roster implementation; define migration strategy. **No Roster NG implementation.**

**Baseline screenshots:** `docs/screenshots/step-012/roster-current/`  
**Capture script:** `scripts/capture-step-012-roster-baseline.mjs`  
**Related:** `docs/BDM_OS_NG_MIGRATION_DOCTRINE.md`, `docs/BDM_OS_NG_PLAYER_AUDIT.md`

---

## Final Verdict

**B. RESTYLED + SELECTIVELY ADAPTED**

Current Roster information architecture is **strong** — dense FM-like grid, column presets, inline rotation editing, multi-select, context menu with lineup/training actions, and persistent grid preferences. Visual age is high (legacy FM skin, Spanish/English mix, hardcoded injury `"OK"` in CanonicalRoster) but **workflow quality exceeds Player tab composition** for squad management.

Do **not** rebuild as Player-like tabs + inspector. Migrate visual/interaction system onto existing grid grammar with selective fixes (real injury status, sub-view implementation or removal, unify dual implementations).

---

## Why (not based on visual age)

| Factor | Assessment |
|--------|------------|
| IA quality | Excellent scanning density; preset column views match manager mental models |
| Workflow | Row → Player side-by-side window preserved; context menu for lineup/training |
| Grid maturity | `BDMDataGrid` + `RosterSquadTable` already implement sort/resize/reorder/persist |
| Weaknesses | Dual code paths, placeholder sub-views, status column bug — **fixable without rebuild** |
| Player NG | No Roster app; opening Player goes to legacy `PlayerProfileApp`, not NG PlayerWorkspace |

---

## Current Roster Architecture

### Production path (dock app `squad`)

```
DesktopShell → DesktopWindow(appId='squad')
  → DesktopAppHost (line 37, precedes renderKey)
    → PlantillaPcbPage
      → CanonicalRoster
        → BDMDataGrid (gridId=plantilla-pcb-{presetId})
```

**Registry:** `DesktopAppRegistry.ts` — id `'squad'`, label `'Plantilla'`, icon `'roster'`, default window 980×820.

### Secondary path (Entity Page — Team Squad tab)

```
EntityPageApp → TeamPage → SquadScreen → RosterSquadTable
```

**Note:** `DesktopAppHost` line 46 `renderKey === 'squad'` → `SquadScreen` is **dead** for dock app `squad` (line 37 wins).

### ui-ng

- `Taskbar.tsx`: Roster button **without handler**
- `WorkspaceHost.tsx`: only `PlayerWorkspace`
- No NG Roster application exists

### Data flow

| Source | Usage |
|--------|-------|
| `getTeamRoster(world, teamId)` | Row set |
| `getUserTeam(world)` | Default team |
| `getPlayerAge`, `getCareerFatigueForPlayer`, `getCurrentPlayerContract` | Columns |
| `getTeamLineup`, `getLineupSlotForPlayer`, `LINEUP_SLOTS` | ROT column |
| `player.basketball.ratings` (35 canonical) | Rating columns |
| `legacyRatingSignals` | FIN/SHO/PMK summary columns |
| `getPersonality` | Psico preset |
| `useGameStore.setLineupSlot/clearLineupSlot` | ROT + context menu |
| `useGameStore.assignTrainingModuleToPlayer` | Context menu training |

---

## Feature Inventory

| # | Feature | Location | Classification | NG disposition |
|---|---------|----------|----------------|----------------|
| 1 | Full roster grid (all players) | `CanonicalRoster` + `BDMDataGrid` | **PRESERVE EXACTLY** | Same grid grammar |
| 2 | 8 column presets (General, Offense, Brain, Defense, Physical, Ball handling, Psico, Custom) | `CanonicalRoster` views | **PRESERVE EXACTLY** | Restyle selectors |
| 3 | 35 canonical rating columns (subset per preset) | `CanonicalRoster` | **PRESERVE EXACTLY** | Scale to 80 = ADAPT later |
| 4 | FIN/SHO/PMK/PDE/IDE/REB/ATH summary signals | `getBasketballSummarySignals` | **PRESERVE EXACTLY** | Restyle numeric |
| 5 | Personality columns (Psico preset) | `CanonicalRoster` | **PRESERVE + RESTYLE** | |
| 6 | Inline rotation (ROT) dropdown | `CanonicalRoster` column | **PRESERVE EXACTLY** | Critical workflow |
| 7 | Player name link + context menu | `CanonicalRoster` | **PRESERVE EXACTLY** | |
| 8 | Row click / double-click → open Player | `BDMDataGrid` + `onRowClick` | **PRESERVE EXACTLY** | Target NG Player when ready |
| 9 | Multi-select rows | `BDMDataGrid` multiSelect | **PRESERVE EXACTLY** | |
| 10 | Entity context menu (lineup slots, training, open profile) | `EntityContextMenuProvider`, surface `'roster'` | **PRESERVE EXACTLY** | |
| 11 | Sort (multi with Shift) | `BDMDataGrid` | **PRESERVE EXACTLY** | |
| 12 | Column resize | `BDMDataGrid` | **PRESERVE EXACTLY** | |
| 13 | Column reorder (drag) | `BDMDataGrid` | **PRESERVE EXACTLY** | |
| 14 | Column hide/show (manager) | `BDMDataGrid` | **PRESERVE EXACTLY** | |
| 15 | Grid search (toolbar + grid tools) | `CanonicalRoster` + `BDMDataGrid` | **PRESERVE + RESTYLE** | Dedupe two search inputs |
| 16 | CSV export | `BDMDataGrid` column manager | **PRESERVE EXACTLY** | |
| 17 | Custom saved views | `BDMDataGrid` saveView (non-fm) / fm CSV | **PRESERVE EXACTLY** | |
| 18 | Preferences persist localStorage | `bdm:grid:plantilla-pcb-*` | **PRESERVE EXACTLY** | Key migration ADAPT |
| 19 | Team identity header (count, name) | `canonical-roster__toolbar` | **PRESERVE + RESTYLE** | |
| 20 | Sub-view select (overview/jerseys/registration/all-players) | `PlantillaPcbPage` rosterSection | **ADAPT** | Implement or DEPRECATE UI |
| 21 | Injury status column | `CanonicalRoster` | **REBUILD** (small) | Currently hardcoded `"OK"` — use real injury like SquadScreen |
| 22 | Position filter pills | `RosterSquadTable` only | **PRESERVE EXACTLY** | Port to canonical or keep Squad path |
| 23 | 4 legacy views (Overview/Ratings/Physical/Contracts) | `SquadScreen` | **PRESERVE + RESTYLE** | Merge feature parity into canonical |
| 24 | Scout uncertainty ratings (legacy 7 keys) | `SquadScreen` intelligence | **ADAPT** | Canonical uses true V2 ratings — product decision |
| 25 | Contract expiry column | `SquadScreen` | **PRESERVE EXACTLY** | Add to Canonical general/contracts preset |
| 26 | Section jump (training/tactics/coach) | `RosterSquadTable` | **PRESERVE EXACTLY** | |
| 27 | Global search → opens squad not player | `GlobalSearch.tsx` | **ADAPT** | UX improvement optional |
| 28 | LegacyRoster / Analysis mock UI | `PlantillaPcbPage` | **DEPRECATE** | Dead code ~300 lines |
| 29 | Mentoring app | separate `mentoring` appId | **PRESERVE EXACTLY** | Not part of roster grid |

---

## Workflow Inventory

| Workflow | Current behavior | Preserve? |
|----------|------------------|-----------|
| Open roster from dock | `openWindow('squad')` | Yes |
| Scan squad by preset | Preset dropdown switches column set | Yes |
| Find player | Search filters name | Yes |
| Open player profile | Click name / row / Enter → `openEntity` → entity window `PlayerProfileApp` side-by-right | Yes — later NG Player |
| Assign lineup slot | ROT dropdown or context menu Starting five / Bench | Yes |
| Bulk training assign | Multi-select + context menu | Yes |
| Customize columns | ⚙ triggers column manager | Yes |
| Export CSV | Column manager | Yes |
| Filter by position | SquadScreen pills only | Yes — add to canonical |
| Navigate to training/tactics | RosterSquadTable section select | Yes |
| Return to roster after Player | Desktop windows remain; roster selection in memory only | ADAPT — persist selection/scroll |

---

## Player Opening Workflow

**CanonicalRoster** (`CanonicalRoster.tsx:206-211, 484-487`):

```typescript
onOpenEntity?.({ type: 'player', playerId: player.id, section: 'overview' })
```

**App.tsx `openEntity`:**

1. `navigateEntity(destination)` — entity navigation store
2. `openWindow('entity', 'player-{id}', bounds)` — side-by-side layout
3. `PlayerProfileApp` in entity window (**legacy**, not NG PlayerWorkspace)

| Behavior | Status |
|----------|--------|
| Single click row | Opens Player + selects row |
| Double click | Same (BDMDataGrid) |
| Click name only | Opens Player |
| Side-by-side | Yes — roster left, player right (`defaultEntityWindowBounds`) |
| Preserves roster filter/sort | Yes (roster window stays) |
| Preserves roster scroll | **No** |
| Preserves selection on return | In-memory until reload |
| Opens NG Player | **No** — must be explicit migration decision |

**Recommendation:** NG migration must preserve side-by-side or equivalent; opening NG PlayerWorkspace in place of `PlayerProfileApp` is **ADAPT**, not rebuild. Do not navigate away from roster grid by default.

---

## Data Grid Audit

### CanonicalRoster → BDMDataGrid

| Feature | Works today | Notes |
|---------|-------------|-------|
| Column count | ~50+ defined; presets show 10–40 | General preset compact |
| Column types | Text, numeric, link, select (ROT) | |
| Sortable | Yes, multi-sort Shift+click | Header menu + click |
| Resizable | Yes | Pointer drag |
| Visibility toggles | Yes | Column manager |
| Sticky header | Yes | Table thead |
| Sticky columns | **No** | Player column not pinned |
| Row height | Compact FM | ~single line |
| Numeric alignment | `.is-numeric` | |
| Icon/status columns | EST (broken OK) | Fix injury |
| Selection | Single + multi | Ctrl/Cmd, Shift |
| Keyboard | Arrow, Page, Home/End, Enter, Escape, Ctrl+A | Full |
| Virtualization | **No** | All rows DOM |
| Context menu | Row + header | Entity + sort |
| Double click | Opens player | |
| Row activation | Click selects + opens player | Aggressive — preserve |
| Filtering | Search only | No position pills |
| Grouping | **No** | |
| Saved views | localStorage per preset gridId | |
| Custom views | prompt save (non-fm path) | fm uses CSV |
| Horizontal scroll | Yes | Wide presets |

**Persistence key:** `bdm:grid:plantilla-pcb-{general|offense|...}`

### RosterSquadTable (legacy parallel)

| Feature | Works today |
|---------|-------------|
| Position filter ALL/PG/SG/SF/PF/C | Yes |
| View tabs Overview/Ratings/Physical/Contracts | Yes |
| gridKey `roster-squad-table-v1` | Yes |
| Real injury status | Yes |
| Contract expiry column | Yes |
| Intelligence ratings (scout bands) | Yes |

**Gap:** Two grids diverge — migration should **consolidate behaviors into one NG grid**, not pick Player table patterns.

---

## Visual Strengths

| Pattern | Classification |
|---------|----------------|
| High row density (~15+ visible at 980px height) | **VISUAL PATTERN TO PRESERVE** |
| FM-style column presets | **PRESERVE** |
| Compact numeric columns | **PRESERVE** |
| ROT inline edit without leaving grid | **PRESERVE** |
| Golden toolbar + view tabs (SquadTable) | **MODERNIZE** (map to ng tokens) |
| Team + count in header | **PRESERVE** |
| Selected row highlight | **MODERNIZE** (ng selection token) |
| Context menu depth (lineup/training) | **PRESERVE** |

---

## Visual Weaknesses

| Issue | Classification |
|-------|----------------|
| Legacy FM skin vs NG tokens | **MODERNIZE** |
| Spanish labels mixed with English grid tools ("SQUAD", "Search") | **MODERNIZE** |
| Hardcoded `"OK"` status | **REMOVE** (bug) |
| Duplicate search fields (toolbar + grid tools) | **MODERNIZE** |
| Sub-view selector that does nothing | **REMOVE or IMPLEMENT** |
| Dead mock components in PlantillaPcbPage | **REMOVE** |

---

## IA Strengths

- Primary task = compare many players quickly → grid-first is correct
- Presets map to manager questions (offense brain defense physical)
- ROT column supports rotation management without separate app
- Context menu exposes lineup + training without cluttering toolbar
- Multi-sort supports ad-hoc comparison

---

## IA Weaknesses

- Row click always opens Player — may be heavy for users who only want selection (mitigated by context menu)
- No sticky player name column on horizontal scroll
- Sub-views (jerseys/registration) advertise missing functionality
- Global search doesn't open player directly
- Two implementations confuse which is source of truth

---

## Preservation Matrix Summary

### PRESERVE EXACTLY

Grid-first layout, presets, ROT dropdown, multi-select, sort/resize/reorder, column manager, CSV export, context menu lineup/training, persist preferences, row→Player workflow, entity side-by-side windows, keyboard grid navigation.

### PRESERVE + RESTYLE

Toolbar, headers, row selection/hover, numeric columns, status chips (once fixed), fonts/surfaces/borders/scrollbars, buttons/dropdowns.

### ADAPT

- Shell integration into NG desktop (SystemBar/Taskbar) without changing grid
- Consolidate CanonicalRoster + SquadScreen features (position filter, expiry, real injury)
- Player opens NG PlayerWorkspace instead of PlayerProfileApp
- Dedupe search inputs
- localStorage key strategy under NG namespace
- Sub-views: implement jerseys/registration or remove selector

### REBUILD

- Injury status column in CanonicalRoster (small scoped fix, not full grid rebuild)
- Optionally: unify dual grid implementations into one codebase path

### DEPRECATE

- `LegacyRoster`, `Analysis` mock blocks in `PlantillaPcbPage.tsx`
- Dead `renderKey === 'squad'` branch expectation
- Placeholder sub-views if product declines scope

---

## Player / NG Primitives

| Primitive | Roster verdict | Rationale |
|-----------|----------------|-----------|
| `ApplicationWorkspace` | **OPTIONAL** | Wrap in NG shell; grid remains main body |
| `WorkspaceHeader` | **ADAPT** | Team context header — not Player header |
| `WorkspaceTabs` | **DO NOT USE** | Roster is single-surface grid |
| `WorkspaceToolbar` | **USE** | Maps to existing roster toolbar |
| `WorkspaceBody` | **USE** | Main content region |
| `InspectorPane` | **DO NOT USE** | Player detail belongs in Player app/window |
| `ScrollRegion` | **USE** | Grid scroll container |
| `SplitPane` | **OPTIONAL** | If side-by-side Player embedded later |
| `SemanticTone` | **USE** | Status/injury/fatigue |
| `PresentationField` | **OPTIONAL** | Contract unknown currency etc. |
| `StatusChip` | **USE** | Injury/availability |
| Future `BDMDataGrid` NG | **USE** | Evolve from existing `BDMDataGrid` |

---

## Session Requirements (future Roster NG)

| State | Persist? | URL? |
|-------|----------|------|
| `selectedPlayerId` / `selectedRowIds` | Session | Optional |
| `sort` / multi-sort | Yes (already localStorage) | No |
| `filters` / position | Yes | No |
| `search` | Optional | No |
| `columnWidths` / order / hidden | Yes (already) | No |
| `activePreset` / view id | Yes | Optional |
| `scrollTop` | Desirable | No |
| `teamId` | Yes when multi-team | Yes |

Compare Player: Roster needs **grid preference persistence** more than tab/view deep links.

---

## 1920×1080 Density Baseline

**Captures:** `docs/screenshots/step-012/roster-current/`

| Capture | Content |
|---------|---------|
| `01-roster-populated-1920x1080.png` | Default general preset, full squad |
| `02-roster-with-player-open-1920x1080.png` | Side-by-side entity window |
| `03-roster-search-filter-1920x1080.png` | Search active |
| `04-roster-context-menu-1920x1080.png` | Context menu |

**Observations (1920×1080, squad window ~980×820 default):**

- Window default is smaller than full viewport — NG should allow maximized grid while preserving row count
- General preset shows core columns without horizontal overload
- Wider presets (Custom, Psico) require horizontal scroll — **preserve**
- Desktop chrome (dock, context bar) consumes vertical space — NG SystemBar/Taskbar must not exceed legacy chrome net loss
- Target: **≥ baseline visible rows** at maximized 1920×1080

**Density regression blocker:** Any NG shell padding that reduces visible rows below baseline without explicit approval.

---

## Functional Parity Checklist (mandatory before Roster NG cutover)

### Grid core

- [ ] Display full team roster from `getTeamRoster`
- [ ] All 8 column presets with same column IDs
- [ ] 35 canonical rating columns available in custom/presets
- [ ] FIN/SHO/PMK/PDE/IDE/REB/ATH summary columns
- [ ] Personality preset (8 dimensions)
- [ ] Age, height, weight, fatigue, salary columns
- [ ] Contract expiry visible (from SquadScreen parity)
- [ ] Real injury/availability status (not hardcoded OK)

### Editing & actions

- [ ] ROT dropdown all `LINEUP_SLOTS` + clear
- [ ] Context menu surface `'roster'` with lineup assignments
- [ ] Context menu training module assign (single + multi-select)
- [ ] Open player profile from name, row, Enter, double-click

### Grid interactions

- [ ] Single and multi row selection
- [ ] Ctrl/Cmd+A select all visible
- [ ] Sort primary + Shift secondary
- [ ] Header context menu (sort, hide column, reset width)
- [ ] Column drag reorder
- [ ] Column resize persist
- [ ] Column show/hide manager
- [ ] Keyboard navigation (arrows, page, home/end, escape)
- [ ] Search filter by player name
- [ ] Position filter ALL/PG/SG/SF/PF/C

### Persistence & export

- [ ] Save/restore column order, widths, sorting, hidden columns per view
- [ ] CSV export
- [ ] Custom view save (if retained)

### Navigation & integration

- [ ] Open from dock/launcher as `squad`
- [ ] Open player side-by-side (or equivalent non-destructive pattern)
- [ ] Return to roster without losing sort/filter (selection optional)
- [ ] Section jump to training/tactics/coach where applicable
- [ ] Entity Page Team Squad tab equivalent (or redirect to NG roster)

### Density

- [ ] Visible row count ≥ baseline at 1920×1080 maximized
- [ ] Horizontal scroll for wide presets preserved

---

## Regression Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Forcing Player tabs + inspector | **Blocker** | Follow migration doctrine |
| Losing ROT inline edit | **Blocker** | Parity checklist |
| Losing multi-select + bulk training | **Blocker** | Parity checklist |
| Losing column persist | **Blocker** | Port `persistence.ts` |
| Losing context menu lineup | **Blocker** | Keep EntityContextMenuProvider |
| Row click opens Player removed | **Blocker** | Preserve activation |
| Density loss from NG padding | **Blocker** | Measure baseline screenshots |
| Replacing V2 ratings with scout bands unknowingly | High | Product decision documented |
| Sub-views removed without replacement | Medium | Implement or deprecate explicitly |
| Two grid codepaths remain | Medium | Consolidate during ADAPT phase |
| Player opens legacy profile forever | Medium | Plan NG Player bridge separately |

---

## Functional Regressions (if migrated naïvely to Player pattern)

| Capability | Would disappear | Blocker |
|------------|-----------------|---------|
| 15+ column dense grid | Replaced by cards/tabs | Yes |
| ROT inline dropdown | No equivalent in Player | Yes |
| Multi-select bulk training | Player is single-entity | Yes |
| 8 rating presets | Player Attributes single view | Yes |
| Column resize/reorder persist | Player fixed layouts | Yes |
| Side-by-side roster+player | Full-screen Player workspace | Yes |

---

## Recommended Migration Strategy

### Phase 1 — Restyle (no IA change)

Apply NG tokens, typography, controls to `CanonicalRoster` + `BDMDataGrid` presentation mode inside legacy desktop OR ng shell wrapper.

### Phase 2 — Parity fixes (small ADAPT)

1. Fix injury status column (`getCurrentPlayerInjury`)
2. Add contract expiry to general/contracts preset
3. Port position filter from `RosterSquadTable`
4. Remove or implement sub-view selector
5. Dedupe search UI

### Phase 3 — Shell integration

Mount roster in NG SystemBar/Taskbar route without `WorkspaceTabs` or `InspectorPane`. Use `WorkspaceToolbar` + `ScrollRegion` + grid.

### Phase 4 — Consolidate implementations

Merge `SquadScreen`/`RosterSquadTable` features into single canonical grid module; deprecate duplicate.

### Phase 5 — Player bridge

When NG Player is default, `openEntity` targets NG PlayerWorkspace preserving side-by-side geometry.

### Phase 6 — Parity sign-off

Run Functional Parity Checklist against NG build; regression register empty.

**Do not start Phase 1 implementation in STEP 012.**

---

## Runtime / Domain Gaps (Roster-relevant, no implementation)

| Gap | Impact on migration |
|-----|---------------------|
| 35→80 ratings | More columns in custom preset — grid must scale |
| No roster registration/jersey data | Sub-views blocked until domain exists |
| Contract currency absent | Salary column shows compact `$` — align with NG honesty |
| Two rating models (V2 vs intelligence) | Consolidate presentation rules before NG |

---

## Technical Notes

| Item | Path |
|------|------|
| Active roster | `src/ui/pcb-migrated/plantilla/CanonicalRoster.tsx` |
| Page wrapper | `src/ui/pcb-migrated/plantilla/PlantillaPcbPage.tsx` |
| Grid engine | `src/ui/dataGrid/BDMDataGrid.tsx` |
| Legacy alternate | `src/ui/screens/SquadScreen.tsx`, `RosterSquadTable.tsx` |
| Context actions | `src/ui/entityContextMenu/entityContextActions.ts` |
| Grid persist | `src/ui/dataGrid/persistence.ts` |
| Tests | `CanonicalRoster.test.ts`, `RosterSquadTable.test.ts`, `SquadScreen.test.ts` |

---

## Finding Classification (STEP 012)

| Priority | Items |
|----------|-------|
| **P0** | Functional parity checklist must pass before cutover; no silent feature removal |
| **P1** | Consolidate dual grid; fix injury status; NG restyle layer; density baseline |
| **P2** | Sub-views implement/deprecate; global search UX; sticky player column |
| **P3** | Virtualization for very large rosters; saved view naming UX |

| Work type | Items |
|-----------|-------|
| **UI FOUNDATION** | NG tokens on BDMDataGrid; ScrollRegion; toolbar primitives |
| **ROSTER REFINEMENT** | Injury column; position filter; expiry column |
| **RUNTIME ALIGNMENT** | 80 ratings; registration/jersey domain |
| **DESIGN SYSTEM EXTRACTION** | BDMDataGrid NG from production lessons |
| **FUTURE FEATURE** | Virtualization; sticky columns |

---

*End of Roster migration audit.*
