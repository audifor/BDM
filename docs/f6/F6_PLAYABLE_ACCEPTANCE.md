# F6 Playable Acceptance

**Result: PARTIAL / NOT CERTIFIED.** No full Windows GUI acceptance was performed in this run. Focused tests and static inspection do not substitute for real New Game workflows.

| Scenario / route | Result | Evidence or outstanding work |
|---|---|---|
| European club signing | PARTIAL | Market engine response cases are covered; complete UI contact → offer → response → finance/governance → contract → roster path was not run. |
| Professional negotiation | PARTIAL | Causal salary/term and competing-offer tests pass; role and club-attractiveness valuation remain unsupported; pending-save/load not certified. |
| NBA trade | BLOCKED | AI counterparty readiness explicitly reports `NO_DEFENSIBLE_AUTONOMOUS_TRADE_RESPONSE_POLICY`; no accepted/countered/executed rival workflow. |
| NCAA / NCAAW | NOT TESTED | No F6 New Game recruiting/scouting/eligibility/season workflow run. |
| Unified multi-ecosystem world | NOT TESTED | No F6 user-through-UI scenario or Save V4 round trip completed. |
| Match preparation and live tactics | NOT TESTED (F6) | Existing tests/code establish engine and tactical routes, not F6 GUI acceptance or equivalent-context causal comparison. |
| Training, staff, scouting, finance, medical, facilities, governance | PARTIAL | Canonical services/UI exist; end-to-end consequence and delegation acceptance not run. Specific connection gaps are in the audit. |
| Coach career / mobility | PARTIAL | F5 controlled mobility evidence exists; organic opportunity generation and three interactive seasons were not re-certified in F6. |
| Save/load | NOT TESTED (F6) | No post-negotiation pending-save/load or full-world multi-season round trip run. |
| Windows native GUI | NOT TESTED | No GUI launched or manually inspected. A native compile, if completed, is not visual acceptance. |

The focused market tests are recorded in `F6_FINAL_REPORT.md`. This document makes no claims about actions performed through a UI where none were performed.
