# BDM_OS_NG · Migration Doctrine

**Version:** STEP 012  
**Branch:** `bdm-os-ng`  
**Status:** Canonical rules for migrating existing BDM applications to BDM_OS_NG.

This document defines how legacy/current applications enter the NG visual and interaction system **without** assuming PlayerWorkspace composition is universal.

---

## Core equation

```
GOOD EXISTING APPLICATION
+ BDM_OS_NG VISUAL / INTERACTION SYSTEM
+ TARGETED STRUCTURAL CORRECTIONS
= BDM_OS_NG APPLICATION
```

Never reduce functionality to make another app resemble Player.

---

## PRESERVE FIRST

Existing functionality and strong information architecture survive **by default**.

| Default | When to override |
|---------|------------------|
| **PRESERVE** or **PRESERVE + RESTYLE** | Unless concrete evidence of IA failure or broken workflow |
| **ADAPT** | Only when NG workspace geometry genuinely requires it |
| **REBUILD** | Only when current structure fails users or blocks maintenance |
| **DEPRECATE** | Only with evidence: redundant, broken, or obsolete |

If a capability would disappear during migration, it is a **FUNCTIONAL REGRESSION** and blocks replacement until resolved.

---

## VISUAL MIGRATION ≠ FUNCTIONAL REWRITE

Visual modernization (tokens, typography, surfaces, controls, scrollbars, selection chrome) may proceed **without** changing workflows, column sets, or action placement.

Restyle layers that can migrate independently:

- Fonts and numeric typography (`ng-fonts.css`, `ng-type-numeric`)
- Background surfaces and borders (`ng-tokens.css`)
- Row hover / selection states
- Toolbar and button styling (`ng-controls.css`)
- Status tone semantics (after hierarchy cleanup from Player audit)
- Scrollbar styling (`ScrollRegion` / `ng-scroll-region`)
- Context menu visual language

---

## NO PLAYER TEMPLATE COPYING

PlayerWorkspace is a reference for:

| Player IS reference for | Player is NOT reference for |
|------------------------|----------------------------|
| OS integration (SystemBar, Taskbar) | Application layout |
| Workspace hosting shell | Navigation structure (tabs vs single surface) |
| Visual system (tokens, typography) | Data composition |
| Spacing, surfaces, controls | Mandatory inspector |
| Scroll ownership rules | Player header composition |
| Semantic empty/unavailable states | Tab-per-domain pattern |
| Session slice patterns (lessons) | Radar / attribute matrix layouts |

**Roster is a grid-first management surface.** It must not be forced into seven tabs + 336px inspector unless IA analysis proves benefit.

---

## FUNCTIONAL PARITY

No migrated application replaces its current UI until:

1. A **Functional Parity Checklist** exists (per app).
2. Every checklist item is demonstrated in NG implementation or explicitly deferred with user approval.
3. Regression register has zero unresolved **blockers**.

Parity includes: actions, keyboard behavior, persistence expectations, density (visible rows/columns), and cross-app workflows (e.g. Roster → Player).

---

## REGRESSION REGISTER

For each migration, maintain a register:

| Field | Description |
|-------|-------------|
| Capability | What the current app does |
| Location | File / UI region |
| Why useful | User workflow justification |
| NG disposition | PRESERVE / ADAPT / etc. |
| Status | Open / Mitigated / Accepted |

Any **Open** item marked as user-facing blocks cutover.

---

## APPLICATION-SPECIFIC GRAMMAR

Different apps may require different structural grammars:

| App type | Likely grammar |
|----------|----------------|
| **Player** | Tabbed entity workspace + optional inspector |
| **Roster** | Dense grid + toolbar + inline edits + context menu |
| **Team** | Dashboard + section navigation |
| **Competition** | Schedule / standings tables |
| **Trade** | Multi-panel negotiation |
| **Scouting** | Comparison + report surfaces |

Shared visual system; **not** shared layout templates.

---

## SHARED SYSTEM, DIFFERENT APPS

What provides cross-app coherence:

- `--ng-*` design tokens
- Typography roles (UI + numeric)
- Surface hierarchy (workspace, panel, inset)
- Control primitives (`ng-btn`, inputs, selects)
- Interaction states (hover, selected, focus)
- Empty / unavailable / not-tracked taxonomy
- Scroll ownership contract (document does not scroll)
- Semantic tone hierarchy (positive / warning / negative — non-colliding)

What stays app-specific:

- Column sets and presets
- Primary navigation model
- Master-detail vs inspector vs inline expansion
- Toolbar action sets
- Domain-specific inline editors (e.g. ROT dropdown)

---

## NG PRIMITIVE ADOPTION RULE

For each NG primitive, classify before use:

| Class | Meaning |
|-------|---------|
| **USE** | App benefits clearly; adopt in migration |
| **OPTIONAL** | Valid enhancement; not required for parity |
| **DO NOT USE** | Would harm IA or workflow |

Primitives to evaluate per app:

- `ApplicationWorkspace`
- `WorkspaceHeader` / entity header variant
- `WorkspaceTabs`
- `WorkspaceToolbar`
- `WorkspaceBody`
- `InspectorPane`
- `ScrollRegion`
- `SplitPane`
- `SemanticTone` (future)
- `PresentationField` (future)
- `StatusChip` / `StatusBand` (future)
- Future `BDMDataGrid` NG foundation

---

## DENSITY REGRESSION IS A BLOCKER

NG migration must **not** reduce visible information merely due to larger padding, taller chrome, or typography changes.

Baseline captures at **1920×1080** document current visible row counts and column sets. NG acceptance must meet or exceed baseline density unless explicitly approved.

---

## DATA GRID FOUNDATION (FUTURE)

Legacy `BDMDataGrid` (`src/ui/dataGrid/BDMDataGrid.tsx`) already implements many roster-critical behaviors. Future NG grid work should **extract lessons** from production Roster usage, not replace Roster with Player patterns.

Do not rewrite grids during audit-only steps.

---

## SESSION CONTRACT (FUTURE)

Per-app workspace sessions should capture what users expect to restore:

- Selection (row, multi-select)
- Sort and filters
- Search query
- Column order, widths, visibility
- Active view preset
- Scroll position (when feasible)

URL/deep-linkable state is optional per app; Roster may need `teamId` + filter state less than Player needs `playerId` + tab.

Do not introduce global `WorkspaceSession` until per-app contracts are documented.

---

## MIGRATION PHASES (RECOMMENDED)

1. **Audit** — inventory, parity checklist, baseline screenshots (STEP 012 for Roster).
2. **Restyle layer** — tokens, typography, surfaces on existing structure.
3. **Targeted adaptation** — shell integration, session persistence gaps.
4. **Structural correction** — only where audit marked ADAPT/REBUILD.
5. **Parity validation** — checklist + regression register clear.
6. **Cutover** — replace legacy route; keep fallback until signed off.

---

## RELATION TO PLAYER AUDIT (NG-011)

NG-011 identified Player-specific issues (Condition label, Overview duplication, inspector collapse global). **Do not import Player bugs into Roster migration.**

NG-011 design system candidates (tokens, shell, ScrollRegion, formatting utilities) **do** apply to Roster restyle.

---

## AUTHORITY

This doctrine outranks ad-hoc “make it look like Player” decisions during NG migration work. Product behavior changes require explicit approval outside audit scope.

---

*End of migration doctrine.*
