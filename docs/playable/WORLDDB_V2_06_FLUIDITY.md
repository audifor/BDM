# BDM WorldDB V2-06 — fluidez y sesión real

## Alcance e integración

PR #171 se integró después de comprobar sus nueve checks satisfactorios y fijar el head
`64849345f3c1629d9148db28246cf3820a3d47fc`. Merge en main:
`708af37514166ec99caf2c6c79cb109e84c595a1`. Evidencia: [CI previa](evidence/worlddb-v2-06/pr171-ci-before-merge.json).
El trabajo V2-06 vive en `playable/worlddb-v2-06`, worktree separado. El checkout F4 de `C:/BDM` queda protegido.

Se conservan las cuatro competiciones, 70 clubes y autoridades existentes. No se añaden reglamentos,
bases, motores, bonus por intervención manual ni reglas de transferencias.

## Medición controlada

Windows, Tauri debug con frontend de producción embebido, WebView2 Edge 155, i5-12400F
(6 núcleos físicos/12 lógicos), 64 GB. Tres procesos/perfiles nuevos por versión.
Sin otras pruebas o compilaciones durante estas mediciones. La escritura de evidencias, hashes,
capturas y transporte de resultados completos quedan fuera del intervalo de avance.

El punto inicial es el Save V4 certificado V2-05 del 4 de octubre de 2025. Los 35 encuentros reciben,
en orden de calendario, semillas `151617..151651`. Se contrastan tanto todos los `MatchNextResult`
(incluidos eventos) como el estado persistente completo; solo se normalizan las claves JSON y el
orden por ID de los eventos de gobernanza, conforme a Save V4.

- Jornada de 35 partidos: mediana original **20.530 ms**; candidata **21.351 ms**. Rangos
  originales 20.285–21.696 ms y candidatos 21.213–21.554 ms. **No hay mejora demostrada en esta jornada**;
  la mediana candidata resulta un 4,0 % mayor. No se presenta como aceleración.
- Preparación: medianas 771 y 779 ms. Workers: 18.818 y 19.635 ms. Aplicación/calendario/pintado
  después del último resultado: 933 y 928 ms. Guardado: 1.585 y 1.602 ms.
- Seis días siguientes sin encuentros: medianas acumuladas **1.604 → 1.441 ms**, mejora **10,2 %**.
  Rangos 1.526–1.619 ms y 1.388–1.444 ms. Se ejecutan todos los procesos diarios ordinarios.
- Consulta de autoridad de instalaciones en siete días, perfil fuente: **337 → 3,8 ms** en 71 llamadas,
  48 repetidas para el mismo mundo/club. Es un coste anidado; no debe sumarse otra vez al total.
- Se probaron también 6 y 11 workers. Fueron más lentos y se descartaron. Se conserva el máximo de ocho.

Los perfiles fuente de siete días separan estadísticas (16,9/18,3 ms) y proyección de fatiga/aprendizaje
(298,0/300,4 ms), anidadas en la aplicación de resultados (683,5/692,0 ms). No se acredita mejora en ellas.
Los archivos `phases-before.json` y `phases-after.json` conservan todas las fases por fecha, incluidas
recuperación, entrenamientos, medicina, finanzas y publicación. Las fases no ejecutadas no se contabilizan
como trabajo optimizado. Los nueve archivos de mediciones nativas conservan los tiempos y hashes por repetición.

El cuello de botella sigue siendo MatchEngine. No se modifica su lógica deportiva para conseguir cifras mejores.
La optimización aplicada indexa una vez las relaciones de instalaciones por mundo inmutable, organización y fecha,
y reutiliza la autoridad ya calculada. Un comando o cambio de fecha crea otra clave; el índice nunca se guarda.

La UI publica fases y conteos de encuentros **terminados**, sin porcentajes ni tiempos inventados.
Se cede el hilo antes de preparar y antes de aplicar consecuencias, fuera de los scopes de validación síncrona.
La publicación del universo sigue siendo atómica y en orden de calendario. Persisten bloques síncronos
de aproximadamente 0,9 segundos al aplicar/pintar los 35 resultados: la respuesta no es instantánea en ese tramo.

## Determinismo y límite entre entornos

Las tres repeticiones Windows de cada versión producen exactamente el mismo estado y los mismos 35 resultados:

- Universo de la jornada: `3799277a29fd27807bfb60a1aa7542f4aebf8b99ef3f5764468235639505e6b1`.
- Resultados/eventos: `7d0c9a6949089173f4a42ad40d0d259436b816edd9915e873b8b46719252b7c7`.
- Universo al 11 de octubre: `a3f0acd5fbdc7ff9a0b32de056e3f4805262785f6249bedae00f617206ddae08`.

