"""v7.1 lifecycle smoke against prod. Picks an opp, runs the full strict
flow + the negative cases, and checks that the ?d bug is gone."""
import json, os, sys, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

B = os.environ['B']
KEY = os.environ['KEY']
HDR = {'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def call(method, path, body=None, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{B}{path}", headers=HDR, data=data, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        return resp.getcode(), json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read())
        except: body = {}
        return e.code, body

def label(s): print(f"\n--- {s} ---")

# Pick a fresh opp from /opportunities/my that has NO existing draft.
# We'll search for an act_now or standard with bucket and recommended_action='generate_proposal'.
my = call('GET', '/api/v1/oied/opportunities/my?limit=20')[1]['data']
target = None
for r in my:
    if r['context']['recommended_action'] == 'generate_proposal':
        target = r
        break
if not target:
    print('Could not find a fresh opp; falling back to first row.')
    target = my[0]
opp_id = target['id']
print(f"Target opp: id={opp_id} title={target['title'][:55]}")

# ---- Negative tests BEFORE submission ----
label(f"Negative: mark-result responded WITHOUT submitted event")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-result', {'status':'responded'})
print(f"  status: {sc}")
print(f"  message: {body.get('message')}")
print(f"  errors.requires: {body.get('errors', {}).get('requires')}")
assert sc == 400, f"expected 400, got {sc}"

label(f"Negative: mark-result with status=submitted (must redirect)")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-result', {'status':'submitted'})
print(f"  status: {sc}")
print(f"  message: {body.get('message')}")
assert sc == 400 and 'mark-submitted' in body.get('message', ''), 'expected redirect message'

label(f"Negative: mark-result won WITHOUT responded event")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-result', {'status':'won'})
print(f"  status: {sc}")
print(f"  message: {body.get('message')}")
print(f"  errors.requires: {body.get('errors', {}).get('requires')}")
assert sc == 400, f"expected 400, got {sc}"

# ---- Happy path: generate → mark-submitted → responded → won ----
label(f"1. POST /opportunities/{opp_id}/generate")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/generate', {'type':'proposal'})
print(f"  status: {sc}, output_id={body.get('data',{}).get('id')}")

label(f"2. POST /opportunities/{opp_id}/mark-submitted (NEW v7.1 endpoint)")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-submitted')
print(f"  status: {sc}")
print(f"  body: {json.dumps(body.get('data', body), indent=2)[:300]}")
assert sc == 201

# Now check the ?d bug is fixed: re-fetch and inspect reason.
label(f"3. Verify ?d ago bug fix (same-day submission renders 0d)")
out = call('GET', f'/api/v1/oied/opportunities/{opp_id}')[1]['data']
reason = out['context']['reason']
print(f"  reason: {reason}")
print(f"  recommended_action: {out['context']['recommended_action']}")
print(f"  strategic_type: {out['context']['strategic_type']}")
assert '0d ago' in reason or '?' not in reason.split('—')[0], f"?d bug NOT fixed: {reason}"

label(f"4. POST /opportunities/{opp_id}/mark-result {{status:'responded'}}")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-result', {'status':'responded'})
print(f"  status: {sc}, eventType: {body.get('data',{}).get('eventType')}")
assert sc == 201

label(f"5. POST /opportunities/{opp_id}/mark-result {{status:'won'}}")
sc, body = call('POST', f'/api/v1/oied/opportunities/{opp_id}/mark-result', {'status':'won'})
print(f"  status: {sc}, eventType: {body.get('data',{}).get('eventType')}")
assert sc == 201

label(f"6. Final state (after lifecycle complete)")
out = call('GET', f'/api/v1/oied/opportunities/{opp_id}')[1]['data']
print(f"  recommended_action: {out['context']['recommended_action']}")
print(f"  strategic_type:     {out['context']['strategic_type']}")

print("\n✅ v7.1 lifecycle validation: ALL CHECKS PASSED")
