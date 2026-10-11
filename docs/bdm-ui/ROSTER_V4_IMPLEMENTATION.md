# ROSTER V4 · Courtside / FM-like squad workflow

**Branch:** `feat/bdm-ui-roster-v4` (isolated from main and PLAYER).
**Scope:** UI-only ROSTER redesign with existing canonical domain and engine.

## Approved behavior implemented

- Courtside palette: `#0c0a14`, `#17141f`, `#ff6a2b`, `#d4ff3a`; existing game shell and dock unchanged. No sidebar.
- Compact one-line header and four tabs: **PLANTILLA, PROFUNDIDAD, BRIEFING, PLANIFICAR**. No calendar shortcut.
- ROSTER table fills remaining vertical space; no persistent lower deck/depth panel and only internal table scroll.
- Built-in BDMDataGrid supplies multi-sort, resize, drag reorder, visible columns, CSV, keyboard and multi-select.
- Favorite view tabs, full view selector, column manager, named custom views and local saved configurations.
- Rapid position/injury/age/contract filters plus independently saved grouped AND/OR filters.
- Explicit inspector popup for exactly one selected player; closes on outside pointer or Escape. Double-click and player-name click still navigate to PLAYER.
- PROFUNDIDAD uses a dedicated Courtside five-lane depth presentation built from the canonical depth/rotation projection; no inferred all-position eligibility or overall badges.
- BRIEFING uses source-backed Courtside analytics cards: age histogram, position coverage, available knowledge, injuries, rotation gaps and contract types.
- PLANIFICAR uses a Courtside three-horizon contractual board. It only counts already active, registered contracts against declared date cutoffs; **no fictional projected signings, future squad guarantees or silent financial actions**.
- Scouting-aware rating visibility, canonical positions, fatigue, injuries and contracts remain owned by existing domain/world data.

## Important limitations / fidelity checks

- Player portraits and rating colors are inherited from the production data grid; a browser-level Courtside 1:1 comparison is still required.
- Advanced filters are display-only; they do not modify the world.
- PLANIFICAR remains a source-backed contractual outlook, not yet an editable multi-season transfer scenario board.
- The existing Legacy Roster keeps precisely its eight view presets; V4-only presets are not inserted into legacy selectors.
- The wider CI suite on the integration baseline includes failures unrelated to this isolated Courtside work; targeted validation must be reported separately, not represented as full-suite PASS.
- No claimed live test/build PASS until GitHub Actions completes and visual behavior is inspected.
- The approved conceptual mockup uses illustrative data; production UI never hardcodes those player ratings, counts or salaries.
