# WSR2 · Rendimiento del ciclo diario

Misma máquina y mismos binarios de referencia que `WSR2_DAILY_LIFECYCLE_PROFILE.md`. La línea base (`e75bbcf`) se compiló desde `git archive e75bbcf` con el mismo arnés, y cada par antes/después se midió en la misma sesión.

## 1. Ciclo diario fuera de los partidos (ms)

`wsr2Lifecycle.ts`, detalle MINIMAL. Formato de cada celda: `e75bbcf → WSR2`.

| Equipos | Día de partidos | Tranquilo | Lunes (semanal) | Tranquilo |
|---:|---:|---:|---:|---:|
| 48 | 285 → **36** | 76 → **12** | 265 → **40** | 79 → **15** |
| 144 | 2.484 → **81** | 736 → **41** | 2.135 → **108** | 763 → **42** |
| 288 | 12.805 → **156** | 3.982 → **81** | 10.475 → **214** | 3.965 → **87** |
| 528 | 51.087 → **273** | 16.086 → **156** | 42.770 → **360** | 17.983 → **152** |
| 960 | — → **502** | — → **295** | — → **633** | — → **305** |
| 1.008 | — → **567** | — → **320** | — → **684** | — → **305** |

- A 528 equipos, el ciclo es entre **119** veces más rápido (lunes) y **187** veces más rápido (día de partidos).
- **Escala lineal.** El exponente empírico entre 48 y 1.008 equipos es ~0,93 (lunes) y ~1,0–1,1 (resto), frente a ~2,2 en `e75bbcf`.

### Fases a 528 equipos, día de partidos (ms)

| Fase | `e75bbcf` | WSR2 |
|---|---:|---:|
| `PRE_MATCH_SELF_HEALING` | 4.404 | 19 |
| `EXPIRED_CONTRACT_RECONCILIATION` | 2.618 | 3 |
| `SCOUTING_INTAKE` | 5.587 | 9 |
| `MEDICAL_AND_ROSTER_ADVISORIES` | 5.904 | 9 |
| `STAFF_HUMAN_STATE` | 22.443 | 81–131 |
| `STAFF_CULTURE_COHESION` | 9.420 | 76–85 |
| `DATE_ADVANCE` | 374 | 37–49 |
| `CAREER_FATIGUE_RECOVERY` | 330 | 46–54 |
| `STAFF_APPRAISAL` (lunes) | 607 | 52–58 |

## 2. Con carga de *scouting*

Con `WSR2_SCOUT=4`, cada equipo encarga 4 misiones: 1.056 asignaciones abiertas y 748 informes en 6 días a 528 equipos.

| Equipos | `e75bbcf`, ciclo por día | WSR2, ciclo por día | WSR2, `SCOUTING_ASSIGNMENTS` |
|---:|---:|---:|---:|
| 528 | 85–332 s | **154–420 ms** | |
| 960 | — | **320–788 ms** | 84–107 ms |

## 3. Día mixto: la prueba de producto

Configuración de WSR1: `wsr1Perf.ts mixed <copias> 12 worker 6`, con `advanceGameDayWithResultAsync` real y 6 *workers*. El partido del usuario y su competición se resuelven exactos, más 12 exactos de presupuesto; el resto, BACKGROUND.

| Equipos | Partidos | `e75bbcf`: resolución + resto = **total** | WSR2: resolución + resto = **total** |
|---:|---:|---|---|
| 48 | 22 | 13,5 + 0,27 = **13,7 s** | 14,9 + 0,03 = **15,0 s** |
| 144 | 66 | 13,7 + 2,5 = **16,2 s** | 14,8 + 0,09 = **14,9 s** |
| 288 | 132 | 14,4 + 12,9 = **27,3 s** | 16,6 + 0,16 = **16,7 s** |
| 528 | 242 | 18,1 + 53,1 = **71,2 s** | 17,6 + 0,29 = **17,9 s** |
| 960 | 440 | — | 23,1 + 0,51 = **23,6 s** |
| 1.008 | 462 | — | 22,7 + 0,53 = **23,3 s** |

En `e75bbcf`, el día de 528 equipos medía 65,5 s en el informe de WSR1 y 71,2 s al repetirlo en esta sesión. Los 16 partidos exactos en 6 *workers* fijan un suelo de ~13–15 s, que no depende del tamaño del mundo. La variación de ±1 s en la resolución entre sesiones es ruido de la máquina; Match Next no cambió.

## 4. Día solo BACKGROUND

El día 0 del arnés: todos los partidos en BACKGROUND, salvo el del usuario (exacto, ~3 s).

| Equipos | Partidos | Total | Resolución | Ciclo |
|---:|---:|---:|---:|---:|
| 528 | 242 | 6,8 s | 6,5 s | 0,27 s |
| 960 | 440 | 12,8 s | 12,3 s | 0,50 s |
| 1.008 | 462 | 13,6 s | 13,0 s | 0,57 s |

Por partido BACKGROUND (`wsr1Perf.ts bg`), en ms:

| Equipos | Preparar | Simular | Aplicar |
|---:|---:|---:|---:|
| 240 | 7,2 | 0,54 | 3,6 |
| 528 | 7,0 | 0,42 | 7,2 |
| 1.008 | 7,1 (antes de WSR2: 11,8) | 0,39 | **14,3** |

- La preparación ya es constante: la elegibilidad está indexada.
- La aplicación sigue creciendo con el mundo, porque cada partido copia los mapas de moral, fatiga y estímulo. Es el P1 principal.

## 5. Horizonte largo: 30 días a 528 equipos

814 partidos, 224 lesiones.

| Medida | Antes de los arreglos de historial | Ahora |
|---|---|---|
| lunes, `STAFF_HUMAN_STATE`, semanas 1–4 | 108 → 350 → 693 → 1.024 ms | 109 → 102 → 86 → 97 ms |
| lunes, ciclo completo | 378 → 676 → 1.003 → 1.362 ms | 386 → 356 → 362 → 376 ms |
| día de 44 partidos, resolución | 4,0 → 7,5 s (narrativas) | 1,0–3,4 s |
| día tranquilo, ciclo, días 5 → 29 | | 104 → 148 ms (lineal en el historial acumulado: una validación por fase y avisos médicos con más lesiones) |

## 6. Proyección a 1.000 equipos y factor de escala

1.008 equipos se midieron directamente: 9.576 jugadores, 2.520 miembros del staff y 462 partidos.

| Medida a ~1.000 equipos | Valor | Objetivo |
|---|---:|---|
| ciclo fuera de los partidos | 0,3–0,7 s | < 5 s fuerte |
| día mixto | 23,3 s | ≤ 20–25 s |
| día solo BACKGROUND | 13,6 s | — |

**Factor empírico de 528 → 1.008 equipos (×1,91):**

| Medida | Factor | Lectura |
|---|---:|---|
| ciclo | ×1,90–2,08 | lineal |
| resolución BACKGROUND | ×2,0 | ligeramente superlineal, por la aplicación por partido |

**Extrapolación a 2.000 equipos:**

| Medida | Valor |
|---|---:|
| ciclo | ~1,4 s |
| resolución BACKGROUND de ~920 partidos (preparar ~6,5 s + aplicar ~26 s) | ~33 s |
| día mixto | ~45 s |

Ese es el límite siguiente, el P1 de lotes de aplicación.
