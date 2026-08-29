# PCB market hybrid recovery audit

## Executive summary

PCB is a useful product and presentation source, not a replacement simulation stack. Its market implementation consists of a Python/SQLite service with shortlist, offer/counter/withdraw, agency relationship, transfer-history and scout-report commands, plus a React market tab containing scouting, agency and agent views. The UI has no dedicated free-agent, trade-center, negotiation or contract-center screen. BDM already has the stronger canonical authority: GameWorld, typed IDs, deterministic engines, Player Intelligence, MarketKnowledge, contracts, salary rules and trade legality.

The hybrid should retain BDM's Data Grid, desktop shell and domain boundaries; recover PCB's market sub-navigation, inspectable agency/agent tables, compact profile panels, contextual row actions, shortlist workflow and negotiation-history concept.

## Audit scope and evidence

Inspected `PCB/backend/app/api/commands.py`, `services/market_service.py`, `agent_service.py`, `agency_service.py`, `agency_generator.py`, repositories for agents/agencies/contracts, and `PCB/bu/frontend/renderer/src/App.jsx`, `pages/MercadoPage.jsx`, `pages/SectionRouter.jsx`, `index.css` and the market sidebar asset. Searches covered market, agent, agency, contract, transfer, trade, negotiation, offer, shortlist, scouting, salary, interest, availability, history and transaction terms. No local browser render or supplied screenshots were available; visual findings are source/CSS based.

## PCB architecture relevant to market

- Backend: Python services and SQLite repositories. `market_service.py` owns mutable team JSON shortlists, negotiations, agency relationship/discount data, transfer history and daily resolution. It uses wall-clock IDs/time and `random`, so its authority architecture is incompatible with BDM.
- Frontend: React `MercadoPage.jsx` switches between `scouting`, `agencias` and `agentes`. The actual render functions remain in the monolithic `App.jsx`; data arrives from command calls and selected entities open a shared detail overlay/context menu.
- Contracts: `contract_service.py` and `contract_repo.py` are simple list/create wrappers around JSON payloads. `market_service.py` creates transfer contracts and charges a transfer/agent fee.

## Screen inventory

| PCB surface | Path | Purpose | Scores V/UX/W/F/R/A | Classification | Hybrid target |
|---|---|---|---|---|---|---|
| Market sub-navigation | `bu/frontend/renderer/src/pages/MercadoPage.jsx` | Switch Scouting/Agencies/Agents | 3/4/3/2/5/5 | ADAPT_UI | BDM Market app tabs |
| Scouting Board + Watchlist | `App.jsx` `renderScouting` | Filters, scout cards, local watchlist | 3/4/4/3/3/3 | ADAPT_WORKFLOW | BDM Data Grid saved shortlist + scouting actions |
| Agencies table | `App.jsx` `renderAgencias` | Searchable agency rows and inspector entry | 3/3/2/2/4/4 | ADAPT_UI | Agency directory/agent inspector |
| Agents table | `App.jsx` `renderAgentes` | Agency filter, search, row actions | 3/4/3/2/4/4 | ADAPT_UI | Agent directory/market inspector |
| Agency detail overlay | `App.jsx` selectedAgency block | Agency profile, agents list, chips | 4/4/3/2/4/4 | RECONNECT | BDM Agent/Agency inspector |
| Agent detail overlay | `App.jsx` selectedAgent block | Style, attributes, network, clients | 4/4/4/2/4/4 | RECONNECT | BDM Agent inspector |
| Offer/negotiation backend | `backend/app/services/market_service.py` | Make/improve/respond/withdraw/day resolution | 1/3/4/4/1/1 | ADAPT_WORKFLOW | BDM Wave 4 negotiation runtime |
| Contract list endpoint | `backend/app/services/contract_service.py` | List contract records | 1/1/1/2/1/1 | MAP | BDM canonical contracts |

`V` visual, `UX` usability, `W` workflow, `F` feature, `R` reusability, `A` architecture compatibility; each 0–5.

Market-screen audit: Free Agent Market—NOT FOUND; Transfer/Trade Center—NOT FOUND as a screen; Player Search—PARTIAL through scouting filters/cards; Shortlist—PARTIAL; Contract Center—NOT FOUND; Negotiation screen—NOT FOUND; Transaction history—backend-only; Agent/Agency screens—EXISTS as tabular lists plus inspectors; Offer workflow—backend-only.

## Component recovery inventory