La versión anterior ya presenta diferencias entre Node 24/V8 13.6 y WebView2/V8 15.5 para los mismos inputs.
Se verificaron los 35 setups idénticos, las semillas y los bytes del worker. Diferencias de último bit en
funciones matemáticas divergen después en decisiones deportivas: el primer ejemplo auditado es `passQuality`
del evento 502 del partido brasileño 0001. Por eso se exige igualdad antes/después **dentro de cada runtime**;
no se afirma igualdad binaria entre Node y Windows. V2-06 no cambia fórmulas para ocultarlo.

## Problemas UX corregidos

- Progreso de jornadas y avance por fechas basado en resultados reales, visible en el pie existente y el modal.
- Bloqueo global durante avance por fechas, incluido el intervalo pendiente tras Escape; se evita iniciar otro partido a la vez.
- Errores y decisiones obligatorias de avance visibles en Match, en lugar de promesas rechazadas sin explicación.
- Estado del pie diferenciado para partido en directo y reloj mundial detenido.
- Lecturas de clasificación, presentación, play-by-play y snapshot visual reutilizadas entre repintados del mismo frame/mundo.
  El perfil en directo localizó 1,94 segundos de CPU en clasificación durante 30 segundos observados.
  Ese perfil de atribución coincidió con la suite global y no se usa como comparación controlada de latencia.
  La prueba controlada de `Simular final` mantiene aproximadamente tres segundos (medianas 2.977 y 2.983 ms):
  no se atribuye una aceleración a ese control. Los seis universos resultantes, con acta FULL completa,
  coinciden exactamente: `19d495a5345875cd96a8c30196e8c5d5848e7659864cd4acfb50d266c535eb24`.
- NEW GAME con semilla `worlddb-v2-universe-06` fallaba al seleccionar el agente libre original brasileño
  `DYN_joueur:100047903`, sin nombre. El overlay BDM filtra identidades opcionales que no cumplen el contrato
  Player antes de ordenar/seleccionar agentes libres. No se fabrica nombre ni se modifica el master o Runtime V1.
  La selección V2-05 permanece exactamente igual en los cuatro países; se conserva la auditoría de IDs.
- Contratar al antiguo entrenador como asistente fallaba porque la validación de una fachada Coach sin puesto
  de primer entrenador rechazaba cualquier asignación Staff. Ahora rechaza específicamente una asignación
  `headCoach`; puede trabajar como asistente con la misma Person, perfil Staff e historial Coach.
  El test también conserva el rechazo del caso realmente inválido y la exigencia de asignación única del primer entrenador empleado.

## Consecuencias funcionales

Tres ramas parten del mismo Save V4, con 70 clubes y las mismas semillas por fecha/encuentro. Se avanza
14 días y se conserva cada universo completo tras guardar/cargar. El primer partido, antes de decisiones
diferentes, tiene exactamente la misma acta en las tres ramas: seleccionar una política no concede un bonus.

- A contrata a Jesus Ramirez, persona original ya desempleada, por el proceso existente de vacante,
  candidatura, entrevista y oferta con Finance. Delega `createTeamTrainingPlan` en él y utiliza el
  planificador semanal existente. Se registran 11 decisiones delegadas aplicadas. Fatiga media final 22,38;
  cohesión 50; 11 jugadores disponibles; coste salarial anual activo del staff 135.000.
- B combina sesiones razonables, recuperación y selección según disponibilidad/fatiga. Fatiga media 3,11;
  cohesión 56,92; 12 disponibles; coste salarial anual activo del staff 72.000.
- C programa sobrecarga de fuerza y un quinteto deliberadamente débil. Fatiga media 64,69; cohesión 50;
  12 disponibles; coste salarial anual activo del staff 72.000.

Estas cifras describen esta ventana y semilla. La alta fatiga no garantiza una lesión ni una derrota en un
partido concreto; la muestra no permite afirmar superioridad competitiva. La diferencia salarial de A procede
del contrato del asistente, no de un coste artificial por delegar. Se conservan también caja, salud financiera,
lesiones, participación y minutos reales de cada acta; no se inventan movimientos de caja cuando no existen.
No se afirma que las rotaciones del usuario se hayan delegado: los cambios en pista utilizan la autoridad existente del motor.

## Aceptación Windows y guardados anteriores

El recorrido nuevo duró **17,48 minutos**, mediante el ejecutable Tauri con frontend embebido:
NEW GAME, club español, plantilla, rotaciones guardadas, entrenamiento programado, mercado, partido,
consecuencias, semana siguiente, guardar/cerrar/cargar/continuar. El primer encuentro se conservó una
sola vez con acta FULL. Se consultó Francia durante el procesamiento de los otros 34 partidos, con
conteos reales visibles, y después las clasificaciones de las cuatro ligas.

