# BDM_OS_NG · STEP 011 · Player Workspace Final Audit

**Checkpoint:** `4c18c9e` — NG-010 Player History workspace  
**Branch:** `bdm-os-ng`  
**Date:** 2026-09-04  
**Scope:** Architectural, UX, visual, and runtime-gap audit of the complete PlayerWorkspace (Overview, Attributes, Performance, Development, Contract, Medical, History).  
**Rule:** Diagnosis only — no production fixes in STEP 011.

**Golden set:** `docs/screenshots/step-011/01-overview` … `07-history` @ 1920×1080  
**Capture script:** `scripts/capture-step-011-golden-set.mjs` (audit helper; each tab reloads the page and bootstraps a fresh `createNewGame()`, so default player identity differs between captures unless `playerId` is pinned in the URL — see §30).

---

## Executive Verdict

**YES, AFTER SPECIFIC CORRECTIONS**

PlayerWorkspace is mature enough to serve as the **structural reference** for future BDM_OS_NG applications (`ApplicationWorkspace` → header → tabs → body → optional inspector), but it must **not** be copied verbatim until P0 data-honesty issues and P1 foundation gaps are addressed. The seven-tab vertical slice is functionally complete and architecturally separable (builders + presentation models + session slices), yet Overview still carries pre-NG assumptions, terminology drifts across tabs, and several runtime concepts are exposed before they are user-meaningful.

---

## Primary Questions (§1)

| # | Question | Answer |
|---|----------|--------|
| 1 | One coherent application? | **Partially.** Same shell and navigation grammar; visual/CSS drift between `po-` (Overview/Attributes) and dedicated prefixes (`pp-`, `pd-`, `pc-`, `pm-`, `ph-`). |
| 2 | Seven views belong together? | **Yes.** All answer player-centric questions; tab labels and status-band rhythm are recognizable. |
| 3 | Meaningfully different where needed? | **Yes.** Performance game log, Contract financial schedule, Medical dossier, History chronology are appropriately distinct from Attributes matrix. |
| 4 | Excessive duplication? | **Yes, mainly Overview.** Duplicates ratings subset, performance deck, and a misleading status band vs Medical. |
| 5 | Inconsistent information? | **Yes.** Condition, Risk, Availability, currency, empty-state phrasing. |
| 6 | Shared components genuinely reusable? | **Shell yes; domain bands no.** `ApplicationWorkspace`, `WorkspaceTabs`, `InspectorPane`, `ScrollRegion`, `ng-tokens` are ready. Per-view status bands and inspectors are copy-paste cousins, not one primitive. |
| 7 | Overfitting architecture to Player? | **Moderate.** Session bundles all sub-sessions; acceptable for Player, but future apps should not inherit the full shape. Builder-per-view pattern is good and not overfit. |
| 8 | Ready for Design System primitives? | See §Design System Candidates — shell, tokens, numeric typography, `PresentationField`, scroll regions. |
| 9 | Must remain Player-specific? | Radar/shot court, role profile, rating matrix, contract term cards, injury dossier layout. |
| 10 | UI vs runtime/domain gaps? | **Both.** Condition label = UI honesty bug. Stimulus decimals = runtime exposed too raw. 35→80 ratings = domain/data migration. No shot tracking = runtime absence correctly labeled. |

---

## Cohesion Scores (§29)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Architecture | **7/10** | Clean builder → model → view split; session coherent; inspector wiring inconsistent; Overview still monolithic CSS. |
| Visual cohesion | **6/10** | Shared tokens and shell; section header styles diverge; Overview density ≠ dedicated tabs. |
| Information hierarchy | **6/10** | Attributes/Contract/Medical strong; Overview competes with itself; Performance empty state too flat. |
| Density | **6/10** | Overview overcrowded; Performance/History underuse vertical space when sparse; Contract lower band empty. |
| Navigation | **7/10** | Tabs + deep-link `playerView` work; header actions dead; no keyboard tab nav. |
| Data honesty | **5/10** | Condition = 100 − fatigue; History derived events need stronger provenance; Development stimulus too engine-like. |
| Runtime integration | **6/10** | Honest sparse states in NG-009/010; many canonical fields unused; scouting/potential thin. |
| Reusability | **7/10** | Workspace shell extractable; row/table patterns duplicated; status bands not abstracted. |
| 1920×1080 usability | **7/10** | No document scroll in golden capture; Overview fits but tight; Attributes rail will break at 80 ratings without scroll/search. |

---

## Per-View Audit (§2)