| PCB path | Component/pattern | Classification | Priority | BDM target | Notes |
|---|---|---|---|---|---|
| `pages/MercadoPage.jsx` | subnav tabs | ADAPT_UI | P1 | MarketScreen app tabs | Preserve compact three-way navigation idea, not local state contract. |
| `App.jsx` | `renderScouting` filters + watchlist | ADAPT_WORKFLOW | P0 | Data Grid views, shortlist and scout actions | Retain workflow; replace bespoke cards/filter state. |
| `App.jsx` | agency/agent table rows | ADAPT_UI | P1 | BDM Data Grid renderers | Keep concise identity, agency link and context action. |
| `App.jsx` | selected Agency/Agent detail overlay | RECONNECT | P0 | Agent inspector | Bind to BDM Agent/Agency/representation/relationship selectors. |
| `App.jsx` | reusable detail overlay, chips, row context menu | ADAPT_UI | P2 | Desktop modal/context actions | Visual patterns only; adapt to existing desktop primitives. |
| `index.css` | glass cards, hover lift, bento grid | ADAPT_UI | P3 | selective panels | Too spacious/mobile-web oriented for dense desktop grids. |
| `assets/sidebar/market.svg` | market icon | LIFT | P2 | Existing BDM market navigation | Reuse only after asset/license review. |

## Workflow and feature recovery

| PCB workflow/feature | Evidence | Maturity | Classification | Priority | Hybrid decision |
|---|---|---|---|---|---|
| Shortlist with priority, notes, status | `market_service.py` add/update/remove methods | FUNCTIONAL | EXTEND | P0 | Add typed BDM shortlist; show in Data Grid saved view. |
| Offer → counter → improve/withdraw/respond | commands and `simulate_day` | PARTIAL_RUNTIME | ADAPT_WORKFLOW | P0 | Rebuild against BDM Negotiation/MarketKnowledge; preserve history/status workflow. |
| Agency relationship and fee discount | market commands/service | PARTIAL_RUNTIME | EXTEND | P1 | Map to BDM Agent↔Organization relationship; do not use generic discount formula as authority. |
| Agent fee charged on transfer | `_finalize_transfer` | FUNCTIONAL | MAP | P1 | BDM already has Wave 4 fee field; implement via canonical finances/transactions. |
| Transfer history/balance | service functions | FUNCTIONAL | EXTEND | P1 | BDM transaction history needs a market-oriented projection. |
| Scout assignment/report | service functions | PARTIAL_RUNTIME | MAP | P0 | BDM Wave 2 scouting is stronger; recover quick-action workflow only. |
| Value-player query | `get_value_players` command | PARTIAL_RUNTIME | DROP | DROP | Uses PCB omniscient market value/ratings model. |
| Agent/agency generation | `agency_generator.py` | FUNCTIONAL | MAP | P2 | BDM deterministic typed generation is the authority; PCB names/style descriptors inspire presentation. |
| Advanced clauses/bonuses | contract catalogs/service | PARTIAL_RUNTIME | MOVE TO WAVE 5 | P2 | Keep out of Wave 4. |

## Classification totals

LIFT: 1; ADAPT_UI: 4; ADAPT_WORKFLOW: 3; RECONNECT: 2; EXTEND: 3; MAP: 3; DROP: 3.

### P0 must recover

1. Shortlist/target workflow in BDM Data Grid.
2. Negotiation status/history workflow, connected to BDM's typed runtime.
3. Agent/agency inspector with client and organization-relationship context.
4. Quick scout/contact/offer actions from a market row.

### P1 high value

- Market tabs, agent/agency table composition, transaction-history projection, relationship-aware fee/interaction explanations.

### P2 useful / P3 optional

- P2: market sidebar asset, agency niche/style descriptors, selective chips/context menu.
- P3: glass/bento styling and animated card treatments.

### Drop list

| PCB path | Reason | BDM replacement |
|---|---|---|
| `market_service.py` authority/runtime | SQLite JSON state, `random`, wall-clock IDs and omniscient value model conflict with BDM | GameWorld + deterministic TypeScript engines |
| `agency_generator.py` runtime | Python random/UUID and oversized/decorative trait model | BDM Agent/Agency generation |
| PCB player rating/value presentation | Omniscient/fake market values | OrganizationKnowledge + derived valuation + MarketKnowledge |
| bespoke card-table data model | Lower density and weaker table features | BDM Data Grid |

## Reconnect data map

