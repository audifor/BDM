# BG8B · Ownership Transactions

`OrganizationOwnershipTransaction` is the immutable economic-transfer workflow for an organization. Its event stream derives proposal, approval, rejection, cancellation, and execution status.

Execution appends new historical `OrganizationOwnership` facts using the inclusive BG8A date semantics. It never changes `OrganizationControl`, governance appointments, governance bodies, or consideration accounting.

An optional `OWNERSHIP_CHANGE` `GovernanceDecision` can authorize the transaction. The governance decision and the transaction remain separate histories; a linked transaction cannot be approved or executed until the governance decision is approved.