### Overview — `PlayerOverviewView.tsx`, `player-overview.css`, `buildPlayerWorkspaceModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Player identity + skill snapshot + navigation surface to deeper tabs. |
| **Primary user question** | "Who is this player and what are they good at right now?" |
| **Information grammar** | Identity band → radar + rating matrix + performance deck (3 columns). |
| **Shared components** | `EntityIdentityBand`, `RatingMatrix`, `RatingInspectorDetail`, `ApplicationWorkspace` shell. |
| **Player-specific** | `AttributeProfilePanel`, `ShotProfileCourt`, `PerformanceStrip`, `FormTimeline`, `RoleProfile`. |
| **Inspector** | Rating detail; auto-selects first rating; no empty hint component. |
| **Scroll ownership** | `.po-overview` → `overflow: hidden` (no scroll — fixed 1080 layout). |
| **Data source** | `buildPlayerWorkspaceModel()` inline (not dedicated builder). |
| **Duplication** | Ratings matrix ⊂ Attributes; performance deck ⊂ Performance; status band ⊂ Medical (with different semantics). |
| **Weaknesses** | Earliest design; `Condition = 100 - fatigue`; no Development synthesis; performance deck empty cards large; header actions non-functional. |

### Attributes — `PlayerAttributesView.tsx`, `player-attributes.css`, inline `buildAttributes()`

| Field | Finding |
|-------|---------|
| **Purpose** | Full canonical rating catalogue by category with selection + inspector. |
| **Primary user question** | "What is each skill worth, grouped logically?" |
| **Information grammar** | Category rail → category detail → primary/secondary rating rows. |
| **Shared components** | `RatingAttributeRow`, `RatingInspectorDetail`, `InspectorPane`. |
| **Player-specific** | Category rail aggregation (`primary`/`secondary` split in builder). |
| **Inspector** | Same `RatingInspectorDetail` as Overview; category rank context. |
| **Scroll ownership** | Rail: `.po-attributes__rail` `overflow: auto`; detail list: `.po-attributes__rating-list` `overflow: auto`. |
| **Data source** | `buildPlayerWorkspaceModel` → `attributes.categories`. |
| **Duplication** | Inspector content duplicated with Overview for same rating. |
| **Weaknesses** | Fixed 220px rail; 8 categories hard-coded; no search; 80 ratings will require UX changes (see §21). |

### Performance — `PlayerPerformanceView.tsx`, `player-performance.css`, `buildPlayerPerformanceModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Season production, shooting profile, recent form, game log. |
| **Primary user question** | "How is this player performing this season?" |
| **Information grammar** | Status/season summary → production lanes → shooting → form strip → scrollable game log. |
| **Shared components** | `InspectorPane`, `ScrollRegion` pattern via `.pp-log` overflow. |
| **Player-specific** | `PerformanceGameLog`, `GameDetailInspector`, competition filter. |
| **Inspector** | Game box-score detail; empty hint present. |
| **Scroll ownership** | Root hidden; `.pp-log` `overflow: auto`; upper lanes fixed. |
| **Data source** | `buildPlayerPerformanceModel` + runtime `selectPerformanceSnapshot(world, …)`. |
| **Duplication** | Overview performance deck when data exists. |
| **Weaknesses** | Re-fetches `world` in view; empty state is mostly blank space; competition filter hidden when single competition. |

### Development — `PlayerDevelopmentView.tsx`, `player-development.css`, `buildPlayerDevelopmentModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Training context, season stimulus, scout potential, honest absence of longitudinal data. |
| **Primary user question** | "How is this player developing?" |
| **Information grammar** | Context band → stimulus grid + training + scout potential + longitudinal notice. |
| **Shared components** | `InspectorPane`; status band pattern (`pd-status`). |
| **Player-specific** | All `Development*` components. |
| **Inspector** | Stimulus category / scout row detail; empty hint present. |
| **Scroll ownership** | `.pd-root` hidden; `.pd-stimulus__list` and inspector inner `overflow: auto`. |
| **Data source** | Engine/domain: `getDevelopmentStimulusForPlayer`, `getBaseDevelopmentTrend`, scout evaluation. |
| **Duplication** | Minimal with other tabs (intentionally sparse). |
| **Weaknesses** | Stimulus decimals feel engine-internal; `developmentStage` shown as label only; large empty scout/longitudinal zones. |

### Contract — `PlayerContractView.tsx`, `player-contract.css`, `buildPlayerContractModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Active agreement, term timeline, financial schedule, rights/history strip. |
| **Primary user question** | "What is the contractual situation?" |
| **Information grammar** | Status band → agreement table → timeline cards → financial table + rights. |
| **Shared components** | `InspectorPane`, table-like schedule rows. |
| **Player-specific** | `ContractTermTimeline`, `ContractFinancialSchedule`, guarantee semantics. |
| **Inspector** | Season/year financial detail; empty hint present. |
| **Scroll ownership** | `.pc-schedule__body` `overflow: auto`; root hidden. |
| **Data source** | `buildPlayerContractModel` from world contracts. |
| **Duplication** | History tab repeats contract events. |
| **Weaknesses** | "Currency not tracked" repeated; lower workspace dead space; no options/clauses. |

### Medical — `PlayerMedicalView.tsx`, `player-medical.css`, `buildPlayerMedicalModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Availability, fatigue, active injury, risk advisory, recovery, history. |
| **Primary user question** | "Can this player play and what is their medical state?" |
| **Information grammar** | Availability band → fatigue instrument + injury dossier → recovery + history list. |
| **Shared components** | `InspectorPane`. |
| **Player-specific** | All `Medical*` components. |
| **Inspector** | Injury event detail; empty hint present. |
| **Scroll ownership** | `.pm-history__list` `overflow: auto`; root hidden. |
| **Data source** | `buildPlayerMedicalModel` + injury risk from engine assessments. |
| **Duplication** | Overview status band shows subset with different Condition semantics. |
| **Weaknesses** | Raw risk score "Low · 0" vs band-only would be clearer; no body area / rehab stages. |

