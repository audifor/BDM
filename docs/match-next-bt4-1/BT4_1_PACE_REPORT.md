# BT4.1 · Pace Closure — Informe

Rama `match-next-basketball-core-bt4-1-pace`, worktree `C:\BDM-NEXT-TRUTH`. Sin push, PR ni merge.
Auditorías en `src/presentation/match-next/audit/bt41/` (`BT2_AUDIT=1`), resultados en `docs/match-next-bt4-1/audit/`.
Cifras del motor final: 12–16 semillas (3–6 en las sondas de defensa, subida y acarreos; 3 en identidad y 5 en rosters, donde hay mucho ruido).
"BT4" es el motor de `af2fb82` medido con el mismo auditor (`pace41-bt4-equivalent.json`, que reproduce exactamente la economía publicada de BT4).

## 1–3. Estado

| | |
|---|---|
| 1. STATUS TÉCNICO | **PASS**. Typecheck y build limpios, Live e Instant deterministas, 16 partidos completos sin transiciones ilegales. En los tests del motor y la app solo fallan los 4 base de `matchNext.test.ts` (ver punto 23). |
| 2. STATUS PACE | **PASS en el número y en el reparto del tiempo** (165 posesiones, 14,7 s por posesión, reloj de tiro repartido). **No cierra el ritmo como calidad comercial**: la transición ha perdido velocidad y el ataque se ha vuelto casi todo penetración (ver 9–13). |
| 3. STATUS BASKETBALL | **NO PASS**. De los 13 criterios del prompt, cumplo 1, 2, 3, 4, 6, 7, 8 y 12. **No cumplo** el 5 (transición rápida cuando toca), el 9 (identidad: pasador y manejador se han perdido), el 10 (economía de tiro) ni el 11 (regresiones: asistencias). El 13 (ritmo humano visual) queda sin confirmar. |

## 4–6. SHA, commit

- SHA inicial: `af2fb8266944e0c0f3105ba2c1fd6ee53ddb848a` (BT4).
- SHA final y commit: el de este commit (`git log`).

## 7. Posesiones antes y después

| | BT3 | BT4 | **BT4.1** |
|---|---|---|---|
| Posesiones combinadas | 228,7 | 213,5 | **165,5** (p10 155, p90 176, mín 148, máx 180 en 16 partidos) |
| Puntos | 233,7 | 225,4 | 179,5 |
| Tiros | 226 | 209,5 | 158,9 |
| FG% | .39 | .39 | .41 |
| Triples / aro / mediocampo | .43 / .19 / .08 | .46 / .30 / .07 | **.31 / .52** / .03 |
| Tiros libres (por tiro) | 28,3 (.13) | 34,8 (.17) | 42,7 (.27) |
| Faltas, bonus, eliminados | 26,3 / 0,9 / 1,6 | 33,8 / 4,0 / 2,8 | 42,2 / 6,2 / 3,8 |
| Pérdidas | 27,8 | 19,6 | 18,2 |
| Asistencias | 43,8 | 35,6 | **15,7** |
| Pases | 484 | 397 | **245** |
| Penetraciones / bloqueos directos | 207 / 18 | 150 / 20 | 169 / 59 |
| PPP | 1,02 | 1,06 | 1,08 |

## 8. Duración media y 9. histograma

Media 14,7 s (BT4: 10,8), mediana 14,2 s. Media cancha asentada: 14,2 s (BT4: 10,9).

| | <4 s | 4–8 | 8–12 | 12–16 | 16–20 | >20 |
|---|---|---|---|---|---|---|
| BT4 | 4,2% | 21,7% | 40,8% | 21,9% | 7,3% | 4,0% |
| **BT4.1** | 3,6% | 13,0% | 20,3% | 22,4% | 22,3% | 18,5% |

Por tipo de posesión (por partido / segundos): tras rebote defensivo 59,7 / 14,6 (BT4: 91,0 / 10,5), tras canasta 50,4 / 12,5 (67,8 / 10,1), tras tiros libres 18,3 / 13,2, tras robo 10,8 / 13,5 (9,4), segunda oportunidad 17,3 / 23,1 (16,2). **La segunda oportunidad dura 23 s y el 53% de ellas pasa de 20 s: demasiado larga.**

