# Entity Action System

## Philosophy

BDM separates knowledge, navigation and intent: **hover = know**, **left click = enter**, and **right click = act**. A short RMB click opens the four habitual Quick Actions; holding RMB opens the complete Action Composer.

Actions belong to an `EntityType`, never to a screen. A Player therefore has the same catalog and stable action IDs in Squad and MatchViewer; only real application state can change availability.

## Architecture

```text
EntityRef → EntityActionRegistry → Quick Actions / Full Composer
         → ComposerEngine → EntityCommand or Handoff
         → ExecutorRegistry → Application / Domain
```

- **Domain** owns game rules and canonical validation.
- **Application** owns use cases and registered executors.
- **Entity Action System** expresses and composes intent; it does not own game rules.
- **Zustand** holds ephemeral composer and usage UI state.
- **React** renders targets and interaction only.
- **Preferences** are global user data outside `GameWorld`.

The production registry is assembled once, contains Player, Staff and Team catalogs, and is frozen before React renders.

## Capability and availability

Capability answers whether BDM implements an action at all (`EXECUTABLE_NOW`, `HANDOFF_NOW`, `DOMAIN_MISSING`, or `FUTURE_SYSTEM`). Availability answers whether that action is valid for this concrete entity and current application state. Disabled actions retain their stable board slot and expose a reason; they are not removed to reshape the catalog.

## Quick Actions

Each catalog declares up to four stable cold-start root IDs. Usage signatures are versioned and partitioned by `entityType`; Player usage cannot affect Staff or Team slots. Reusable selections are stored, while dynamic target selections are deliberately excluded so concrete target IDs never persist. Usage ranking uses hysteresis, preserving slots until a new action has enough additional use to replace the weakest slot. Preferences are currently stored globally through the runtime repository, not in saves or `GameWorld`.

## Full Composer

The Full Board reads the catalog's stable order and transforms the same panel into declarative composition steps. It supports different catalog sizes without route-specific boards or Football-Manager-style submenu trees. A composer can produce a data-only `EntityCommand` or a `Handoff`; neither mutates the world itself.

## Execution

Executors revalidate at the application boundary. `player.release` changes canonical `GameWorld` through its existing application path. `player.substitute` operates on the transient active match session. Handoffs (such as future negotiation or comparison destinations) are intentionally not executors until their receiving domain exists. Results distinguish execution, rejection, handoff, and no-executor outcomes.

## Input and accessibility

`useEntityActions` owns target-local RMB pointer lifecycle: short release opens Quick, a hold opens Full, and cancellation disposes the hold controller. The hold threshold is centralized in `RightMouseHoldController`. Entity targets suppress `contextmenu`; `DesktopShell` additionally suppresses native context menus globally so overlay transitions or bubbling cannot reveal browser/WebView menus. This global suppression does not turn background RMB into an entity action.

The panel supports Escape and outside-click closure, uses dialog semantics, keeps disabled roots focusable through `aria-disabled`, and exposes availability reasons through `aria-describedby`.

## Current catalogs

### Player

Stable roots, in order: `talk`, `assign`, `instruct`, `substitute`, `limit`, `rest`, `assess`, `send`, `recall`, `negotiate`, `offer`, `release`, `trade`, `scout`, `follow`, `compare`, `delegate`, `tag`, `note`, `recruit`.

The complete EAC-03 action-language audit lives in [EAC-03_PLAYER_ACTION_LANGUAGE.md](EAC-03_PLAYER_ACTION_LANGUAGE.md). Current executors are `player.release` and `player.substitute` only.

### Staff

Stable roots: `talk`, `assign`, `assess`, `develop`, `delegate`, `negotiate`, `release`, `compare`. They are intentionally `DOMAIN_MISSING` or `FUTURE_SYSTEM`: Staff has role/evaluation data, but no exact mutation or destination API yet.

### Team

Stable roots: `assess`, `manage`, `arrange`, `delegate`, `compare`, `contact`, `follow`, `scout`. They are intentionally `DOMAIN_MISSING` or `FUTURE_SYSTEM`: roster, schedule and training data exist, but no generic Team-intent executor is invented merely to fill a button.

## How future domains integrate with Entity Actions

The domain milestone that supplies authority activates an existing action or introduces a new entity catalog; it must not modify Composer core. It implements the domain/application API, defines availability and an optional `ComposerDefinition`, produces an `EntityCommand`, registers an exact executor or handoff, and adds tests.

Examples: Contracts may enable `player.negotiate`; Relationships `player.talk`; individual training/instructions `player.assign` or `player.instruct`; Scouting Player and Team assessment roots; Trades `player.trade`; Affiliates `player.send`/`player.recall`; Recruitment `player.recruit`. Agents may add an `Agent` entity type, while Media may add MediaPerson/MediaOutlet catalogs.

For the practical checklist and the executable future-entity example, see [ADDING-AN-ENTITY-TYPE.md](ADDING-AN-ENTITY-TYPE.md).

## Known debt

- Runtime preferences use `localStorage`; a future native global-preferences service may replace that repository.
- Successful feedback currently may be limited to closing the Composer.
- Negotiation and comparison handoffs have no receiving surface yet.
- Pending Player domains include contracts, relationships, individual instructions/training, scouting, trades, affiliates and recruitment.

This debt is documented, not solved by the Entity Action System.
