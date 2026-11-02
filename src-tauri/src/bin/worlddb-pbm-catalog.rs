use bdm_lib::db04_catalog_adapter::{list_competitions_v1, list_countries_v1, read_competition_v1};
use serde_json::to_string_pretty;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let operation = args.next().ok_or_else(usage)?;
    let mut database = std::env::var_os("DB06_WORLDDB_PATH").map(PathBuf::from);
    let mut country: Option<String> = None;
    let mut selector: Option<String> = None;
    while let Some(flag) = args.next() {
        let value = args.next().ok_or_else(usage)?;
        match flag.as_str() {
            "--database" => database = Some(PathBuf::from(value)),
            "--country" => country = Some(value),
            "--id" => selector = Some(value),
            _ => return Err(usage()),
        }
    }
    let database = database
        .ok_or_else(|| "PBM WorldDB path required via --database or DB06_WORLDDB_PATH".to_owned())?;
    let result = match operation.as_str() {
        "countries" => serde_json::to_value(list_countries_v1(&database)?),
        "competitions" => {
            serde_json::to_value(list_competitions_v1(&database, country.as_deref())?)
        }
        "competition" => serde_json::to_value(read_competition_v1(
            &database,
            selector.as_deref().ok_or_else(usage)?,
        )?),
        _ => return Err(usage()),
    }
    .map_err(|error| format!("Unable to serialize DB-06 catalog response: {error}"))?;
    println!(
        "{}",
        to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn usage() -> String {
    "Usage: worlddb-pbm-catalog <countries|competitions|competition> --database <worlddb-db07.sqlite> [--country <ISO-like source code>] [--id <certified competition ID or DB-03 key>]".to_owned()
}
