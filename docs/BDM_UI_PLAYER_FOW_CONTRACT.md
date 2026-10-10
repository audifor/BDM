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
