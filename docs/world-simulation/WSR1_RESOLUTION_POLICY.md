# WSR1 · Política de resolución de simulación

`src/app/worldSim/SimulationResolutionPolicy.ts` (`decideResolutions`): una autoridad fuera de Match Next que decide, para cada partido de un día, su nivel (FULL, FAST o BACKGROUND).

## 1. Entradas

| Entrada | Detalle |
|---|---|
| Mundo canónico | equipo del usuario, participantes de cada competición, misiones de *scouting*, `Game.stakes` |
| Ajuste de detalle del usuario | `SimulationDetailSettings` |
| Contexto opcional | el partido que el usuario mira en directo |

**Nunca el hardware.** La misma partida resuelve el mismo mundo en cualquier máquina; si el nivel dependiera de los núcleos, dos jugadores con la misma semilla tendrían mundos distintos. El hardware puede servir para *proponer* un ajuste en la interfaz; la decisión lee el ajuste.

## 2. Reglas V1, por prioridad

| # | Caso | Nivel | Motivo |
|---|---|---|---|
| 1 | Partido del equipo del usuario | FULL si lo mira en directo; FAST si no | `USER_GAME` |
| 2 | Partido observado por una misión `LIVE_GAME` activa | FAST | `LIVE_SCOUTING`: sube **ese** partido, no todos los del jugador observado |
| 3 | Nivel `MINIMAL` | todo lo demás BACKGROUND | `MINIMAL_DETAIL` |
| 4 | Otro partido de una competición del usuario | FAST | `USER_COMPETITION`: la burbuja de alto detalle más segura |
| 5 | Competición marcada de bajo detalle | BACKGROUND | `LOW_DETAIL_COMPETITION` |
| 6 | Resto | exactos mientras quede **presupuesto exacto del día**, por prioridad y en orden de calendario dentro de cada una; lo que no cabe, BACKGROUND (`OVER_BUDGET`) | ver abajo |

Prioridades dentro del presupuesto (regla 6):

1. competiciones de alto detalle (`HIGH_DETAIL_COMPETITION`);
2. partidos eliminatorios o finales, solo si `promoteKnockoutGames` (`KNOCKOUT_GAME`): no se hacen exactos por defecto todos los *playoffs* del mundo;
3. el resto (`WITHIN_BUDGET`).

No hay competiciones fijas como «siempre FAST»: ni ACB ni NBA. Decide la configuración o el contexto.

## 3. Ajuste y presupuesto

```ts
SimulationDetailSettings = {
  level: 'MINIMAL' | 'STANDARD' | 'DETAILED',
  highDetailCompetitionIds, lowDetailCompetitionIds,
  exactBudgetPerDay?,          // si se omite, el del nivel
  promoteKnockoutGames,
}
```

| Nivel | Presupuesto exacto por defecto (además de los obligatorios) |
|---|---:|
| MINIMAL | 0 (y la competición del usuario también en BACKGROUND) |
| STANDARD | 24 |
| DETAILED | 64 |

El presupuesto no es un 20 fijo: es configuración. Los valores por defecto son conservadores. Con STANDARD, los mundos actuales (≤ 9 partidos al día) quedan **completamente exactos**, y la producción de hoy no cambia de comportamiento.

Coste medido de un partido exacto: ~2 s de CPU. Con 6 *workers*, 12–16 exactos al día cuestan ~7–9 s (ver informe de rendimiento). Un presupuesto de 24 ronda los 12–15 s solo de simulación exacta. Ese número sirve para el ajuste de la interfaz: Minimal, Standard o Detailed.

## 4. Costuras

| Costura | Dónde | Estado |
|---|---|---|
| Ajuste persistido | `simulationDetailFor(world)` | hoy devuelve el valor por defecto. Cuando exista, leerá el ajuste del mundo o de la carrera |
| Ajuste por llamada | `advanceGameDayWithResult[Async](…, { simulationDetail })` y `simulateRemainingGamesToday[Async](…, { simulationDetail })` | disponible |
| Interfaz | — | no se construye en WSR1 |

## 5. Promoción y degradación

**El nivel se decide cada día y no se guarda en ningún sitio salvo en la procedencia de cada resultado.** Por eso, si el usuario cambia de club:

- la competición nueva pasa a FAST desde el día siguiente;
- la vieja vuelve al presupuesto o a BACKGROUND;
- nada del mundo se rompe.

Tampoco se inventa historia: un partido BACKGROUND pasado no gana posesiones ni eventos al cambiar el nivel. Sus resultados, estadísticas, clasificación e historial siguen siendo válidos y canónicos. La prueba «switching resolution mid-season» comprueba que los `MatchStatLog` BACKGROUND anteriores quedan intactos tras días FAST.

## 6. Determinismo

`decideResolutions` es pura: mismo mundo, mismo ajuste y mismos partidos dan la misma decisión. Las semillas se extraen en orden de calendario, independientemente del nivel, y la aplicación es en orden de calendario. La prueba de día mixto compara el mundo en línea con el de un pool que responde en orden inverso: es idéntico.
