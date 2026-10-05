# Sesión larga en navegador real (MatchEngine Next)

Chrome real (no headless), seed 424242, 5 min de reloj real a 2× (6.009 ticks = ~10 min de juego, P1 casi completo, marcador 44–51).
Los primeros 2,5 min en vista normal (cancha completa) y el resto con Basketball Truth + cámara half-court + slots/targets/asignaciones.
Vídeo (fuera del repo): `Desktop/BT1-evidence/next-soak-seed424242/*.webm`. Resumen: `evidence/soak/soak-summary.json`.

- 600 eventos canónicos reproducidos, **0 fuera de orden o duplicados**; sin excepciones JS (un 404 estático del navegador).
- Diferencia canónico–renderizado: media 0,14 m, máx. 0,60 m (= como máximo un tick de retraso, por diseño).
- Vista crítica de los fotogramas: pista proporcionada, 10 jugadores y balón coherentes, vuelo/altura del balón del motor, defensa con asignación y
  cierres, rebote físico. Lo que un espectador de baloncesto rechazaría: ritmo (≈ 95 puntos por cuarto), rebotes ofensivos encadenados, ataque que no
  asienta su estructura, ausencia de screens/faltas. Ver "cinco defectos" en `NEXT_TRUTH_REPORT.md`.
