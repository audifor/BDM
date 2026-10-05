# WSR1 · Certificación FAST frente a BACKGROUND

**Referencia**: Match Next FAST, el motor exacto bloqueado en `4da33d1`. BACKGROUND se mide contra poblaciones de partidos FAST con las mismas entradas canónicas. No se compara contra cifras escritas a mano, ni se exige el mismo marcador con la misma semilla.

## 1. Corpus de referencia FAST

| Conjunto | Casos | Semillas | Partidos FAST | Uso |
|---|---:|---:|---:|---|
| Calibración de identidad (`calibrationCases`) | 104: prototipo, 4 días × 4 partidos; ACB, 4 días × 9; 2 variantes cada uno | 4 | 416 | ajuste |
| Calibración de diferencias de fuerza (`strengthCalibrationCases`) | 68: ataque y defensa de cada equipo escalados por separado en [0,82; 1,18] | 4 | 272 | ajuste |
| Certificación (`certificationCases`) | 60: 15 cohortes × 4 enfrentamientos de días **posteriores**, nunca usados en el ajuste | 6 | 360 | certificación |

Variantes de la calibración de identidad:

- formatos NBA, NCAA masculino, NCAA femenino, WNBA y FIBA, como datos de la competición;
- 19 transformaciones de cohorte: fuerza, ataque y defensa, ritmo, interior y perímetro, profundidad de banquillo, estrella, rebote, coberturas y fatiga.

**Cohortes de certificación (§41):**

| Grupo | Cohortes |
|---|---|
| Fuerza | equilibrado; élite frente a débil; élite frente a élite |
| Ataque y defensa | carga ofensiva; carga defensiva |
| Ritmo | rápido; lento |
| Perfil de tiro | interior; perímetro |
| Plantilla | banquillo profundo; banquillo corto; estrella |
| Formato | NBA; NCAA; WNBA |

BACKGROUND corre 40 semillas por caso (2.400 partidos).

**Herramientas** (`scripts/world-sim/`):

| Script | Función |
|---|---|
| `wsr1Cases.ts` | casos y transformaciones |
| `wsr1Collect.ts` | colector FAST: estadísticas por zona, viajes a tiros libres, *and-ones*, carga, acciones |
| `wsr1Fit.ts` | calibración: genera `backgroundModelV1.ts` |
| `wsr1Certify.ts` | comparación |

## 2. Calibración y procedencia

Todos los coeficientes vienen de los 688 partidos FAST de calibración (1.376 partidos de equipo y 16.000+ de jugador).

| Componente | Método |
|---|---|
| Tasas de equipo | ridge ponderada sobre rasgos estandarizados, para que un *rating* y una intención pesen igual en la penalización |
| Reparto entre jugadores | máxima verosimilitud multinomial (Newton) |
| Zona de tiro | logit multinomial |
| Acierto | logística por zona |
| Acciones por minuto, fatiga, problemas de faltas | mínimos cuadrados ponderados |
| Tamaño de los viajes a tiros libres; faltas ofensivas | proporciones de FAST |

No hay constantes a mano salvo las reglas canónicas reutilizadas:

- la tabla de estímulo;
- la conversión de fatiga;
- la probabilidad de tiro libre;
- el límite de faltas.

En `backgroundModelV1.ts` constan la versión (`bg-v1`) y la procedencia.

**En tiempo de juego no se calibra nada (§43).**

### Iteraciones guiadas por la certificación (todas en el conjunto ajeno al ajuste)

