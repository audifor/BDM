"""Compile source documents plus explicit sourced execution bindings, by data.

Original documents and the frozen BLAKE3 bundle remain untouched. No sporting
field is guessed: every applied addition is in the reviewable binding document.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--inventory', default='.worlddb-v2/batch-04/inventory.json')
    parser.add_argument('--bindings', default='scripts/playable/worlddb-v2-execution-bindings.json')
    parser.add_argument('--output', default='src/data/worlddb-v2/additional-formats.json')
    args = parser.parse_args()
    inventory = json.loads(Path(args.inventory).read_text(encoding='utf-8-sig'))
    bindings = json.loads(Path(args.bindings).read_text(encoding='utf-8-sig'))
    documents, provenance = [], []
    for binding in bindings:
        matches = [f for f in inventory['formats'] if f['sha256'] == binding['source_document_sha256']]
        if len(matches) != 1:
            raise ValueError('Exact source document required: ' + binding['source_document_sha256'])
        doc = copy.deepcopy(matches[0]['document'])
        if doc['status'] != 'COMPLETE':
            raise ValueError('Bindings must not promote a partial research document to COMPLETE')
        for variant in doc['variants']:
            if variant['key'] != binding['variant_key']:
                continue
            if set(binding['node_additions']) - {node['key'] for node in variant['nodes']}:
                raise ValueError('Binding references an unknown node')
            for node in variant['nodes']:
                addition = binding['node_additions'].get(node['key'])
                if addition:
                    # A single explicit hosting field, not a generic deep merge
                    # that could quietly rewrite pairings or contest semantics.
                    if node.get('hosting', {}).get('rule_type') != 'SERIES_PATTERN':
                        raise ValueError('Source hosting contract changed: ' + node['key'])
                    node['hosting']['priority_basis'] = addition['hosting_priority_basis']
            variant['seeding'] = binding['seeding']
        if not any(v['key'] == binding['variant_key'] for v in doc['variants']):
            raise ValueError('Binding references an unknown variant')
        doc['notes'] = doc.get('notes', '') + binding['notes_suffix']
        documents.append(doc)
        provenance.append(dict(source_sha256=binding['source_document_sha256'], sources=matches[0]['sources'],
                               evidence=binding['evidence'], edition=doc['competition_season_id']))
    output = Path(args.output)
    text = json.dumps(documents, ensure_ascii=False, indent=2) + '\n'
    output.write_text(text, encoding='utf-8')
    target = Path('.worlddb-v2/compiled-formats.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(dict(output=str(output), sha256=hashlib.sha256(text.encode()).hexdigest(), documents=provenance), indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(documents=len(documents), sha256=hashlib.sha256(text.encode()).hexdigest())))


if __name__ == '__main__':
    main()