El estado final es del 12 de octubre de 2025 y contiene 70 actas: España 18, Francia 16, Italia 16 y Brasil 20.
El guardado antes del cierre y el recuperado son idénticos en todo el payload persistente normalizado;
se continuó al día siguiente desde la UI. Las capturas muestran sesiones ejecutadas, disponibilidad,
redistribución automática de minutos tras una lesión, finanzas y estado personal en Courtside existente.

También se cargó el certificado V2-05 de temporada completa/sucesoras en el ejecutable nuevo. Se
conservaron exactamente sus 1.358 actas, se guardó, cerró, cargó y continuó del 12 al 13 de octubre de 2026.
La regresión fuente verifica además los cuatro campeones anteriores, las identidades globales y el checkpoint de 30 días.

La contratación del asistente se verificó también desde Courtside: abrir vacante, identificar al candidato
original desempleado, entrevista, oferta, confirmar contrato y asignar la planificación del entrenamiento
en modo sencillo. El guardado nativo contiene la responsabilidad delegada al mismo StaffProfile original,
sin aumentar el número de personas o perfiles. Se conservaron capturas de contratación y asignación.

## Reproducción

1. Compilar con `npm run tauri -- build --debug --no-bundle --config src-tauri/tauri.worlddb-v2.conf.json -- --offline`.
2. Situar el ejecutable anterior en `artifacts/bdm-baseline.exe` y el candidato en `artifacts/bdm.exe`.
3. Descomprimir `evidence/worlddb-v2-06/opening.save.json.gz` en `.worlddb-v2/v2-06/opening.json`.
   Su SHA-256 está en `day-before.json`. Para repetir la comparación, compilar la versión anterior
   desde el commit base en otro worktree y conservarla como `bdm-baseline.exe`.
4. Ejecutar `scripts/playable/worlddb-v2-06-benchmark.mjs`, con `BDM_BENCH_LABEL`, `BDM_BENCH_EXE` y
   `BDM_BENCH_REFERENCE` para la candidata. La original usa `BDM_BENCH_LABEL=baseline-profiled-8`;
   genera también el `world-1.json` utilizado como inicio de la medición semanal.
   No ejecutar otras pruebas mientras mide.
5. Ejecutar `worlddb-v2-06-week.mjs` con `BDM_WEEK_LABEL`, `BDM_WEEK_EXE`, `BDM_WEEK_REFERENCE`.
6. La sesión real usa `worlddb-v2-06-session.mjs`: perfiles nuevos, controles Courtside, capturas,
   quince minutos de partido a 2× y el control existente `Simular final` para ejecutar todos los ticks
   restantes, semana siguiente, otras clasificaciones, guardado, cierre, carga y continuación.
7. Consecuencias: `BDM_V206_CONSEQUENCES=1 npx vitest run src/app/game/WorldDbV2Consequences.test.ts`.
   Perfil de fases/semanas: `BDM_V206_PROFILE=1 ... WorldDbV2Fluidity.test.ts`.

Los scripts no acceden al perfil de guardado habitual del usuario. El manifiesto final de evidencias registra
versiones, validaciones y artefactos de la sesión. Superar comprobaciones técnicas no demuestra que el juego sea divertido.

La suite global se ejecuta con los presupuestos ya definidos en `.github/workflows/ci.yml`:
`npm test -- --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`.
El primer intento local con el valor por defecto de 5 segundos tuvo timeouts bajo carga y se conserva
como intento interrumpido; no se modificaron aserciones ni presupuestos de los tests para resolverlo.
La repetición aislada del archivo F3 pasó sus ocho pruebas, incluido Save V4 en 6,3 segundos.

Un intento de sesión llegó a completar el partido y avanzar las cuatro ligas, pero el guion interpretó
un aviso de rotación como bloqueo. La versión corregida distingue los avisos de preparación —el cuerpo
técnico redistribuye los minutos cuando cambia la disponibilidad— de los errores o decisiones que sí
impiden avanzar. Los avisos se conservan en la evidencia; no se ocultan en el producto. Se guarda además
un checkpoint después del partido antes de comprobar la siguiente semana.

## Cierre técnico

Suite global: **783 archivos y 5.775 pruebas aprobadas**, cero fallos; 57 archivos/69 pruebas
desactivados por sus condiciones habituales. Consecuencias y regresiones optativas se ejecutaron
expresamente por separado. Typecheck, build nativo, formato/check Rust y sus 18 pruebas pasan.
Las 27 protecciones F4 y las 54 comprobaciones de fuentes certificadas permanecen intactas.

Tras terminar la suite se repitieron secuencialmente la jornada de 35 encuentros, los seis días
siguientes y el partido FULL con el ejecutable final. Sus hashes completos coinciden con los anteriores.
Son comprobaciones finales de igualdad, no una nueva muestra comparativa de rendimiento.
El manifiesto `certification.json` identifica el ejecutable y el guardado entregados por SHA-256.
