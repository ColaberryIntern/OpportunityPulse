# Opportunity Pulse — Exposure Audit & Expansion Plan
**Date:** 2026-06-22 · **Prepared for:** Ali Muwwakkil · **Question:** How do we see more biddable proposals, and where else can we go?

---

## Executive summary

Opportunity Pulse is doing more than it looks: it is currently watching **2,394 Bonfire opportunities across 59 agency portals** plus federal grants and (when it works) SAM.gov. The API-side tuning done earlier this month is good — SAM is configured for 7 NAICS codes + 16 keywords, SBIR for the full workforce/education keyword set.

But the audit found three things worth acting on:

1. **The federal pipeline is silently DARK.** SAM.gov has failed every day since ~Jun 18 (HTTP 429 — daily quota exhausted) and SBIR.gov returns 403 every run. The daily email still looks healthy because Bonfire is fine, which masks that the federal half is producing zero new rows.
2. **We are scraping 1 of ~8 free aggregating networks.** Bonfire is one platform. OpenGov, DemandStar, BidNet, PlanetBids/Vendorline, Public Purchase, Periscope, and Ionwave are all free to register and each aggregates thousands of agencies we cannot currently see.
3. **The opportunities we are most likely to WIN are in lanes Opportunity Pulse does not track at all** — SBIR, the NSF "AI-Ready America" state hubs, TX DIR DBITS, and cooperative vehicles. These bypass the certification wall that disqualifies us from most Bonfire/SAM software bids.

**The single most substantial find:** **NSF TechAccess — AI-Ready America (NSF 26-508)** funds **~$1M/year for 3 years per state coordination hub** to do *exactly* Colaberry's work — AI readiness assessments, hands-on AI deployment help for businesses and government, and workforce training. No hosting certification required. Round 1 full proposals are due **July 16, 2026**; Round 2 ~Dec 2026. This is a multi-million-dollar, exact-profile fit that OP would never surface because it is a cooperative/grant vehicle, not an RFP.

---

## 1. What Opportunity Pulse sees today (ground truth, live prod)

| Source | Total | Last 7d | Newest | State |
|---|---|---|---|---|
| Bonfire (59 agencies) | 2,394 | 219 | Jun 22 | ✅ healthy |
| sam_gov | 499 | 64 | **Jun 17** | ❌ failing (429) |
| grants_gov | 424 | 6 | Jun 19 | ✅ running (few new) |
| sbir_gov | — | 0 | — | ❌ failing (403) |
| usa_spending | 390 | 1 | Jun 17 | ⚠️ historical awards, not open bids |
| usajobs | 497 | 0 | Mar 13 | ❌ no API key (dead) |

The rest of the data sources (freelancer 18k, devto, arxiv, google_news, huggingface, etc.) are AI **jobs/news/research** feeds — useful for the intelligence product, irrelevant to government bids.

**Bonfire reach** is registration-scoped: the scraper only sees agencies the configured vendor account is registered with via Bonfire's `vendors/me/agencies` ("My Network") endpoint — currently **59 agencies**, heavily Texas-weighted (Utah U3P 801, DART 202, TxDOT 152, Harris County, Dallas, TDCJ, Fort Worth) but reaching Detroit, LA Court, Baltimore, and even NATO/Bahamas.

---

## 2. Two critical defects (federal pipeline is dark)

### 2a. SAM.gov — daily quota exhausted (HTTP 429, code 900804)
- **Symptom:** every `sam_gov` run since Jun 18 fails on the *first* request: `"You have exceeded your quota. You can access API after <next midnight UTC>"`. Confirmed with a manual `limit=1` call — throttled immediately.
- **Root cause:** the SAM.gov API key is a **low-tier (personal/non-federal) key** with a small daily request cap. The 7-NAICS × pagination fan-out blows through the cap on the first run, then 429s for the rest of the day.
- **Fix options:**
  - **Best:** provision a **non-federal *system account* API key** (free, ~1,000 requests/day) through Colaberry's SAM.gov entity admin. The current 7-NAICS config then works as designed. *(Ali / SAM.gov admin action.)*
  - **Code mitigation (keeps partial flow alive now):** rotate NAICS across the week (1–2 codes/day) and cap total requests/run to stay under the personal-key limit. *(I can implement this.)*

