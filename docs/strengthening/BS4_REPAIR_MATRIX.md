# BS4 Repair Matrix

| Domain | Condition | Recoverable? | Repair authority | Automatic? | User breakpoint? | Result |
|---|---|---|---|---|---|---|
| Roster/contract | Roster and active contract name same team | Already valid | Market contract + roster state | No action | No | `ALREADY_VALID` report |
| Roster/contract | Team mismatch with exact departure and signing trail | Yes, with evidence | Canonical player transactions | Yes | No | Move roster membership to signed team; clear stale lineups |
| Roster/contract | Active contract without roster, matching signing transaction | Yes, with evidence | Canonical signing transaction | Yes | No | Restore proven roster membership |
| Roster/contract | Mismatch lacks complete evidence, multiple active claims, or required contract missing | No | None can select authority safely | No | Blocking/integrity diagnostic | `UNRECOVERABLE`; unchanged |
| Roster | AI team below five | If affordable eligible free agents exist | Existing free-agent valuation, market signing, affordability | Yes | No | Sign deterministically up to five; otherwise report team ID |
| Roster | User team below five | Requires user decision | Existing Market signing flow; BS2 breakpoint authority | No | Yes, Market action when available | No automatic signing; manual action report |
| Lineup | Saved starter unavailable, at least five eligible players | Yes | Existing eligibility and team lineup selection rules | At match preparation | No | Preserve valid starters and fill invalid slots deterministically |
| Lineup | Fewer than five eligible players or malformed lineup | No automatic lineup repair | Existing roster/lineup invariants | No | Existing roster breakpoint or blocking error | Fail safely; no fabricated lineup |
| Registration | Eligibility/availability derived from roster | Not applicable | Existing derived eligibility rules | No separate repair | Existing authority | No persisted projection to rebuild; restrictions preserved |
| Staff | Critical vacancy | Not applicable today | No canonical auto-hire policy | No | Owning gameplay path | Diagnose; do not invent or move staff |
| Schedule | Missing/conflicting fixture | Not safely recoverable today | Canonical source fixture/format absent or insufficient | No | Blocking lifecycle diagnostic | Do not shift/delete/invent games |
| Venue/facilities | Intended venue unavailable | Not applicable today | No canonical fallback/maintenance rule | No | Owning gameplay path | No venue/project created |
| Finance | Emergency response needed | Not applicable today | No automatic canonical response | No | Finance/governance owner | No money, debt, or contract manipulation |
| Competition | Season/cup lifecycle inconsistency | Only through existing BS3 idempotent authority | BS3 lifecycle | Existing BS3 behavior | BS2 where relevant | No new participant/format/source invention |
