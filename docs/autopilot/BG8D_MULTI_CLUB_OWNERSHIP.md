# BG8D · Multi-club ownership and conflict assessment

Direct ownership is the active `OrganizationOwnership` fact for an
Organization. Effective ownership follows active Organization-to-Organization
edges and multiplies percentages as percentages (`parent * edge / 100`), then
aggregates independent paths deterministically. Null percentages and cycles are
reported as uncertainty; they are never guessed.

`OrganizationControl` is a separate explicit, direct graph. Common control does
not imply ownership, and ownership does not infer transitive control.

The World DB `organization_relationship` table is structural context only in
this layer; it is not substituted for ownership or control.

`MultiClubOwnershipPolicy` is explicit runtime configuration scoped to a
Competition or Ecosystem. It chooses direct versus indirect ownership,
threshold, common-control behavior, and `ADVISORY` versus `BLOCK` enforcement.
Assessments are derived and return `CLEAR`, `CONFLICT`, or `INDETERMINATE`; they
are not persisted.

Investor interest does not count as ownership. Unexecuted BG8B transactions and
unexecuted BG8C proposals do not count. Previews project canonical ownership
without mutating the source world, while BLOCK policies reject projected
conflict or indeterminate compliance atomically.
