# WorldDB V2-05: universo multiliga

Rama `playable/worlddb-v2-05`, derivada del head certificado de #170.
La PR #170 se integró en main como `dd1a778e11f5e2ba2cd20d3b80a9e350782c0fa2`
el 27 de octubre de 2026, después de las nueve comprobaciones correctas.
El estado exacto anterior al merge está en `evidence/worlddb-v2-05/pr170-ci-before-merge.json`.

## Conexión

NEW GAME permite elegir fecha, semilla, ligas activas y el club de una de ellas.
Las proyecciones certificadas se ensamblan antes de arrancar el reloj: una sola
colección normalizada de personas, jugadores, clubes, competiciones, temporadas,
contratos y hechos financieros. Las identidades PBM no se renombran y una colisión
con datos diferentes impide crear la carrera. Todas las selecciones deben compartir
maestro, fecha y semilla. El resultado es un único GameWorld y un único Save V4.

Se reutilizan los cuatro formatos existentes: Endesa (18), Betclic Élite (16),
Serie A (16) y NBB (20). No se amplían bases ni reglamentos. Las SQLite de trabajo
que crea el Runtime congelado son las proyecciones ya utilizadas por el adaptador;
no son nuevas bases maestras ni partidas que avancen por separado.

El día compartido utiliza Calendar y MatchEngine Next exacto para las cuatro ligas,
con los workers existentes en Windows. La selección multiliga usa el presupuesto
DETAILED de 64 encuentros; las cuatro ligas tienen como máximo 35 encuentros diarios.
No se conecta otra simulación deportiva. Estadísticas, lesiones, fatiga, Staff,
Contracts, Finance y entrenamiento conservan sus autoridades actuales.

El coordinador existente genera la sucesora de cada edición terminada sin mover
el reloj ni esperar a otra liga. Los objetivos del consejo solo cambian para los
participantes de esa competición. El selector existente de Competition consulta
las otras ligas; cambiar de liga quita el filtro de calendario «Mi equipo».

Save V4 conserva las cuatro colecciones y su procedencia. El nuevo campo opcional
`activeCompetitionIds` no es necesario para cargar guardados anteriores. El pin
del Runtime congelado y los formatos existentes se mantienen.

## Alcance del mercado

La búsqueda de Market y las peticiones de scouting admiten las identidades públicas
de las plantillas de todas las ligas activas; no conceden conocimiento de ratings
ni de disposición a negociar. Los universos anteriores conservan su alcance previo.
Las operaciones entre clubes
usan los contratos generados y `BDM_TRANSFER_POLICY_V1`, con la aprobación existente
de jugador, vendedor, Governance y Finance. Esa política es una política ficticia
ya presente en BDM; no representa una autorización federativa internacional.
No se han añadido ITC, permisos de trabajo, cupos ni nuevas reglas internacionales.
Las negativas por contrato, plantilla, autoridad y financiación siguen vigentes.
No se inventan ascensos, descensos ni clasificación europea entre estas ligas.

## Evidencias

La aceptación deportiva larga se ejecuta únicamente con la fuente local y
activación explícita. Las pruebas sintéticas de CI verifican el ensamblaje de los
70 clubes, los 1.166 partidos regulares, las identidades, los conflictos de fuente,
la resolución exacta y Save V4 sin depender de esa fuente privada.

Los primeros 30 días terminan el 3 de noviembre de 2025: 45 partidos de España,
40 de Francia, 40 de Italia y 50 de Brasil, con actas FAST, fatiga y lesiones en las
cuatro ligas. El guardado y su auditoría están en `evidence/worlddb-v2-05`.

La temporada compartida termina con **1.297 partidos**: 328 de España (306 regulares),
265 de Francia (240), 266 de Italia (240) y 438 de Brasil (380). Los campeones de
esta simulación son FC Barcelona Bàsquet, LDLC ASVEL, Umana Reyer Venezia y Botafogo
de Futebol e Regatas. Cada edición tiene su propio cierre, historia y sucesora.
Al 11 de octubre de 2026, las siguientes ediciones ya tienen 9, 8, 8 y 10 partidos
respectivamente: **35 encuentros nuevos**, con las temporadas anteriores intactas.