### History — `PlayerHistoryView.tsx`, `player-history.css`, `buildPlayerHistoryModel.ts`

| Field | Finding |
|-------|---------|
| **Purpose** | Save-scoped career chronology with filters and provenance-aware events. |
| **Primary user question** | "What happened to this player in this save?" |
| **Information grammar** | Scope band → filter chips → timeline table → inspector detail. |
| **Shared components** | `InspectorPane`, filter chip pattern. |
| **Player-specific** | `HistoryTimelineList`, `HistoryScopeBand`, normalized event union. |
| **Inspector** | Per-event-type detail blocks; empty hint present. |
| **Scroll ownership** | `.ph-timeline__scroll` `overflow: auto`. |
| **Data source** | Derived from contracts, transactions, injuries, trades, draft, ecosystem, game logs. |
| **Duplication** | Contract/Medical events reappear here (appropriate if provenance clear). |
| **Weaknesses** | Derived season participation could read as explicit fact; sparse saves feel empty despite honest scope note. |

---

## Visual Consistency Audit (§3)

**Shared strengths:** `--ng-*` tokens (`ng-tokens.css`), gold accent selection, dark panel surfaces, `ng-type-numeric` for stats, inspector 336px width, workspace tabs underline pattern.

**Drift (should align):**

| Area | Drift |
|------|-------|
| Section headers | `pp-panel-head`, `pc-status`, `pm-status`, `pd-status`, `ph-scope` — similar role, different class names and uppercase rules. |
| Status bands | Each view reinvents band layout (`pc-status`, `pm-status`, `pd-status`) instead of one composable band primitive. |
| Selected row | Attributes magenta glow vs Performance game row vs History row — related but not one tokenized pattern. |
| Empty panels | Mix of `po-lane-empty`, `pp-log--empty`, inline `<p>` — copy and padding differ. |
| Inspector titles | "Rating Detail" vs "Game Detail" vs "Contract Detail" — consistent titling, but inner density varies (Contract dense, Development sparse). |

**Intentional differences (keep):**

- Overview radar + court visuals (synthesis, not tab clone).
- Contract timeline cards vs History chronological table vs Medical recovery steps.
- Performance production grid vs Attributes rating bars.

**Typography drift:** Overview uses more all-caps micro-labels; History scope band smaller meta; Development footnotes longest.

---

## Player Header Audit (§4)

**File:** `PlayerWorkspaceHeader.tsx` + `WorkspaceHeader.tsx` (generic, unused by Player)

| Check | Finding |
|-------|---------|
| Repeated information | Team, competition, season repeat SystemBar context; acceptable but dense at 1920. |
| Missing context | No availability/injury badge; no contract expiry hint; no nationality in header (only identity band on Overview). |
| Height | Uses `po-workspace-header` (~56px) + tabs 36px — acceptable. |
| Player selection | `<select>` only when roster > 1; no search; long names truncate OK. |
| Long team names | Truncation via CSS; no tooltip. |
| Multiple positions | Not shown in header (only in select label `Name · PG`). |
| No team | Shows `—` for team/competition. |
| Injured / free agent | Not surfaced in header. |
| International | No locale-specific formatting in header. |
| 1920 pressure | Seven tabs + context + 3 action buttons fit; buttons are **non-functional** (placeholder). |

**Canonical EntityWorkspace header recommendation (future, not now):**

- Identity row: entity name, role/position, selection control.
- Context row: org/team, competition, season (single line, truncating).
- Optional status chip strip (availability, contract state) — **from authoritative tab builders**, not derived ad hoc.
- Actions: only wire when implemented; ghost buttons erode trust.

---

## Tab System Audit (§5)

**File:** `WorkspaceTabs.tsx`, `playerStructuralData.ts`

| Check | Finding |
|-------|---------|
| Readability | Good at 1920; 7 labels fit without overflow. |
| Selected state | Gold underline + tint — clear. |
| Horizontal capacity | ~7–9 tabs before overflow strategy needed. |
| Deep-link | `?playerView=` synced via `syncPlayerViewQuery`; overview omits param. |
| Selected player | `?playerId=` read by `usePlayerWorkspaceModel`; not synced on roster select (only `setPlayerId` in context — verify if URL updates). |
| Subview state | Preserved across tab switches; reset on `playerId` change (correct). |
| Keyboard | No arrow-key tab navigation. |
| Future expansion | No overflow/menu; 8th tab will require design. |
| Overflow behavior | None — flex row only. |

**Verdict:** `WorkspaceTabs` is **ready as canonical workspace primitive** with planned overflow for 8+ tabs. Not ready for global app tabs without overflow + keyboard spec.

---

## Session Model Audit (§6)