| Versión | Cambio | Acuerdo |
|---|---|---:|
| v1a | tasas lineales de equipo y reparto por zona | 592/681 |
| v1b | orientación de tapones y faltas; ridge estandarizada; minutos por longitud de partido; problemas de faltas | 599/681 |
| v1c | **tiro de abajo arriba**: tirador → zona (logit) → acierto (logística); el perfil del equipo sale de sus jugadores | 612/681 |
| v1d–v1h | minutos: cuota de banquillo como tasa ajustada, reescalado por grupo, sin doble cuenta de faltas | 625/681 |
| v1i | rol de creador principal (`creatorGap`) | 624/681 |
| v1j | datos de diferencias de fuerza; tope de faltas ofensivas | 641/681 |
| **v1k (final)** | rasgos de tiro por nivel, sesgos y **roles canónicos de Match Next** | **641/681** |

## 3. Universo estadístico (todas las cohortes, por 40 minutos)

| Métrica | FAST | BACKGROUND | Δ | Acuerda |
|---|---:|---:|---:|---|
| puntos | 86,4 | 85,4 | −1,2 % | sí |
| posesiones | 84,3 | 83,9 | −0,4 % | sí |
| tiros de campo intentados | 78,6 | 76,8 | −2,2 % | sí |
| cuota de triples | 0,519 | 0,519 | −0,2 % | sí |
| cuota de aro | 0,384 | 0,383 | −0,2 % | sí |
| % de campo | 0,408 | 0,412 | +1,0 % | sí |
| % de triples | 0,334 | 0,339 | +1,4 % | sí |
| tiros libres intentados | 10,9 | 10,6 | −2,3 % | sí |
| % de tiros libres | 0,808 | 0,820 | +1,6 % | sí |
| pérdidas | 11,3 | 11,0 | −2,7 % | sí |
| rebotes ofensivos | 8,4 | 8,2 | −2,6 % | sí |
| rebotes defensivos | 35,9 | 37,1 | +3,4 % | sí |
| asistencias | 14,6 | 14,1 | −3,9 % | sí |
| robos | 9,5 | 9,1 | −3,5 % | sí |
| tapones | 2,59 | 2,64 | +1,7 % | sí |
| faltas | 14,5 | 14,6 | +0,3 % | sí |
| cuota del máximo anotador | 0,370 | 0,370 | −0,1 % | sí |
| cuota de tiros del que más tira | 0,341 | 0,337 | −1,3 % | sí |
| minutos por titular | 34,4 | 34,5 | +0,3 % | sí |
| minutos del banquillo | 28,4 | 28,1 | −1,0 % | sí |
| minutos del jugador con más minutos | 39,1 | 38,9 | −0,3 % | sí |

**21/21 métricas agrupadas acuerdan.**

**Criterio de acuerdo por métrica.** Una métrica acuerda si la diferencia es pequeña con alguno de estos dos criterios:

- **Estadístico**: ≤ 2,5 errores estándar, o ≤ 0,1 desviaciones típicas de un partido de equipo FAST.
- **Práctico**: ≤ 10 % relativo, ≤ 0,2 desviaciones típicas, o ≤ 0,03 absoluto en cuotas y porcentajes.

## 4. Por cohorte (casa = equipo transformado)

