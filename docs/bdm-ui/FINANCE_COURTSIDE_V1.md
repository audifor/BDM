# Finance Courtside V1 · Compact financial cockpit

## Visual and functional contract

- Courtside tokens and global shell are authoritative. No replacement of NG navigation or Finance V2 logic.
- Five first-level destinations: Resumen, Caja, Presupuesto, Plantilla, Futuro.
- All fourteen canonical Finance V2 views remain accessible as second-level tabs.
- Default view is a decision-first cockpit. No horizontal 14-tab strip or permanent technical filters.
- At a glance: unrestricted cash, recognized operating result, due receivables and payables, 30-day cash outlook, debt, income vs expense, known commitments, and access to recorded finance recommendations.
- Every metric is derived from current GameWorld finance facts. Multi-currency facts are shown separately, never naively summed.
- A zero is not shown as a cash balance when no cash ledger facts exist.
- Original Finance V2 table data and row-level source trace are retained. Advanced tables and technical controls are collapsed by default.
- Salary-cap charges, company cash and accounting payroll remain separate. Salary-cap room is not presented as an authorized transfer budget.
- Valuation remains assumption-driven. Finance AI advice remains non-executing and subject to existing governance.
- The UI creates no new authority, budget, financial transaction, forecast assumption, or decision.

## Regression coverage

- Finance domain tabs still derive from canonical world data.
- Full five-group navigation reaches cash, salary cap and valuation.
- On empty saves, the cockpit signals unavailable facts rather than fabricating financial strength.
- Missing FX and valuation inputs continue to block misleading values.
- Club satellite regression tests now validate the grouped navigation and canonical salary-cap destination.
- CI workflow: BDM UI Courtside unified.
