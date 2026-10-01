# Análisis a fondo del partido (motor `60b0e96`, semillas 31337, 424242 y 7)

Motivo: "no se siente fluido, defensas como pollos sin cabeza, ataques ramplones, todo algo pachucho".
Instrumento: `src/presentation/match-next/audit/bt42/fluidity.ts` (`BT2_AUDIT=1`), tres partidos completos (35,6 min de juego vivo cada uno). Datos en `audit/fluidity-base.json` y `audit/fluidity-base2.json`.

## Lo que muestran los datos

**Ataque: el tiempo se llena de nada.**
- Mediana de **10,5 s hasta la primera acción real** (bloqueo, penetración, tiro o catch-and-shoot) en posesiones de más de 6 s; p10 3,2 s, p90 15,3 s.
- El manejador está parado (<0,5 m/s) el **42%** de sus fotogramas, y hay **121 tramos por partido** en los que se queda con el balón más de 2 s parado (media 4,0 s, máx 14 s).
- Solo **1,72 jugadores tocan el balón por posesión** (mediana 1).
- Solo se mueve el **52%** de los jugadores sin balón a la vez; cortes: 24 por partido (BASKET_CUT 4, BACKDOOR_CUT 20). El resto del movimiento sin balón son OFFER (328 por partido) y DRIFT durante penetraciones (136).
- **OFFER:** 2,1 por posesión, y solo el **2,8%** acaba con ese compañero recibiendo el balón en 4 s. El 97% de las ofertas no sirve para nada: el compañero viene al balón, no se le pasa y se vuelve a ir.
- Secuencias típicas (ver `sampleTimelines`): `catch → OFFER → OFFER → OFFER → OFFER → SCREEN → screenSet → tiro`, con el bloqueo a los 11–13 s. 215 patrones distintos en 519 posesiones, pero los más repetidos son un esqueleto de OFFER + bloqueo/penetración.
- Espaciado de media cancha: compañero más cercano a 4,8 m; área del polígono de los cinco 60 m² (p10 26 m²): el ataque se arracima porque las ofertas lo atraen al balón.

**Defensa.**
- Cambios de responsabilidad: 5,2 por defensor y minuto; saltos del objetivo de movimiento: 6,7 por defensor y minuto: no hay temblor.
- Eficiencia de recorrido en 3 s: 0,68 (defensor sobre el balón) y 0,74 (resto): zigzaguean más que el ataque (0,76–0,83).
- El 28–31% del tiempo están parados y se mueven a una media de 1,9–2,0 m/s; giro medio por tick 4,3–5,2° (el doble que el ataque, que va a 1–3°).
- El 15% de los fotogramas de media cancha tienen a un defensor más lejos del aro que el balón. Distancia media de un defensor al balón: 4,8 m.

## Diagnóstico

1. **La paciencia está implementada como "esperar", no como "hacer".** Para reducir posesiones sin un temporizador, el ataque espera una mejor mirada mientras hay reloj (prima de espera). Pero el motor casi no tiene acciones sin balón con las que llenar esa espera (cortes, bloqueos sin balón, pantallas de ayuda, mano a mano, poste, reversión). El resultado es que el manejador se queda con el balón hasta que el valor de esperar decae (~11 s) y entonces actúa de golpe: un reloj de tiro bimodal y una posesión con una larga meseta de nada.
2. **Mi mecanismo de oferta añade ruido en vez de fluidez.** Cuando el manejador no tiene una salida libre un compañero viene a ofrecerse, pero el manejador sigue en espera, así que no se le pasa. Se repite cada ~1,6 s: 4 ofertas seguidas, sin consecuencia. Es movimiento sin propósito: lo que se ve como "pollos sin cabeza", aunque la defensa en sí no tenga temblor: sus pares se mueven sin sentido y los defensores los siguen.
3. **La defensa reacciona a un ataque que no ataca.** Se mueve para seguir a hombres que van y vienen y que no reciben el balón. Sus recorridos son menos eficientes (0,68–0,74) y sus giros mayores.
4. **Pocos tipos de acción:** pase, penetración, bloqueo directo, catch-and-shoot. No hay poste, mano a mano, bloqueo sin balón ni corte de retorno. Es difícil que algo parezca fluido con ese vocabulario.

## Qué haría, en orden

1. Hacer que esperar sea moverse con intención: el manejador que espera y la oferta deben estar acopladas (si hay oferta, se evalúa el pase al que se ofrece como opción natural; si no se le pasa, no se repite la oferta).
2. Limitar la espera pura: un manejador parado más de ~2 s debe estar haciendo algo (sondeo, pase de circulación, bloqueo); eso toca el modelo de decisión, no un temporizador.
3. Ampliar el vocabulario sin balón con lo mínimo que dé fluidez: corte de retorno, bloqueo sin balón, mano a mano.
4. Reducir el trabajo inútil de la defensa: no perseguir ofertas ni ir a hombres que no pueden recibir.
5. Revisar la suavidad del movimiento (velocidad media baja, 28–42% de tiempo parado) con un clip a 1x.
