# BS9E-B planning lifecycle audit

## Existing lifecycle hooks

- `createNewGame` and the ACB test-career factory finish constructing teams, staff, competitions, contracts, finances, governance and recruiting state before returning. Prototype setup already reviewed AI strategy; these are safe complete-world initialization boundaries.
- `startNextSeasonTransitionFor` creates the next competition edition, reconciles contracts, repairs the world, rolls boards and reviews AI strategy. Its completed transition is the stable preseason boundary; the caller may batch the new season's participant clubs.
- `advanceGameDayWithResult` owns the application day boundary around `CalendarEngine`. Calendar runs daily roster/contract reconciliation and several other systems; the application boundary already detects roster changes after the calendar and repairs only affected clubs.
- `MarketService.signFreeAgent` and `releasePlayer` perform completed contract/roster mutations. `TradeEngine.executeTrade` performs completed trades, with the store and staff-recommendation services as application command boundaries.
- Completed match application creates canonical post-match Injury records. The Injury Domain distinguishes serious injuries and defines their recovery interval as 22–60 days.
- Strategy, needs, decision context, GM selection and workflow assessment already have public engine/application APIs. No new planning formula or workflow authority is needed.

## Truthful material-change hooks

- Initial setup can initialize all AI club strategy and plans after `createNewGame` has finished constructing canonical world data.
- Competition rollover can review the new edition's participant clubs after board rollover, repair, schedule and recruiting setup are complete.
- Market sign/release and completed trade command paths know the affected clubs after the canonical mutation succeeds.
- The application day boundary can observe actual roster changes caused by contract expiry or other daily lifecycle work and review only those teams.
- Post-match application can compare new serious Injury records and refresh only the affected player's club. Minor and moderate injury records do not trigger planning.

## Hooks that must not trigger planning

- Ordinary day advancement without a club roster change must not update plans.
- Proposed, rejected or invalid transactions do not represent changed world state.
- Each low-level scouting datum, daily medical advisory, routine ledger entry and Governance record write is too granular or lacks a single material-change application seam.
- Medical recommendations and return-date adjustments are not new injury events; they do not independently trigger a planning review.
- Club Finance V2 has no global calendar processor. Governance calendar resolution is intentionally disabled. Scouting assignments progress daily but have no consolidated knowledge-completion callback. No transfer-market window is defined by the shared ecosystem calendar.

## Existing Analysis surface

`src/ui-ng/applications/analysis/ClubStrategyScreen.tsx` already shows each coached club's strategy assessment, top three BS9B needs and BS9C response options. It has an existing presentation test and no management action controls. It is the appropriate surface to add persisted AI plans and current BS9E-A workflow status. The screen currently exposes raw player IDs in one needs evidence line; normal inspection should show player names without those IDs.

## Duplicate-processing risk

Calling review unconditionally from `advanceDay` would refresh every club daily and cause unnecessary plan review churn. Calendar contains multiple daily workflows, so attaching planning independently to each processor could also review one club several times in one day. Existing material triggers intentionally allow BS9D to reconsider options; callers must use them only after a real completed event. Preseason rollover is already idempotent when a successor edition exists.

## Current cadence gap and integration map

New prototype careers currently initialize strategy but not GM plans/workflow decisions. The ACB test-career factory constructs fully staffed AI clubs and is another complete-world setup boundary. Season rollovers review strategy globally but do not refresh participant GM plans. Completed market/trade changes and actual daily roster changes have no common GM planning coordinator. Analysis does not render accepted plans or their current routes.

BS9E-B adds one Application coordinator composing strategy review, BS9D plan review and BS9E-A route assessment; initializes AI planning at completed prototype and ACB test setup boundaries; calls it for new season participants; and uses completed market/trade changes, serious post-match injuries, and daily roster changes as team-scoped triggers. It extends the existing Analysis screen. Finance, Governance, scouting knowledge and market checkpoints remain deferred until a truthful shared application checkpoint exists. No action is dispatched and no workflow decision is persisted.
