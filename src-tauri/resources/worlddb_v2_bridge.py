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
    # Reuse the certified selection/identity adapter, not a second SQLite importer.
    if request['method'] == 'discover':
        catalog = available(master)
        candidate = next((c for c in catalog['competitions'] if c['key'] == 'DYN_championnat:5' and c['initializable']), None)
        if candidate is None:
            raise ValueError('Spanish pilot unavailable; no unverified competition rules substituted')
        import sqlite3
        c = sqlite3.connect(master.as_uri()+'?mode=ro&immutable=1',uri=True)
        try:
            rows = c.execute('SELECT id_equipe FROM DYN_equipe WHERE championnat_id=5 ORDER BY id_equipe').fetchall()
            counts = [c.execute('SELECT count(*) FROM DYN_joueur WHERE team_id=? AND is_alive=1 AND retraite=0',(r[0],)).fetchone()[0] for r in rows]
            if len(rows)!=18 or min(counts)<5:raise ValueError('Pilot requires 18 existing clubs with usable original rosters')
        finally:c.close()
        from runtime import decode
        c = sqlite3.connect(master.as_uri()+'?mode=ro&immutable=1',uri=True)
        try:teams=[dict(key='pbm:DYN_equipe:'+str(r[0]),name=decode(r[1]),code=str(r[0])) for r in c.execute('SELECT id_equipe,nom_equipe FROM DYN_equipe WHERE championnat_id=5 ORDER BY id_equipe')]
        finally:c.close()
        return dict(competitionId='pbm:DYN_championnat:5',name=candidate['name'],teams=teams,minimumOriginalRoster=min(counts),masterSha256=catalog['master_sha256'])
    if request['method']!='build':raise ValueError('Unknown bridge method')
    target = Path(request['output']).resolve()
    config=dict(game='BDM',start_date=request['startDate'],countries=[8],competitions=['DYN_championnat:5'],population='original',seed=request['seed'])
    manifest=build(target,config,master)
    with Universe(target,master) as u:
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
        return dict(manifest=manifest,countries=u.query('country',10000),clubs=clubs,people=u.query('person',10000),competitions=u.query('competition',100),physicalContent=dict(places=list(places.values()),facilities=list(facilities.values()),teamUsages=usages))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(main(),ensure_ascii=False,allow_nan=False))
