# WSR1 · Arquitectura de simulación BACKGROUND

Rama `world-sim-wsr1-background-resolution`, desde `4da33d1` (MatchEngine exacto bloqueado).

WSR1 añade un tercer nivel de resolución, BACKGROUND, a la **simulación del mundo**. No es baloncesto de MatchEngine: Match Next (FULL/FAST) sigue siendo la única autoridad exacta y no se ha tocado (§6).

## 1. Niveles

| Nivel | Motor | Para qué | Exacto |
|---|---|---|---|
| FULL | Match Next con presentación | el partido que el usuario mira | sí |
| FAST | Match Next sin presentación | competición del usuario, competiciones activas, partidos importantes | sí, idéntico a FULL |
| BACKGROUND | modelo agregado de World Simulation | volumen del mundo lejano | no; certificado estadísticamente contra FAST |

## 2. Frontera

```text
CANONICAL MATCH INPUTS  (GameWorld -> prepareMatchSetup: disponibilidad, plan de rotación del entrenador,
        │                perfiles de jugador, planes tácticos, reglas de la competición, fatiga)
        ├── FULL / FAST ── Match Next (posesiones, espacio, decisiones) ──────────── MatchNextResult
        └── BACKGROUND ─── BackgroundMatchModel (resultados de posesión agregados) ─ BackgroundMatchResult
                                                     │
                      completeResolvedMatch (una cadena canónica para todos los niveles)
                      resultado + clasificación + MatchStatLog (con procedencia) + fatiga/desarrollo
                      + elegibilidad + cierre de temporada + lesiones post-partido
```

Las dos ramas consumen **el mismo `MatchSetup` preparado**: el que produce `prepareMatchSetup` desde el mundo. BACKGROUND no tiene autoridades de entrada propias:

- usa los jugadores disponibles ese día;
- usa el plan de rotación canónico (titulares, minutos previstos, profundidad);
- usa la identidad táctica canónica: `tacticalIntent` de Match Next, que ya dobla los deseos del entrenador hacia lo que permite la plantilla;
- usa los roles de quinteto canónicos (`lineupRoles`);
- usa la probabilidad canónica de tiro libre (`freeThrowProbability`);
- usa las reglas de la competición (`clockRules`, `resolveFoulRules`).

No existe un `BackgroundTeamRating`. Los resúmenes por equipo (medias ponderadas por minutos previstos) son derivados temporales de esas entradas.

## 3. Modelo (`src/engine/world-sim/background/`)

| Fichero | Contenido |
|---|---|
| `BackgroundFeatures.ts` | entradas derivadas del `MatchSetup`, y vectores de rasgos compartidos por el colector FAST, la calibración y el modelo |
| `BackgroundModelParams.ts` | contrato de parámetros (tasas, reparto entre jugadores, tiro, minutos, acciones, fatiga) |
| `backgroundModelV1.ts` | parámetros **generados** por la calibración, con versión `bg-v1` y procedencia |
| `BackgroundMatchModel.ts` | `simulateBackgroundMatch(setup)` → `BackgroundMatchResult` |

**Cadena de un partido:**

1. **Minutos** (`realizeMinutes`): la cuota de banquillo es una tasa ajustada sobre FAST (de la cuota prevista, la longitud de periodo, la calidad del banquillo…). Dentro de titulares y banquillo, los minutos siguen el plan con ruido de partido; suman exactamente 5 × la duración del partido. Tras el partido, los problemas de faltas pasan minutos del jugador cargado a sus compañeros (pendiente ajustada sobre FAST).
2. **Tasas de equipo**: cada ataque contra la otra defensa, y viceversa. Son lineales en un único vector de rasgos (calidades de ataque frente a calidades de defensa, intención táctica de los dos, contexto) y cubren: ritmo, pérdidas, viajes a tiros libres, rebote ofensivo, asistencias, *and-ones*, robos, tapones, faltas sin tiros libres y cuota de banquillo.
3. **Tiro, de abajo arriba**:
   - el tirador sale de un reparto ajustado (minutos × exp(β·habilidades relativas));
   - su zona (aro, media, triple), de un logit multinomial de **sus** rasgos (nivel, sesgo tirador/finalizador, altura, roles canónicos), la intención de su equipo y la defensa rival;
   - su acierto, de una regresión logística por zona con las mismas entradas.

   El perfil de tiro del equipo emerge de sus tiradores.
4. **Realización**: cada posesión acaba en pérdida, viaje a tiros libres o tiro, con cadenas de rebote ofensivo. **No hay espacio, tiempo ni decisiones**: solo recuentos de resultados.
5. **Cada evento se acredita a un jugador** con repartos ajustados (rebote, asistencia, pérdida, robo, tapón, falta) × minutos. Por eso el equipo es la suma de sus jugadores por construcción: puntos, tiros, rebotes, faltas, minutos.
6. **Prórroga**: si hay empate se juegan prórrogas con la duración de la competición, y sus minutos se reparten según la confianza del entrenador.
7. **Carga**: recuentos esperados de las acciones que FAST premia (penetraciones, bloqueos, pases, ayudas defensivas…) por minuto, ajustados sobre FAST. Con ellos se calculan la carga de eventos y la fatiga de sesión, en las mismas unidades que Match Next.

