# BDM UI · PLAYER · Knowledge & Fog of War contract

Status: approved product direction (10 October 2026). This document is
scoped to PLAYER Courtside and does not authorize redesign or implementation
of any other PLAYER page without its screen-by-screen review.

## Canonical invariant

PLAYER is **one Courtside visual identity with two knowledge experiences**:
the user's own roster shows canonically authorized full management data;
opponents show only public information or what the user's organization knows
through the organization-specific scouting authority. A lack of information
does **not** indicate low ability. The same rule applies to player identity,
manager readings, badges, tooltips, charts, filters, exports, comparisons,
context menus and deep navigation. Never derive an opponent's UI from
Player Truth simply because the world entity exists.

Sources of authority:
- `derivePlayerKnowledgeAccess` and its `own-roster | scouted | unknown` projection.
- Organization evaluations and report provenance from Scouting.
- Public performances and public transactions only when actually modelled as
  public, or when explicitly authorized by an existing canonical service.
- Do not use invented ratings, unknown priors, synthetic personality notes,
  inferred hidden potential or internal medical/contract fields.

## PLAYER ATTRIBUTES

Own roster: keep the approved three-column Courtside 80-rating board, interactive
category radar, optional comparison selector (max two), Focus Tracker and
selected attribute details. No duplicated Full Attribute Analysis or separate
Training panel.

Rival unknown: show eight knowledge areas and a deliberate unknown-profile
state; **do not list 80 repeated `Not scouted` rows**. Provide navigation to
the real Scouting Report actions.

Rival partially/advanced scouted: show only `ratingEvaluations` with non-null
authorized evaluations, preserving their source-defined range/descriptor and
confidence and coverage. Do not display exact Player Truth or numeric bars
for `UNKNOWN`. The eight-family full-shape radar must not be fabricated from
incomplete reports. When all eight families have complete authorized
individual evaluations and at least 50% mean source coverage and confidence
per family, draw a single slim Courtside polygon of **the organization's
estimated means**, with explicit uncertainty and a direct note that these
are not the true player ratings. The selected family shows its aggregate
estimated rating, indicative range, mean evidence coverage, mean confidence
and the number of evaluated attributes. Never substitute old broad-dimension
coverage (which can legitimately be zero while individual ratings have
coverage) for the individual profile's evidence; do not display a misleading
0% next to evaluable individual skills. Family selection remains available
and shows unknown states until an evaluation exists. Re-entering the profile after new authorized
knowledge naturally reveals more information from the updated projection.

Header: exact private morale, fatigue, injury risk and availability are not
shown for rivals from the raw status model. Show an honest unknown state
until there is an explicit authorized source. Do not render the raw global
Talent Pathway band for rival players until individually knowledge-gated.
Own-player status and pathway controls are preserved.

## Scouting actions and bounded candidate access

PLAYER ATTRIBUTES for rivals launches the existing `RequestScoutingModal`,
which delegates to `requestScoutingAssignment` and applies all existing staff,
mission, capacity and duplicate-assignment guards. The selected attribute
family is carried into a `SKILL_EVALUATION` mission. Results are not immediate:
assigned staff must progress through normal game days.

A player's publicly scheduled fixture against the user-controlled team grants
access to their roster **identity** for scouting requests, not their ratings.
This includes later fixtures and is not limited to the next opponent. Other
unseen players remain subject to awareness/market/territory discovery and
recruitment authorities. When a request is not possible, PLAYER must show
whether the reason is an active assignment, a missing addressable identity or
staff capacity, and offer the Scouting Centre as the discovery/workload route.

## PLAYER OVERVIEW · specific FOW safeguards (10 October 2026)

- PLAYER DNA basketball chips and the mental panel for rivals read only authorized
  `ratingEvaluations` and explicitly label numeric estimates with uncertainty.
  The authorized full-report coverage must never be called "individual abilities
  unknown" simply because old broad scouting dimensions remain unpopulated.
- Rival morale, private availability and medical risk are **not** read from
  `PlayerWorkspaceModel.status`, regardless of raw world values being present.
  The shared header and Overview must agree on their unknown state.
