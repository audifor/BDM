# F4A · Baseline de rendimiento

## Referencia heredada

F3.1 midió el bootstrap/simulación WorldDB comparable:

```text
advanceGameDay ×100 = 292338.6 ms
media = 2923.386 ms/día
```

Ese valor procede del test `WorldDbGameBootstrap.test.ts`, con el mundo WorldDB de referencia y sus fases completas de simulación. No se atribuye automáticamente a WorldDB: el coste incluye calendario, partidos, entrenamiento, Finance, staff, HRPG, lifecycle y validaciones.

## F4A

La misma prueba WorldDB ejecutada en la rama F4A registró:

```text
advanceGameDay ×100 = 248026.1 ms
media = 2480.26 ms/día

La misma suite también registró en una ventana mayor:

```text
advanceGameDay ×365 = 707299.8 ms
media = 1937.81 ms/día
```
```

La diferencia observada es de -44312.5 ms (-15.16 %) frente a F3.1. F4A cambia routing y presentación de autoridad, no el avance diario ni los motores de simulación; por tanto la mejora se registra, pero no se atribuye causalmente a F4A.

| Configuración | Tamaño/autoridad | Medición comparable | Resultado |
|---|---|---|---|
| WorldDB Spain/F3.1 | referencia WorldDB, 100 días | 100 días | 292338.6 ms / 2923.386 ms/día |
| WorldDB Spain/F4A | mismo test y fixture | 100 días | 248026.1 ms / 2480.26 ms/día |
| WorldDB Spain/F4A | mismo test y fixture | 365 días | 707299.8 ms / 1937.81 ms/día |
| ACB FIBA-like | fixture ACB test | no se ejecutó otra ventana de 100 días | sin evidencia de regresión de engine |
| Prototype NBA-like | mundo generado | no se ejecutó otra ventana de 100 días | routing certificado; rendimiento pendiente |
| NCAA simulated | fixture simulado | no se ejecutó otra ventana de 100 días | routing certificado; rendimiento pendiente |

La comparación de memoria máxima, personas, fases y tiempo Save/Load de las tres configuraciones queda pendiente de una campaña de rendimiento separada con la misma instrumentación y límites.
