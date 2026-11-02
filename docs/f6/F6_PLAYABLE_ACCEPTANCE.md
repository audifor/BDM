# F6 Playable Acceptance

**Result: PARTIAL / NOT CERTIFIED.** The native Tauri window launched successfully on 2026-11-02, but no full Windows GUI acceptance route was performed. Focused tests and startup do not substitute for real New Game workflows.

| Scenario / route | Result | Evidence or outstanding work |
|---|---|---|
| European club signing | PARTIAL | Market UI tests now cover contact, waiting, response, offers, counter/revision and rejection; existing playable tests cover the signing service path. A full Windows GUI contact → offer → response → Finance/Governance → contract → roster route was not performed. Review branch: `f6/immersive-market-20261102` (not integrated). |
| Market Operations experience | PARTIAL | The selected-operation dossier, known/unknown information, real actors, event history and in-place decision controls are covered by focused UI tests. Windows screenshots and resolution/keyboard acceptance remain pending. |
| Professional negotiation | PARTIAL | Salary/term response and competing-offer tests pass; free-agent role is recorded as a commitment but does not affect response valuation because no canonical role expectation is modeled. No automatic in-season fulfilment evaluator exists; pending-save/load GUI acceptance remains outstanding. |
| NBA trade | BLOCKED | AI counterparty readiness explicitly reports `NO_DEFENSIBLE_AUTONOMOUS_TRADE_RESPONSE_POLICY`; no accepted/countered/executed rival workflow. |
| NCAA / NCAAW | NOT TESTED | No F6 New Game recruiting/scouting/eligibility/season workflow run. |
| Unified multi-ecosystem world | NOT TESTED | No F6 user-through-UI scenario or Save V4 round trip completed. |
| Match preparation and live tactics | NOT TESTED (F6) | Existing tests/code establish engine and tactical routes, not F6 GUI acceptance or equivalent-context causal comparison. |
| Training, staff, scouting, finance, medical, facilities, governance | PARTIAL | Canonical services/UI exist; end-to-end consequence and delegation acceptance not run. Specific connection gaps are in the audit. |
| Coach career / mobility | PARTIAL | F5 controlled mobility evidence exists; organic opportunity generation and three interactive seasons were not re-certified in F6. |
| Save/load | NOT TESTED (F6) | No post-negotiation pending-save/load or full-world multi-season round trip run. |
| Windows native GUI | NOT TESTED (this review) | Computer Use native pipe failed to connect after one reset/retry; no screenshots were obtained. The previous F6 launch did not certify the New Game → club → season → Market route. |

The focused market tests and the source-derived action comparison are recorded in `F6_GAMEPLAY_CHANGES.md`. No claim of native GUI acceptance is made for the review branch.