| PCB UI/function | Old PCB source | Canonical BDM source | Transformation |
|---|---|---|---|
| Scout card rating/value | player JSON/scout tier | OrganizationKnowledge evaluation | Intelligence DTO; no truth fallback. |
| Watchlist | team JSON `shortlist` | new typed BDM shortlist | EXTEND; organization-owned record. |
| Availability/interest | implicit market/player JSON | MarketKnowledge | Unknown remains unknown. |
| Offer/counter history | team JSON `active_negotiations` | BDM ContractNegotiation | Typed lifecycle, bounded rounds, player consent. |
| Contract salary/years | contract JSON | PlayerContract | Canonical terms/rules. |
| Agent/agency | SQLite rows/JSON | BDM Agent/Agency/representation | Reconnect inspector and portfolio list. |
| Agency relationship/discount | team JSON | Relationship + MarketKnowledge | Relationship affects friction/openness, not automatic truth. |
| Transfer history | team JSON list | player transactions/trade history + market projection | EXTEND a derived history view. |

## Hybrid target map

- **Free Agent Market:** BDM Data Grid base; PCB contributes shortlist, dense filters and row quick actions. Columns: Player Intelligence, MarketKnowledge availability/interest/expected terms, agent and agent relationship. Inspector exposes negotiation history and scout actions.
- **Negotiation:** BDM runtime base; PCB contributes visible round history, current/counter terms and withdraw/improve flow. Add contract impact and role/agent panels; advanced clauses stay Wave 5.
- **Agent:** Compact inspector—not a full standalone agency app initially. PCB agency/agent tables and detail grouping are worth reconnecting.
- **Player Profile:** Add a market/contract panel: canonical contract, BDM Agent, MarketKnowledge-only availability/interest, and links to negotiations. PCB's detail grouping/chips are reusable patterns.
- **Trade Center:** BDM N-team asset/legal engine remains base. Recover only offer/status/history visual patterns; never PCB's football-style transfer authority.
- **Player Search/Discovery:** BDM Data Grid remains canonical. Add PCB-like saved shortlist/filter workflow; do not transplant cards as the primary table.
- **Transaction history:** Extend BDM's canonical transactions/trades into a chronological market projection inspired by PCB transfer history/balance.

## Performance and dependency considerations

PCB's single monolithic `App.jsx`, bespoke lists and unbounded local arrays should not be lifted. Recovered views must use BDM selectors, existing Data Grid virtualization/density mechanisms, and no full-world subscriptions or render-time report scans. PCB imports `lucide-react` and uses a Python/Electron/SQLite stack; no dependency is authorized for this audit. Prefer existing BDM icons/primitives; evaluate `lucide-react` only in an implementation prompt.

## Cross-domain candidates

The profile overlay's grouped panels, contextual row actions and drill-through links are reusable for Player Profile, roster, staff and transactions. PCB's radar implementation is visually useful but must be adapted to BDM Intelligence (and never render hidden canonical ratings).

## Scope correction and sequence

### Wave 4B.1 — corrected runtime

KEEP: negotiation, distinct player/agent preferences, player consent, relationships, agent fee, role promises, cross-client effects and persistence.

ADD: typed shortlist/target records and negotiation history as first-class workflow support.

REMOVE: no PCB transfer-value or agency-discount authority.

CHANGE: agency relationship should control openness/friction, not a blanket deterministic fee discount.

### Wave 4B.2 — corrected consumers/UI

KEEP: autonomy, private opportunities, AI market behavior, FA/renewal/trade integration, Market UI, Agent UI and inbox.

ADD: Data Grid shortlist view, market-row quick actions, negotiation-history inspector and transaction-history projection.

CHANGE: prefer compact inspector over an initial full Agency app.

### Wave 5 candidates

PCB contract clauses/bonuses and its negotiation concepts are only partial runtime; retain as research input for BDM-native advanced clauses. Deep rumors/media remain unimplemented in PCB UI/runtime evidence and stay Wave 5.

Recommended sequence: (1) 4B.1 runtime plus shortlist/history records, (2) 4B.2 consumers/UI reconnect, (3) 4C acceptance/global certification. Expected future prompt count: three.

## Hybrid completeness

YES. Implementing the P0/P1 items yields a genuine hybrid: BDM retains authoritative, deterministic basketball-management behavior while PCB contributes discoverability, market workflow, inspector composition and transaction visibility. The recovery deliberately excludes PCB's incompatible state authority.
