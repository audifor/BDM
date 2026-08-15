# Adding an entity type to Entity Action System

The Entity Action Composer is open to new entity types. Adding one does not require a Composer, Quick Actions, RMB, or executor branch.

1. Create an `EntityRef` with `createEntityRef('agent', agentId)`. Known-type aliases are optional conveniences; unknown string types are valid.
2. Audit the domain inventory and choose natural action roots; do not turn departments into roots.
3. Define a product catalog in `src/app/entityActions/agentActions.ts`: stable `agent.*` IDs, stable order, semantic groups, icon keys, capability status, availability, and declarative composer definitions where needed.
4. Give the catalog up to four `quickActionIds` for its cold start.
5. Register the catalog beside the others during application assembly, then call `freeze()`. Never register while rendering.
6. Use `EXECUTABLE_NOW` only when an exact Application executor exists. Otherwise use `DOMAIN_MISSING` or `FUTURE_SYSTEM`; availability must stay based on real application state, not a screen.
7. Optionally register the matching command type in `EntityActionExecutorRegistry`. Commands and handoffs remain JSON-safe intent contracts.
8. Attach `useEntityActions(createEntityRef('agent', id), environment)` to an existing UI target. It supplies RMB click, RMB hold, and local native-context-menu suppression.
9. Add catalog, Quick, Full Board, availability, executor (when applicable), and cross-surface tests.
10. Usage learning and persistence are automatically partitioned by the `entityType` carried in `ActionSignature`; no repository schema or entity-type list is needed.

Do not change Composer, RMB, or Quick core unless a generic defect is demonstrated and covered by a regression test.

The registry test for `testFutureEntity` is the permanent executable example of this contract.