## 10. Causas raíz del exceso de posesiones en BT4

1. **El ataque aceptaba la primera mirada mejor que la media.** El valor de seguir era constante hasta los últimos 12 s del reloj: el tiro salía con mediana de 16,7 s restantes (a los 7 s de posesión; el 62% entre 19 y 15 s) y solo el 1,3% con menos de 5 s.
2. **Pocos ciclos por posesión:** 1,9 pases y 3 decisiones por posesión; el 27% de las posesiones cortas (<8 s) terminaban en tiro antes de que la media cancha estuviera asentada.
3. **Un fallo de subida que la regla de 8 s ha puesto al descubierto:** tras un rebote defensivo con el defensor encima, la transición se daba por "resuelta" en 4 ticks y la posesión pasaba a media cancha con el balón en campo propio. Al manejador le quedaba la orden "mantener posición" y esperaba parado, a 1 m de su defensor, hasta que los compañeros llegaban a sus puestos. Con la regla recién puesta hubo **64–69 infracciones por partido** (28% de las posesiones).
4. Los parámetros de decisión existentes no mueven el ritmo (±5% y ±10% dan 200–218 posesiones): el límite era estructural, no de calibración fina.

## 11. Tiempo por fase

Segundos por posesión, BT4 → BT4.1 (y cuota del tiempo actual):

| Fase | BT4 | BT4.1 | Cuota | Mediana si está | p10–p90 si está |
|---|---|---|---|---|---|
| inbound | 0,41 | 0,47 | 3,2% | 0,7 | 0,7–1,2 |
| transición | 1,89 | 1,88 | 12,8% | 1,3 | 0,4–3,8 |
| asentamiento | 2,62 | 3,07 | 21,0% | 4,4 | 1,1–6,3 |
| lectura (retener el balón) | 0,61 | 1,82 | 12,4% | 2,1 | 0,7–5,8 |
| movimiento sin balón | 0,06 | 1,04 | 7,1% | 2,0 | 0,3–3,7 |
| montaje de bloqueo | 0,38 | 1,31 | 9,0% | 3,9 | 2,1–5,5 |
| penetración | 0,95 | 1,24 | 8,5% | 1,9 | 1,2–2,3 |
| vuelo de pase | 0,95 | 0,62 | 4,2% | 1,4 | 0,6–2,7 |
| preparación del tiro | 0,35 | 0,24 | 1,6% | 0,3 | 0,3–0,4 |
| vuelo del tiro | 0,67 | 0,70 | 4,8% | 0,6 | 0,6–1,2 |
| rebote | 0,85 | 0,71 | 4,9% | 1,2 | 0,3–2,2 |
| reset ofensivo | 0,09 | 0,25 | 1,7% | 2,3 | 0,6–4,1 |
| balón muerto | 0,65 | 0,95 | 6,5% | 3,9 | 2,6–5,9 |

El tiempo nuevo está en lectura, movimiento sin balón, bloqueos y asentamiento; el pase **baja** (0,95 → 0,62 s por posesión): el ritmo se ha ganado reteniendo y moviéndose, no pasando más.

## 12. Transición

Sigue siendo rápida **cuando ocurre** (posesión de transición ~5,6 s; primer tiro a los 3,9 s), pero **ocurre mucho menos**: los tiros de creación TRANSITION pasan de 22,1 a 4,5 por partido (−80%). Es un defecto de este cierre: la espera ya no actúa durante una transición viva, pero tras un rebote o robo los defensores llegan antes y los ataques se asientan en campo contrario sin contra.

## 13. Media cancha

Tiene tiempo real para asentarse y actuar: asentamiento 3,1 s, lectura 1,8 s, movimiento sin balón 1,0 s, bloqueos 1,3 s. El primer tiro tras la subida llega a 9–17 s según la creación (penetración 9,2 s, catch-and-shoot 17,7 s, bloqueo directo 16,7 s).
**Pero** el 42% de los tiros son penetraciones (BT4: 25%) y el 19% salen del manejador de un bloqueo.

