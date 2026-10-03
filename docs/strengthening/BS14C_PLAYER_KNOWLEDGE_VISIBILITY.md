# BS14C Player Knowledge Visibility

BS14C closes the profile-level PlayerTruth bypass identified by BS14A. The application projection in `src/app/player/PlayerKnowledgeAccess.ts` is the permission authority used by Player-profile builders. It reads the controlled team via `getUserTeam(world)`, takes knowledge ownership from that team's `Team.organizationId`, and evaluates `GameWorld.organizationKnowledge` at `world.currentDate` through `getOrganizationRatingEvaluation`.

## Access policy

- A Player on the user's controlled roster receives exact current canonical ratings. This does not grant exact potential.
- Same-organization knowledge is shared through `organizationKnowledge`; organization membership alone does not grant PlayerTruth. A teammate club's player is external unless on the controlled roster.
- External Players receive only known seven-dimension aggregates (finishing, shooting, creation, perimeter defense, interior defense, rebounding, physical) and known potential-domain evaluations. `UNKNOWN` evaluations are omitted. An unscouted external Player has no rating rows and is labelled `Not scouted` / `Unknown`.
- Public identity, age, physical measurements, position, nationality, team and competition context remain with their owning domains. Contract, medical, box-score and other public/domain projections remain governed by their existing models.
- No individual value is fabricated from an aggregate. An exact `shooting` evaluation is still only exact for that OrganizationKnowledge dimension; it does not authorize any underlying individual rating.

## Profile surfaces and navigation

Overview removes external top-rating chips, rating-derived archetypes, rating-based roster rank, true rating history and movers. It shows authorized aggregate labels where available. Attributes omit external individual ratings, radar, strengths and weaknesses. Development omits true 80-rating values, deltas, curves, events, training stimulus and hidden ceilings, while retaining a limited public context and authorized scouted potential. The Scouting tab uses the viewer's organization projection; comparison snapshots do not carry external truth values. Market, Draft, Recruiting and external-roster links share the same workspace builder, so navigation preserves the access policy.

Freshness is evaluated on each projection using the current world date. Old findings therefore display the current widened/less certain evaluation, not a cached prior label. The ACB test-game baseline is consumed through this same projection; there is no ACB-specific profile branch. Normal generated and WorldDB worlds remain unseeded. `PlayerKnowledgeRecord` remains migration-only.

## Deliberate limits

The current scouting contract covers seven aggregate current-ability dimensions and existing potential dimensions. Rating-level (80-key) scouting remains deferred to BS14D. No tendencies, narrative, discovery, geography, budget, cadence, valuation, Draft or Recruiting behavior is added here.

## Manual visual validation

1. Open a Player from the user's roster. Confirm exact current ratings remain visible, the profile remains useful, and potential is a knowledge evaluation rather than an exact ceiling.
2. Open an external Player with no matching `organizationKnowledge`. Confirm identity/public facts remain visible, individual ratings and true development history are absent, and basketball ability reads `Not scouted` / `Unknown`.
3. Scout an external Player until one aggregate dimension exists, then open the profile. Confirm only its authorized range/descriptor/confidence appears, unknown dimensions remain unknown, no 80-rating values are inferred, and potential appears only when a potential evaluation exists.