**File:** `playerWorkspaceSession.ts`, `PlayerWorkspace.tsx`

**Current shape:**

```
activeView, selectedRatingId, selectedCategory, attributesCategory,
inspectorCollapsed (global),
performance.{selectedGameId, competitionFilter},
contract.{selectedItemId},
medical.{selectedEventId},
development.{selectedItemId},
history.{selectedItemId, activeFilter}
```

| State | Recommendation |
|-------|------------------|
| `activeView` | Workspace session + URL (`playerView`) |
| Rating selection | Local to Overview/Attributes; could reset on leaving attributes |
| `attributesCategory` | Attributes session only |
| `inspectorCollapsed` | **Should be per-view or per-app**, not global — collapsing in Contract affects Overview |
| Performance filters | Performance session; persist while in Player |
| Contract/Medical/Dev/History selection | Per-view session slices — good pattern |
| `selectedCategory` (Overview radar) | Overview-local; overlaps conceptually with `attributesCategory` |

**Duplication:** Two category selection concepts (`selectedCategory` vs `attributesCategory`).

**Future WorkspaceSession contract (proposal only):**

```typescript
interface WorkspaceSession<TView extends string> {
  activeView: TView
  entityId: string
  inspector: { collapsed: boolean } // or per-view map
  views: Record<TView, unknown> // view-specific slices
}
// URL: ?app=player&entityId=&view=&...viewParams
// Persist: entityId + activeView across app switches (Zustand bridge, not engine)
```

Do **not** migrate in STEP 011.

---

## Inspector Audit (§7)

**File:** `InspectorPane.tsx`, `--ng-inspector-width: 336px`

| Aspect | Finding |
|--------|---------|
| Width | 336px appropriate for numeric detail + related list; Contract schedule doesn't need inspector width change. |
| Header | Consistent collapse toggle. |
| Selection semantics | Overview/Attributes: implicit rating selection; others: row selection. |
| Empty state | Performance/Contract/Medical/Development/History have hints; Overview/Attributes lack explicit empty pane when nothing selected. |
| Scroll | `ng-inspector-pane__content` is `overflow: hidden` — inner components must scroll (`.pm-inspector`, `.pc-inspector` use `overflow: auto`). |
| Detail density | Contract/Medical denser than Development. |
| Actions | No primary actions in inspector (correct for read-only audit phase). |
| Focus | No focus trap; acceptable for desktop FM-like UI. |

**Canonical primitives:** `InspectorPane`, empty hint block pattern, inspector section stack (title / stat grid / footnote).

**Not every app needs an inspector** — Performance-style master-detail is optional; Team roster might use inline expansion instead.

---

## Scroll Ownership Audit (§8)

**Canonical rule:** document and shell do not scroll; explicit regions do.

| View | Scroll owner | Violations |
|------|--------------|------------|
| Overview | None (fixed layout) | None at 1080; risk if content grows |
| Attributes | Category rail + rating list | Compliant |
| Performance | Game log (`.pp-log`) | Upper area fixed; OK |
| Development | Stimulus list, inspector inner | Compliant |
| Contract | Financial schedule table body | Compliant |
| Medical | Medical history list | Compliant |
| History | Timeline scroll region | Compliant |

**Golden capture:** `document.documentElement.scrollHeight === clientHeight` (no document scroll).

**Minor issues:**

- `ScrollRegion` component exists but Player views mostly use ad-hoc `overflow: auto` classes — inconsistent adoption.
- Inspector outer content `overflow: hidden` requires every inspector child to handle scroll — easy to regress.

---

## Empty State Audit (§9)

**Proposed canonical taxonomy:**

| Concept | Meaning | Example copy |
|---------|---------|--------------|
| **EMPTY** | Valid scope, zero records | "No game log entries for this season." |
| **UNAVAILABLE** | System cannot provide field | "Currency not tracked." |
| **NOT TRACKED** | Feature not implemented | "Shot tracking not yet available." |
| **NOT YET KNOWN** | Org lacks scouting knowledge | "No scouting potential evaluations available." |
| **NO RECORDS** | Historical ledger empty | "No recorded injuries." |
| **UNKNOWN** | Avoid — prefer specific above | — |

**Current violations:**

- "Not tracked" used for Sharpness (Overview) and shot profile — OK if labeled NOT TRACKED consistently.
- "Not available" in `unavailableField()` vs "No …" strings — merge into taxonomy.
- Development longitudinal uses good honest copy; scout section matches NOT YET KNOWN.
- Performance empty season vs Overview empty deck — same runtime state, different visual weight (Overview cards larger).

---

## Terminology Audit (§10)

