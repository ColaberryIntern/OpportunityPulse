import sys, urllib.request, urllib.error, json, os
sys.stdout.reconfigure(encoding='utf-8')

B = os.environ['B']
KEY = os.environ['KEY']
ADMIN_PW = os.environ['ADMIN_PW']

def code(method, path, headers, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{B}{path}", headers=headers, data=data, method=method)
    try:
        return urllib.request.urlopen(req, timeout=20).getcode(), None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:120]

print('--- 3.1 Valid API key ---')
sc, _ = code('GET', '/api/v1/oied/recommendations', {'Authorization': f'Bearer {KEY}'})
print(f'  /recommendations -> {sc}')

print('--- 3.2 Wrong API key (same length, wrong content) ---')
sc, body = code('GET', '/api/v1/oied/recommendations', {'Authorization': 'Bearer ' + 'x' * 48})
print(f'  /recommendations -> {sc}  body={body}')

print('--- 3.3 No Authorization header ---')
sc, body = code('GET', '/api/v1/oied/recommendations', {})
print(f'  /recommendations -> {sc}  body={body}')

print('--- 3.4 Short token (below 24-char guardrail) ---')
sc, body = code('GET', '/api/v1/oied/recommendations', {'Authorization': 'Bearer short'})
print(f'  /recommendations -> {sc}  body={body}')

print('--- 3.5 JWT fallback (login as admin, call with JWT) ---')
req = urllib.request.Request(f"{B}/api/v1/auth/login",
  headers={'Content-Type':'application/json'},
  data=json.dumps({'email':'admin@opportunitypulse.com','password':ADMIN_PW}).encode(),
  method='POST')
try:
    resp = urllib.request.urlopen(req, timeout=15).read()
    jwt = json.loads(resp)['data']['accessToken']
    print(f'  login OK, jwt prefix={jwt[:25]}...')
    sc, _ = code('GET', '/api/v1/oied/recommendations', {'Authorization': f'Bearer {jwt}'})
    print(f'  /recommendations (JWT) -> {sc}')
except urllib.error.HTTPError as e:
    print(f'  login failed: {e.code} {e.read().decode()[:200]}')
