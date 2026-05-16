import sys, urllib.request, json, os, re
sys.stdout.reconfigure(encoding='utf-8')

B = os.environ['B']
KEY = os.environ['KEY']
HDR = {'Authorization': f'Bearer {KEY}'}

def get(path):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(f"{B}{path}", headers=HDR), timeout=20).read())

# Pattern that says "this is a literal API call sketch the consumer can run".
API_CALL = re.compile(r'^(GET|POST|PATCH|DELETE)\s+/api/v1/oied/[^\s]+', re.IGNORECASE)

paths = [
    ('/recommendations?limit=3',          'rows'),
    ('/opportunities/my?limit=3',         'rows'),
    ('/opportunities/execution?limit=3',  'rows'),
    ('/bundles?limit=5',                  'rows'),
    ('/opportunities/11367',              'single'),
    ('/bundles/43/blueprint',             'single'),
]

total_steps = 0
api_call_steps = 0
unique_actions = set()
unique_types = set()
samples = []

for path, kind in paths:
    d = get(f'/api/v1/oied{path}')
    if kind == 'rows':
        rows = d['data']
    else:
        rows = [d['data']]
    for row in rows:
        ctx = row.get('context', {})
        action = ctx.get('recommended_action', '?')
        stype  = ctx.get('strategic_type', '?')
        steps  = ctx.get('next_steps', [])
        unique_actions.add(action)
        unique_types.add(stype)
        for s in steps:
            total_steps += 1
            if API_CALL.match(s):
                api_call_steps += 1
        if len(samples) < 6:
            samples.append({'path': path, 'action': action, 'type': stype, 'steps': steps})

print(f"--- 4. next_steps actionability audit ---")
print(f"  total next_steps strings collected: {total_steps}")
print(f"  starting with VERB /api/v1/oied/...: {api_call_steps} ({100*api_call_steps//max(1,total_steps)}%)")
print(f"  unique recommended_action values:   {sorted(unique_actions)}")
print(f"  unique strategic_type values:       {sorted(unique_types)}")
print()
print(f"--- Sample step lists (first 6 rows) ---")
for s in samples:
    print(f"  {s['path']}  action={s['action']}  type={s['type']}")
    for step in s['steps']:
        marker = '[API]' if API_CALL.match(step) else '[GUIDE]'
        print(f"    {marker} {step}")

# Inconsistency probes
print()
print(f"--- Inconsistency probes ---")
# Look for the literal '?d ago' bug reported in v7 docs
recs = get('/api/v1/oied/recommendations?limit=10')['data']
glitches = []
for r in recs:
    reason = r['context'].get('reason', '')
    if '?d ago' in reason:
        glitches.append((r['opportunity_id'], reason))
if glitches:
    print(f"  '?d ago' bug found in {len(glitches)} row(s):")
    for oid, rsn in glitches[:3]:
        print(f"    opp #{oid}: {rsn}")
else:
    print(f"  '?d ago' bug: not present")

# UTF-8 encoding glitches in reason / next_steps (em-dash mojibake)
mojibake_count = 0
for r in recs:
    reason = r['context'].get('reason', '')
    if 'â€' in reason:
        mojibake_count += 1
print(f"  em-dash mojibake in reason: {mojibake_count} of {len(recs)}")
