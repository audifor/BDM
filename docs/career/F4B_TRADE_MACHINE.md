# F4B · Trade Machine

La ficha ofrece `Proponer traspaso` cuando el club tiene una autoridad de trade NBA-like activa, el objetivo pertenece a otra plantilla y su franquicia pertenece al ecosistema de la autoridad.

La acción abre `TradesWorkspace` con `playerId`. La pantalla inicializa el editor canónico con:

- el club del usuario;
- la franquicia del jugador objetivo como contraparte;
- el jugador objetivo como activo enviado a cambio del usuario.

El usuario puede añadir o retirar jugadores, picks, derechos y otros activos solo si `TradeRules` los admite. `buildTradePresentation` y `validateTrade` muestran contratos, ventana, matching salarial, restricciones y razones de invalidez. La propuesta se envía mediante `proposeUserTradeNegotiation`; las respuestas, contraofertas, compromiso y ejecución siguen las autoridades existentes.

No se acepta ni ejecuta automáticamente una propuesta. Un objetivo sin contrato válido puede abrir el editor para corregir el paquete, pero la validación canónica lo marca como inviable.