| Term | Issue | Recommendation |
|------|-------|------------------|
| **Condition** | Overview shows `100 - fatigue` labeled "Condition" — **not** medical condition | Rename to **"Freshness"** or **"Rest level"** OR remove and link to Medical fatigue |
| **Fatigue** | Shown in Overview and Medical — consistent value | Keep; single source `getCareerFatigueForPlayer` |
| **Risk** | Overview "Low · 0" vs Medical injury risk advisory | Label **"Injury risk (advisory)"** everywhere; prefer band + reason over raw 0 |
| **Sharpness** | "Not tracked" | NOT TRACKED — OK |
| **Potential** | Development scout evaluations | USER-FACING — OK |
| **Development stimulus** | Raw floats | Reframe as "Training focus accumulation" with rounded/banded values |
| **Contract status** | ACTIVE / EXPIRES | Clear |
| **Guarantee** | Used on timeline + schedule | Clear |
| **Free agent** | Not prominently shown in Contract empty path | Add when domain supports |
| **Current season** | Repeated in multiple bands | OK if same `seasonLabel` source |
| **Availability** | Medical authoritative; Overview mirrors | Overview should defer or badge-link to Medical |
| **History scope** | "Persisted in this save" | Good — keep prominent |

**P0:** Condition label (factual inconsistency with Medical semantics).

---

## Data Consistency Audit (§11)

| Concept | Inconsistency |
|---------|---------------|
| Availability | Overview identity band vs Medical band — same injury source but Overview adds Condition derivative |
| Fatigue | Consistent numeric source |
| Medical risk | Overview shows simplified; Medical shows band + reasons — same engine, different presentation depth |
| Team | `findTeamForPlayer` in multiple builders — consistent |
| Competition | Performance filter vs header competition label — aligned when available |
| Season | Multiple builders resolve season labels — shared helpers partially (`formatSeasonSpanLabel`, `resolveSeasonLabelForYear`) |
| Ratings | Overview matrix vs Attributes — same catalogue |
| Potential/scouting | Development only; Overview doesn't show |
| Contract status | Contract tab vs History event — aligned |
| Dates | `formatGameDateLabel` shared — good |
| Currency | Contract explicit "not tracked" — good |
| Player selection | Header select may not update URL `playerId` — breaks deep-link/share |

---

## Numeric Formatting Audit (§12)

| Domain | Current | Canonical need |
|--------|---------|----------------|
| Ratings | Integer 1–100 | `formatRating(value)` |
| Percentages | Performance `formatPercentage` local | `formatShootingPct(made, att)` |
| Money | `Intl.NumberFormat` without symbol | `formatMoney(amount, { currency: 'unknown' })` |
| Dates | `formatGameDateLabel` (en-GB upper) | `formatGameDate`, `formatSeasonSpan` in `@/ui-ng/format` |
| Minutes | Performance one decimal | `formatMinutes` |
| Box scores | Made/attempt strings | shared stat column helpers |
| Fatigue | Integer /100 | same as rating |
| Risk | Integer score + band | band-primary display |
| Stimulus | One decimal | `formatStimulus` with cap/note |
| Contract years | "N seasons remaining" | shared duration helper |

**Do not refactor in STEP 011** — record as DESIGN SYSTEM EXTRACTION item.

---

## Color Semantics Audit (§13)

**Current tokens:** `--ng-positive`, `--ng-warning`, `--ng-negative`, `--ng-rating-*`, team `--po-team-primary`.

**Collisions:**

| Red (`--ng-negative`) used for | Conflict |
|----------------------------------|----------|
| Poor rating tone | vs injury severity |
| High fatigue load | vs loss result (Performance form W/L) |
| High injury risk | vs expired contract warning |

**Proposed hierarchy:**

1. **Selection / focus** — gold accent only (`--ng-accent-primary`).
2. **Availability** — green/red discrete (Available / Out).
3. **Advisory risk** — amber band, not same red as injury.
4. **Rating quality** — gold scale (`--ng-rating-*`), not semantic red/green.
5. **Game result** — muted green/red or W/L badges separate from medical.

Do not redesign palette in STEP 011.

---

## Component Inventory (§14)

### A — Canonical OS primitive

| Component | Path |
|-----------|------|
| Design tokens | `src/ui-ng/tokens/ng-tokens.css` |
| Global NG styles | `src/ui-ng/styles/ng-global.css`, `ng-controls.css`, `ng-fonts.css` |
| SystemBar / Taskbar | `src/ui-ng/system/*` |

### B — Canonical workspace primitive

| Component | Path | Notes |
|-----------|------|-------|
| ApplicationWorkspace | `workspace/ApplicationWorkspace.tsx` | Ready |
| WorkspaceBody | `workspace/WorkspaceBody.tsx` | Ready |
| WorkspaceTabs | `workspace/WorkspaceTabs.tsx` | Needs overflow spec |
| WorkspaceHeader | `workspace/WorkspaceHeader.tsx` | Generic; Player uses custom header |
| InspectorPane | `workspace/InspectorPane.tsx` | Ready |
| ScrollRegion | `workspace/ScrollRegion.tsx` | Underused |
| SplitPane | `workspace/SplitPane.tsx` | Ready for master/detail |
| WorkspaceHost | `workspace/WorkspaceHost.tsx` | App routing shell |

### C — Canonical data / sports primitive

| Component | Path | Notes |
|-----------|------|-------|
| `PresentationField` pattern | `playerWorkspaceModel.ts`, `presentationHelpers.ts` | Extract |
| `formatGameDateLabel` | `presentationHelpers.ts` | Move to shared format |
| Rating tone CSS | `ng-tokens.css` `--ng-rating-*` | Ready |
| `ng-type-numeric` | `ng-global.css` | Ready |