### 2b. SBIR.gov — HTTP 403 every run
- **Symptom:** every `sbir_gov` run returns `403` (e.g. kw "machine learning"). The adapter already retries/backs off; the endpoint is rejecting us outright.
- **Likely cause:** SBIR.gov changed its public API auth/headers, or is blocking the request signature. Needs a header/user-agent/endpoint fix and re-test. *(I can investigate.)*
- **Note:** even when fixed, SBIR.gov ingestion only surfaces *topics*; actual SBIR proposals are submitted on agency portals (NSF/IES — see §4).

### 2c. usajobs — no API key (minor)
Enabled but `USAJOBS_API_KEY` is unset, so it fails daily. It produces federal *jobs*, not contracts — recommend disabling it to clean up the red, or add a key if the jobs feed is wanted.

---

## 3. Breadth gap — we scrape 1 of ~8 free aggregating networks

Bonfire/Euna is one platform. Each network below is **free to register and free to bid** (the agency pays the SaaS license, not the vendor), and each aggregates across many agencies. Registering widens what we can SEE; several can be wired into OP later.

| Network | URL | Aggregates? | Cost | Fit | Priority |
|---|---|---|---|---|---|
| **Euna Supplier Network** (our Bonfire, network-wide view) | supplier.eunasolutions.com | Yes — all Euna agencies | Free | High (already on it) | Use network search, not just our 59 |
| **OpenGov Procurement** (was ProcureNow) | procurement.opengov.com/signup | Yes — 1,000s of local govs | Free | High | **Register now** |
| **DemandStar** | network.demandstar.com | Yes — ~700 active agencies | Free tier | High | **Register now** |
| **BidNet Direct** | bidnetdirect.com/vendors | Yes — regional groups, all 50 states | Free tier | High | **Register now** |
| **PlanetBids / Vendorline** | vendor.planetbids.com | Vendorline aggregates 10k+ | Free basic | High (CA/West) | If targeting CA/West |
| **Public Purchase** | publicpurchase.com | Partial | Free | Med-High | Low-effort add |
| **Periscope S2G / BidSync** | app.bidsync.com | Yes (state portals) | Free notifications | Med-High | Add |
| **Ionwave** | ionwave.net/suppliers | Per-agency | Free | Med | Reactive |

**Bonfire-specific lever (already coded, currently unused):** `BONFIRE_SCRAPER_AGENCY_ALLOWLIST` is unset. Setting it to a list of high-value agency subdomains forces the scraper to visit those portals' *public* opportunities even without registering with them — a zero-cost way to expand beyond the 59 followed agencies.

**Home-state master portals (free, register in TX first):** Texas **ESBD / TxSmartBuy** + the **CMBL** bidders list (comptroller.texas.gov/purchasing/vendor/). Then CA (Cal eProcure), NY (NYS Contract Reporter), FL (MyFloridaMarketPlace) as you pursue them.

---

## 4. Depth gap — the lanes where we actually WIN (OP tracks none of these)

The disqualification engine keeps proving the same truth: most Bonfire/SAM software bids are cert-walled (SOC 2 / TX-RAMP) or past-performance-gated. The winnable lanes sell **advisory, analysis, assessment, prototype, and training** — work product, not certified hosted software.

