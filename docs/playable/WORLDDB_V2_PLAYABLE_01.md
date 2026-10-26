# BDM Playable 01 · WorldDB V2

## Alcance y estado

Piloto jugable de Liga Endesa desde los registros originales PBM de WorldDB V2. Rama `playable/worlddb-v2-01`, worktree `C:\BDM-worktrees\worlddb-v2-01`, base `c1905549d87ca1a11797ae5cadc348e2ccf557c9`. El checkout original `C:\BDM` y sus cambios locales de F4 se conservan; no se importa ni se da por certificada esa fase sin commit.

**PASS del piloto**, certificado el 26 de octubre de 2026. La aceptación funcional nativa ha pasado: arranque real de Tauri, origen V2, selección de fecha/club, Courtside, plantilla y jugador, competición/calendario, MatchViewer y motor real, acta, estadísticas, clasificación, avance de un día, Save V4, cierre, reapertura, recarga, continuidad e independencia de una segunda carrera. La [certificación final](evidence/worlddb-v2/certification.json) distingue estas comprobaciones de los controles generales del repositorio.

Resultado general: **5722 pruebas pasan, 51 omitidas de las suites opcionales existentes, 0 fallos** (774 archivos de pruebas aprobados y 46 omitidos). Las cuatro pruebas nuevas de integración PBM se ejecutaron y pasaron. También pasan 18 pruebas Rust, 54 verificaciones de fuentes protegidas, TypeScript, compilación frontend, `cargo fmt`, `cargo check` y compilación del ejecutable nativo. La interfaz Tauri completó sus ocho pasos de aceptación, sin errores de consola. No se han fusionado cambios con `main`.

El piloto contiene 18 clubes y 255 jugadores originales. Hay 307 registros de identidad en el GameWorld del ensayo, incluido el entrenador creado por el usuario. La carrera A quedó el 6 de octubre de 2025 con nueve partidos completados; la B se creó de forma independiente el 1 de julio de 2032, con los 306 encuentros inicialmente pendientes.

## Arrancar y jugar en esta máquina

Ejecutable con frontend integrado:

```powershell
Set-Location C:\BDM-worktrees\worlddb-v2-01
$env:BDM_SAVE_PROFILE = 'partida-a'
.\src-tauri\target\debug\bdm.exe
```

Alternativa de desarrollo, con Vite en el puerto independiente 1435:

```powershell
.\start-worlddb-v2.cmd partida-a
```

En la pantalla inicial:

1. `NEW GAME` → `WORLDDB V2 · PBM`.
2. Carpeta de fuente: `C:\BDM_DB\WORLDDB_PBM` (editable; contiene las carpetas V2 y Runtime V1).
3. Elegir fecha y semilla. El valor inicial es `2025-07-01`. Para llegar directamente al primer partido del ensayo nativo, usar `2025-10-04`.
4. Seleccionar `Liga Endesa` y un club original, por ejemplo `Casademont Zaragoza`.
5. Completar el entrenador, incluida su nacionalidad, y pulsar `START CAREER`.
6. En Courtside consultar `ROSTER`, abrir un jugador y su pestaña `ATTRIBUTES`. En el menú `Partidos y competición`, abrir `COMPETITION` o `SCHEDULE`.
7. Llegado el día del partido, pulsar `MATCH` → `JUGAR PARTIDO`. El visor permite jugar en directo o `Simular final`; ambos pasan por MatchEngine. `Continuar` publica el acta en el mismo GameWorld.
8. `AVANZAR UN DÍA` ejecuta la frontera diaria real. `CONTINUE` puede recorrer varios días hasta el siguiente evento o una decisión pendiente.
9. Menú BDM → `GUARDAR PARTIDA`. Cerrar la aplicación y volver a abrir con el mismo perfil; `CONTINUE` en la pantalla inicial carga el Save V4 y permite continuar.

Para una segunda partida independiente, iniciar con `BDM_SAVE_PROFILE=partida-b`, o `.\start-worlddb-v2.cmd partida-b`. Los perfiles aceptan letras ASCII, números, guion y guion bajo. No cambie el perfil mientras una instancia esté abierta. La selección de perfil pertenece al arranque y no añade un gestor de guardados nuevo.

Para continuar directamente la carrera certificada en esta máquina:

```powershell
$env:BDM_SAVE_PROFILE = 'acceptance-1792960023158'
C:\BDM-worktrees\worlddb-v2-01\src-tauri\target\debug\bdm.exe
```

El perfil de la segunda carrera certificada es `acceptance-1792960023158-b`. Sus copias de evidencia están en `.worlddb-v2\windows-1792960023158\partida-a.json` y `partida-b.json`. Son guardados nativos producidos desde la interfaz; no son mundos inyectados por pruebas.

Guardados del piloto:

`%APPDATA%\com.bdm.worlddbv2.pilot\saves\profiles\partida-a\main.json`

Sin perfil explícito se usa `saves\main.json` dentro del mismo identificador aislado del piloto. La aplicación original `com.bdm.app` y sus guardados no se modifican. El script de aceptación usa perfiles únicos propios y verifica la huella del guardado original antes/después.

