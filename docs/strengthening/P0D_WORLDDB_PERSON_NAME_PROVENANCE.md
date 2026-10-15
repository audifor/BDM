# P0D · Consumo de procedencia del nombre de Person desde WorldDB

**Estado:** Implementación opt-in, rama aislada, sin modificación de main ni UI Courtside.  
**Proveedor:** BDM-DB [PR #65](https://github.com/audifor/BDM-DB/pull/65) → [#64](https://github.com/audifor/BDM-DB/pull/64) → [#63](https://github.com/audifor/BDM-DB/pull/63).

## Problema

El lector de BDM en `src-tauri/src/world_db_bootstrap.rs` leía únicamente `given_name`/`family_name` de WorldDB. La ruta P0C puede colocar un patronímico o un componente cultural provisional en el antiguo campo `family_name`; descartando el tipo se fingiría que todos los segundos nombres son apellidos hereditarios.

## Cambio acotado

- Tauri consulta `person_name_component_provenance` **solo si la tabla existe**; si no existe, no añade campos y sigue aceptando el antiguo DDL-PHASE1-A/DDL-12. Si existe pero está rota, falla de forma explícita, no inventa datos.
- El DTO `WorldDbGameBootstrapPersonV1` añade `nameComponent?` (país del nombre, país fuente de cada componente, discriminante y key de padre real, cuando existe), sin cambiar `schemaVersion: 1` ni campos obligatorios previos.
- `GameBootstrap.ts` valida códigos ISO2 y las restricciones: `LINKED_PATERNAL_GIVEN_NAME` **requiere** padre, `PROVISIONAL_UNLINKED_CULTURAL_GIVEN_NAME` lo **prohíbe**.
- `Person` conserva el mismo objeto `nameComponent` opcional, sin alterar Player, Staff, Coach, MatchEngine, género o puntuaciones de roster.
- Save V4 usa la serialización del tronco Person a través de las capas de compatibilidad de Save V1/V3; el lector `readPerson` se amplía para restaurar y revalidar `nameComponent`. Las partidas anteriores siguen siendo válidas.
- No hay nuevas pantallas ni cambios de estilos; el objeto facilita que las vistas futuras distingan nombre provisional de patronímico real.

## Certificación pendiente

Las pruebas focales cubren `createPerson`, el paso desde `WorldDbGameBootstrapSliceV1` hasta `GameWorld`, Save V4, bases sin tabla P0D y lectura Tauri SQLite de prueba con tabla P0D.

**No asumir** que la producción ya tiene la tabla o nombres de P0C: el proveedor BDM-DB está en PR draft, no fusionado; la rama BDM actual solo incorpora el **consumidor compatible**. No ha habido lectura de una WorldDB productiva materializada con P0C, ni carga de la aplicación completa con nuevos jugadores. La activación debe hacerse después de la migración/ingesta fuente, la certificación del runtime y la integración funcional completa.

Ningún cambio en `main`, bases de producción o interfaz Courtside.
