@echo off
cd /d "%~dp0"
set "BDM_SAVE_PROFILE=%~1"
npm run tauri -- dev --config src-tauri/tauri.worlddb-v2.conf.json
