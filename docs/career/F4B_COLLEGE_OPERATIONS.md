# F4B · Recruiting y Transfer Portal

La ficha consulta el contexto NCAA activo del club mediante `resolveClubActiveSeasons` y no mediante el puntero global `currentSeasonId`.

- Un `RecruitProfile` abierto o comprometido de origen no-transfer lleva a `RecruitingWorkspace` con `focusPlayerId`.
- Una entrada Portal `noticePending` o `authorized` lleva a `TransferPortalWorkspace` con el foco del jugador.
- Para una entrada autorizada, la etiqueta refleja que la incorporación sigue requiriendo recruiting y elegibilidad; no se convierte en firma profesional instantánea.
- La lista Portal y sus acciones siguen usando `canRecruitTransferPlayer`, `completeTransferEducationModule`, `processTransferPortalEntry` y `addTransferRecruitToCycle`.

La protección de categoría no se reimplementa en la ficha: la selección del ecosistema/temporada y las autoridades NCAA existentes siguen siendo las que autorizan cada downstream action. Por eso la ficha no ofrece Market profesional a un club NCAA.

El fixture F4B materializa el prospecto con `discoverRecruitingTalentCandidate`, de modo que el test usa el mismo `RecruitingEngine` que la partida.