- Overview's spider for rivals uses the exact same eight-family authorized
  estimation and coverage/confidence threshold as ATTRIBUTES, never
  `model.radarAxes` (reserved for own-roster truth). A partial profile cannot
  create a closed polygon using missing axes.
- Manager Read interprets only sufficiently supported family estimates and
  acknowledges uncertainty. Public game stats may remain visible where their
  competition provenance permits; private training, mental status, medical
  readings and hidden contracts must not be inferred from those.
- The expanded legacy analysis board is own-roster-only pending separate
  FOW review of its contracts, medical, development and alert panels.
- An SSR regression fixture injects private morale, availability, risk and
  raw radar values into the model, and verifies no leaks for known/unknown
  rival access. These tests require execution before certification.

## PLAYER FOW · clarity and usable vertical space (10 October 2026)

- In rival ATTRIBUTES, remove the redundant `Lectura FOW` footer. The
  authorized-knowledge banner, estimation labels and distinct unknown states
  already communicate what is visible, leaving the family navigation uncluttered.
- Scouting `RatingEvaluation.confidence` is a 0..100 internal index. Never
  present it as a calibrated probability of a rating being correct:
  show `Índice scout 100/100` rather than `100 % de confianza`. Preserve
  the independently tracked per-rating coverage and estimated range, with
  explicit explanation of uncertainty. Own-player canonical values are
  unaffected.
- Rival Overview's fourth DNA quadrant uses recorded competitive activity:
  games played and the latest actual game box-score. Never substitute those
  public observations for internal availability, morale, risk or medical data.
  The owned-player Stability/Risk quadrant is unchanged.
- At the reference desktop height, allocate a real bottom row for Manager Read
  and its action buttons; if the available viewport is shorter, scroll the
  Overview rather than hiding actions behind the dock. Recompose below the
  existing Courtside container breakpoints.

## PLAYER PERFORMANCE · Courtside implementation direction (10 October 2026)

- PERFORMANCE follows the approved PLAYER Courtside shell. No sidebars, no
  duplicated legacy analysis, no fabricated box scores or scouting ratings.
- The same recorded completed-game stats are visible for own players and
  rivals. The rival path is **recorded competitive performance**, not Player
  Truth ability or confidential physical/mental condition; no opponent
  `ratings`, `status`, medical, stamina or hidden staff estimates are
  consumed in the view. The canonical `getPlayerGameLogs` and match-stat
  aggregation remain the sole factual sources.
- Filtering remains actionable for real seasons, competitions, decisive or
  regular stages and home/away/wins/losses. Empty selections do not invent a
  season average or an artificial recent-form graph.
- All ten canonical KPIs remain visible. Analysis keeps three accessible
  views: efficiency, two recorded shooting zones (not fictional shot
  coordinates), and actual splits (unsupported half-time splits stay absent
  with their explicit reason).
- Recent form offers one user-selected statistic at a time (PTS/REB/AST/VAL).
  Clicking a bar selects the same `gameId` as the game log and inspector.
- The log keeps eight readable columns (date, opponent, result, minutes,
  points, rebounds, assists, valuation). The inspector retains the remaining
  actual box-score detail and can navigate matches without a second table.
- Responsive layout must **recompose**, not make texts smaller forever.
  Desktop uses three lanes, mid-size uses two rows, narrow uses a single
  column. Only sufficiently long logs or detailed analysis may scroll.
- Courtside themes inherit the same canonical dark/light tokens from HOME.
  No new synthetic visual palette. No gameplay code or Save schema changes.
- This page's implementation needs its own visual and automated certification.
  Static checks are not a substitute for typecheck, Vitest and Tauri dark/light
  inspection.

## PLAYER · shared identity and PERFORMANCE shooting V2 (10 October 2026)

- The eight PLAYER subsections share exactly one `EntityIdentityBand`. The
  last-loaded `player-courtside-identity-unified.css` is the canonical color,
  surname glow and tabs contract, overriding the former overview-only
  header look. Dark and light use HOME `--cs-*` tokens. First name is the
  same primary text color on every view; surname is always lime with subtle
  consistent glow (weaker on the light theme).
- The three PERFORMANCE analysis tabs (Efficiency, Shooting, Splits) are the
  only titles. Their repeated inner headings are suppressed only inside the
  Courtside performance analysis panel. The details and the canonical data
  source remain intact.