### D — Player-specific

| Component | Path |
|-----------|------|
| EntityIdentityBand | `components/EntityIdentityBand.tsx` |
| RatingMatrix, RatingAttributeRow, RatingInspectorDetail | `components/Rating*.tsx` |
| ShotProfileCourt, RoleProfile, BasketballVisuals | `components/visual/*`, `ShotProfileCourt.tsx` |
| Performance* | `components/Performance*.tsx`, `GameDetailInspector.tsx` |
| Development* | `components/Development*.tsx` |
| Contract* | `components/Contract*.tsx` |
| Medical* | `components/Medical*.tsx` |
| History* | `components/History*.tsx` |
| PlayerWorkspaceHeader | `components/PlayerWorkspaceHeader.tsx` |
| Builders | `data/buildPlayer*.ts` |

### E — Should be refactored

| Item | Reason |
|------|--------|
| Per-view status bands (`pc-status`, `pm-status`, `pd-status`) | Merge into composable `StatusBand` |
| Per-view inspector inner wrappers | Share inspector section layout |
| Overview performance deck | Replace with synthesis widgets, not mini-tabs |
| `PlayerPlaceholderView` | Dead code — remove in future cleanup |
| `PLAYER_VIEW_PLACEHOLDERS` | Obsolete |
| Overview inline builder in `buildPlayerWorkspaceModel` | Split `buildPlayerOverviewModel` |

### F — Should be removed / merged

| Item | Reason |
|------|--------|
| `PlayerOverview.tsx` re-export | Transitional — merge doc only |
| Duplicate rating inspector wiring in Overview + Attributes | Single path via session |
| Non-functional header buttons | Remove or implement |

---

## Data Grid Roadmap (§15)

| Grid-like surface | Sort | Select | Sticky header | Virtualization | Keyboard |
|-------------------|------|--------|---------------|----------------|----------|
| Attributes rows | No | Yes | No | Needed at 80+ | Partial (click only) |
| Performance game log | Implicit date | Yes | Should | Yes for long seasons | No |
| Contract schedule | Season order | Row → inspector | Yes | No | No |
| Medical history | Date desc | Yes | No | Unlikely needed | No |
| History timeline | Date desc | Yes + filter | Should | Maybe | No |

**Shared foundation needs:** row selection chrome, numeric column alignment (`ng-type-numeric`), sticky header row, empty row state, optional sort indicators, scroll container contract.

**Different behaviors:** History filters; Performance competition scope; Contract guarantee badges.

Do **not** rewrite in STEP 011.

---

## Timeline Lessons (§16)

| Timeline | Semantics | Reuse? |
|----------|-----------|--------|
| ContractTermTimeline | Season cards, guarantee state | Domain-specific card timeline |
| MedicalRecoveryTimeline | Injury milestones | Clinical steps — different grammar |
| History chronology | Tabular events | List/table, not card timeline |
| Development context | Text band only | Not a timeline |

**Verdict:** No universal `Timeline` component yet. Shared **chronology row** (date + title + context) could be extracted for History + Medical history + Contract history strip — not for Contract term cards.

---

## Status System Lessons (§17)

Statuses implemented ad hoc per view. Shared concepts:

- Availability (Medical)
- Contract ACTIVE/EXPIRED
- Medical severity / risk band
- Guarantee state
- Development context labels
- Game W/L (Performance form)

**Recommendation:** Extract **`SemanticTone`** enum (`positive | warning | negative | neutral | information`) + **`StatusChip`** before **`StatusBand`**. Full `StatusBadge` system premature — guarantee vs injury vs availability need different icons/copy templates.

---

## Typography Audit (§18)

**Direction:** Inter Tight UI + Roboto Flex numerics (`ng-fonts.css`).

| Problem | Location | Recommendation |
|---------|----------|----------------|
| Too small meta | History footnotes, Development notes | Bump `--ng-font-size-meta` minimum legibility |
| Excessive uppercase | Panel heads, stat labels | Sentence case for body-adjacent labels |
| Insufficient hierarchy | Performance empty state | Stronger empty headline |
| Numeric hierarchy | Good on Medical fatigue, Contract money | Extend to Performance production |
| Line height tight | Category rail buttons | +2px for 2-line labels |
| Corporate tone | Contract agreement table headers | Slight warmth via secondary color not weight |
| Overview crowded labels | Identity band status grid | Reduce column count or wrap |

**Correction plan (P2):** Document typographic roles (Display / Title / Label / Meta / Numeric); audit uppercase rules; fix Overview status band density; align panel head classes to shared `ng-panel-head`.

---

## Density Audit (§19)

| View | Issue |
|------|-------|
| Overview | Overcrowded center matrix + bottom deck; identity band wide |
| Attributes | Balanced; rail will need density modes at 80 ratings |
| Performance | Large empty vertical gap when no games |
| Development | Honest sparse — acceptable whitespace |
| Contract | Lower-left empty below schedule |
| Medical | Balanced for healthy player |
| History | Table could use more rows visible; inspector fixed |

