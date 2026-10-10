import json,sys,collections
dir_=sys.argv[1]; Ws=[int(w) for w in sys.argv[2:]]
for w in Ws:
    d=json.load(open(f'{dir_}/{w}.json')); print(f'===== {w}px')
    print(' dock',dict(collections.Counter((x['dock']['h'],x['dock']['icon']) for x in d if x['dock'])),'| maxContent',dict(collections.Counter(x['maxContent'] for x in d)),'| scrollX',sum(1 for x in d if x['docScrollX']>0))
    mods=[(x['s'],x['tab'],m) for x in d for m in x['modules']]
    print(' modules',len(mods),'fuera de talla',[(s,t,m['title'] or m['sel'],m['h']) for s,t,m in mods if not m['inScale']][:6])
    print(' recortado/sobresale',[(s,t,m['title'] or m['sel'],m['sh'],m['protrude']) for s,t,m in mods if (m['sh']>2 and not m['innerScroll'] and m['overflowStyle']!='visible') or m['protrude']][:8])
    print(' solape modulos',[(x['s'],x['tab'],o['a'],o['b']) for x in d for o in x['overlap']][:5])
    print(' solape texto',[(x['s'],x['tab'],o) for x in d for o in x.get('textOverlap',[])][:12], sum(len(x.get('textOverlap',[])) for x in d))
    tr=collections.defaultdict(list)
    for x in d:
        for t in x['trunc']: tr[(x['s'],x['tab'])].append(t['text'][:22])
    print(' truncados',sum(len(v) for v in tr.values()),{k:(len(v),v[:2]) for k,v in tr.items()})
    print(' hscroll interno',[(x['s'],x['tab'],h['title'],h['sw'],h['cw']) for x in d for h in x.get('hscroll',[])][:8])
    print(' huecos der',[(x['s'],x['tab'],g['gapRight']) for x in d for g in x['gaps']][:6])
