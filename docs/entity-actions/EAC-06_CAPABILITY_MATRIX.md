# EAC-06 Player capability matrix

| Root | Existing authority | Mapping | Status | Executor |
| --- | --- | --- | --- | --- |
| release | `releasePlayer` | EXACT | EXECUTABLE_NOW | connected, canonical world update |
| substitute | `LiveMatchController.applyManualSubstitutions` | EXACT | EXECUTABLE_NOW | connected, transient session update |
| negotiate / compare | declared handoffs | EXACT handoff intent | HANDOFF_NOW | no destination yet |
| sign free agent | `signFreeAgent` | FORCED against current roots | DOMAIN_MISSING | not connected |
| instruct / assign / limit | team-level `applyLiveTactics` | FORCED | FUTURE_SYSTEM | not connected |
| rest / training actions | team training APIs | FORCED | FUTURE_SYSTEM | not connected |
| talk | morale/relationship primitives | FORCED | DOMAIN_MISSING | not connected |
| send, recall, assess, offer, trade, scout, follow, delegate, tag, note, recruit | no matching application use case | NONE | DOMAIN_MISSING or FUTURE_SYSTEM | not connected |

`substitute` is available only when the controlled player is active in a live
session and the session has a bench replacement. The target list is resolved by
the live controller and revalidated on execution. It never changes `GameWorld`.

The Player cold-start Quick Actions remain product defaults rather than a
contextual development workaround. They can be disabled until their capability
exists; Full Board order remains stable.