## Procedencia y conversiones

Se reutilizan `available`, `build` y `Universe` de Runtime V1 desde un puente Python incluido en el ejecutable. Python se ejecuta con `-B` y UTF-8; no escribe cachés en Runtime V1. La raíz de la fuente se recibe como parámetro. `BDM_PYTHON` permite elegir otro ejecutable Python. La maestra se abre mediante el acceso certificado de solo lectura y debe coincidir con su SHA-256.

La selección automática confirma los 18 clubes almacenados de la competición española y sus plantillas originales. No se inventan participantes ni jugadores. Los IDs de clubes y personas conservan los espacios de nombres del runtime (`pbm:DYN_equipe:*`, `pbm:DYN_joueur:*`, `pbm:DYN_person:*`). Se conservan nombres, nacimientos, nacionalidades, posición derivada de las aptitudes explícitas PBM y las medidas disponibles. Las referencias compatibles de pabellones y ciudades se trasladan como hechos físicos; capacidad cero se trata como desconocida, sin inventar propiedad, derechos de uso o estado de conservación.

Los atributos PBM no se multiplican arbitrariamente para fingir atributos BDM. El piloto completa perfiles con los generadores **existentes** `generateCanonicalRatings`, la factoría `createPlayer` y sus tendencias, `generateCanonicalDevelopmentProfile`, `generatePlayerBio` y `generateInitialTeamStaff`. Sus salidas se validan con los contratos reales: 80 atributos y el catálogo completo de tendencias aceptados por MatchEngine. Los atributos de personal BDM se expanden reversiblemente al transporte legado de 80 valores; la proyección existente recupera exactamente sus 13 atributos canónicos. No se representan esos atributos generados como mediciones PBM.

Los entrenadores originales se seleccionan de las personas del club usando su preferencia explícita de entrenador. La creación del entrenador del usuario reutiliza `appointCreatedUserCoachToWorldDbClub`; no suplanta una identidad original PBM.

Los importes de PBM no se convierten a euros o a otra escala sin un contrato verificado. Se conserva el acceso de referencia en el SQLite inicial; el estado económico jugable se inicializa con las autoridades ya existentes de `GameBalanceBootstrap` y Finance. La procedencia se etiqueta `BDM_GAME_BALANCE_NOT_PBM`. Los contratos históricos PBM no se redatan ni se convierten en nuevos contratos activos; la plantilla inicial puede mostrar `No consta` en contrato. No se certifican aquí fichajes o renovaciones para esos casos sin contrato nativo.

La barra superior señala permanentemente `PBM identities · BDM-generated profiles` en estos universos; su descripción distingue identidad/físico disponible de atributos, alcance y economía generados. Save V4 conserva la procedencia, semilla, fecha inicial y hash de la maestra mediante un campo opcional validado. Los sobres anteriores conservan su contrato; los validadores de contenido obligatorio no se relajan.

## Reglas, calendario e identidades de competición

Se conserva **sin cambios** el bundle compilado `phase1-competition-runtime-bundle.json`, incluidas su huella BLAKE3 y sus reglas existentes. La copia local permite arrancar sin una ruta absoluta externa a ese archivo. `WorldDbSessionV1` abre y valida el repositorio de proyección, y `bootstrapGameWorldFromWorldDb` construye el GameWorld con la factoría, el calendario y el generador de calendario existentes.

La identidad nativa de competición/plantilla de reglas sigue siendo `competition:ESP:liga-endesa` / `edition:ESP:liga-endesa:2025-26`, exigida por el bundle inalterado. La identidad fuente `pbm:DYN_championnat:5` se conserva explícitamente junto a su alias nativo en la procedencia de Save V4. No se afirma que SQLite V2 tenga esquema DDL: el adaptador produce DTO compatibles con el contrato DDL de la aplicación, identificados como `worlddb-v2-projection:<SHA>`. Los IDs PBM de clubes y personas no se sustituyen por los del antiguo universo de prueba ACB.

La edición lógica de juego tiene ID y fechas propios, calendario de 306 partidos nuevos y resultados inicialmente vacíos. La etiqueta de la temporada y la procedencia indican ficción. La plantilla de reglas 2025-26 no equivale a disponer de datos históricos de otra fecha. Para fechas posteriores se reutiliza el desplazamiento de calendario que ya ofrece BDM y se rotan sus días de semana por la diferencia del día de apertura: se conserva la cadencia relativa de referencia, sin afirmar que sea el calendario oficial futuro. Esta adaptación de parámetros evita que la jornada 34 quede fuera de la ventana al desplazar años. No se importan resultados antiguos. Se omite la ventana especial de Copa porque esa competición no forma parte del piloto. No se implementan reglamentos, desempates, playoffs ni motores deportivos nuevos.

Los clubes y las personas representan el estado almacenado en PBM, cuya referencia temporal es 1 de julio de 2025; no se certifica que esa población sea el censo histórico exacto de cada fecha elegida. Solo se ofrece la competición del piloto; las demás se explican como no disponibles para esta integración nativa. Los dos generadores históricos opcionales permanecen desactivados.

