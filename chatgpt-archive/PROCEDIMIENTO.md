# Procedimiento del archivo conversacional BDM

1. Mantener la rama `archive/chatgpt-bdm` solo para el índice público. No mergearla con `main`.
2. Guardar contenido íntegro o reconstrucciones detalladas **únicamente** en la rama privada `archive/chatgpt-bdm-db` del repositorio `audifor/BDM-DB`.
3. Etiquetar cada registro `ORIGINAL_EXPORTADO` o `RECONSTRUCCION_PARCIAL`; nunca inventar intervenciones ni afirmar cobertura exhaustiva.
4. Actualizar el índice público con fecha, título, estatus y vínculo al archivo privado, sin copiar secretos o mensajes privados.
5. Para completar hilos históricos, importar el archivo original de exportación ChatGPT (por ejemplo, `conversations.json` dentro de exportación de datos) o los Markdown aportados por el usuario. Antes de importar, clasificar por proyecto y revisar datos sensibles.
6. Para nuevos hilos, ejecutar una acción explícita de archivado mientras el contenido esté disponible. No hay webhook o sincronización permanente habilitada al iniciar o cerrar chats.
7. Confirmar el SHA del commit y que ambos repositorios permanecen sin cambios en `main`.
