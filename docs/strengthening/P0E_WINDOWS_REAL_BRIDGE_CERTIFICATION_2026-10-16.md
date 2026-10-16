# P0E · Certificación REAL del puente WorldDB → Tauri → GameWorld / Save V4

**Fecha:** 16/10/2026.  
**Resultado:** **PASS_P0E_SOURCE_BACKED_TAURI_AND_GAMEWORLD_SAVE_V4_FIXTURE**.  
**Evidencia original:** archivo recibido `BDM_P0E_GAME_BRIDGE_REAL_v3.zip`. El ZIP contiene exclusivamente un resumen JSON y tres logs de ejecución. No contiene SQLite ni datos personales del universo generado.

## Integridad de la evidencia

- ZIP válido, verificadas todas las entradas (CRC) y contenido, SHA-256: `177eacdbf116d82e6e88e6f2a088aca4586d0a44abb13308523cf8872c9559cf`.
- `p0e_game_bridge_summary.json`, SHA-256 `673619e43427d58bcf508f3fac007d1b370c0f80d79b2de338d92495ec16545e`.
- `p0e_tauri_readback.log`, SHA-256 `38a8f5cc7c4dd9db2f69e9ca297fc7f508cbb072e289c1c6e59f2a4b0e568e83`.
- `npm-ci.log`, SHA-256 `99ffce8561bb26e714e6b43f6feaa55717658850a6f1896ecac3b98e919298af`.
- `p0e_gameworld_save_v4.log`, SHA-256 `0e47cb7705510e502c55f5fbe251807c895de730ca54cfa2a959e06ae37271ff`.

## Tests ejecutados sobre el equipo del usuario

| Puerta | Evidencia | Estado |
| --- | --- | --- |
| Materialización previa de 20 PERSON P0C | `source_manifest_people=20` y hash manifest | Referencia externa; no se reabre aquí el ZIP de BDM-DB |
| Consumidor **real** Tauri `query_person` contra WorldDB persistente P0E | `p0e_read_persistent_worlddb_people_via_actual_tauri_person_adapter ... ok`; **1 passed, 0 failed** | **PASS** |
| `npm ci` | exit 0; dependencias instaladas | **PASS** |
| GameWorld → serializador Save V4 → deserializador Save V4 | 1 test P0E pasado, 33 tests no seleccionados; exit 0 | **PASS** (en slice de ensayo) |
| Integridad de WorldDB tras la lectura | hash reportado antes y después idéntico | **PASS según el reporte Windows** |
| Prueba completa de inicio de nueva partida con plantilla real | `actual_playable_roster_activated=false` | **NO PROBADO** |

**Códigos de salida reportados en JSON:**
`tauri_person_query_test_exit=0`, `npm_install_exit=0`, `gameworld_save_v4_test_exit=0`. Verificación independiente de logs: Rust tiene el nombre exacto de la prueba P0E en PASS, Vitest confirma 1 prueba PASSED.

**WorldDB stage SHA-256 reportado antes y después:**
`EF4DDE62788CC2D3034467CB3ABF27C13B6DDC772469DBBA98A1B3962E5EA7E9`.

**Manifest fuente SHA-256 reportado:**
`F5CD9596BFB4E774C13629CDAEB75B1D06498D385CDB9A57ECDD4C26FDD63FA3`.

El ZIP **no trae los bytes completos** de la WorldDB o manifest, por lo que el hash de esas fuentes se basa en el script Windows y no en un cálculo directo desde esta auditoría.

## Qué certifica y qué NO

**Certificado:** el lector real Rust/Tauri ha abierto la copia persistente P0E y comprobado las 20 personas existentes contra su manifest (identificador, nombre, segundo componente, género); el camino TypeScript de construcción de `GameWorld` y persistencia Save V4 conserva los nombres al usar esas 20 personas **introducidas en una slice de ensayo**. La lectura no modifica la SQLite según sus hashes. Se superaron todos los exit codes y logs.

**No certificado:** que las 20 personas sean jugadores, tengan ratings reales, sexo/posición/físico calibrados, estén asignadas a equipos, figuren en las plantillas o se carguen por **la selección natural** del bootstrap de BDM, ni que exista un Save V4 de partida completa real jugable. La prueba TypeScript **inyecta PERSON en una slice válida sintética**. La siguiente fase P0F requiere crear/linkar un jugador canónico sin introducir inconsistencias de WorldDB, y comprobar bootstrap natural + partida.

**Advertencia separada no bloqueante:** `npm ci` reportó **4 vulnerabilidades, 2 moderadas y 2 altas**. El paso devuelve 0; no deben confundirse con fallos P0E. Conviene auditar dependencias en una rama independiente sin cambios de alcance en este PR.

## GitHub

- [BDM PR #118](https://github.com/audifor/BDM/pull/118) sigue **DRAFT**; el puente P0E se certifica con esta evidencia.
- [BDM-DB PR #66](https://github.com/audifor/BDM-DB/pull/66) continúa con los cambios de persistencia en copia, también DRAFT.
- [CI focal BDM #118 PASS](https://github.com/audifor/BDM/actions/runs/38959661944) cubre Windows PowerShell 5.1, TypeScript y Rust; la evidencia de usuario es adicional y distinta del CI.
- Sin merge a `main`, sin activación en producción ni cambios en Courtside.