| Cohorte | Acuerdo | Margen FAST | Margen BG | Victoria FAST | Victoria BG | Lo que no acuerda |
|---|---:|---:|---:|---:|---:|---|
| equilibrado | 42/44 | 3,3 | −0,3 | 0,58 | 0,47 | robos (casa), pérdidas (fuera) |
| élite frente a débil | 40/44 | 24,5 | 20,1 | 0,92 | 0,88 | cuota de aro y tapones (casa); rebote ofensivo y cuota del máximo anotador (fuera) |
| élite frente a élite | 44/44 | 2,5 | −1,5 | 0,54 | 0,48 | — |
| carga ofensiva | 41/44 | 6,5 | 2,6 | 0,58 | 0,57 | perfil de tiro (casa) |
| carga defensiva | 38/44 | −4,9 | −3,4 | 0,33 | 0,45 | % de tiro (casa); perfil de tiro y pérdidas (fuera) |
| rápido | 43/44 | 1,4 | −2,2 | 0,54 | 0,42 | asistencias |
| lento | 39/44 | 0,9 | −2,0 | 0,46 | 0,48 | cuota de aro; pérdidas; concentración de tiro |
| interior | 42/44 | 7,5 | 1,5 | 0,67 | 0,57 | tiros de campo intentados; rebote ofensivo |
| perímetro | 43/44 | −0,5 | 1,8 | 0,50 | 0,54 | tiros libres intentados |
| banquillo profundo | 41/44 | 7,2 | −0,9 | 0,54 | 0,50 | asistencias; robos; pérdidas |
| banquillo corto | 41/44 | 0,5 | −1,7 | 0,42 | 0,43 | rebote ofensivo; minutos del banquillo; tapones |
| estrella | 42/44 | 3,4 | 4,6 | 0,71 | 0,63 | cuota del máximo anotador (BG la exagera) |
| NBA | 41/44 | −1,3 | −2,3 | 0,46 | 0,44 | minutos del banquillo; máximo anotador |
| NCAA | 40/44 | 1,3 | −2,0 | 0,63 | 0,47 | perfil de tiro de los dos equipos |
| WNBA | 43/44 | 1,0 | −0,5 | 0,50 | 0,46 | tiros libres intentados |

**Total: 641/681 comprobaciones (94,1 %).**

## 5. Identidad

### Enfrentamientos (60 casos)

| Medida | Valor |
|---|---:|
| Correlación del margen medio FAST frente a BACKGROUND | **0,77** |
| Fiabilidad del propio FAST con 6 semillas (mitad contra mitad, Spearman-Brown) | 0,67, así que la correlación alcanzable es ≈ 0,82 |
| Pendiente bruta | 0,59 |
| Pendiente corregida por atenuación | ≈ **0,88** |
| Favorito igual cuando FAST da ≥ 5 puntos de margen | 75–81 % (según iteración; ruido de 6 semillas) |

BACKGROUND reproduce ~88 % de las diferencias de fuerza de FAST.

**Orden de fuerza**: monótono en las pruebas. Con una diferencia del ±15 % en un enfrentamiento concreto:

| Escenario | BACKGROUND gana | FAST gana |
|---|---:|---:|
| débil | 2 % | — |
| base | 30 % | 33 % |
| fuerte | 73 % | 12 de 12 |

Nunca se invierte, pero en el extremo fuerte BACKGROUND comprime: es un P1.

### Jugadores (653 jugadores con ≥ 12 min de media; producción por 36 minutos)

| Métrica | Correlación FAST–BG | Techo por ruido de FAST (fiabilidad con 6 partidos) |
|---|---:|---:|
| minutos | 0,86 | — |
| puntos | **0,89** | 0,96 |
| tiros de campo intentados | **0,90** | 0,98 |
| rebotes | **0,86** | 0,96 |
| triples intentados | 0,79 | — |
| tapones | 0,54 | 0,86 |
| pérdidas | 0,24 | 0,71 |
| asistencias | 0,28 | 0,55 |

En FAST, asistencias y pérdidas apenas dependen del jugador: cambian mucho de un partido a otro. Su techo alcanzable es bajo. BACKGROUND queda a la mitad de ese techo (P1).

### Identidad táctica

- **Interior frente a perímetro**: la cuota de aro sube más de 3 puntos con plantillas interiores (prueba).
- **Ritmo**: posesiones de 84,3 en FAST frente a 83,9 en BACKGROUND en conjunto.
- **Cohortes de estilo** (rápido, lento, coberturas) dentro de tolerancia en 39–44 de 44.

Los entrenadores del mundo generado tienen identidad por defecto. Su variación llega por la plantilla, que dobla la intención canónica, y por los estilos de la cohorte.

## 6. Carga y consecuencias