## 14. Reset tras rebote

Tras rebote ofensivo: pase en 2,3 s de media (BT4: 1,0 s), putback a 1,5 s, otro tiro a 3,8 s. No hay acciones físicamente absurdas (mínimo 0,7 s al pase, 1,0 s al tiro).

## 15. Saque

Los saques se reanudan con balón en el punto, receptor listo y pase en vuelo de 2–8 ticks. Se corrigió un teletransporte real: al inicio de un periodo el balón saltaba 3,6 m al centro; ahora el saque espera a que el balón llegue al punto.
**Regla de los 8 segundos** (nueva): infracciones 0,33 por partido (antes de arreglar la subida, 64). Pasar a campo de ataque tarda 3,6 s de media (p10 2,8 s, p90 4,2 s, máx 7,6 s).

## 16. Ecología del reloj de tiro

Reloj restante al soltar el tiro (BT4 → BT4.1): 24–20 s 5,8% → 2,0%; 19–15 s 62,0% → 32,2%; 14–10 s 23,8% → 29,0%; 9–5 s 7,1% → 30,5%; 4–0 s 1,3% → 6,3%. Violaciones de 24 s: 0,08 por partido. Ninguna cuota está fijada: depende del valor de las miradas frente al reloj.

## 17. Decisiones por posesión

3,14 por posesión (BT4: 2,97), 0,21 por segundo (BT4: 0,28), cancelaciones 0,078 por posesión (BT4: 0,026; son bloqueos cancelados). El compromiso de acción se mantiene y la cadencia es humana.

## 18. Regresión de identidad (cohortes 25 / 50 / 85, 3 semillas)

| Cohorte | Señal | 25 | 50 | 85 | BT4 (25→85) |
|---|---|---|---|---|---|
| Tirador | Cuota de triples | 0,13 | 0,28 | 0,44 | 0,13 → 0,64 |
| Finalizador | Cuota al aro / tiros libres | 0,25 / 10,7 | 0,30 / 9,0 | 0,58 / 26,3 | 0,11 → 0,40 |
| Protector | Intentos rivales al aro / FG rival | 52 / .49 | 48 / .37 | 40 / .37 | 41 → 36 |
| Rebotero | Rebote ofensivo | 4,3 | 4,7 | 10,3 | 3,3 → 9,7 |
| **Pasador** | **Asistencias** | 5,0 | 6,3 | **5,3** | 9,7 → 17,7 |
| **Manejador** | **Asistencias** / pérdidas | 7,7 / 16,0 | 10,3 / 13,7 | **4,7** / 10,0 | pérdidas 14 → 7,7 |

Sobreviven tirador, finalizador, protector y rebotero. **Se ha perdido el pasador** (más pases, mismas asistencias) y el manejador solo conserva el cuidado del balón. Correlaciones de jugadores: creación→asistencias 0,43, visión→asistencias 0,33 (BT4: 0,74 y 0,63).

## 19. Estadísticas

Ver el punto 7; además: 16 partidos, todos completos. Rosters (5 semillas): el plantel de tiro lanza el 72% de triples y el de aro el 66% al aro, con 22 tiros libres; **el plantel de pase no genera más asistencias que el base (6,6 frente a 6,8)**.

## 20. Partidos extremos

- Más puntos: 205 (+26 sobre la media): +17 por volumen (180 posesiones), +14 por suerte de tiro, +17 por faltas (63 tiros libres).
- Menos puntos: 156 (−23): −22 por suerte de tiro, −7 por tiros libres.
- Menos posesiones: 148 (−18 por volumen), compensadas por +18 de suerte de tiro.
- Más tiros libres: 69 (partido 424242), +22 por volumen de faltas. La varianza de tiros libres sigue siendo alta (p10 23, p90 63).
Ningún extremo se reduce a "RNG": siempre se descompone en volumen, calidad de tiro, faltas, pérdidas y rebotes.

## 21. Visual