**Do not solve by shrinking fonts.**

---

## Overview Audit (§20)

**Hardest findings:**

Overview duplicates:

- Full rating matrix (Attributes)
- Performance strip / form / shot court (Performance)
- Status metrics (Medical) with **wrong Condition semantics**

**Missing synthesis:**

- No Development headline
- No Contract summary chip
- No History recent event
- No navigation CTAs to tabs with context

**Recommendation — what should remain:**

- Entity identity (compact)
- Role + radar **summary** (not full matrix)
- Top 3 strengths / limitations (derived once)
- **Synthesis cards** linking to tabs (e.g. "View medical → Available")
- Single "last event" or "contract status" strip

**Remove/change:**

- Full 12+ rating list → link to Attributes
- Performance deck empty giants → compact unavailable chips
- Condition metric → remove or rename
- Duplicate fatigue/risk → badge linking to Medical

---

## Attributes Audit (§21) — 35 → 80 Readiness

**Verdict: YES WITH CHANGES**

| Area | Impact |
|------|--------|
| Category rail | 8 categories may become 10–12; rail scroll + search required |
| Primary/secondary split | Builder logic must stay data-driven from catalogue |
| Rating rows | Virtualization or grouped collapse for 80 rows |
| Inspector | Unchanged |
| Radar (Overview) | May need aggregated families beyond 8 axes |
| Persistence | Domain keys drive UI — migration is additive if catalogue is source of truth |
| Tests | `ratingCatalog.ts` maps keys — extend, don't fork |

Will **not** survive 80 ratings **without** search, virtualization, and category map updates.

---

## Performance Audit (§22)

**Reusable for Team / Competition / Scouting:**

- Season summary grid (`PerformanceSeasonSummary`)
- Shooting panel structure
- Recent form strip
- Game log + inspector pattern
- Competition filter pattern

**Player coupling:** `buildPlayerPerformanceModel`, player-scoped game logs, `playerId` in snapshot selector.

Extract **presentation components** with injected snapshot models, not Player builders directly.

---

## Development Audit (§23)

| Field | Classification |
|-------|----------------|
| Age, season label | USER-FACING |
| Development stage label | ADVISORY (note says not used in calculation) |
| Age base trend | ADVISORY |
| Training team/intensity/focus | USER-FACING |
| Individual plan | USER-FACING |
| Season stimulus totals (raw floats) | **INTERNAL-BUT-CURRENTLY-EXPOSED** |
| Per-category stimulus breakdown | **INTERNAL-BUT-CURRENTLY-EXPOSED** — reframe for managers |
| Scout potential evaluations | USER-FACING |
| Longitudinal notice | USER-FACING (honest absence) |
| `growthRate` / `declineSensitivity` | **SHOULD BE HIDDEN** (not shown — good) |

---

## Contract Audit (§24)

**NBA-agnostic strengths:** Unknown currency honest; numeric amounts without fake `$`; guarantee + cap hit columns; term timeline.

**FIBA / future gaps (domain, not UI):** options, clauses, buyouts, dual currency, federation rights, loan vs transfer.

**UI gaps:** free agent state, expired contract empty path, rights section minimal.

---

## Medical Audit (§25)

- **Risk is advisory** — tests assert engine connection; UI should not imply probability.
- Raw **"Low · 0"** — prefer band + primary reason (Medical inspector partial).
- **Condition inconsistency with Overview** — P0.
- Missing: body area, rehab stages, sharpness (correctly absent).

---

## History Audit (§26)

- Save-scoped messaging in `HistoryScopeBand` — **good**.
- Event model includes `source` in builder — inspector should always show provenance for derived events (season participation from game logs).
- Risk: normalized events feel like explicit historical facts — differentiate **Recorded** vs **Derived** visually in inspector (badge).

---

## Runtime Gap Register (§27)

| Gap | Priority | Layer |
|-----|----------|-------|
| 35 vs 80 canonical ratings | P1 | DOMAIN/DATA/UI |
| 21 vs broader tendencies | P2 | DOMAIN |
| No role affinity | P2 | DOMAIN/ENGINE |
| No rating history | P1 | DATA/PERSISTENCE |
| Potential internal vs scout architecture | P1 | DOMAIN |
| `developmentStage` not used in sim | P2 | ENGINE |
| `growthRate` / `declineSensitivity` unused | P2 | ENGINE |
| No playing-time development effects | P2 | ENGINE |
| No injury-development effects | P2 | ENGINE |
| Traits/personality development absent | P3 | ENGINE |
| Contract currency absent | P1 | DATA |
| Contract options/clauses absent | P2 | DOMAIN |
| Shot locations absent | P2 | DATA/ENGINE |
| Sharpness absent | P2 | ENGINE/UI |
| Body area absent | P2 | DOMAIN |
| Rehab stages absent | P2 | DOMAIN |
| Team membership history absent | P1 | DATA |
| Awards absent | P3 | DATA |
| National-team history absent | P3 | DATA |
| Overview Condition misleading | **P0** | UI |
| Header actions non-functional | P2 | UI |
| `playerId` URL sync | P1 | UI |