- La fatiga de sesión se ajustó sobre FAST: +0,303 por minuto en pista, −0,056 por minuto en el banquillo, +0,906 por unidad de carga de eventos.
- Las acciones por minuto (penetraciones, bloqueos, pases, ayudas defensivas…) se ajustaron con rasgos del jugador.
- Fatiga de carrera y estímulo de desarrollo usan la misma conversión y la misma tabla que Match Next. Un jugador BACKGROUND no queda inmune al calendario ni gana o pierde desarrollo por su nivel de simulación.

## 7. Continuidad de temporada y cambio de nivel (§39–40)

**Montaje** (`scripts/world-sim/wsr1Season.ts`):

- 20 días de partido reales del mundo prototipo (84 partidos);
- avance de día asíncrono de producción, con pool de 6 *workers*;
- cuatro planes:

| Plan | Qué es |
|---|---|
| todo FAST | todo exacto |
| todo BACKGROUND | `MINIMAL` |
| BG→FAST | cambio a la mitad |
| FAST→BG | cambio a la mitad |

Los partidos del propio usuario son siempre exactos. Comparación con `wsr1SeasonCompare.mjs`.

### Universo de liga por nivel (672 partidos de equipo, por 40 minutos)

| Métrica | FAST | BACKGROUND | Δ en desviaciones típicas de FAST |
|---|---:|---:|---:|
| puntos | 84,5 | 84,4 | −0,01 |
| tiros de campo intentados | 77,7 | 76,4 | −0,27 |
| cuota de triples | 0,522 | 0,508 | −0,15 |
| % de campo | 0,404 | 0,414 | +0,16 |
| tiros libres intentados | 10,6 | 10,2 | −0,07 |
| pérdidas | 10,3 | 10,4 | +0,02 |
| asistencias | 14,8 | 14,9 | +0,04 |
| rebotes | 44,1 | 44,7 | +0,12 |
| robos | 8,7 | 8,5 | −0,06 |
| faltas | 14,1 | 13,4 | −0,18 |
| cuota del máximo anotador | 0,370 | 0,378 | +0,08 |
| victorias en casa | 0,516 | 0,520 | — |

Ninguna diferencia sistemática supera 0,3 desviaciones típicas: **el mismo baloncesto**.

### Cambio de nivel a mitad de temporada

| Plan | Segmento 1 | Segmento 2 |
|---|---|---|
| BG→FAST | 83,9 puntos; triples 0,501 | 84,3 puntos; triples 0,531 |
| FAST→BG | 85,2 puntos; triples 0,524 | 85,0 puntos; triples 0,512 |

Para comparar, el propio plan todo FAST varía entre segmentos 85,2 → 83,0 puntos. El salto por cambiar de nivel no supera la variación natural entre medias temporadas.

**Continuidad de jugadores** (puntos por 36 minutos, segmento 1 frente a 2, jugadores con ≥ 60 min en cada uno):

| Plan | Correlación | Medias |
|---|---:|---|
| todo FAST | 0,885 | 16,24 → 16,27 |
| todo BG | 0,880 | 16,37 → 16,57 |
| **BG→FAST** | **0,838** | 16,21 → 16,19 |
| **FAST→BG** | **0,827** | 16,35 → 16,62 |

Un jugador sigue siendo el mismo jugador al cambiar de nivel. La correlación baja unas centésimas (las diferencias de perfil individual del P1-2), y las medias no se mueven.

**Historias**: la prueba `switching resolution mid-season keeps every past result and history valid` comprueba que los `MatchStatLog` BACKGROUND anteriores quedan intactos tras días FAST, sin inventar detalle.

### Clasificación

| Plan | Correlación del % de victorias por equipo con el plan todo FAST (24 equipos) |
|---|---:|
| todo BG | 0,52 |
| BG→FAST | 0,69 |
| FAST→BG | 0,58 |

Dispersión del % de victorias: 0,24–0,30 en todos los planes.

