# MG6I · Basketball interaction integration

## Movement authority

Each active player receives one target for each `stepMatchSession` movement
step. The precedence is:

1. Transition targets own every active player during the one transition step.
2. During half court, the ball handler may follow an active drive target.
3. A valid screen owns its screener; otherwise an active cut may own its cutter.
4. P&R coverage owns its directly committed defenders.
5. MG6G help, rotation, or recovery owns only uninvolved defenders.
6. Remaining players follow BaseSpacing.

The half-court override list is applied once through the MG6A/B movement
primitive. Current lifecycle rules keep drive and handler separate from screen
and cut participants; cut and screen are mutually exclusive. P&R coverage
participants are excluded from MG6G helper and rotator selection. Thus valid
screen plus drive, roll plus help, and coverage plus uninvolved help can coexist
without competing targets for the same player. Transition suppresses all old
offensive and defensive intents.

## Possession changes and transition

When `attackingTeamId` changes, MatchEngine clears cut, screen/P&R, drive, and
help/recovery state from the previous possession. It records a one-step runtime
`TransitionIntent` for the new attacking team. The terminal event step resolves
its half-court movement and sporting event once; it does not apply a second
transition movement in that same step. The next session step uses only transition
targets and consumes the intent. The following step resumes BaseSpacing. Period
changes and game completion clear the intent. The transition intent is runtime
session state, not persisted save data.

Transition roles derive from active lineup roles, current positions, ball owner,
and court dimensions:

- A controlled ball handler advances five metres toward the attacked basket.
- SG/SF lane runners advance and use separate 20% / 80% court-width lanes.
- The center rim-runs toward the middle lane; the remaining interior player trails.
- The nearest defender to the ball targets a point 1.25 metres into its attack
  path. Another defender targets 1.75 metres off their own basket. The remaining
  defenders retreat toward their basket.

All targets are court-bounded and all ten players move through their own MG6A/B
kinematics. Transition lasts exactly one movement step. It adds no RNG, does not
force a shot or pass, and leaves existing shot, pass, rebound, and turnover
resolution authoritative. A possession change with no resolved handler keeps
the ball unassigned until the next offensive actor is selected, matching the
existing possession contract. Turnovers with a credited steal and defensive
rebounds use the resolved player as transition ball handler. Made baskets retain
the existing unassigned inbound state.

## Determinism and presentation

Transition role selection and target ties are deterministic from current roles
and geometry; the transition uses no random draw. Repeated simulations with the
same inputs and RNG streams remain equivalent between the wrapper and stepped
session paths. New-match RNG seed lifecycle remains deferred to MG6J. Live and
Instant Result share MatchEngine. MatchViewer only renders canonical positions.

No new dribble, screen, coverage, shot, pass, rebound, foul, contact, playbook,
zone defense, or animation system is introduced.