La fecha elegida es el inicio de la carrera. El piloto elige la siguiente ventana regular completa de su plantilla de calendario: una fecha posterior al 4 de octubre utiliza la edición del año siguiente. Así no se rellenan con resultados inventados los partidos anteriores al inicio elegido. Esta política se aplica únicamente a la inicialización del piloto, con el planificador existente.

## Persistencia y contratos reales

`TauriWorldDatabaseRepository.ts` y `WorldDbSession.ts` se mantienen como autoridades de sus contratos. El repositorio específico de V2 cumple la misma interfaz para el origen convertido. `WorldDbGameBootstrapSliceV1` es completo y pasa el validador original; el bundle de reglas pasa su parser original. Las pantallas existentes y las acciones de `gameStore` consumen el GameWorld resultante, sin un segundo mundo sintético de demostración.

`GameSaveRepository.ts` y `GameSaveService.ts` mantienen sus servicios reales. Se añade únicamente la persistencia opcional y estricta de procedencia a Save V4 y la selección de perfil al localizador nativo de guardados. El SQLite de Runtime creado en el directorio de datos de la aplicación documenta la selección inicial; la progresión jugable y los perfiles completados viven en el GameWorld del Save V4. La continuación no vuelve a inicializar jugadores ni regenera el universo.

## Pruebas reproducibles

```powershell
npx vitest run src/app/game/WorldDbV2Playable.test.ts --maxWorkers=1
python scripts/playable/worlddb-v2-verify-sources.py
node scripts/playable/worlddb-v2-windows-acceptance.mjs
npm test -- --maxWorkers=6 --testTimeout=180000 --hookTimeout=600000 --reporter=verbose
npm run typecheck
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --offline
cargo test --manifest-path src-tauri/Cargo.toml --offline
```

Para reconstruir el ejecutable integrado:

```powershell
npm run tauri -- build --debug --no-bundle --config src-tauri/tauri.worlddb-v2.conf.json -- --offline
```

Se usan las dependencias ya instaladas y el caché Rust existente. El worktree actual enlaza `node_modules` con la instalación existente; no modifica dependencias de producción. En otra máquina se necesitan las dependencias normales de desarrollo de BDM, Python y las fuentes congeladas indicadas por la configuración.

Los ensayos automáticos construyen la selección desde V2 real, pasan por el arranque de producción, las acciones reales de Courtside y MatchEngine, y guardan/cargan archivos Save V4 reales. También comprueban la fecha de referencia y una fecha ficticia futura y rechazan procedencia incompleta.

El límite predeterminado de cinco segundos de Vitest vence en pruebas existentes de mundo completo: se reprodujo el timeout de `PlayableF3AB` en un worktree limpio de `c1905549`, sin esta integración. La repetición de `PlayableF3AB` y `StaffScreen` con un límite de 60 segundos pasó sus 57 comprobaciones sin cambiar aserciones ni código de esas pruebas. Por eso los comandos anteriores especifican tiempos adecuados para estas pruebas de simulación completas.

El ensayo Windows arranca el ejecutable Tauri con frontend integrado, utiliza los controles existentes mediante el arnés WebView2/CDP del repositorio, genera capturas, cierra/reabre procesos y comprueba el archivo nativo. No sustituye comandos Tauri ni inyecta un GameWorld. Las diferencias de orden de claves JSON se normalizan al comparar, manteniendo el orden y los valores de todas las listas. Las capturas se revisan por separado de las aserciones automáticas.

Las evidencias locales están en `.worlddb-v2`: bases iniciales, dos guardados nativos, informes de aceptación y capturas. `worlddb-v2-verify-sources.py` verifica 54 huellas de artefactos congelados, originales protegidos y bundle de reglas. No reescribe las certificaciones V2/Runtime V1.

Evidencia incluida en la rama: [aceptación nativa](evidence/worlddb-v2/native-acceptance.json), [hechos y hashes de ambos guardados](evidence/worlddb-v2/native-save-facts.json), [atributos](evidence/worlddb-v2/player-attributes.png), [clasificación tras el partido](evidence/worlddb-v2/competition-after.png), [acta](evidence/worlddb-v2/match-report.png) y [reapertura](evidence/worlddb-v2/reopened.png). Las capturas se han inspeccionado visualmente; la secuencia completa se ha ejecutado con controles reales de Tauri mediante el arnés de automatización del proyecto.

## Límites concretos

Se certifica el ciclo jugable del piloto, incluido partido, estadísticas, clasificación, avance y persistencia. No se certifica en esta fase una temporada completa hasta el campeón, la semántica de todos los desempates o la ampliación a otras competiciones. Se conservan las autoridades deportivas existentes y sus límites. Los perfiles generados no reconstruyen el talento real de los jugadores originales. No se adaptan BTW, selecciones nacionales ni los generadores históricos bloqueados. No hay cambios de diseño en Home, Player, Roster, Tactics o Competition.
