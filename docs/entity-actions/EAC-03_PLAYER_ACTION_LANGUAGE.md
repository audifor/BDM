# EAC-03 Player action language

## Decision

The inventory contains 81 concrete Player intents. The recommended vocabulary is
20 stable action roots, ordered in `src/app/entityActions/playerActions.ts`.
`change` is rejected because it hides the user's intent; `instruct` and
`substitute` are direct roots because they are frequent live-match verbs.

The coverage is 74 Natural, 7 Acceptable, 0 Forced, and 0 Uncovered (100%
Natural/Acceptable). This meets the 90% acceptance threshold. An action root is
not an implementation promise: `capabilityStatus` records the current boundary.

## Coverage matrix

Each comma-separated entry is an individual inventory action with the same
composition pattern and classification. `P`, `T`, `V`, `S`, and `C` mean
property, target, value, scope, and confirmation.

| Product family and concrete actions | Root | Composition | Steps | Fit | Current capability |
| --- | --- | --- | ---: | --- | --- |
| Talk, praise, criticise, warn, promise, manage expectations, discipline | `talk` | P(message) → command | 1 | Natural | DOMAIN_MISSING |
| Squad role, status, position assignment, permissions | `assign` | P(assignment) → V → C | 3 | Natural | FUTURE_SYSTEM |
| Availability restriction, minutes restriction | `limit` | P(limit) → V → S → C | 4 | Natural | FUTURE_SYSTEM |
| Rest, planned recovery | `rest` | S(duration) → C | 2 | Natural | FUTURE_SYSTEM |
| Affiliate/associated team loan | `send` | T(destination) → S(duration) → C | 3 | Natural | DOMAIN_MISSING |
| Recall from affiliate | `recall` | command | 0 | Natural | DOMAIN_MISSING |
| Substitute, live position, matchup, marking, individual coaching, individual match instruction | `substitute` / `instruct` | substitute: T(replacement) → C; instruct: P → V | 2 / 2 | Natural | EXECUTABLE_NOW / FUTURE_SYSTEM |
| Match minutes limit | `limit` | P(minutes) → V → S → C | 4 | Natural | FUTURE_SYSTEM |
| Training focus, intensity, individual program, position/role work, development plan | `assign` / `instruct` | P → V → C | 3 | Acceptable | FUTURE_SYSTEM |
| Development coach, group, mentorship | `assign` / `delegate` | P → V or P(responsibility) | 1–2 | Natural | FUTURE_SYSTEM |
| Medical evaluation, physical evaluation, risk clearance | `assess` | P(assessment) → command | 1 | Natural | DOMAIN_MISSING |
| Medical specialist, treatment | `assign` | P(assignment) → T(specialist) → C | 3 | Acceptable | DOMAIN_MISSING |
| Medical rest, restrictions, risk authorization | `rest` / `limit` / `assess` | S → C; P → V → C; P → command | 1–3 | Natural | FUTURE_SYSTEM / DOMAIN_MISSING |
| Renewal, new contract, options, buyout, exit agreement | `negotiate` | P(subject) → handoff | 1 | Natural | DOMAIN_MISSING |
| Release / contract termination | `release` | C → command | 1 | Natural | EXECUTABLE_NOW |
| Transferable, not transferable, listen to offers, price, conditions, trade block | `offer` / `tag` | P → V → C; V(tag) | 1–3 | Acceptable | DOMAIN_MISSING / FUTURE_SYSTEM |
| Offer contract, offer loan, offer transfer terms | `offer` | P(subject) → V(terms) → C | 3 | Natural | DOMAIN_MISSING |
| Trade and trade partner | `trade` | T(partner) → V(terms) → C | 3 | Natural | FUTURE_SYSTEM |
| Observe, report, assign scout, contact, player interest | `scout` | P(request) → command | 1 | Natural | DOMAIN_MISSING |
| Workout, interview | `scout` | P(request) → T/date → handoff | 2 | Natural | DOMAIN_MISSING |
| Follow player, watch list | `follow` / `tag` | command; V(tag) | 0–1 | Natural | FUTURE_SYSTEM |
| Compare player | `compare` | T(other player) → handoff | 1 | Natural | FUTURE_SYSTEM |
| Personal note, reminder | `note` | V(note) → command | 1 | Natural | FUTURE_SYSTEM |
| Tags | `tag` | V(tag) → command | 1 | Natural | FUTURE_SYSTEM |
| Delegate development, medical or scouting responsibility | `delegate` | P(responsibility) → command | 1 | Natural | FUTURE_SYSTEM |
| Agent availability, agent terms, representation relationship | `negotiate` / `talk` | P(subject/message) → handoff/command | 1 | Acceptable | DOMAIN_MISSING |
| Draft priority, draft workout, draft interview, draft rights | `recruit` / `scout` | P(action/request) → T/V → handoff | 1–2 | Natural | FUTURE_SYSTEM / DOMAIN_MISSING |
| NCAA recruitment, contact, scholarship | `recruit` | P(action) → command | 1 | Natural | FUTURE_SYSTEM |

## Root rationale and stable order

1. `talk`, 2. `assign`, 3. `instruct`, 4. `substitute`, 5. `limit`,
6. `rest`, 7. `assess`, 8. `send`, 9. `recall`, 10. `negotiate`,
11. `offer`, 12. `release`, 13. `trade`, 14. `scout`, 15. `follow`,
16. `compare`, 17. `delegate`, 18. `tag`, 19. `note`, 20. `recruit`.

The order groups interpersonal, club management, live-match, health, movement,
commercial, discovery, organisation, and recruitment intents. It is never
reordered by usage; future quick actions are a separate projection.

## Size comparison

| Scenario | Coverage and trade-off |
| --- | --- |
| 12–14 roots | `change`/`assign` become overloaded; live coaching, assessment, recruitment and organisation acquire forced chains. Average depth rises to about 3.1. |
| 15–18 roots | Better, but either `assess`, `trade`, `recruit`, tags or notes are buried. Average depth about 2.4; some repeated verbs remain ambiguous. |
| 19–22 roots | Recommended: 20 roots, average 1.8 decisions, median 1, P90 3, maximum 4 (`limit`). It keeps frequent direct verbs memorable without making departments into roots. |

## Current implementation boundary

Only `release` has an Application executor today. `substitute` has an existing
live-match operation but requires future session-target resolution before it can
be connected. All other definitions produce declarative intent contracts only;
they do not claim that their domains, handoffs, or executors exist.

The one `PLAYER_ACTIONS` catalog is independent of screen, route, React and
Zustand. Availability uses only Player existence, controlled-team ownership and
active match session state; disabled roots retain their stable slot.
