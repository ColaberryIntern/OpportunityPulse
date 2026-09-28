# Directive — Bonfire Opportunities API Contract (external consumer: Enterprise AI Accelerator)

**Consumer:** Colaberry Enterprise AI Accelerator, admin "Factory Command Center" →
Government Opportunities page. Server-to-server from prod backend `95.216.199.47`.
No browser, no user session.

**Status of this document:** Sections 2–4 are verified against source and safe to
implement against. Owner approved option **B** (a narrow `read:bonfire_source` API-key
scope) and the **`/best-fit`** endpoint on 2026-09-28; both are implemented and tested,
committed as **`66944c8`** on branch `feat/accelerator-bonfire-read-integration`.

**Rollout state as of 2026-09-28 — NOT LIVE:**

| Step | State |
|---|---|
| Deploy to prod | ❌ **Blocked.** Branch is local only; `git push` was not authorized. Prod also has 2 unpushed commits — see §5b. |
| `api_keys` table | ✅ Verified present on prod (5 rows) |
| `BONFIRE_ENGINE_ENABLED` | ✅ Verified `true`; `/bonfire/flag` returns `enabled:true` |
| Base URL | ⚠️ **`op.colaberry.ai` does not exist (NXDOMAIN)** — see §5a-bis |
| Credential minted | ❌ **No.** Would 400 until the scope deploys — see §5c |
| Live smoke test | ❌ Not possible: no deploy, no key, no such hostname |

**Verified against:** `f0c577c` (branch `main`), local working tree, 2026-09-28.
Every claim below cites the file that establishes it. Values marked
**(unverified in prod)** come from `docker-compose.prod.yml` defaults; `.env.prod` on the
VPS can override them and was not readable during this pass.

---

## 1. Authentication — what works today

### 1a. JWT (the only mechanism that currently reaches these routes)

`POST /api/v1/auth/login {email, password}` → `data.accessToken`, then
`Authorization: Bearer <token>`. Confirmed: `backend/src/auth/auth.service.js:95`.

Token payload is exactly:

```
{ userId, email, role }
```

**TTL: 15 minutes.** `JWT_ACCESS_EXPIRY` is hardcoded to `15m` in
`docker-compose.prod.yml:50`. `auth.service.js:102` reads it with a `'15m'` fallback.

**There is no refresh endpoint.** The auth router exposes only `/register`, `/login`,
`/me`, `/profile`, `/account`, `/my-data`, `/change-password`, `/forgot-password`,
`/reset-password`, `/resend-verification` (`backend/src/auth/auth.routes.js`). No
refresh token is issued and none is accepted. **Refresh = re-login.** A consumer must
re-POST `/auth/login` when the token expires (or on any 401 with
`"Token expired. Please log in again."`).

`/auth/login` is behind `authLimiter`: **50 requests / 15 min**
(`AUTH_RATE_LIMIT_MAX: "50"`, `docker-compose.prod.yml:56`). Cache the token for its
full 15 minutes; do not log in per page load.

### 1b. `role` must literally be `'admin'` to un-redact `sourceUrl`

`backend/src/bonfire/bonfire.util.js`:

```js
const ADMIN_ONLY_FIELDS = ['sourceUrl', 'rawText', 'source_url', 'raw_text'];
function isAdmin(user) { return !!user && user.role === 'admin'; }
```

Non-admin gets those four keys set to `null` (the keys are still present — they are
nulled, not removed). Redaction is applied on every egress path: list, detail, and
enrich (`bonfire.controller.js` calls `redactListForRole` / `redactForRole`).

Roles are `admin | consultant | auditor | devops` (`backend/src/config/constants.js:1`).
**There is no read-only admin role.** `checkPermissions(ROLES.ADMIN)`
(`backend/src/middleware/rbac.middleware.js`) gates writes on the same `role` string,
so any token carrying `role: 'admin'` can also POST every admin-gated write in the app —
`/enrich-all`, `/deep-vet`, `/pursue`, `/upload/json`, `/opportunities/:id/attachments`,
submission packages, and the admin surfaces outside Bonfire. See Section 5.

### 1c. `X-API-Key` with the `read:bonfire_source` scope — **the chosen mechanism**

This is what the accelerator should use. **Adapt your client to send a static header
and drop the login loop entirely:**

