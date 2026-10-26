# WorldDB V2-02: temporada, continuidad y mercado PBM

La carrera de Liga Endesa conserva los clubes y las personas originales PBM y utiliza los motores existentes de BDM para disputar la temporada, gestionar contratos y continuar en la siguiente edición. La fuente sigue siendo el estado PBM de 2025-07-01: las fechas elegidas inicializan una carrera ficticia, no una reconstrucción histórica.

**Estado de alcance: temporada, continuidad jugable y mercado esencial PASS; GLOBAL PARTIAL.** El cierre contable formal automático no tiene una autoridad ejecutable existente y no se ha inventado para declarar un PASS global. La contratación general de staff tampoco se incluye en la certificación PBM de esta entrega. La limitación contable no bloquea disputar, guardar y continuar la carrera, y se distingue del rollover fiscal y de autorizaciones que sí funciona.

## Integración y alcance

PR #167 está fusionada en `main`, merge `b78c778fec5fe6e511100be9adcb24531d9563b6`. Su árbol coincidía con el commit certificado `0158086c`; V2-02 incorporó el merge mediante avance directo, comprobando que los archivos locales conservaban sus hashes. El checkout `C:\BDM` sigue en `playable/f4` con sus 27 entradas de trabajo pendiente. No se han modificado BTW, PBM, V1, V2, Runtime V1 ni los guardados anteriores.

Esta entrega cambia la inicialización PBM y su certificación. No cambia MatchEngine, reglamentos, desempates, formato de playoffs, calendario, mercado F3, Finance, Governance, desarrollo anual ni el motor de guardado.

## Resultado deportivo y continuidad

- Liga regular: **306/306 encuentros**, 18 clubes con **34 partidos** cada uno, 306 parejas dirigidas distintas y un acta por resultado.
- Playoffs: **22 encuentros** adicionales, resueltos por los módulos existentes. **Real Madrid (`pbm:DYN_equipe:50`) campeón**, registrado con `championSource: postseason` el 2026-06-26. Había terminado cuarto en la fase regular: no se eligió al líder por conveniencia.
- La auditoría vuelve a leer los 328 resultados guardados y verifica todos los marcadores contra las actas, la suma de puntos de los jugadores y las victorias, derrotas, puntos a favor y en contra de la clasificación histórica. Todos los encuentros usaron resolución exacta `FAST`/`FULL`, sin acortar períodos ni sustituirlos por BACKGROUND.
- Se resolvieron nueve interrupciones de decisión mediante las acciones existentes, sin desactivar bloqueos. El estado registró 119 lesiones, 1.861 sesiones programadas de entrenamiento, 26.594 eventos de estímulo y 254 reconocimientos de gasto.
- El cierre creó `generated-season-0001` con otros **306 encuentros**, conservando institución, clubes, jugadores e historial. La transición repetida es idempotente.
- Desde ese guardado se avanzó día a día hasta disputar **los nueve partidos de la primera jornada de la nueva edición**. Sus actas y clasificación se comprobaron. Los 328 encuentros anteriores y el campeón permanecieron idénticos.
- Se ejecutó `annual-development:2026`: 315 historiales de desarrollo y 94 cohortes agregadas juveniles; no se recrearon identidades PBM ni se materializaron personas sin demanda. Finance creó los períodos y autorizaciones del nuevo ejercicio mediante la política existente.
- En Tauri se cargó esa segunda edición, se consultó su clasificación, se avanzó, guardó, cerró, reabrió y continuó hasta **2026-10-14**.

La temporada completa se ejecutó en la prueba de aplicación con el GameWorld PBM y los motores de producción. La aceptación Windows verificó los guardados resultantes y la continuación mediante controles reales. No se afirma haber clicado los 328 partidos individualmente en Windows.

## Contratos, personas y economía

Los 255 jugadores de plantilla reciben contratos sintéticos mediante `generateInitialPlayerContract`, antes de generar presupuestos y activar Finance. La política contractual es la misma política ficticia sin tope de F3 (`createAcbDemoSalaryRulesV1`), con duraciones de 1 a 5 años; no es una afirmación sobre la regulación económica real de ACB. Los importes y fechas originales `DYN_contrat` permanecen como referencia en V2 y en los snapshots del adaptador: no se reinterpretan ni se redatan.