La certificación conserva los calendarios derivados existentes. En esta partida,
Francia e Italia terminan su liga regular en abril y juegan sus eliminatorias en
septiembre; Brasil también cierra en septiembre/octubre. Son calendarios de una
temporada ficticia, no una reconstrucción de fechas históricas. No se desplazan
sus finales para sincronizarlas con España.

El fichaje probado lleva al jugador `pbm:DYN_joueur:100017735` de Basquete Cearense
a Casademont Zaragoza mediante el flujo contractual existente. Conserva PersonId,
PlayerId e historial; la ejecución repetida se rechaza y el nuevo estado sobrevive
a Save V4. La búsqueda visible de Market se comprueba por las cuatro ligas.

Windows prueba una carrera creada mediante NEW GAME, la jornada compartida de 35
partidos, la consulta de otras ligas y guardar/cerrar/cargar/continuar. También carga
los checkpoints completos de 30 días y de continuidad preparados por el motor y
compara todo el payload persistente antes de continuar. No se afirma que los 1.297
partidos se hayan pulsado manualmente. La jornada nativa de 35 partidos tarda
27.018 ms en la máquina de aceptación (12 procesadores lógicos, otras pruebas en
ejecución); el frontend utiliza su pool existente de ocho workers.

La prueba larga inicial serial se retomó desde el checkpoint del 3 de diciembre
con ese mismo pool y bundle FAST mediante transporte Node. Se compara un resultado
MatchNextResult completo con el motor de origen antes de usarlo. La certificación
final verifica todas las actas, clasificaciones y campeones, no suma cuatro carreras
aisladas ni presenta el tramo interrumpido como una ejecución finalizada.

Los guardados y capturas originales se conservan en `.worlddb-v2/universe-05`
y `.worlddb-v2/native-universe-05-*`. El guardado de entrega comprimido está en
`evidence/worlddb-v2-05/certified-universe.save.json.gz`; su SHA y el del ejecutable
se registran en `artifacts.json`. El JSON sin comprimir está en
`artifacts/certified-universe.json`.

## Repetición

```powershell
$env:BDM_WORLDDB_UNIVERSE='1'
npx vitest run src/app/game/WorldDbV2Universe.test.ts --maxWorkers=1
# Solo después de certificar day-30-acceptance.json:
$env:BDM_UNIVERSE_SEASON='1'
$env:BDM_UNIVERSE_RESUME='.worlddb-v2/universe-05/day-30.json'
# Opcional: mismo bundle/pool exacto que Windows, transporte worker_threads de Node.
# Ejecutar npm run build y certificar WorldDbV2UniverseWorkers.test.ts con
# BDM_UNIVERSE_WORKER_PROOF=1 antes de activar BDM_UNIVERSE_WORKERS=1.
npx vitest run src/app/game/WorldDbV2Universe.test.ts --maxWorkers=1
$env:BDM_UNIVERSE_MARKET='1'
npx vitest run src/app/game/WorldDbV2UniverseMarket.test.ts --maxWorkers=1
node scripts/playable/worlddb-v2-05-windows.mjs
Remove-Item Env:BDM_WORLDDB_UNIVERSE,Env:BDM_UNIVERSE_SEASON,Env:BDM_UNIVERSE_RESUME,Env:BDM_UNIVERSE_WORKERS,Env:BDM_UNIVERSE_MARKET -ErrorAction SilentlyContinue
```

La prueba de temporada resuelve decisiones obligatorias mediante acciones del
store; no elimina decisiones del guardado. Los avances usan la frontera de día
de producción. La aceptación Windows crea una carrera nueva por los controles
de NEW GAME y usa perfiles de guardado nuevos.

## Regresión global final

PASS: 835 archivos cubiertos exactamente una vez en cuatro particiones, 5766 pruebas aprobadas, 66 omitidas, 0 pendientes TODO y cero fallos. Los informes JSON y logs completos se conservan junto a `certification.json`.

La primera pasada global había arrancado antes de la corrección final de visibilidad del mercado y falló en esa nueva aserción. Su log se conserva; no se utiliza como evidencia de PASS. La repetición completa se ejecutó con el código final congelado. Typecheck, build de Vite/Tauri Windows, cargo fmt/check y las 18 pruebas Rust también pasan. Las 54 comprobaciones de fuentes protegidas y los hashes de los 27 archivos F4 se mantienen.