**Lo que BACKGROUND no produce, a propósito:**

- historial de posesiones, acciones o eventos;
- espacio;
- *frames*;
- jugadas pedidas.

El resultado lo dice con su forma: `BackgroundMatchResult` no tiene `events` ni `finalState`. Nunca se fabrican eventos.

**Más/menos**: BACKGROUND no conoce los quintetos de cada momento. Reparte 5 × el margen en proporción a los minutos. Es una estimación declarada.

**Determinismo**: una corriente propia (mulberry32) con semilla `world-sim-background-<versión>:<matchSeed>:<gameId>`. El mismo modelo, `MatchSetup` y semilla dan el mismo resultado. No comparte consumo de aleatoriedad con FAST (§8 del enunciado).

## 4. Frontera canónica de resultado

| Pieza | Cambio |
|---|---|
| `completeResolvedMatch` (`app/matchNext/applyMatchNextResult.ts`) | **una** cadena para todos los niveles. Cada nivel aporta su `MatchStatLog` y sus consecuencias por jugador; el resto es común |
| FAST/FULL (`completeMatchNext`) | sus derivaciones son las de siempre, aritmética incluida. La tabla de estímulo de desarrollo pasa a ser `MATCH_ACTION_STIMULUS`, con los mismos valores |
| BACKGROUND (`app/worldSim/BackgroundMatchCompletion.ts`) | `MatchStatLog` con el mismo contrato (5 titulares, puntos = marcador, segundos enteros). Fatiga de carrera con la misma conversión (`matchSessionFatigueDeltaToCareer`). Estímulo con la misma tabla, sobre recuentos esperados |
| `MatchStatLog` | procedencia opcional: `resolution` (FULL/FAST/BACKGROUND) y `backgroundModelVersion`. El guardado la lee y la conserva. Las partidas anteriores a WSR1 no la tienen |

Lesiones, elegibilidad, clasificación, estadísticas de temporada y cierre de temporada leen el `MatchStatLog` y el `Game`, **no** el nivel que los produjo. Ningún subsistema necesita saber cómo se simuló un partido.

## 5. Día del mundo

`app/game/matchResolution.ts` mantiene las tres fases de ME-LOCK1.1:

1. **Preparar** todo desde el mundo del inicio del día, con semillas en orden de calendario, y decidir el nivel de cada partido (`decideResolutions`).
2. **Simular**: los exactos en el *runner* (pool de *workers*); BACKGROUND en línea, porque cuesta menos de un milisegundo y no necesita *worker*.
3. **Aplicar** en orden de calendario por la frontera única, con una validación del mundo por día.

Los *workers* nunca tocan el `GameWorld`. Un fallo deja el día `FAILED` sin aplicar nada.

**Opción de día**: `advanceGameDayWithResult[Async](…, { simulationDetail })` acepta el ajuste de detalle del usuario. Sin ella, `simulationDetailFor(world)`, que hoy devuelve el valor por defecto; es la costura para un ajuste persistido.

## 6. Bloqueo del MatchEngine

| Comprobación | Resultado |
|---|---|
| `src/engine/match-next/` | sin cambios en WSR1 (solo se importan autoridades canónicas: intención táctica, roles, tiros libres, faltas, estado inicial) |
| Mundo completo FAST frente a `4da33d1`, 2 días, 8 partidos de duración real | 250 de 251 dominios idénticos. El único distinto es `matchStatLogsByGameId`, por el campo nuevo de procedencia |
| Motor legado | sigue en cuarentena. El guardián detectó un nombre en conflicto (`completeMatch`) y se renombró a `completeResolvedMatch` |

## 7. Lesiones, desarrollo, finanzas

| Sistema | Cómo lo alimenta BACKGROUND |
|---|---|
| **Lesiones** | `applyPostMatchInjuries` decide por jugador y por segundos jugados del `MatchStatLog`. BACKGROUND aporta minutos reales: no hace más seguras las competiciones lejanas. No hay lesiones dentro del partido en Match Next |
| **Desarrollo** | el mismo estímulo por minuto y por acción. BACKGROUND usa recuentos esperados calibrados sobre FAST (el certificado compara estímulo por minuto) |
| **Finanzas / asistencia** | sin atajos: consumen el resultado canónico |

## 8. Información de *scouting*

- Un resultado BACKGROUND aporta resultado y estadística: lo que publica un acta.
- No aporta observación de acciones, porque no las hay: no tiene eventos.
- Una misión `LIVE_GAME` activa sobre un partido lo **sube a FAST** (política, §2 del documento de política).

Así, la evidencia detallada solo existe donde hubo simulación detallada. La procedencia del `MatchStatLog` permite a *scouting* distinguirlo.
