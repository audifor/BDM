# F4A · Dependencias WorldDB

Estado: **aislado y documentado; no integrado en esta rama**.

## Lo que sí está disponible

- WorldDB Spain expone una carrera FIBA-like ACB mediante `createWorldDbSpainGame` y bootstrap asíncrono.
- WorldDB V2 puede ensamblar varias competiciones cuando las instantáneas comparten master, fecha, seed e identidades compatibles.
- Save V4 conserva la procedencia WorldDB y las competiciones activas.

## Lo que no se ha afirmado

- No se ha generado una nueva base WorldDB.
- No se han mezclado snapshots NBA/NCAA con WorldDB Spain.
- No se ha cherry-pickeado la rama `feature/worlddb-global-playable-02`.
- No se ha modificado `docs/playable/evidence/f3/ab-comparison.json`.

## Dependencia precisa para PASS integral

Para que A, B y C sean pilotos accesibles desde una única ruta de partida de producción, el catálogo y el bootstrap deben ofrecer en un mismo `GameWorld` una organización NBA-like y un programa NCAA-like con sus reglas configuradas, identidades sin conflicto, calendario compatible y MatchEngine disponible. F4A solo certifica los fixtures existentes y clasifica esa integración como pendiente.

## Decisión recomendada

Mantener F4A aislada de WorldDB. El siguiente trabajo mínimo es ampliar el contrato de selección WorldDB y sus fixtures de integración; no reimplementar Trade, Recruiting, Eligibility, Finance ni Save V4.