| # | Lane | Why it fits | $ size | Deadline / next action |
|---|---|---|---|---|
| 1 | **NSF TechAccess: AI-Ready America** (NSF 26-508) | Funds AI readiness, deployment help, training — exactly us. Partner under a TX university/workforce lead. | ~$1M/yr × 3 yrs per hub | **Round 1: Jul 16, 2026**; Round 2 ~Dec 2026. Contact a likely TX lead this week. |
| 2 | **NSF SBIR/STTR** (NSF 26-510, Learning & Workforce/AI) | No cert wall; upskilling/analytics fit. | Phase I up to $305K | Project Pitch (required) open now → proposal deadlines **Jul 27 / Nov 4 / Mar 4**. |
| 3 | **ED / IES SBIR** | Explicitly funds "AI tutors, **data dashboards**, assistive tech." | Phase I ~$250K → II $1M | FY26 closed Jun 29; register for FY27 alert, start a concept. |
| 4 | **TX DIR DBITS** | "Business Intelligence, Data Mgmt, Analytics" + "IT Assessments/Advisory"; deliverables-priced, no cert wall, Texas-local. | per-SOW, < $10M | Watch dir.texas.gov for the next DBITS RFO; meanwhile **sub** onto a current DBITS holder. |
| 5 | **Co-ops: Sourcewell / TIPS / OMNIA** | One competitive win → tens of thousands of agencies buy with no re-bid. Evaluates past performance + price, **not** SOC 2. | durable | Create vendor accounts, set alerts (Sourcewell #11403 already on radar). |
| 6 | **SBA SUBNet + DSBS profile + WOSB/8(a)** | Lowest barrier; builds the past performance the other lanes want. | varies | Complete DSBS profile in SAM.gov (NAICS 541511/541512/541611/611430); check SUBNet weekly. |

---

## 5. Critical correction — Texas HUB is gone

In **December 2025** the Texas Comptroller replaced the **HUB** (Historically Underutilized Business) program with **VetHUB** — eligibility is now **service-disabled veterans only**. Women- and minority-owned firms lost HUB eligibility (a lawsuit filed Mar 2026 is unresolved). **Do not build any Texas state strategy around HUB.** Pivot to DBITS/TIPS deliverables vehicles + federal SBA certifications (8(a)/WOSB/HUBZone, if Colaberry qualifies by ownership).

---

## 6. Prioritized action plan

### This week
- [ ] **Fix the dark federal pipeline:** provision a SAM.gov non-federal *system account* key (root cause of the 429). I implement the NAICS-rotation mitigation as a stopgap + investigate the SBIR 403.
- [ ] **Submit an NSF Project Pitch** (seedfund.nsf.gov) — free, required on-ramp, gates the Jul 27/Nov 4 deadlines.
- [ ] **Identify a Texas lead org for NSF TechAccess** (R1 university / TWC-aligned) to be named a partner before **Jul 16**.
- [ ] **Register free** on OpenGov, DemandStar, BidNet (one afternoon, thousands of new agencies).

### 30 days
- [ ] Get on **CMBL / ESBD** (TX home-state); start **TX DIR DBITS** vendor process; identify 2–3 DBITS holders to sub under.
- [ ] Create **Sourcewell + TIPS** vendor accounts; set IT/consulting solicitation alerts.
- [ ] Complete **DSBS profile**; apply for any **SBA cert** Colaberry qualifies for (8(a)/WOSB).
- [ ] Wire the **highest-value new networks into OP** (OpenGov/DemandStar adapters) and set a **Bonfire allowlist** to expand beyond 59 agencies.

### 60–90 days
- [ ] Build **NSF SBIR (Nov 4)** and **ED/IES SBIR (FY27)** proposals.
- [ ] Pursue the first **DBITS/TIPS sub deliverable** to bank past performance.
- [ ] Begin **GSA MAS 541611** onboarding (6–12 month track).

---

## 7. Honest caveats
- Individual RFP listings on third-party aggregators (e.g. rfpmart) are **unverified** — confirm on the issuing agency's own portal.
- SBIR/grant cycle dates shift; verify exact FY27 dates before committing.
- Whether Colaberry qualifies for WOSB/8(a)/HUBZone depends on ownership facts not in scope here.
- Even with maximum exposure, raw federal/Bonfire bids remain low-win-rate for a no-cert, thin-past-performance firm. The structural wins are co-ops, SBIR, TechAccess, and subcontracting — which is why expanding *registration* matters more than expanding *scraping*.
