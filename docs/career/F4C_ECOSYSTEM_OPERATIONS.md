# F4C ecosystem operations

F4C keeps the authorities connected to the team context instead of selecting one universal ruleset.

## FIBA-like

The existing Market Intelligence and Direct Free Agent Approach services remain responsible for contacts, offers, Finance, Governance, contract binding and roster updates. Courtside actions from F4B remain the entry point.

## NBA/WNBA-like

The WorldDB global catalog supplies the NBA/G League competition configuration and native format binding. Trade UI continues to use `TradePresentation`, `TradeEngine` and `TradeSeasonAuthority`; salary matching, windows and assets are not reimplemented by F4C.

## NCAA/NCAW-like

The composed world contains both NCAA categories. Recruiting and Portal continue to use `RecruitingEngine`, `RecruitingPermission`, `TransferPortalLifecycle` and Eligibility. The global player/team category guard remains at the domain and engine boundaries, not only in UI filters.

## Context and persistence

`resolveClubActiveSeasons` and existing capability routing identify the managed context. Save V4 serializes the resulting collections and runtime provenance. F4C adds only the persisted configuration input needed to request NCAA inclusion; it does not create a second save format.