Revisado por la persona usuaria viendo partidos en directo durante esta fase. Hallazgos (todos corregidos o medidos, ver más abajo): defensas que iban "en patines" y daban vueltas, el base haciendo coast to coast, el manejador parado muchos segundos, salto inicial no estándar, seis jugadores en la zona de tiros libres y ausencia de la regla de 8 s.
Medido después: distancia media de un defensor a su par 2,68 m (BT4: 3,10 m); a más de 3 m el 31% (41%); persigue el 4,6% (11,4%); órbitas 0,1%. Acarreos largos sin pase: 127 por partido (incluyen la subida), el 58% termina en tiro, con el defensor a 1,0 m de media. No hay capturas de Phaser con los valores finales (las anteriores se descartaron por ser de un motor distinto). **No he vuelto a ver un partido completo con los valores finales.**

## 22–24. Tests, base, typecheck y build

- Tests focales y amplios: 4 fallos base de `matchNext.test.ts` (no los toca BT4.1).
- Tests actualizados por diseño: reloj tras canasta de campo (ya no confunde un tiro libre), salto inicial estándar (no hay contra), cortes sin contar la oferta, tolerancias de BT2/BT3 sobre muestras y ritmo, subida con rodeo, cadena de acciones que puede acabar en pérdida.
- `npm run typecheck`: limpio. `npm run build`: OK.

## 25. Limitaciones restantes

1. **El ataque es de penetración**: 169 por partido, 42% de los tiros, aro 52%; pases 245 y asistencias 15,7 (real ~30).
2. **Se perdió la identidad del pasador y del manejador** (punto 18).
3. **Transición**: −80% de tiros de contra.
4. **La espera es un coeficiente calibrado** (`waitPremium` 1,4), no una duración; funciona reteniendo y moviéndose, no pasando.
5. Segunda oportunidad: 23 s de media, demasiado larga.
6. FG 41% y tiros libres 0,27 por tiro (real ~0,28): aceptables, pero con faltas (42) y eliminados (3,8) por encima de lo real.
7. La regla de 8 s es del motor (por defecto 8 s, configurable en `clockRules.backcourtSeconds`); **no está conectada a las reglas por competición** (NCAA 10 s).
8. Solo existe defensa individual en media pista; presión, caja +1 y zonas son trabajo futuro y requerirán su propia colocación y recalibración.
9. Parámetros nuevos sin sensibilidad medida sobre los valores finales.

## Respuestas explícitas

**¿Por qué BT4 producía ~215 posesiones?** Porque el ataque tomaba la primera mirada mejor que la media (mediana de 16,7 s de reloj restante), hacía pocos ciclos por posesión (1,9 pases) y, tras la mitad de los rebotes defensivos, el manejador se quedaba parado en campo propio hasta que llegaban los compañeros.

**¿Cuántas posesiones produce ahora?** 165,5 por partido (p10 155, p90 176).

**¿Qué fases consumían demasiado poco tiempo?** Lectura (0,6 s), movimiento sin balón (0,06 s), montaje de bloqueo (0,4 s) y asentamiento (2,6 s). Ahora 1,8 / 1,0 / 1,3 / 3,1 s.

**¿El nuevo ritmo emerge del juego o de temporizadores artificiales?** De decisiones frente al reloj: no hay esperas fijas ni duraciones objetivo. Pero el coeficiente de paciencia está calibrado a mano para que salga el número, y la regla de 8 s es una regla real.

**¿La transición sigue sintiéndose rápida?** Cuando existe sí (5,6 s por posesión), pero hay un 80% menos de tiros de contra: no.

**¿El half court tiene tiempo para asentarse?** Sí: 3,1 s de asentamiento y 14,2 s por posesión.

**¿La identidad de jugador de BT4 sobrevive?** En parte: tirador, finalizador, protector y rebotero sí; pasador y manejador no.

**¿Qué impide todavía considerar el ritmo calidad comercial?**
1. Ataque casi solo de penetración, con poca circulación de balón (245 pases, 15,7 asistencias).
2. Identidad del pasador y del manejador perdida.
3. Transición muerta (−80%).
4. Faltas y tiros libres con alta varianza entre partidos (p10 23, p90 63) y demasiados eliminados.
5. Ningún partido completo revisado visualmente con los valores finales, y sin variantes defensivas más allá del hombre a hombre.
