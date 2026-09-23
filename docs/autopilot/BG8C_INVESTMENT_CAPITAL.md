# BG8C · Investment, Capital & Investor Search

Investor interest is a discovery and relationship layer. It is not ownership,
capital commitment, control, or an accounting position.

`OrganizationOwnership` remains the sole canonical equity ledger. A capital
raise and an investment proposal are immutable event streams; executing an
accepted primary-equity proposal deterministically dilutes the active
ownership basis and appends its temporal successor rows. Governance links are
optional and reuse the existing `OWNERSHIP_CHANGE` decision type when present.

This milestone does not introduce valuation, accounting, debt, bidding, AI,
or UI behavior. The audited `investment_asset` and `investment_position`
concepts remain deferred: they are not runtime entities and must not become a
second equity ledger.
