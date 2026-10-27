"""Read WorldDB through the frozen runtime API; all new files belong to BDM."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True

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
            if len(rows)!=selection['teamCount'] or min(counts)<5:raise ValueError('Original participants/rosters do not fit the selected format')
            teams=[dict(key='pbm:DYN_equipe:'+str(r[0]),name=decode(r[1]),code=str(r[0])) for r in rows]
        finally:c.close()
        return dict(competitionId=selected_id,name=candidate['name'],teams=teams,minimumOriginalRoster=min(counts),masterSha256=catalog['master_sha256'])
    if request['method']!='build':raise ValueError('Unknown bridge method')
    target = Path(request['output']).resolve()
    # PBM country=0 identifies cross-border selections. Runtime V1 already
    # supports all country references with an explicit competition selection;
    # that does not activate clubs from other competitions.
    config=dict(game='BDM',start_date=request['startDate'],countries=[selection['countryId']] if selection['countryId'] else 'all',competitions=[source_key],population='original',seed=request['seed'])
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
        for row in u.c.execute('SELECT * FROM world.DYN_joueur WHERE team_id=0 AND is_alive=1 AND retraite=0 AND sexe=0 AND nationalite=?',(selection['countryId'],)):
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
        return dict(manifest=manifest,countries=u.query('country',10000),clubs=clubs,people=people,freeAgents=free_agents,freeAgentSelection=dict(eligibleOriginals=len(candidates),selected=len(selected),policy='ORIGINAL_SPANISH_MALE_18_40_SEEDED_MAX_60' if selection['countryId']==8 else 'ORIGINAL_COUNTRY_MALE_18_40_SEEDED_MAX_60'),competitions=u.query('competition',100),physicalContent=dict(places=list(places.values()),facilities=list(facilities.values()),teamUsages=usages))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(main(),ensure_ascii=False,allow_nan=False))