---

## 35 vs 80 Impact (§28)

**What breaks or requires change:**

| Area | Impact |
|------|--------|
| `ratingCatalog.ts` | Extend mappings — mechanical |
| Attributes rail + lists | UX redesign (search/virtualization) |
| Overview radar | May need non-1:1 axis mapping |
| Overview RatingMatrix | Cannot show all 80 — summary only |
| Development stimulus rows | More rows per category |
| Inspector related ratings | More siblings per category |
| Scouting comparison (future) | Catalogue-driven — OK if data-driven |
| Persistence/generation | Domain change — UI adapters follow keys |
| Simulation | Engine already keyed — UI only |
| Tests | Update counts/fixtures |

**NG architecture tolerance:** **YES WITH CHANGES** — builders and catalogue are data-driven; layout components are not yet scalable.

---

## Design System Candidates (§31)

**Mature enough to extract:**

1. `ng-tokens.css` semantic colors (after hierarchy cleanup)
2. Workspace shell quartet (ApplicationWorkspace, WorkspaceBody, WorkspaceTabs, InspectorPane)
3. `ScrollRegion` + scroll ownership lint rule
4. `PresentationField<T>` + empty/unavailable taxonomy
5. `ng-type-numeric`, panel head pattern
6. Row selection chrome (from Attributes + History)

**Not mature:** universal Timeline, StatusBadge, DataGrid, EntityHeader.

---

## Blockers Before Team / Roster (§32)

1. **P0:** Fix Condition / freshness terminology conflict.
2. **P1:** Extract workspace session contract pattern (per-view slices + URL sync for entity id).
3. **P1:** Shared formatting utilities (dates, money, percentages).
4. **P1:** Empty/unavailable taxonomy applied consistently.
5. **P1:** Remove or implement header ghost actions.
6. **P1:** Overview synthesis refactor spec (stop duplicating tabs).
7. **P1:** Attributes scalability plan for 80 ratings.
8. **P1:** Inspector empty state parity + provenance badges for History.
9. **P2:** Status band / SemanticTone extraction.
10. **P2:** Data grid foundation spike.

---

## Recommended Next Steps (§33 — ordered, do not execute)

1. **NG-012 P0:** Terminology + Overview Condition fix spec (UI FOUNDATION).
2. **NG-013:** Overview synthesis refactor — remove tab duplication (PLAYER REFINEMENT).
3. **NG-014:** Shared `ui-ng/format` + empty state components (DESIGN SYSTEM EXTRACTION).
4. **NG-015:** Session/URL contract for entity workspaces (UI FOUNDATION).
5. **NG-016:** Attributes 80-rating scalability (search + virtualized list) (PLAYER REFINEMENT + RUNTIME ALIGNMENT).
6. **NG-017:** History provenance badges + derived event styling (PLAYER REFINEMENT).
7. **NG-018:** Development stimulus user-facing reframing (PLAYER REFINEMENT).
8. **NG-019:** BDMDataGrid foundation spike from Performance log + History table (DESIGN SYSTEM EXTRACTION).
9. **Future:** Team workspace using extracted shell — only after 1–5.

---

## Golden Set Methodology (§30–31)

Captures: `docs/screenshots/step-011/01-overview-1920x1080.png` … `07-history-1920x1080.png`

**Limitation:** Script reloads page per tab; Zustand resets → new `createNewGame()` each navigation unless `playerId` is pinned. Golden set shows **structural** consistency, not one fixed player across tabs. Future captures should use `?playerId=<id>` after single bootstrap.

Compared with steps 004–010: typography and shell stabilized; dedicated tabs (006–010) show cleaner panel grammar than step-004 Overview-only capture.

---

## Finding Classification Index (§34)

### P0 — architectural correctness / data honesty

- Overview `Condition = 100 - fatigue` mislabel
- History derived events provenance visibility

### P1 — required before replicating NG architecture

- Workspace session + URL entity sync
- Empty/unavailable taxonomy
- Shared formatting utilities
- Overview duplication removal plan
- Attributes 80-rating scalability
- Non-functional header actions
- Rating history / team membership runtime awareness in UI copy

### P2 — polish / refinement

- Typography / uppercase / panel head unification
- Color semantic hierarchy
- Status band extraction
- Performance empty layout density
- Tab keyboard navigation
- Per-view inspector collapse state

### P3 — future capability / runtime gap

- Awards, national team, traits, clauses, shot tracking, sharpness, rehab stages

---

## Validation (§36)

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Player NG data tests (`src/ui-ng/applications/player/data/`) | **46/46 PASS** |
| Production source changes | **NONE** (audit artifacts only) |

---

## Files Created

| Path | Purpose |
|------|---------|
| `docs/BDM_OS_NG_PLAYER_AUDIT.md` | This audit |
| `docs/screenshots/step-011/*.png` | Golden set (7 views @ 1920×1080) |
| `scripts/capture-step-011-golden-set.mjs` | Audit capture helper |

---

*End of STEP 011 audit document.*
