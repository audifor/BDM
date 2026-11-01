# F4B · Fichaje profesional directo

La ficha ofrece `Hacer oferta` únicamente cuando el club dirigido tiene una temporada activa `fibaLike`, el jugador es agente libre según `isPlayerFreeAgent` y no está en una plantilla.

La acción navega a `MarketWorkspace` con `marketTab=free-agents`, `marketContract=FREE` y el `playerId` seleccionado. El Market existente abre el contacto del jugador; el botón de contacto usa `contactFreeAgentDirectly`, y la oferta posterior usa `submitCustomFreeAgentOffer`. La interfaz conserva salario, duración, estado y respuestas reales. Governance y Finance siguen siendo autoridades de aprobación y ejecución.

No se muestran cláusulas no soportadas. Si el jugador deja de ser agente libre, la propia operación canónica rechaza el contacto/firma. La incorporación no se simula desde la ficha.

La prueba F4B usa un jugador real de `createAcbTestGame`, libera su contrato mediante `releasePlayer` y comprueba la proyección de acción. El recorrido completo de firma ya está cubierto por los pilotos F3 (`PlayableF3DirectApproach`/`PlayableF3Transfer`); F4B certifica la entrada contextual hacia ese recorrido.

