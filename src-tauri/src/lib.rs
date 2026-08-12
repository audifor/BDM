use serde::Serialize;
use serde_json::Value;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveInfoV1 {
    saved_at: String,
}

#[tauri::command]
fn save_game_v1(app: tauri::AppHandle, envelope_json: String) -> Result<(), String> {
    validate_envelope_json(&envelope_json)?;
    write_save(&save_path(&app)?, envelope_json.as_bytes())
}

#[tauri::command]
fn load_game_v1(app: tauri::AppHandle) -> Result<String, String> {
    let text = fs::read_to_string(save_path(&app)?).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "No saved game exists".to_owned()
        } else {
            format!("Unable to read saved game: {error}")
        }
    })?;
    validate_envelope_json(&text)?;
    Ok(text)
}

#[tauri::command]
fn get_save_info_v1(app: tauri::AppHandle) -> Result<Option<SaveInfoV1>, String> {
    let path = save_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text =
        fs::read_to_string(path).map_err(|error| format!("Unable to read saved game: {error}"))?;
    let value = validate_envelope_json(&text)?;
    let saved_at = value
        .get("savedAt")
        .and_then(Value::as_str)
        .expect("validated savedAt")
        .to_owned();
    Ok(Some(SaveInfoV1 { saved_at }))
}

fn save_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to find application data directory: {error}"))?;
    Ok(app_data.join("saves").join("main.json"))
}

fn validate_envelope_json(text: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(text).map_err(|_| "Save file contains malformed JSON".to_owned())?;
    let object = value
        .as_object()
        .ok_or_else(|| "Save envelope must be an object".to_owned())?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported or invalid save version".to_owned());
    }
    if object
        .get("savedAt")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
    {
        return Err("Save savedAt must be a non-empty string".to_owned());
    }
    if !object.get("payload").is_some_and(Value::is_object) {
        return Err("Save payload must be an object".to_owned());
    }
    Ok(value)
}

fn write_save(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Save path has no parent directory".to_owned())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Unable to create save directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temporary)
            .map_err(|error| format!("Unable to create temporary save: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("Unable to write temporary save: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Unable to flush temporary save: {error}"))?;
        replace_save(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(not(windows))]
fn replace_save(temporary: &Path, path: &Path) -> Result<(), String> {
    fs::rename(temporary, path).map_err(|error| format!("Unable to replace saved game: {error}"))
}

#[cfg(windows)]
fn replace_save(temporary: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return fs::rename(temporary, path)
            .map_err(|error| format!("Unable to create saved game: {error}"));
    }

    let temporary_wide: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    let path_wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // ReplaceFileW replaces an existing file without deleting the previous save first.
    let replaced = unsafe {
        ReplaceFileW(
            path_wide.as_ptr(),
            temporary_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(format!(
            "Unable to replace saved game: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(windows)]
#[link(name = "Kernel32")]
extern "system" {
    fn ReplaceFileW(
        replaced_file_name: *const u16,
        replacement_file_name: *const u16,
        backup_file_name: *const u16,
        replace_flags: u32,
        exclude: *mut std::ffi::c_void,
        reserved: *mut std::ffi::c_void,
    ) -> i32;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_game_v1,
            load_game_v1,
            get_save_info_v1
        ])
        .run(tauri::generate_context!())
        .expect("error while running BDM");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_minimum_envelope() {
        assert!(validate_envelope_json(
            r#"{"schemaVersion":1,"savedAt":"2026-01-01T00:00:00.000Z","payload":{}}"#
        )
        .is_ok());
    }

    #[test]
    fn rejects_invalid_envelope() {
        assert!(
            validate_envelope_json(r#"{"schemaVersion":2,"savedAt":"","payload":null}"#).is_err()
        );
    }
}
