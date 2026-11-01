# F4C unified world

The WorldDB New Game path now has an explicit `includeNcaa` option. When enabled, the existing `createNcaaD1Real2026Universe` projection is composed with the selected WorldDB competitions before the first daily tick.

The result is one `GameWorld` with:

- one `currentDate` and one `userCoachId`;
- WorldDB PBM/professional competitions selected by the user;
- NBA and G League entries when selected from the global catalog;
- both NCAA D1 male and female categories, with separate teams, conferences, seasons and rules;
- shared identity maps and Save V4 persistence;
- no namespace rewrite and no duplicated simulation engine.

The New Game selector exposes NCAA as an inclusion in the WorldDB universe rather than requiring a second universe. An NCAA program can be selected as the initial club. If a PBM competition is also active, the selected PBM and both NCAA categories coexist in the same world.

Source fidelity remains explicit. NCAA school identities and sourced fixtures retain the existing provenance; generated gaps remain generated under the existing NCAA policy. WorldDB generated competition formats retain the WorldDB `simulationPolicy` and format provenance. No official season claim is added.

The unified construction seam is `createWorldDbV2UniverseWithNcaa`. It uses `mergeGameWorlds` only for composition. It does not alter WorldDB source records or invent cross-ecosystem contracts.
