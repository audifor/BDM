"""Verify every frozen runtime delivery artifact and its protected original sources."""
import hashlib
import json
import os
from pathlib import Path

root=Path(os.environ.get('WORLDDB_SOURCE_ROOT','C:/BDM_DB/WORLDDB_PBM'))
runtime=root/'WORLDDB_RUNTIME_V1'
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
manifest=json.loads((runtime/'delivery_manifest.json').read_text(encoding='utf-8'))
checks={name:sha(runtime/name)==entry['sha256'] for name,entry in manifest['artifacts'].items()}
cert=json.loads((runtime/'certification.json').read_text(encoding='utf-8'))
for path,expected in cert['protected_before'].items():checks[path]=sha(path)==expected
checks['immutable_rules_snapshot']=sha('src/data/worlddb-v2/competition-runtime.json')==sha(root.parent/'phase1-competition-runtime-bundle.json')
assert all(checks.values()),[name for name,passed in checks.items() if not passed]
destination=Path('.worlddb-v2');destination.mkdir(exist_ok=True)
report=dict(passed=True,checks=checks,master_sha256=sha(root/'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite'))
(destination/'protected-sources.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(dict(passed=True,checks=len(checks),master_sha256=report['master_sha256'])))
