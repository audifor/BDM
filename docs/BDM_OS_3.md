# BDM OS 3.0

BDM is a desktop workspace, not a collection of web pages. OS chrome (context bar,
windows, widgets and dock) is deliberately separate from application chrome and
application content.

## Foundation

- Use the semantic tokens in `src/ui/design-tokens.css`; do not introduce per-screen
  color, spacing, radius or shadow values without a token.
- `comfortable`, `standard` and `compact` density are local workstation preferences.
  They change spacing and row height, never game data or the reading scale.
- Wallpaper, density and dock behavior belong to `desktopPreferencesStore`, not
  `GameWorld` or a save file.
- Team colour is contextual and restrained. Missing logos and portraits use the
  existing consistent placeholders.

## Applications

Use fixed app regions: app header, local navigation, toolbar, a scrollable workspace
and an inspector when an entity selection benefits from it. Data-dense work belongs
in the reusable table patterns: sticky headers, aligned tabular figures, hover and
selection states, and localized scrolling.

Entity windows have a stable instance key. A player, team or competition may be open
beside another entity; do not route all profile windows through one global selection.

## OS shell

The desktop is Home: wallpaper, workspace widgets, free windows, the global context
bar and dock remain visible together. The context bar uses only canonical game date,
club, competition, season and ecosystem information; search and Settings are real
actions. The dock presents pinned modules, open/active state and only real inbox
badges. Window state is local and supports focus, move, resize, minimize, restore,
maximize and left/right/top-edge snapping.

Widgets are independently persisted workstation instruments. They are sourced from
canonical team, game, standings, training, calendar, inbox and news queries. In edit
mode they can be moved, resized and hidden; Settings/desktop customization restores
only registered widgets.

## App framework and data

`AppFrame`, `AppHeader`, `SplitWorkspace`, `DataTable` and `DetailGroup` are the
shared Golden Reference primitives. Use them for a fixed header/navigation/toolbar
plus a localized workspace rather than growing a page vertically. `DataTable` owns
sticky headers, selected and hover states, localized scrolling, numeric alignment,
empty state and density-aware row height. It is used by the Free Agent Market dense
reference app; Roster retains its entity action integration and inspector while it
migrates incrementally.

An inspector is a stable side pane, never a source of fabricated information. Use
the existing entity-action composer for contextual actions; visible actions must
reach a valid query, window, workflow or canonical command.

## Canonical reference apps

- Team/Roster: search, position filter, sortable ratings table and selected-player
  inspector backed by canonical player, fatigue, eligibility and academic queries.
- Player profile: an independent entity window with real attributes and team links.
- Player profile: uses the shared app frame, identity/portrait fallback, a stable
  condition inspector and canonical attribute detail group; it never manufactures an
  overall rating, contract or statistics.
- Coach Career: uses the shared app frame with Overview, Opportunities, Career,
  Reputation, Relationships and Development views. Job offers/openings and career
  actions remain direct adapters to the existing career APIs.
- Dense Market: Free Agent Market uses `AppFrame`, `DataTable`, filter toolbar and
  real salary-budget signing inspector.
- Desktop: the OS shell itself is Home; it is not a duplicate SaaS dashboard.

Charts are deliberately absent until a canonical series exists. Portraits and logos
reserve a stable slot/fallback; an unavailable asset must never shift the layout.

## Certification status

Functional certification uses focused Vitest coverage plus typecheck/build/Rust
checks. Visual browser certification remains blocked in this environment: Vite serves
the application at `http://127.0.0.1:1420`, but no browser-control surface is exposed,
Playwright is not installed, and the environment rejects a local Chrome remote-debug
process. No conceptual screenshots substitute for a real browser capture.

## Do not

- create endless page scrolls, HTML-looking grid tables, button walls or cards for
  every section;
- invent stats, charts, actions, logos or portraits when canonical data is absent;
- persist derived values or local UI preferences into `GameWorld`;
- put Domain/Engine rules in React, Zustand or Tauri code;
- use arbitrary screen-local spacing, colours or mobile-first layouts.
