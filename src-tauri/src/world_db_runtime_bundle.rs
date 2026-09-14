use serde_json::Value;
use std::{fs, path::Path};

pub fn load_runtime_bundle_v1(bundle_path: &str) -> Result<Value, String> {
    let path = Path::new(bundle_path);
    if !path.is_file() {
        return Err(format!(
            "World DB competition runtime bundle does not exist: {}",
            path.display()
        ));
    }
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Unable to read World DB competition runtime bundle: {error}"))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("World DB competition runtime bundle contains invalid JSON: {error}"))?;
    if !value.is_object() {
        return Err("World DB competition runtime bundle must be a JSON object".to_owned());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_bundle_file() {
        assert!(load_runtime_bundle_v1("__bdm_missing_runtime_bundle__.json").is_err());
    }
}