- Shooting keeps the actual schematic basketball **half court**, not a
  replacement abstract chart. It shows one honest marker each for 2PT and
  3PT (not fabricated shot locations or a heat map). At wide viewports the
  half court remains the dominant left part, with two zone breakdown cards
  alongside, then one factual analysis line.
- Each zone shows actual FGM/FGA, percent (or unknown when no attempts),
  percentage of all field-goal attempts, raw points derived from recorded
  2PT and 3PT makes, share of total field-goal points, and a separate visual
  comparison of volume vs efficiency. No fake court subdivisions or coords.
- The reading only states an evidence-supported comparison and calls out
  small attempt totals. When no shots were made, it cannot pretend either
  zone contributed an identifiable share of points.
- At narrow container widths the shooting layout becomes a large court
  followed by two side-by-side reading cards and an interpretation. No
  permanent additional scroll surface, sidebar or new backend authority.
- Implementation is pending typecheck, focused Vitest and actual dark/light
  visual certification before full PERFORMANCE PASS.

## PLAYER PERFORMANCE · Nine-zone shot evidence V3 (10 October 2026)

Nine zones are already present in `MatchEngine Next` (`ShotEcology`):
RESTRICTED, RIM, SHORT_PAINT, FLOATER_RANGE, MIDRANGE,
LONG_MIDRANGE, CORNER_THREE, ABOVE_BREAK_THREE and DEEP.

**Persisted authority:**
- Optional `PlayerGameStatLine.shotZones` in canonical `MatchStatLog`;
  its count arrays are sparse and integer, and made/attempted totals MUST equal
  the corresponding two-point/three-point box-score totals precisely.
- `OBSERVED`: compact aggregates of Match Next `shotReleased` and
  `shotMade` events, with misses and blocked attempts accounted for.
  Any absent/ambiguous labels fall back to exact 2PT/3PT data, never an
  invented nine-zone split.
- `MODELLED`: the BACKGROUND solver's existing three fitted outcomes
  (rim/mid/three) are subdivided deterministically, **without consuming
  more simulation RNG or altering results**. Version:
  `bg-zone-conditional-provisional-v1`. Conditional subdivision ratios
  are provisional hypotheses, NOT empirically calibrated distributions.
  They must not be represented in gameplay as observed or certified
  until benchmarked against a Match Next FAST shot-zone corpus. This is
  a quality gate to certify before worldwide promotion.
- Legacy Save V1-V4 records without optional zones remain readable;
  V1 parser and V4 current writer preserve new fields. No reconstruction
  of historical zones.
- On PERFORMANCE, all selected games with shot attempts must have
  complete zone evidence for the nine-zone mode. Partial historical
  selections show the exact 2PT/3PT court instead; empty zones use
  missing-attempt labels rather than unsupported shooting percentages.
  Filters, own/rival public shot stats, and matchup inspector keep their
  existing authority.
- Nine-zone Courtside court shows a schematic, not precise positions;
  nine selectable regions, actual FGM/FGA, FG%, attempt share, points,
  provenance and explicit uncertainty. Keep dark/light shared tokens.

**Certification pending:** full TS typecheck, MatchNext & BACKGROUND
regression tests, real Save V4 reload, statistical validation of the
conditional BG split, benchmark/performance and UI visual inspection.
Do not mark the nine-zone program or PERFORMANCE full PASS until complete.

## PERFORMANCE V3.1 · nine-zone court visual redesign (10 October 2026)

- The previous nine concentric bands were a misleading dartboard.
  The Court now has recognizable painted key, restricted/rim areas, two
  midrange wings, floater corridor, long-midrange perimeter, separate corner
  threes, above-break outside the arc and deep threes.
- Geometry is explicitly schematic. No new event coordinates or zone-level
  precision have been invented; the nine regions refer to existing MatchEngine
  shot families and read only `detailedZones`.
- Efficiency is encoded by existing Courtside theme color tokens at
  0-29%, 30-49%, 50-69%, 70%+, with neutral fill for no attempts.
  Never confuse **efficiency** fill with attempt **volume**; counts/FG% remain
  visible in the synchronized list. A selected region retains its own
  orange outline without overriding the efficiency fill.
