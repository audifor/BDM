# BT1 · sesión larga en navegador real

Chrome real (no headless), seed 424242, 5 min de reloj real a velocidad 2×, 147 pasos de motor reproducidos (P1–P3),
marcador final 20–20. Los primeros 2,5 min en vista normal (cancha completa) y el resto con Basketball Truth + cámara half-court.
Vídeo (38 MB, fuera del repo): `Desktop/BT1-evidence/soak-seed424242/*.webm`. Resumen: `evidence/soak/soak-summary.json`.

- 219 beats, 120 de ellos eventos del motor, **0 fuera de orden**; cola nunca > 2 segmentos; sin excepciones JS.
- Único aviso de consola: un 404 (recurso estático del navegador, no afecta al render; no aparece como petición fallida de la app).
- Diferencia canónica–renderizada media 2,3 m (esperada: la canónica es el destino del paso en curso); máx. 19,9 m en pasos largos de transición.
- Inspección visual de fotogramas (`evidence/soak/`): pista completa y proporcionada, balón siempre con su dueño o en vuelo entre cuerpos,
  tiros que llegan al aro antes de subir el marcador, saque tras canasta desde bajo el aro, defensa retrocediendo a la zona.
- Lo que sigue sin verse como baloncesto comercial: ver "cinco problemas" en `BT1_REPORT.md`.
