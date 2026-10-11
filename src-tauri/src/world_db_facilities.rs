//! Read-only DDL-12 physical source projection. No fabricated anatomy or entitlement.
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalContent {
    pub places: Vec<PhysicalPlace>,
    pub facilities: Vec<PhysicalFacility>,
    pub team_usages: Vec<TeamUsage>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalPlace {
    place_id: String,
    name: String,
    place_type: String,
    parent_place_id: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalFacility {
    facility_id: String,
    name: String,
    place_id: String,
    capacity: Option<i64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamUsage {
    usage_id: String,
    team_id: String,
    facility_id: String,
    usage_type: String,
    valid_from: Option<String>,
    valid_to: Option<String>,
}

pub fn load(connection: &Connection, team_ids: &[String]) -> Result<PhysicalContent, String> {
    let mut content = PhysicalContent {
        places: vec![],
        facilities: vec![],
        team_usages: vec![],
    };
    // Older databases with no physical tables retain an honest empty physical slice.
    for table in ["facility", "team_facility_usage", "place"] {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                [table],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Ok(content);
        }
    }
    let mut facility_ids = BTreeSet::new();
    for team_id in BTreeSet::from_iter(team_ids.iter()) {
        let mut statement = connection.prepare("SELECT team_facility_usage_id,team_id,facility_id,usage_type,valid_from,valid_to FROM team_facility_usage WHERE team_id=?1 ORDER BY team_facility_usage_id").map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([team_id], |row| {
                Ok(TeamUsage {
                    usage_id: row.get(0)?,
                    team_id: row.get(1)?,
                    facility_id: row.get(2)?,
                    usage_type: row.get(3)?,
                    valid_from: row.get(4)?,
                    valid_to: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let usage = row.map_err(|e| e.to_string())?;
            facility_ids.insert(usage.facility_id.clone());
            content.team_usages.push(usage);
        }
    }
    let mut needed_places = BTreeSet::new();
    for id in facility_ids {
        let facility = connection.query_row("SELECT f.facility_id,e.canonical_name,f.place_id,f.capacity FROM facility f JOIN entity e ON e.entity_id=f.entity_id WHERE f.facility_id=?1", [&id], |row| Ok(PhysicalFacility { facility_id: row.get(0)?, name: row.get(1)?, place_id: row.get(2)?, capacity: row.get(3)? })).optional().map_err(|e| e.to_string())?;
        let facility = facility
            .ok_or_else(|| format!("Facility usage references missing physical source {id}"))?;
        needed_places.insert(facility.place_id.clone());
        content.facilities.push(facility);
    }
    let mut seen_places = BTreeSet::new();
    while let Some(id) = needed_places.pop_first() {
        if !seen_places.insert(id.clone()) {
            continue;
        }
        let place = connection.query_row("SELECT p.place_id,e.canonical_name,p.place_type,p.parent_place_id,p.latitude,p.longitude FROM place p JOIN entity e ON e.entity_id=p.entity_id WHERE p.place_id=?1", [&id], |row| Ok(PhysicalPlace { place_id: row.get(0)?, name: row.get(1)?, place_type: row.get(2)?, parent_place_id: row.get(3)?, latitude: row.get(4)?, longitude: row.get(5)? })).optional().map_err(|e| e.to_string())?;
        let place =
            place.ok_or_else(|| format!("Facility references missing physical Place {id}"))?;
        if let Some(parent) = &place.parent_place_id {
            needed_places.insert(parent.clone());
        }
        content.places.push(place);
    }
    content.places.sort_by(|a, b| a.place_id.cmp(&b.place_id));
    content
        .team_usages
        .sort_by(|a, b| a.usage_id.cmp(&b.usage_id));
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_physical_source_keeps_identity_unknowns_and_raw_dates() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE entity(entity_id TEXT,canonical_name TEXT); CREATE TABLE place(place_id TEXT,entity_id TEXT,place_type TEXT,parent_place_id TEXT,latitude REAL,longitude REAL); CREATE TABLE facility(facility_id TEXT,entity_id TEXT,place_id TEXT,capacity INTEGER); CREATE TABLE team_facility_usage(team_facility_usage_id TEXT,team_id TEXT,facility_id TEXT,usage_type TEXT,valid_from TEXT,valid_to TEXT); INSERT INTO entity VALUES ('p','Known place'),('f','Shared venue'); INSERT INTO place VALUES ('p','p','CITY',NULL,NULL,NULL); INSERT INTO facility VALUES ('f','f','p',NULL); INSERT INTO team_facility_usage VALUES ('u2','t2','f','home','2025-26',NULL),('u1','t1','f','home','2020-01-01',NULL);").unwrap();
        let a = load(&connection, &["t2".to_owned(), "t1".to_owned()]).unwrap();
        let b = load(&connection, &["t1".to_owned(), "t2".to_owned()]).unwrap();
        assert_eq!(
            serde_json::to_value(&a).unwrap(),
            serde_json::to_value(&b).unwrap()
        );
        assert_eq!(a.facilities.len(), 1);
        assert_eq!(a.places.len(), 1);
        assert_eq!(a.team_usages.len(), 2);
        assert_eq!(a.facilities[0].capacity, None);
        assert_eq!(a.team_usages[1].valid_from.as_deref(), Some("2025-26"));
    }

    #[test]
    fn absent_physical_tables_are_empty_not_generated() {
        assert!(
            load(&Connection::open_in_memory().unwrap(), &["team".to_owned()])
                .unwrap()
                .facilities
                .is_empty()
        );
    }
}