- The half court and legend take priority over tiny numerical labels
  inside nine overlapping shapes. Selection by keyboard or pointer updates
  the same detailed side panel.
- EXPAND opens a larger view portaled to the Courtside application shell
  rather than being clipped by the main Performance grid. Escape or CLOSE
  returns to the unchanged underlying panel with selection intact.
- Light and dark modes inherit canonical `--cs-*` theme colors. No
  changes to persisted model, statistical authority or FOW.
- Requires actual viewport/dark-light inspection, Vitest and typecheck before
  visual certification.

## PERFORMANCE V3.2 · Approved refinements, bounded scope (October 2026)

User-approved adjustments to the existing nine-zone shooting map are limited
to **(2) softer efficiency colors / clear small-sample warning** and
**(4) better use of the enlarged EXPAND right-hand reading column**.
The basketball geometry and nine shapes (item 1), and the existing compact
court dimensions, columns and spatial layout (item 3), are expressly
approved and must remain untouched.

- Palette attenuation affects efficiency fill saturation via Courtside
  `--cs-*` tokens. The orange selected-zone outline and FG% thresholds
  remain intact, for dark and light.
- Attempt counts 1–4 are visually annotated with a dagger on list FG%,
  with text in the selected region on EXPAND and an explicit meaning note.
  It is a **sample-size caution**, not adjusted FG%, a statistical confidence
  interval, or a reclassified zone. Zero attempts is unknown, not small
  observed sample; five or more attempts do not trigger this heuristic.
- The compact layout does not receive a new module or space-consuming row.
  EXPAND alone receives larger selected-zone typography, clearer FGM/FGA
  columns and list entries that utilize the available height.
- Data sources, persistence, FOW, shot-zone identities, geometry and
  existing game/season filters do not change.
- Visual and runtime testing in Tauri dark/light remains required.

## Remaining subsections: mandatory review checklist

| Section | Own roster | Opponent/FOW |
| --- | --- | --- |
| Overview and Player DNA | Full authorized attributes, medical and manager read | Contextual public facts; manager read only from known scouting; hidden personality/potential cannot be inferred |
| Attributes | Approved full 80-rating manager tool | Scouting-only estimates and unknown state, as implemented |
| Performance | Full internal and publicly available game statistics | Public box scores only when actually observable by the player's organization; never private workload metrics |
| Development | Training plans, progression and potential with authorized visibility | Scouted progression or reported observations only; never hidden growth parameters, ceilings or training schedules |
| Contract | Own staff-authorized obligations, deadlines and decisions | Public signings and contract facts only when source and permissions support them; no concealed terms |
| Medical | Internal history, assessments and recovery plans | No private fatigue, morbidity, recovery timelines or injury risk; show public injury news only when actually sourced |
| Scouting Report | Staff-authorized information and scout assignments | Primary source of the rival's reports, provenance, confidence, missions and player knowledge evolution |
| History | Own full career facts and authorized records | Public competition appearances, transfers and honours when modelled as public; private notes excluded |
| RPG/personal relationships | Authorized player-facing relationships, actions and consequences | No omniscient psychological/secret relationship details without legitimate access |

## Screen certification gates

1. Own player profile remains intact for all PLAYER tabs.
2. Unknown rival displays no hidden Player Truth in text, title, tooltips,
   ARIA labels, chart geometry, percentiles, filter ordering or hyperlinks.
3. Known rival uses only organization-specific evaluations with honest
   epistemic state, range, confidence and freshness when available.
4. Public information must have a justified canonical provenance. If no public
   flag or authorization exists, default to unknown instead of leaking data.
5. Scouting controls route to existing authorized actions and respect existing
   availability, capacity and validation. No fake button or instant disclosure.
6. Dark and light Courtside themes are legible; no decorative NG sidebar.
7. Desktop reference 1920×1080; smaller layouts recompose, not shrink forever.
8. Run targeted tests, typecheck and build. Audit own vs unknown vs partial/
   advanced scout, and report visual PASS/FAIL before certifying any screen.

## Implementation scope

The current branch implements opponent FOW for **ATTRIBUTES** and a conservative
shared-header privacy safeguard. The remaining subsections above are pending
separate per-screen audits and explicit approval. This page is not a claim
that their current implementations have passed an FOW audit.
