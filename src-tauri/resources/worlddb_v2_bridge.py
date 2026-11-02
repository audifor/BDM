"""Read WorldDB through the frozen runtime API; all new files belong to BDM."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True

def has_player_name(first_name, last_name):
    """Optional original free agents must satisfy the existing canonical Player identity contract."""
    return isinstance(first_name, str) and bool(first_name.strip()) and isinstance(last_name, str) and bool(last_name.strip())


def validate_discovery(selection, counts):
    if len(counts) != selection['teamCount'] or not counts:
        raise ValueError('Original participants do not fit the selected format')
    generated_population = selection.get('formatProvenance') == 'GENERATED_SIMULATION' or selection.get('simulationPolicy') is True
    if not generated_population and min(counts) < 5:
        raise ValueError('Original rosters do not fit the selected format')

def main():
    request = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    root = Path(request['sourceRoot']).resolve()
    sys.path.insert(0, str(root / 'WORLDDB_RUNTIME_V1'))
    from runtime import Universe, available, build, pin_master
    master = root / 'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'
    pin_master(master)
    import sqlite3
    from runtime import decode
    catalog_config=request.get('competitionCatalog')
    if catalog_config is None:
        catalog_config=json.loads((Path(__file__).resolve().parents[2]/'src/data/worlddb-v2/competitions.json').read_text(encoding='utf-8'))
        catalog_config += json.loads((Path(__file__).resolve().parents[2]/'src/data/worlddb-v2/global-competitions.json').read_text(encoding='utf-8'))
    selected_id=request.get('competitionId','pbm:DYN_championnat:5')
    selection=next((c for c in catalog_config if c['sourceCompetitionId']==selected_id),None)
    if selection is None:raise ValueError('Competition has no verified BDM mapping: '+selected_id)
    source_key=selected_id.removeprefix('pbm:')
    championship_id=int(source_key.split(':')[1])
    if request['method']=='discover':
        catalog=available(master)
        candidate=next((c for c in catalog['competitions'] if c['key']==source_key and c['initializable']),None)
        if candidate is None:raise ValueError('Selected PBM competition unavailable')
        c=sqlite3.connect(master.as_uri()+'?mode=ro&immutable=1',uri=True)
        try:
            rows=c.execute('SELECT id_equipe,nom_equipe FROM DYN_equipe WHERE championnat_id=? ORDER BY id_equipe',(championship_id,)).fetchall()
            counts=[c.execute('SELECT count(*) FROM DYN_joueur WHERE team_id=? AND is_alive=1 AND retraite=0',(r[0],)).fetchone()[0] for r in rows]
            validate_discovery(selection, counts)
            teams=[dict(key='pbm:DYN_equipe:'+str(r[0]),name=decode(r[1]),code=str(r[0])) for r in rows]
        finally:c.close()
        return dict(competitionId=selected_id,name=candidate['name'],teams=teams,minimumOriginalRoster=min(counts),masterSha256=catalog['master_sha256'])
    if request['method']!='build':raise ValueError('Unknown bridge method')
    target = Path(request['output']).resolve()
    staff_selections=[next((c for c in catalog_config if c['sourceCompetitionId']==item),None) for item in request.get('staffCompetitionIds') or [selected_id]]
    if any(item is None for item in staff_selections):raise ValueError('Staff scope includes an unmapped competition')
    staff_country_ids={item['countryId'] for item in staff_selections if item['countryId']}
    staff_scope_is_global=any(not item['countryId'] for item in staff_selections)
    # PBM country=0 identifies cross-border selections. Runtime V1 already
    # supports all country references with an explicit competition selection;
    # that does not activate clubs from other competitions.
    config=dict(game='BDM',start_date=request['startDate'],countries='all' if staff_scope_is_global else sorted(staff_country_ids),competitions=[source_key],population='original',seed=request['seed'])
    manifest=build(target,config,master)
    with Universe(target,master) as u:
        # Runtime V1 deliberately activates only club-bound people. Activate a bounded,
        # seed-stable original domestic free-agent pool in this game-owned overlay.
        # Never change Runtime V1 or manufacture new people.
        import hashlib
        from datetime import date
        from runtime import validate_birth, ref
        day=date.fromisoformat(request['startDate'])
        candidates=[]
        competition_gender = u.c.execute('SELECT sexe FROM world.DYN_championnat WHERE id=?', (championship_id,)).fetchone()[0]
        for row in u.c.execute('SELECT * FROM world.DYN_joueur WHERE team_id=0 AND is_alive=1 AND retraite=0 AND sexe=? AND nationalite=?',(competition_gender, selection['countryId'])):
            # Keep incomplete source identities in the immutable master, outside the playable optional pool.
            if not has_player_name(decode(row['joueur_prenom']), decode(row['joueur_nom'])):continue
            born=validate_birth(dict(row),day)
            if born is None:continue
            age=day.year-born.year-((day.month,day.day)<(born.month,born.day))
            if 18<=age<=40:candidates.append(row['joueur_id'])
        candidates.sort(key=lambda key:hashlib.sha256((request['seed']+':free-agent:'+str(key)).encode()).hexdigest())
        selected=candidates[:60]
        for key in selected:
            u.c.execute("INSERT INTO R_entity VALUES (?,'person','DYN_joueur',?,NULL,1,NULL)",(ref('DYN_joueur',key),str(key)))
        u.c.commit()
        free_agents=[u.get(ref('DYN_joueur',key)) for key in selected]
        # Load original unemployed staff from the countries represented by the selected
        # competitions. A cross-border competition explicitly opens the full source universe.
        staff_query='SELECT * FROM world.DYN_person WHERE equipe_id=0 AND is_alive=1 AND retraite=0'
        staff_parameters=()
        if not staff_scope_is_global:
            if not staff_country_ids:raise ValueError('Selected competitions have no staff-country scope')
            staff_query+=' AND nationalite_id IN ('+','.join('?' for _ in staff_country_ids)+')'
            staff_parameters=tuple(sorted(staff_country_ids))
        # Chairmanship is ownership/governance, not a staff vacancy. No identities are generated.
        staff_groups={}
        staff_role_preferences=('job_preference_coach','job_preference_assistant_coach','job_preference_offense_coach','job_preference_defense_coach','job_preference_head_youth_development','job_preference_scout','job_preference_physio','job_preference_director','job_preference_pt')
        for row in u.c.execute(staff_query,staff_parameters):
            if not has_player_name(decode(row['prenom']),decode(row['nom'])):continue
            born=validate_birth(dict(row),day)
            if born is None:continue
            preferences=[k for k in staff_role_preferences if k in row.keys()]
            if not preferences:continue
            role=max(preferences,key=lambda k:(row[k] or 0,-preferences.index(k)))
            if not row[role]:continue
            staff_groups.setdefault(role,[]).append(row['id_person'])
        selected_staff=[]
        for role,keys in sorted(staff_groups.items()):
            keys.sort(key=lambda key:hashlib.sha256((request['seed']+':free-staff:'+str(key)).encode()).hexdigest())
            selected_staff.extend(keys)
        for key in selected_staff:
            u.c.execute("INSERT INTO R_entity VALUES (?,'person','DYN_person',?,NULL,1,NULL)",(ref('DYN_person',key),str(key)))
        u.c.commit()
        free_staff=[u.get(ref('DYN_person',key)) for key in selected_staff]
        clubs=u.query('club',10000)
        from runtime import decode
        places={};facilities={};usages=[]
        for club in clubs:
            for f in club['reference_data'].get('source_facilities_reference_only',[]):
                city=u.c.execute('SELECT * FROM world.DYN_ville WHERE id=?',(f['id_city'],)).fetchone()
                if city is None or not f['name_arena']:continue
                place_id='pbm:DYN_ville:'+str(city['id']);facility_id='pbm:DYN_facility:'+str(f['id_facility'])
                places[place_id]=dict(placeId=place_id,name=decode(city['nom_ville_en'] or city['nom_ville_fr']),placeType='CITY',parentPlaceId=None,latitude=city['latitude'],longitude=city['longitude'])
                facilities[facility_id]=dict(facilityId=facility_id,name=f['name_arena'],placeId=place_id,capacity=f['capacity'] if f['capacity'] and f['capacity']>0 else None)
                usages.append(dict(usageId=facility_id+':'+club['entity_id'],teamId=club['entity_id'],facilityId=facility_id,usageType='home',validFrom=None,validTo=None))
        people=[p for p in u.query('person',10000) if p['parent_id'] is not None]
        staff_policy = 'ORIGINAL_UNEMPLOYED_SELECTED_COMPETITION_COUNTRIES_TOP_PREFERENCE_SEEDED' if not staff_scope_is_global else 'ORIGINAL_UNEMPLOYED_GLOBAL_TOP_PREFERENCE_SEEDED'
        policy = 'ORIGINAL_{}_{}_18_40_SEEDED_MAX_60'.format('SPANISH' if selection['countryId']==8 else 'COUNTRY', 'FEMALE' if competition_gender == 1 else 'MALE')
        return dict(manifest=manifest,countries=u.query('country',10000),clubs=clubs,people=people,freeStaff=free_staff,freeStaffSelection=dict(eligibleOriginals=sum(map(len, staff_groups.values())), selected=len(selected_staff), policy=staff_policy),freeAgents=free_agents,freeAgentSelection=dict(eligibleOriginals=len(candidates),selected=len(selected),policy=policy),competitions=u.query('competition',100),physicalContent=dict(places=list(places.values()),facilities=list(facilities.values()),teamUsages=usages))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(main(),ensure_ascii=False,allow_nan=False))
