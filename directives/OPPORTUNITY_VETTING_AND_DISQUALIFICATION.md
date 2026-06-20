# Opportunity Vetting & Disqualification Scrutiny

**Purpose.** Opportunity Pulse's scores (`priority_score`, `fit_score`, `bid_score`) measure how *relevant and valuable* an opportunity looks from its title, agency, value, and category. **They do NOT measure whether Colaberry can actually submit and win it.** A `priority 74 / fit 70` contract can still be an automatic no-bid. This directive defines the scrutiny that turns a high-scoring row into a `BID` / `NO_BID` / `CONDITIONAL` verdict, and the disqualification taxonomy that gets written back to OP so the reason shows on the app and in the daily digest.

The rule: **a score is a candidate, not a decision.** Nothing is biddable until it clears the gate-check below on the *actual solicitation documents*.

---

## The four stages

### Stage 0 — OP scoring (automatic)
OP ranks candidates by `bid_score`/`fit_score`. This is the funnel's top. It is blind to cert walls, domain fit, scale, experience gates, and deadlines. **Never treat a top-10 row as biddable on the score alone.**

### Stage 1 — Auto-screen (automatic, pre-download)
`disqualification.service.js` scans the title + description + agency for known disqualifier *signals* and attaches a **tentative** flag (`auto: true`). This is a caution, not a verdict — it tells a human which rows are likely dead before anyone downloads anything. Example signals: cert-walled state agencies (TDHCA, UTD, TDCJ), physical-install language ("bid bond", "IFB plans"), out-of-domain keywords ("building automation", "property management", "real estate brokerage", "transportation software"), enterprise-scale ("parent guarantee", "managed services"), narrow experience gates ("minimum of five (5) years").

### Stage 2 — Download the full document set (HUMAN, required)
**You cannot vet from the OP summary.** OP's `overview` is an LLM guess and `raw_text` is a stub; the real requirements live in the RFP package. A human must download the complete zip from the Bonfire/Euna portal (or the SAM.gov attachments) — RFP body, scope/specs, minimum-qualifications, insurance/bonding, addenda, forms. **No verdict is valid without the documents in hand.**

### Stage 3 — Deep vet (AI + human, on the documents)
Read the governing docs and answer each gate. **Any single hard gate = NO_BID.**

| Gate | What kills it | Disqualifier code |
|---|---|---|
| **Security certification** | Mandatory at submission: TX-RAMP, SOC 2, StateRAMP/GovRAMP, FedRAMP, CJIS, FIPS, HECVAT | `CERT_WALL` |
| **Domain fit** | Not Colaberry's lane: construction, AV/hardware install, property management, social-services delivery, building automation/HVAC, field inspection | `DOMAIN_MISMATCH` |
| **Scale / financial** | Enterprise outsourcing, parent guarantee, source-code escrow, $20M+ capacity | `SCALE_WALL` |
| **Experience gate** | Mandatory N years of *specific* prior work ("5 years infill-housing financial modeling", "3 prior like-for-like deployments") | `EXPERIENCE_GATE` |
| **Product required** | Wants an existing commercial product in a vertical we don't have (EPM, transportation, licensing, AI-video SaaS) | `PRODUCT_REQUIRED` |
| **Physical delivery** | Furnish-and-install hardware, bid bond, IFB plans/drawings, on-site operations | `PHYSICAL_INSTALL` |
| **Set-aside ineligible** | Reserved for a cert we lack: 8(a), WOSB/EDWOSB, HUBZone, SDVOSB | `SET_ASIDE_INELIGIBLE` |
| **Deadline** | Real deadline (verified on cover page + addenda) is < 14 days — too tight to prepare | `DEADLINE_TIGHT` |
| **Incumbent lock** | Re-compete clearly wired to the incumbent / their product | `INCUMBENT_LOCK` |

> Deadlines: OP's `close_date` is unreliable. **Verify against the RFP cover page AND every addendum** before trusting it.

**Verdict logic:**
- **NO_BID** — any hard gate fails. Record the code + a verbatim evidence quote.
- **CONDITIONAL** — clears all gates *except* one that a partner can satisfy (e.g., Que holds the experience/cert). Record what unblocks it.
- **BID** — clears every gate; Colaberry can deliver and win. Record the lane (services / SBIR / co-op).

### Stage 4 — Record the verdict in OP
Write the result to `opportunities.ai_analysis.vetVerdict`:
```json
{
  "status": "no_bid | conditional | bid | needs_review",
  "disqualifier": "CERT_WALL",
  "label": "No-bid: TX-RAMP + SOC 2 required at submission",
  "evidence": "<verbatim quote from the RFP>",
  "lane": "services | sbir | coop | null",
  "unblocked_by": "Que: 5-yr infill-housing experience",
  "auto": false,
  "vetted_at": "ISO-8601"
}
```
Once written, the verdict label renders on the opportunity card (app) and on each digest row, so the daily email shows **why** a high-scoring row is dead — not just its score.

---

## Why this matters
Without it, the digest is a list of plausible-looking traps: `Jefferson HS Building Automation` (HVAC, not our lane), `UTD Community Development Software` (TX-RAMP wall), `TxDOT Application Services` (enterprise scale), `Residential Small Group Home / DHHS` (social-services delivery). Every one scores well and every one is a no-bid. The verdict label converts the funnel from "things that look biddable" into "things we have actually scrutinized," and preserves the *reasoning* so the same dead opportunity is never re-vetted from scratch.

**Maintainer note:** `auto` flags are cheap heuristics and can be wrong in both directions — they only triage. A `false`-`auto` verdict (human/AI confirmed on the documents) always overrides an auto flag.