Save V4 conserva procedencia explícita `BDM_GENERATED_INITIAL_V1_PBM_REFERENCE_ONLY`. Los guardados del piloto anterior siguen siendo válidos y no se les añaden contratos silenciosamente al cargarlos. Para la nueva inicialización contractual debe crearse una carrera V2-02.

Se identificaron 53.183 originales vivos, no retirados y sin club. Cada carrera activa **como máximo 60**, seleccionados reproduciblemente por semilla entre originales masculinos, españoles, de 18 a 40 años en la fecha elegida y con nacimiento válido. El escenario de mercado tenía 705 elegibles; el de octubre, 707. Todos conservan IDs `pbm:DYN_joueur:*`. Sus perfiles deportivos faltantes se generan con los generadores BDM existentes. No se crean personas para rellenar este mercado.

El adaptador activa esas rutas en su propio archivo de universo, después de la selección del Runtime congelado. No modifica Runtime V1 ni el maestro. Finance materializa los presupuestos iniciales generados como autorizaciones canónicas; esos datos iniciales no autorizan operaciones por sí mismos. La auditoría de consumidores Finance clasifica explícitamente este punto como `SEED_GENERATION`.

## Mercado probado en Courtside Windows

La misma carrera nativa de Zaragoza ejecutó, mediante sus pantallas y controles:

1. Búsqueda y contacto de **Serge Konan**, originalmente sin club, con información deportiva sin evaluar y salario todavía desconocido.
2. Respuesta al día siguiente, oferta de 110.000 por un año con rol de rotación, aprobación de Governance y firma.
3. Renovación por dos años, con sucesor que empieza cuando vence el contrato vigente y sin solapamiento.
4. Liberación de **Joaquin Rodriguez**, retirándolo de la plantilla y conservando las obligaciones garantizadas de Finance.
5. Negociación con Bàsquet Girona por **Sander Hollanders**: compensación de 100.000, contrato de 105.000 anuales por dos años, respuesta del club, respuesta del jugador, autorización y ejecución. El vendedor dejó de tenerlo y el comprador lo incorporó.
6. Asignación de Konan al quinteto y participación efectiva en MatchEngine. Hay acta nativa y minutos registrados, además de la captura del MatchViewer.
7. Guardado, cierre, recarga y continuación hasta 2025-10-05, conservando contratos, finanzas y operaciones. Se probaron también copias independientes del guardado de prepartido para estabilizar la automatización de WebView2; no se reconstruyó el universo.

Las cinco pruebas focales PBM comprueban además rechazo real por `INSUFFICIENT_AUTHORIZED_HEADROOM`, rechazo del jugador, contacto inelegible, integridad ambigua por contrato duplicado y repetición idempotente de firma, renovación, liberación y traspaso. Una comprobación complementaria de frontera contractual verifica el vencimiento del predecesor y activación del sucesor sobre el contrato PBM negociado; esa comprobación no simula ni sustituye los días intermedios.

Los eventos de Governance son un mapa canónico por ID. Su orden en el array de transporte puede normalizarse al cargar: la comparación nativa verifica todos los registros íntegros por ID, sin ordenar rondas de negociación ni otras secuencias con significado.

## Cobertura y límites

La [matriz automática](evidence/worlddb-v2-02/compatibility.json) cubre exactamente las 102 selecciones inicializables de Runtime V1: **1 PLAYABLE, 0 COMPATIBLE, 2 PENDING y 99 UNSUPPORTED**.

Betclic Élite y LBA Serie A tienen 16 participantes y documentos deportivos ya incluidos en BDM. Son candidatos a conectar sin escribir reglamentos nuevos, pero el selector/proyector PBM actual y su certificación nativa son exclusivos de Liga Endesa. Por eso no se presentan como COMPATIBLE ni PLAYABLE. Las otras 99 carecen de una correspondencia verificada con un formato deportivo indispensable; tener participantes en SQLite no acredita un motor jugable.

No se certifican aquí una segunda temporada entera, la integración de BTW, contratación general de staff ni otras competiciones. Se reutilizan los ciclos económicos existentes; no se ha añadido un cierre contable formal automático: los períodos históricos conservan el estado `OPEN` del modelo actual y la vigencia financiera se resuelve por sus fechas. El cierre deportivo, el rollover fiscal/autorizaciones y la continuidad jugable sí están comprobados. Los dos generadores históricos opcionales siguen desactivados.

## Jugar en Windows

