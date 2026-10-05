# BT6.1 · Línea base de la ecología de la penetración

Código de `be4b579` (BT6), sin cambios de motor.

**Instrumento:** observador nuevo y de solo lectura, `src/presentation/match-next/audit/bt61/drives.ts`, añadido al runner BT6. Por cada penetración registra:

- cómo se resolvió;
- si llegó la ayuda;
- el siguiente acto del penetrador;
- qué hizo el primer receptor.

Por equipo, registra además los intentos en el aro y las faltas de tiro por origen.

**Muestra:** 8 configuraciones × 6 semillas (`exp-d0-*.json`). Tablas con `node scripts/next/bt61Drives.mjs d0`.

| configuración | qué es |
|---|---|
| neutra | defensa normal |
| `oppDefense` | contención de élite (la plantilla defensiva defiende) |
| `helpHigh` / `helpLow` | ayuda agresiva / conservadora |
| `rosterCreation` | creador de élite contra defensa normal |
| `creationVsDefense` | creador de élite contra defensa de élite |
| `coachA` / `coachB` | entrenadores |

**Interior:** ledger BT4.5 por pase (3 semillas, `docs/match-next-bt4-5/audit/pass-rows-bt61entry.json`).

## 1. Qué pasa después de que empieza una penetración

Neutra, ataque local, por partido:

- **48,5 penetraciones.**
- **Resolución:**
  - *blow-by* limpio: 30,0;
  - parada para tirar (pull-up o flotadora): 7,3;
  - contenida: 5,3;
  - ventaja parcial: 2,8;
  - robo: 1,0;
  - falta en la penetración: 0,7.
- **Siguiente acto del penetrador:**
  - pase fuera: 18,5;
  - tiro en el aro: 10,5;
  - tiro en la zona corta: 9,7;
  - otro tiro: 3,5;
  - dump-off: 1,0;
  - pase de *short roll*: 1,0;
  - entrada interior: 0,8;
  - pérdida: 1,0;
  - falta: 0,7;
  - reset: **0** (no existe como opción).

Desglose por resolución:

| resolución → acto | por partido |
|---|---|
| *blow-by* → pase fuera | **13,8** |
| *blow-by* → aro | 7,3 |
| *blow-by* → zona corta | 4,8 |
| parada → tiro | 7,3 |
| contenida → pase fuera | 4,2 |
| contenida → entrada interior o dump-off | 0,2 |
| contenida → aro | 0,3 |

Tras el primer pase, el receptor:

| qué hace | por partido |
|---|---|
| **otro pase** | **13,8** |
| tiro contestado | 3,0 |
| tiro abierto | 2,2 |
| ataca el *closeout* | 0,8 |
| segunda penetración | 0,2 |
| se queda con el balón | 1,0 |
| pierde el balón | 1,2 |

Ventaja secundaria (*closeout* atacado, segunda penetración o tiro abierto): **3,2 por partido**.

## 2. ¿Se cumple la hipótesis del brief?

La hipótesis era "contención → pase interior forzado → pérdida". **No se cumple:**

- Las penetraciones contenidas terminan casi siempre en un pase fuera.
- Las entradas interiores después de una penetración son 0,8 por partido, y las pérdidas tras una penetración, 1,0.
- Una penetración contenida nunca se reinicia, porque el código obliga a actuar en el acto: `mustAct` y ninguna penetración más en toda la posesión.

Dónde muere de verdad la posesión:

1. **El *blow-by* termina más en pase fuera (13,8) que en el aro (7,3).**
2. **Después del pase fuera, la jugada fuerza otro pase.**
   - DRIVE_KICK exige 2 pases antes de darse por ejecutada.
   - Mientras está comprometida, el tiro frío del receptor vale ×0,65 y el pase ×1,25.
   - El receptor casi nunca ataca el *closeout* (0,8) ni penetra (0,2).
3. **El aro solo llega por penetración y transición.** Origen de los intentos en el aro (neutra, por partido y equipo):

   | origen | intentos |
   |---|---|
   | finalización de penetración | 6,7 |
   | transición | 2,5 |
   | manejador del bloqueo | 1,0 |
   | *roll* | 0,5 |
   | rebote ofensivo | 0,5 |
   | corte | **0,0** |

4. **Las faltas de tiro solo llegan de la penetración:** 3,0 por partido y equipo. De *roll*, rebote ofensivo o ayuda tardía, ~0.

## 3. Pases interiores (12% perdidos en BT6)

Ledger por pase, receptor a < 5 m del aro, 3 semillas:

- **43,7 por partido, 5,3 perdidos (12,2%).**
- **Resultado de los perdidos:** 12 desviados y 4 interceptados. En 15 de 16, el ladrón es el defensor que llegaba primero a la línea.
- **Causa** (clasificación excluyente, por partido):

  | causa | perdidos |
  |---|---|
  | receptor en movimiento (corte o *roll* a > 3 m/s) | **3,0** |
  | línea ocupada (holgura > 0,25 s) | 1,7 |
  | pasador presionado | 0,7 |
  | mala ejecución | 0 |
  | receptor no disponible | 0 |

- **Riesgo percibido por el pasador:** 0,07 en los perdidos, frente a 0,06 en los completados. Sin embargo, la holgura real del defensor era **+0,39 s** en los perdidos, frente a −0,22 s en los completados.

**Causa raíz:** el pasador lee la línea hacia donde está el receptor, pero el balón se lanza hacia donde estará (el punto de recepción). Para un cortador o un *roller* son líneas distintas, y en la verdadera hay un defensor. El mismo error hace que también se infravalore el tiro del cortador (se valora a mitad de corte, no en el aro).

## 4. Robos (0,138 por posesión en BT6)

Neutra, los dos equipos, por partido:

| tipo | robos |
|---|---|
| desvío | 8,2 |
| intercepción | 7,3 |
| robo limpio en el bote | 6,3 |
| balón golpeado | 0,7 |

- Los pases interiores perdidos (≈ 5 por partido y equipo, todos robos) son la cuarta parte de los robos.
- La plantilla de creación sufre **11,0 intercepciones**, la mayor parte en pases a receptores en movimiento.

## 5. Controles

| configuración | penetraciones | aro | FTr | pase fuera | aro (acto) | *closeout* atacado | segunda penetración |
|---|---|---|---|---|---|---|---|
| neutra | 48,5 | 15,6% | 0,08 | 18,5 | 10,5 | 0,8 | 0,2 |
| contención de élite (`oppDefense`) | 47,3 | 11,0% | 0,08 | 21,0 | 7,7 | 0,7 | 0,8 |
| ayuda alta (ataque visitante) | 50,3 | 24,1% | 0,21 | 17,5 | 16,5 | 0,8 | 0,2 |
| ayuda baja (ataque visitante) | 56,8 | 27,4% | 0,10 | 17,2 | 20,0 | 0,2 | 0,5 |
| creador de élite contra defensa normal | 37,5 | 15,9% | 0,09 | 16,7 | 11,5 | 0,0 | 0,2 |
| creador de élite contra defensa de élite | 33,8 | 16,9% | 0,08 | 14,2 | 10,5 | 0,0 | 0,2 |
| entrenador A | 56,7 | 18,6% | 0,11 | 18,3 | 14,0 | 0,5 | 0,0 |
| entrenador B | 52,0 | 13,7% | 0,11 | 19,7 | 9,2 | 0,7 | 0,7 |