```
GET /api/v1/bonfire/best-fit?limit=10
X-API-Key: op_<64 hex chars>
```

No `Authorization` header, no `/auth/login` call, no token refresh, no expiry.

**Why a scope and not an admin service account.** `role` is the string
`rbac.middleware.checkPermissions()` gates every admin write on. Attaching it to a
machine credential would grant write authority over `/enrich-all`, `/deep-vet`,
`/pursue`, `/upload/json`, attachments and submission packages — far beyond a read
integration. So `verifyApiKey` deliberately sets **no `role`**, and the read capability
is granted through `scopes` instead. Writes stay closed *by construction*: an API-key
request has no `role`, so `checkPermissions(ROLES.ADMIN)` rejects it with 401 even if
the key also holds the generic `write` scope. This is asserted in
`backend/tests/bonfire/sourceFieldsScope.test.js`.

**What shipped to make this work** (was not possible before 2026-09-28):

| File | Change |
|---|---|
| `bonfire.util.js` | New `SOURCE_FIELDS_SCOPE = 'read:bonfire_source'` + `canReadSourceFields(user)`; `redactForRole` now un-redacts for admin **or** a key holding that scope. |
| `apiKeys/apiKey.validation.js` | `ALLOWED_SCOPES = ['read','write','read:bonfire_source']` (was `['read','write']`, which would have 400'd the new scope). |
| `bonfire.routes.js` | `/opportunities`, `/opportunities/:id`, `/best-fit` moved from `verifyToken` to `verifyTokenOrApiKey`. **Reads only** — no write route was touched. |
| `middleware/apiKeyAuth.middleware.js` | Its JWT branch was missing the `id`/`userId` normalization `verifyToken` does, which would have silently dropped `req.user.id` for the frontend on the switched routes. Fixed. Also documented why `role` must never be added to the API-key branch. |

Note: `verifyTokenOrApiKey` had **zero** callers before this change — these three routes
are its first production users, so it had never been exercised. That is the main reason
to smoke-test both auth paths (JWT *and* key) after deploy, not just the new one.

**Key properties, from `apiKeys/apiKey.service.js` + `models/ApiKey.js`:**

- Format `op_` + 64 hex chars; stored as a bcrypt hash (cost 10). The plaintext is
  returned **once, at creation** and is unrecoverable afterward.
- **Keys do not expire.** `expiresAt` exists on the model and is enforced when set, but
  `createApiKey` never sets it and the API exposes no way to. So: **TTL = none**.
  Rotation is manual — see Section 5.
- `lastUsedAt` is stamped per request (fire-and-forget), so the key's use is auditable.
- Revocation is immediate: `isActive=false` → `401 "API key has been revoked."`
- Every request costs one bcrypt compare (~50–100 ms). Irrelevant at page-load volume;
  do not use this key for a tight polling loop.

---

## 2. Response contract for `GET /api/v1/bonfire/opportunities`

### 2a. Envelope — has more keys than `{ data, pagination }`

`paginatedResponse` (`backend/src/utils/apiResponse.js`) returns:

```json
{
  "status": "success",
  "message": "Success",
  "data": [ /* BonfireOpportunity[] */ ],
  "pagination": { "total": 0, "limit": 50, "offset": 0 },
  "code": 200
}
```

`pagination.limit` / `pagination.offset` echo **the raw query string**, not the values
actually applied. `bonfire.controller.js` computes them as
`Number(req.query.limit) || 50`, while the service separately clamps the real limit to
`Math.min(limit, 200)`. Request `limit=500` and you get 200 rows but
`pagination.limit: 500`. **Trust `data.length`, not `pagination.limit`.**

One extra top-level key, `clusterContext`, appears **only** when `?fromCluster=` is
passed. It is absent for this integration.

Errors are `{ status: "error", message, code }` — note `message`, not `error`.
A failed list returns `500 "Failed to list opportunities"`.

### 2b. Field-by-field

Source: `backend/src/models/BonfireOpportunity.js`. Sequelize `toJSON()` emits
camelCase.

| Field | Type on the wire | Units / range | Null? | Notes |
|---|---|---|---|---|
| `id` | string (UUID v4) | — | no | **Yes — same uuid** as `GET /opportunities/:id`. It is the PK; deep-linking is correct. |
| `title` | string ≤500 | — | no | |
| `agency` | string ≤300 | — | **yes** | |
| `priorityScore` | number (int) | **0–100** | **yes** | `null` until AI-enriched. Deterministic weighted sum of four 0–100 sub-scores, weights `0.4/0.3/0.2/0.1` summing to 1.0 → range is structurally 0–100 (`bonfire.scoring.js:46`). |
| `fitScore` | number (int) | **0–100** | **yes** | `null` until enriched. AI-provided, hard-clamped: `clamp(ai.fit_score, 0, 100)` (`bonfireAI.service.js:122`). |
| `estimatedValue` | **string** ⚠️ | **CENTS** (dollars × 100) | **yes** | Cents is correct. **But it is `BIGINT`, and `pg` returns int8 as a JSON string** — no `parseInt8` override exists anywhere in the repo. Our own frontend casts: `Number(cents) / 100` (`frontend/src/components/bonfire/BonfireTable.jsx:6`). Do the same; `value / 100` coerces by luck, `value.toFixed()` or `>` comparisons will not. |
| `closeDate` | string, **full ISO-8601 UTC** | e.g. `2026-11-14T00:00:00.000Z` | **yes** | Postgres `timestamptz`, not a date-only string. |
| `sourceUrl` | string | — | **yes** | **Admin-only.** `null` for non-admin. Confirmed. |
| `rawText` | string | ≤16000 chars | yes | Admin-only, same rule. Not in your mapping — just don't rely on it. |
| `aiCategory` | string ≤50 | one of 7, below | **yes** | `null` until enriched; once enriched it is always one of the 7 (unknown AI values fall back to `'Consulting'`, `bonfire.scoring.js:93`). |
| `pursuitStatus` | string ≤20 | **4 values, below** | **no** | `NOT NULL`, defaults `'none'`. |
| `vetVerdict` | object \| null | see below | yes | JSONB. Drives the digest re-rank. |
| `tags` | array | `[{ tag: string }]` | no | Always included (`include: [{ model: BonfireOpportunityTag, as: 'tags' }]`). Objects, not bare strings. |

Also present and possibly useful: `description`, `overview`, `signals` (JSONB array of
`HIGH_ROI` / `HIGH_AUTOMATION` / `QUICK_WIN` / `PRODUCTIZABLE`), `recommendedProduct`,
`automationPotential`, `revenueWeight`, `repeatability`, `easeOfEntry`, `categoryRaw`,
`externalId`, `strategy`, `enrichedAt`, `createdAt`, `updatedAt`.

**`pursuitStatus` — your enum is missing one value.** Actual set is
`['none', 'pursuing', 'declined', 'submitted']`
(`backend/src/bonfire/bonfirePursuit.service.js:16`). You listed three; **`declined`**
is the fourth. Legal transitions: `none→pursuing`,
`pursuing→{declined,submitted,none}`, `declined→pursuing`. It is a
`STRING(20)`, not a Postgres enum, so treat unknown values defensively.

**`aiCategory`** ∈ `Staffing | Data & Analytics | Consulting | Compliance |
Financial Services | Education | IT Services` (`bonfire.constants.js:1`).
Note the `&` and spaces — match exactly.

**`vetVerdict`** shape: `{ status, disqualifier, label, lane?, unblocked_by? }`.
`status` ∈ `no_bid | conditional | needs_review` (a clean row is `vetVerdict: null` —
there is no `'bid'` status). `disqualifier` is a code such as `DOMAIN_MISMATCH`,
`CERT_WALL`, `PRODUCT_REQUIRED`, `SCALE_WALL`, `EXPERIENCE_GATE`,
`PHYSICAL_INSTALL`, `DEADLINE_TIGHT`. `label` is human-readable and is what the UI
should show.

### 2c. Query parameters — full list

From the destructure at `bonfire.service.listOpportunities`:

| Param | Accepts | Default | Behavior |
|---|---|---|---|
| `order` | `priority_desc`, `priority_asc`, `close_asc`, `created_desc` | `priority_desc` | Unrecognized values **silently fall back** to `priority_desc` (no validation — see 2d). |
| `limit` | int | `50` | **Hard-capped at 200.** |
| `offset` | int | `0` | |
| `includeExpired` | `'true'` / anything else | **`false`** — confirmed | See the important caveat below. |
| `agency` | string | — | Case-insensitive **partial** match (`ILIKE %v%`). |
| `category` | string | — | **Exact** match on `aiCategory`. |
| `minScore` / `maxScore` | int | — | `priorityScore >= / <=`. |
| `closeBefore` | date string | — | `closeDate <= v`. |
| `highAiFit` | `'true'` | — | `fitScore >= 75` (threshold is hardcoded). |
| `q` | string | — | `ILIKE` across `title`, `description`, `agency`. |
| `fromCluster` | uuid | — | Strategic-cluster drilldown; adds `clusterContext` to the envelope and changes the default sort. Not for this integration. |

**`includeExpired=false` does not mean "no closed bids."** The filter is
`closeDate IS NULL OR closeDate >= now() OR pursuitStatus IN ('pursuing','submitted')`.
So a top-10 from this endpoint **can contain an already-closed opportunity** if someone
marked it pursuing/submitted, and **can contain rows with no close date at all**.

### 2d. Two sharp edges on the generic list endpoint

1. **`order=priority_desc` puts `NULL` scores FIRST.** The order clause is
   `[['priorityScore','DESC'], ['createdAt','DESC']]` with no `NULLS LAST`. Postgres
   defaults to `NULLS FIRST` on `DESC`. The code comments acknowledge this. Un-enriched
   rows (`priorityScore: null`) therefore sort **above** a genuine 95. This alone means
   `?order=priority_desc&limit=10` is **not** the digest's top 10.
2. **No query-param validation.** `router.get('/opportunities', verifyToken, controller...)`
   has no Zod/express-validator layer. Bad input degrades silently rather than 400-ing.

---

## 3. Digest parity — the `topBonfire` rules

Source: `backend/src/emailDigest/richDigest.service.js:207`. The email's Bonfire section
asks for **10** (`TOP.bonfire = 10`, line 27) — matching "Top 10 Bonfire Contracts to Bid".

```js
async function topBonfire(limit) {
  const cutoff = new Date(Date.now() + BONFIRE_DIGEST_MIN_CLOSE_DAYS * 864e5);
  const biddableFirst = `CASE WHEN (${notHiddenVerdict("(vet_verdict->>'status')")})
                              AND (title ~* '${BONFIRE_DOMAIN_RE}') THEN 0 ELSE 1 END`;
  return BonfireOpportunity.findAll({
    where: { closeDate: { [Op.gte]: cutoff } },
    order: [
      [literal(biddableFirst), 'ASC'],
      ['priorityScore', 'DESC NULLS LAST'],
      ['fitScore',      'DESC NULLS LAST'],
      ['createdAt',     'DESC'],
    ],
    limit,
  });
}
```

### 3a. WHERE — one hard filter

`closeDate >= now() + BONFIRE_DIGEST_MIN_CLOSE_DAYS days`.

- Default **10 days** (`richDigest.service.js:45`, `parseInt(env) || 10`, floored at 0).
  `docker-compose.prod.yml:106` sets `${BONFIRE_DIGEST_MIN_CLOSE_DAYS:-10}`
  **(unverified in prod — `.env.prod` may override)**.
- **Rows with `closeDate IS NULL` are excluded.** A SQL `>=` comparison drops NULL.
  This differs from the generic list endpoint, which keeps them.
- **No pursuit exception.** Unlike the list endpoint, `pursuing`/`submitted` does not
  rescue a closed bid. Operator's rule, quoted in the source: *"Don't add bonfires with
  negative days left, they are closed."*
- No `includeExpired` equivalent, no agency/category filter, no `id`-range or
  source-based exclusion in this path.

### 3b. ORDER — the re-rank is a DEMOTION, not a filter

**Correction to your assumption:** the digest does **not** hide
`vetVerdict.no_bid` / `needs_review`. Those statuses only push a row into the **second
bucket** of the `biddableFirst` CASE. They still appear, below the biddable rows, and
the email deliberately renders their red/amber verdict label so the "why it's dead"
reasoning stays visible. (The `notHiddenVerdict` helper *is* used as a hard `WHERE`
filter — but in the **gov-contracts** section, not the Bonfire one.)

Bucket 0 (top) requires **both**:

1. `vet_verdict->>'status' IS NULL OR NOT IN ('no_bid','needs_review')`
   — from `HIDDEN_VERDICTS`, env-tunable via `DIGEST_HIDE_VERDICTS`, default
   `'no_bid,needs_review'`, sanitized to `[a-z_]`. `DIGEST_HIDE_VERDICTS` is **not set in
   `docker-compose.prod.yml`**, so prod uses the default unless `.env.prod` adds it
   **(unverified in prod)**.
2. `title ~* BONFIRE_DOMAIN_RE` — Postgres case-insensitive regex on **`title` only**.
   `aiCategory` is deliberately **not** used ("OP's LLM over-assigns 'IT Services' to
   junk"). The verbatim alternation (`richDigest.service.js:79`):

```
software|analytic|artificial intelligence|machine learning|information technolog|consulting|advisory|digital|chatbot|conversational|cybersecur|cyber secur| cloud |dashboard|website|web application|web-based|web portal|programming|geospatial|business intelligence|document management|document intelligence|case management|learning management|content management|workforce|upskill|elearning|e-learning|data analyt|data platform|data management|data science|data warehouse| crm | erp |saas|application development|intelligent automation|modernization|technology services|managed it
```

Note the **leading/trailing spaces** in ` cloud `, ` crm `, ` erp ` — they are load-bearing
(they prevent "cloudy"/"scrum" style false hits) and must survive any port. Replicating
this with JS `RegExp` requires `'i'` and is **not** byte-identical to Postgres `~*` for
exotic inputs; this is the main argument against client-side replication.

Then within each bucket: `priorityScore DESC NULLS LAST`, `fitScore DESC NULLS LAST`,
`createdAt DESC`. **`NULLS LAST` here vs. the list endpoint's implicit `NULLS FIRST` is
the single biggest source of divergence between the two lists.**

### 3c. Chosen: option (a) — `GET /api/v1/bonfire/best-fit`

Replicating 3a+3b client-side would hardcode our 10-day floor, our verdict list, and a
50-term Postgres-specific regex — all env-tunable, with no signal to you when they
change. So we exposed the endpoint instead. **Use it; do not reimplement §3.**

```
GET /api/v1/bonfire/best-fit?limit=10
X-API-Key: op_<64 hex>
```

```json
{
  "status": "success",
  "message": "Success",
  "data": [ /* BonfireOpportunity[], exactly the email's rows, in the email's order */ ],
  "ranking": {
    "parityWith": "daily_digest.topBonfire",
    "limit": 10,
    "minCloseDays": 10,
    "demotedVerdictStatuses": ["no_bid", "needs_review"],
    "sort": ["biddable_first ... ASC", "priorityScore DESC NULLS LAST", "..."]
  },
  "code": 200
}
```

- `limit` defaults to **10** (matching `TOP.bonfire`), clamps to **[1, 50]**. Junk input
  (`0`, negative, non-numeric, `NaN`, `Infinity`) falls back to 10 rather than erroring.
- Envelope has **`ranking`, not `pagination`** — there is no paging here by design.
  `ranking` reports the thresholds from the digest module rather than a copy of our own,
  so it always states what the running process actually applied. Note the digest reads
  `BONFIRE_DIGEST_MIN_CLOSE_DAYS` into a module-level `const` at require time, so a
  retune follows on the next restart/redeploy (which an env change needs anyway) — not
  mid-process. Read `ranking.minCloseDays` rather than hardcoding `10`.
- Rows carry the **same redaction rules** as everything else: `sourceUrl` / `rawText`
  need admin or `read:bonfire_source`.
- Parity is **structural, not maintained by hand**:
  `bonfire.service.listBestFitOpportunities()` calls `richDigest.topBonfire` — the exact
  function the email calls. The digest's own code path is unchanged, so this carried no
  regression risk to the daily email. Tests assert the delegation and that row order
  survives verbatim (`backend/tests/bonfire/bestFit.test.js`).
- Errors: `500 { status:'error', message:'Failed to list best-fit opportunities' }`. The
  service deliberately propagates DB failures rather than returning `[]`, so an outage
  reads as an outage on your side and not as "no opportunities today."

---

## 4. Operational

| Question | Answer |
|---|---|
| Reachable server-to-server from `95.216.199.47`? | **Yes — but not at `op.colaberry.ai`, which does not resolve (§5a-bis).** Verified live at `http://95.216.199.47:8091`: origin-less unauthenticated GETs succeed (`/bonfire/flag` → 200). CORS explicitly allows them (`server.js:33-34`). No IP allowlist exists in app code or `nginx/`, so there is nothing to add `95.216.199.47` to. Note the accelerator backend runs on the **same host**, so this is a same-box call — prefer a host-internal address over the public IP so the API key never crosses the public internet in clear text. |
| Rate limits | **Verified in the running container's env**, not just compose: `RATE_LIMIT_MAX_REQUESTS=500`, `RATE_LIMIT_WINDOW_MS=900000` → **500 requests / 15 min** per IP. `/auth/login` additionally **50 / 15 min**. `app.set('trust proxy', 1)` (`server.js:23`), so limits key on the real client IP via `X-Forwarded-For` — the accelerator gets its own bucket, not one shared with browser traffic. Low-volume page-load polling is far inside this, and under option B there is no login call at all, so the 50/15min auth bucket does not apply. |
| Feature-flag risk | **All `/api/v1/bonfire/*` routes return `404` when `BONFIRE_ENGINE_ENABLED !== 'true'`** (`bonfire.middleware.js`), and it **defaults to `false`** in `docker-compose.prod.yml:73`. The digest is demonstrably running, so `.env.prod` must set it `true` — **unverified in prod**. Practical consequence: **a `404` from these routes may mean "flag off", not "bad path".** Probe `GET /api/v1/bonfire/flag` → `{data:{enabled:bool}}`; it is public, unauthenticated, and exempt from the flag gate. Treat `enabled:false` as "degrade the page", not an error. |
| Stability / versioning | Path is already versioned (`/api/v1`). These routes are young and have been iterated (v0.8–v0.11 markers in-tree), so **I will not claim the shape is frozen.** Proposed contract: additive changes (new fields) land without notice; any **removal, rename, type change, or semantic change** to the fields in §2b, or to the §3 ranking, gets a `/api/v2` path or an explicit heads-up to you before deploy, plus a PROGRESS.md entry. On our side, §2b needs a contract test so a drift breaks our build rather than your page — currently **no such test exists**. |

---

## 5. Deploy + credential runbook (NOT yet executed)

The code is in the working tree and tested. **Nothing has been deployed and no key
exists yet.** The order matters: the scope must be deployed *before* a key can be minted
with it, or `POST /api/v1/api-keys` will 400 on the unrecognized scope.

### 5a. Pre-deploy checks — **BOTH VERIFIED ON PROD 2026-09-28, both pass**

1. **`api_keys` table exists.** ✅ **Verified: table present, 5 rows.** The migration
   `20260218000001-create-api-keys.js` *was* applied, so the risk that
   `server.js:299`'s `sync({ alter: false })` had left it uncreated did not materialize.
   Minting will work once the scope is live. Check command, for future reference:
   ```
   docker exec op-backend node -e "require('./src/models').ApiKey.count().then(n=>console.log('api_keys rows:',n)).catch(e=>console.error('MISSING:',e.message))"
   ```
2. **`BONFIRE_ENGINE_ENABLED=true`.** ✅ **Verified in the running container's env.**
   Also confirmed live, and worth recording because §3 and §4 depend on them:
   `BONFIRE_DIGEST_MIN_CLOSE_DAYS=10` (so the documented 10-day floor is what prod
   actually applies), `DIGEST_HIDE_VERDICTS` **unset** (so the documented
   `no_bid,needs_review` default is what prod applies), `JWT_ACCESS_EXPIRY=15m`,
   `RATE_LIMIT_MAX_REQUESTS=500`, `RATE_LIMIT_WINDOW_MS=900000`, `NODE_ENV=production`.
3. **`GET /api/v1/bonfire/flag`** → ✅ `{"status":"success","data":{"enabled":true},"code":200}`.

### 5a-bis. ⚠️ BASE URL CORRECTION — `op.colaberry.ai` DOES NOT EXIST

**`op.colaberry.ai` returns NXDOMAIN.** Verified from two independent resolvers and from
outside the host; the `colaberry.ai` zone (Cloudflare) has **no `op` record**, and the
string `op.colaberry.ai` appears **nowhere** in this repo. Any consumer coded against
`https://op.colaberry.ai/...` will fail at DNS, not at auth.

OP is served **IP-only, on non-standard ports**. `op-nginx` publishes host
`8091 -> 80` and `8444 -> 443` with `server_name _` (the repo's
`deploy/nginx/nginx-ip-only.conf` variant, not the `${DOMAIN}` one). The working base
URL, verified live from outside the host:

```
http://95.216.199.47:8091/api/v1
```

Confirmed against it: `/bonfire/flag` → 200 `enabled:true`; `/bonfire/opportunities` →
401 (route live, auth required); `/bonfire/best-fit` → 404 (not yet deployed — and since
the flag is *on*, that 404 is a genuine "route not registered", which is the clean
pre-deploy baseline).

Two consequences for the integration:
- The accelerator must target `http://95.216.199.47:8091`, or a real DNS record +
  TLS must be provisioned for OP first. **This is a decision for Ali, not a doc fix:**
  plain HTTP over the public internet would carry the API key in clear text. Since the
  accelerator's backend runs on the *same host* (`accelerator-backend`), the safer
  option is a host-internal address or a shared Docker network rather than the public IP.
- The claim "our gov-bid scripts already call you" cannot be true via
  `op.colaberry.ai`. Whatever those scripts use is a different address — worth
  reconciling on the accelerator side before go-live.

### 5b. Deploy — ⚠️ BLOCKED, and `git pull origin main` is the WRONG command here

The work is committed locally as **`66944c8`** on branch
**`feat/accelerator-bonfire-read-integration`** (off `f0c577c`). It is **not on GitHub**
and **not on prod**.

**The divergence PROGRESS.md warned about is real and confirmed:** prod
`/opt/opportunity-pulse` is on `main` at **`79dde5e`**, which is **2 commits AHEAD of
`origin/main`** (`a0fa456`, `79dde5e` — both ingestion/failure-monitor work, never
pushed) and 0 behind. `git rev-list --left-right --count origin/main...HEAD` → `0  2`.
**Those two commits exist only on that box — they are in no remote and no backup.**

So a plain `git pull origin main` would pull nothing useful (origin/main is still
`f0c577c`) while risking entanglement with prod-only history. The safe sequence, once
the push is authorized:

```
# 1. local -> origin (feature branch only; do NOT push to main)
git push -u origin feat/accelerator-bonfire-read-integration

# 2. on prod: snapshot the unpushed commits FIRST so they cannot be lost
ssh root@95.216.199.47
cd /opt/opportunity-pulse
git branch prod-local-backup-$(date +%Y%m%d)      # safety net for a0fa456 + 79dde5e
git fetch origin
git merge --no-edit origin/feat/accelerator-bonfire-read-integration

# 3. backend only -- this change touches no frontend file
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
```

A conflict is unlikely (this branch touches `bonfire/`, `apiKeys/`, `middleware/`,
`emailDigest/`; the prod-only commits touch ingestion), but if one occurs,
`git merge --abort` returns prod to `79dde5e` with no harm done.

**Separately, someone should decide what happens to `a0fa456` + `79dde5e`.** They were
deliberately never pushed and I did not publish them — that is not my call. Until they
are pushed, prod is the single copy.

### 5c. Mint the credential — ⚠️ BLOCKED until 5b lands (by design)

**No key has been minted, and minting now would fail.** Prod is still running code whose
`ALLOWED_SCOPES` is `['read','write']`, so `POST /api/v1/api-keys` with
`read:bonfire_source` returns **400** on the unrecognized scope. This is the exact
ordering constraint recorded when the scope was designed — deploy first, then mint.

Proof the scope is not live, from outside the host and without needing container access:
`/bonfire/flag` returns `enabled:true` while `/bonfire/best-fit` returns `404`. With the
feature flag *on*, that 404 can only mean the route is not registered — i.e. `66944c8`
is not deployed, so neither is the scope.

**Do not mint a `['read']`-only key as a stand-in.** It would authenticate and return
rows, but `sourceUrl` would be `null` — the one field this integration exists to deliver.
That failure is silent and would look like an OP data problem rather than a
wrong-credential problem.

Create a **dedicated non-admin service user** and mint the key under it — not under
Ali's account. Rationale: the key inherits nothing from the user's role (we never attach
`role`), but tying it to a service identity keeps `lastUsedAt` auditing clean and means
Ali's account lifecycle is independent of the integration.

```
# 1. Service user, role=consultant (NOT admin — the scope does the work, not the role)
#    Use a password from a generator; it is never needed again after minting.
# 2. Mint, authenticated as that service user:
POST /api/v1/api-keys
Authorization: Bearer <service user's JWT>
{ "name": "accelerator-factory-command-center",
  "scopes": ["read", "read:bonfire_source"] }
```

The response contains the plaintext key **once**. Capture it straight into the
accelerator's `.env.prod` as `OP_API_KEY`. **Do not** paste it into a ticket, a Basecamp
comment, a chat, or an agent transcript. If it lands in one, revoke and re-mint — that is
routine, not an incident.

### 5d. Post-deploy smoke test (both auth paths)

`verifyTokenOrApiKey` had no callers before this change, so verify **both** branches:

| Check | Expect |
|---|---|
| `GET /bonfire/best-fit` with the key | 200, ≤10 rows, `sourceUrl` **non-null** |
| `GET /bonfire/opportunities?limit=5` with the key | 200, `sourceUrl` non-null |
| Same, key with `["read"]` only | 200 but `sourceUrl: null` |
| `POST /bonfire/enrich-all` with the key | **401** — the property that makes option B safe |
| Frontend Bonfire page, normal admin login | unchanged (the JWT branch still works) |
| `GET /bonfire/flag` unauthenticated | `{data:{enabled:true}}` |
| Bogus key | 401 `"Invalid API key."` |

### 5e. Rotation

No expiry, so rotation is deliberate: mint the replacement first, swap the accelerator's
env, confirm traffic on the new key via `lastUsedAt`, then
`DELETE /api/v1/api-keys/:id` the old one. Revocation takes effect on the next request.
There is no IP allowlist to add anyone to — none exists in app code or `nginx/`.

### 5f. Follow-ups this change did not do

- **No contract test for §2b.** Field-shape drift would break the accelerator's page
  rather than our build. Worth adding a test that asserts the serialized keys/types of a
  `BonfireOpportunity` row.
- **`estimatedValue` string-vs-number** is left as-is (a `pg` `parseInt8` override would
  be a breaking change for existing consumers, including our own frontend).
- **`order=priority_desc` NULLS-FIRST** on the generic list endpoint is left as-is; it is
  pre-existing behavior and `/best-fit` sidesteps it. Fixing it would silently reorder
  the admin UI's default view.
- `validateApiKey` does not check whether the owning user is still active — only that the
  key is. Minor; worth tightening if service accounts proliferate.

---

## 6. Historical: options considered for the credential

Recorded because the reasoning matters if this is ever revisited. **Option B was chosen.**

The governing finding was §1b: **there is no read-only admin role.** `isAdmin()` tests
`user.role === 'admin'`, and that same string is what gates every admin write in the app.
So "give the accelerator admin-level read scope" is not a thing OP could express before
this change — admin-level read and admin-level write were the same grant.

| Option | Code change | Privilege granted | Verdict |
|---|---|---|---|
| **A.** Service user, `role='admin'`, email+password | **None** — would have worked with the consumer's existing client immediately | Full admin **write** across all of OP, not just Bonfire reads | Rejected: **over-privileged** |
| **B.** `read:bonfire_source` scope on the existing API-key system | 3 files + a middleware fix | Un-redacted Bonfire **reads only**; writes closed by construction | **CHOSEN** — least privilege, static header, no refresh loop |
| **C.** Service user with a non-admin role | None | Reads work, `sourceUrl` stays `null` | Rejected: the consumer needs `sourceUrl` |

Creating the credential is a production write and a security-posture change — both
explicit ESCALATE triggers in `CLAUDE.md` — which is why it was put to the owner rather
than done autonomously, and why §5c is a runbook for a human rather than something this
pass executed.

The credential is delivered to Ali out of band and must never be pasted into a shared
transcript, ticket, Basecamp comment, or agent log.