En esta entrega local, el ejecutable con frontend incorporado está en `C:\BDM-worktrees\worlddb-v2-02\artifacts\bdm.exe`. Para continuar la segunda edición certificada:

```powershell
$env:BDM_SAVE_PROFILE='qa-continuity-02-1793007318238'
& 'C:\BDM-worktrees\worlddb-v2-02\artifacts\bdm.exe'
```

Pulsa **CONTINUE**. Para abrir la carrera con el mercado realizado, usa el perfil `qa-market-02-1793006471106`.

Para una carrera propia, elige un perfil nuevo, abre el mismo ejecutable y selecciona **NEW GAME → WORLDDB V2 · PBM**, la carpeta fuente, fecha, semilla, Liga Endesa y club. `2025-10-04` permite disputar el primer partido enseguida; es un ejemplo, no una temporada obligatoria. Cada perfil guarda en `%APPDATA%\com.bdm.worlddbv2.pilot\saves\profiles\<perfil>\main.json`.

Crear una carrera requiere Python y la entrega congelada de WorldDB/Runtime. Continuar un Save V4 utiliza su estado autónomo. En otro checkout con las dependencias ya disponibles se puede compilar con:

```powershell
npm run tauri -- build --debug --no-bundle --config src-tauri/tauri.worlddb-v2.conf.json
```

El ejecutable resultante normalmente queda en `src-tauri\target\debug\bdm.exe`. El lanzador de desarrollo existente `start-worlddb-v2.cmd <perfil>` también sigue disponible.

## Reproducir la certificación

La ejecución global final aprobó **775 archivos y 5.727 pruebas**, con 48 archivos/53 pruebas optativas omitidas y cero fallos. Los dos casos largos PBM pasaron por separado. También pasaron las nueve pruebas focales PBM, las cinco comprobaciones de mercado con frontera de vencimiento, las 13 de auditoría Finance, las 18 de Rust, TypeScript, compilación frontend/nativa, formato Rust y `cargo check`. Las 54 comprobaciones de fuentes y los hashes de tres guardados anteriores permanecen intactos.

```powershell
npm test -- src/app/game/WorldDbV2Market.test.ts src/app/game/WorldDbV2Playable.test.ts
$env:BDM_WORLDDB_SEASON='1'
npm test -- src/app/game/WorldDbV2Season.test.ts
Remove-Item Env:BDM_WORLDDB_SEASON
$env:BDM_WORLDDB_CONTINUITY='1'
npm test -- src/app/game/WorldDbV2Continuity.test.ts
Remove-Item Env:BDM_WORLDDB_CONTINUITY
python -B scripts/playable/worlddb-v2-season-audit.py
python -B scripts/playable/worlddb-v2-compatibility.py
python -B scripts/playable/worlddb-v2-verify-sources.py
```

La continuidad usa el último `successor.json` certificado o la ruta indicada en `BDM_WORLDDB_SUCCESSOR`; no vuelve a disputar la temporada anterior. Los casos largos son optativos en la suite normal y se ejecutaron expresamente en esta certificación. `WORLDDB_SOURCE_ROOT` y `BDM_PYTHON` permiten adaptar el entorno sin editar los cargadores.

`worlddb-v2-02-windows.mjs` crea una partida nativa aislada y prueba contacto/oferta/firma:

```powershell
node scripts/playable/worlddb-v2-02-windows.mjs
```

Después, usando el perfil que imprime:

```powershell
$env:BDM_NATIVE_PROFILE='<perfil qa-market-02 impreso por el primer recorrido>'
$env:BDM_NATIVE_STAGE='play'
node scripts/playable/worlddb-v2-02-windows.mjs
node scripts/playable/worlddb-v2-02-native-continuity.mjs
```

El segundo recorrido de mercado reabre ese estado, realiza gestión, llega al primer partido, utiliza al fichado y vuelve a abrir/continuar. El de continuidad requiere el guardado certificado de segunda edición. Todos los recorridos usan Tauri/WebView2 y controles renderizados, sin inyectar GameWorld ni simular comandos nativos.

Los resultados finales de validación, hashes y evidencias están en [certification.json](evidence/worlddb-v2-02/certification.json), [la auditoría deportiva](evidence/worlddb-v2-02/season-audit.json) y [la aceptación nativa](evidence/worlddb-v2-02/native-acceptance.json). Los guardados completos, snapshots y logs grandes se conservan localmente bajo `.worlddb-v2/` y no se incluyen en Git.