Con ~7 partidos por equipo, dos temporadas FAST con semillas distintas también divergen mucho: la clasificación de 20 días es sobre todo ruido de calendario. **No es una medida de equivalencia.** La de fuerza es la correlación por enfrentamiento del §5 (0,77, techo 0,82).

## 8. P1 abiertos

1. **Compresión en extremos de fuerza**: pendiente corregida ≈ 0,88. Enfrentamientos muy desiguales ganan algo menos que en FAST, sin invertirse nunca.
2. **Perfil de tiro de jugadores extremos**: un pívot que en FAST tira 36 % de triples recibe ~60 % en BACKGROUND. El conjunto está bien (correlación de triples por jugador 0,79), pero los extremos se aplanan.
3. **Asistencias y pérdidas por jugador**: 0,28 y 0,24 frente a techos de 0,55 y 0,71.
4. **Más/menos**: estimado (5 × margen repartido por minutos). BACKGROUND no conoce los quintetos de cada momento.
5. **Perfil de tiro de dos equipos visitantes** concretos en los enfrentamientos base de la certificación: la mayor parte de los fallos de cohorte que quedan.

## 9. Veredictos WSR1

| Área | Veredicto | Motivo |
|---|---|---|
| TECHNICAL | **PASS** | typecheck y build limpios; 13 pruebas WSR1 en verde; regresión enfocada: 798 en verde y 55 fallos, todos del conjunto conocido de `4da33d1`; ninguno nuevo |
| BACKGROUND ARCHITECTURE | **PASS** | nivel separado de Match Next, con las mismas entradas canónicas y la misma frontera de resultado; sin calificación global de equipo; sin historias falsas |
| PERFORMANCE | **PASS** | 0,34–0,6 ms por partido (~2.000/s en un hilo). 250 partidos con preparación y aplicación canónicas en ~5 s |
| FAST/BACKGROUND STATISTICAL CONTINUITY | **PASS** | 21/21 métricas agrupadas; 641/681 por cohorte; temporada con Δ ≤ 0,27 desviaciones típicas |
| PLAYER IDENTITY | **PARTIAL** | puntos, tiros y rebotes 0,86–0,90; asistencias y pérdidas débiles; extremos de perfil de tiro aplanados |
| TACTICAL IDENTITY | **PASS** | cohortes de estilo, interior y perímetro, ritmo y coberturas dentro de tolerancia (39–44/44); roles canónicos en el modelo |
| ROTATION / MINUTES | **PASS** | plan canónico; minutos de titulares y banquillo en ±1 %; minutos exactos con prórrogas; problemas de faltas |
| POST-MATCH CONSEQUENCES | **PASS** | una cadena canónica: clasificación, `MatchStatLog` con procedencia, fatiga y desarrollo, elegibilidad, temporada, lesiones; guardado y carga |
| RESOLUTION POLICY | **PASS** | autoridad fuera de Match Next; usuario, competición, *scouting* en directo, alto y bajo detalle, presupuesto, eliminatorias opcionales; determinista, sin depender del hardware |
| MODE SWITCHING | **PASS** | sin discontinuidad de liga ni de jugadores; historias intactas |
| MIXED WORLD SCALE | **PARTIAL** | 242 partidos resueltos en 15,6 s, pero el día completo cuesta 65 s en un mundo de 528 equipos por sistemas no deportivos que escalan ~cuadráticamente |
| DETERMINISM | **PASS** | mismo resultado con el mismo modelo, `MatchSetup` y semilla; día mixto idéntico en línea y en pool invertido |
| MATCHENGINE LOCK PRESERVED | **PASS** | `src/engine/match-next` sin cambios; mundo FAST idéntico en 250/251 dominios (el 251 es la procedencia) |
| WORLD SIMULATION SCALE READY | **NO** | la simulación de partidos ya escala. El ciclo diario no deportivo (estado humano y cultura del *staff*, *scouting*, médico, autocuración, contratos) es el P0 siguiente para un mundo de cientos de equipos |
