#!/usr/bin/env node
/**
 * Send the Opportunity Pulse scoring & ranking reference email to Ali via
 * the Mandrill kit (Path B, standalone). This is reference documentation
 * meant to be replicated by another project, so it has no originating BC
 * ticket. Doctrine: validateBeforeSend() preflight, branded signature,
 * BCC ali@.
 *
 * Run:
 *   MANDRILL_API_KEY="md-..." node backend/src/scripts/sendScoringReference.js
 */

const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');
const { SIG_HTML, SIG_TEXT } = require('./lib/emailSignature');

const TO = 'ali@colaberry.com';
const SUBJECT = 'Opportunity Pulse / Scoring & Ranking Reference (full documentation)';

// Body HTML. All long-dash separators use ASCII characters: slash, colon,
// or hyphen with spaces. The em-dash hook will reject the file if any U+2014
// or U+2013 slips into source.
const BODY_HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 760px;">

<p>Hi Ali,</p>

<p>Comprehensive documentation of every scoring &amp; ranking engine inside Opportunity Pulse. All five engines are deterministic, all weight vectors sum to <strong>1.0</strong> by invariant, and all sub-scores persist alongside the composite so the &quot;why&quot; is inspectable. Use this as the reference for the other project that needs to replicate the calculations.</p>

<h2 style="color: #1a365d; font-size: 17px; margin: 24px 0 8px;">Engine overview</h2>

<table cellpadding="6" border="1" style="border-collapse: collapse; font-size: 13px; border-color: #cbd5e0; width: 100%;">
<tr style="background: #ebf4ff;">
<th align="left">Engine</th>
<th align="left">Persisted at</th>
<th align="left">Scale</th>
</tr>
<tr><td>Bonfire Opportunity</td><td>bonfire_opportunities.priority_score</td><td>0 to 100</td></tr>
<tr><td>Bonfire Strategic Cluster</td><td>bonfire_strategic_opportunities.strategic_score</td><td>0 to 100</td></tr>
<tr><td>Gov Contract Fit</td><td>opportunities.ai_analysis.govFit.fit_score</td><td>0 to 100</td></tr>
<tr><td>Strategic Keyword Intelligence</td><td>keyword_trends.strategic_score</td><td>0 to 100</td></tr>
<tr><td>Deep Research Topic Ranker</td><td>daily_research_scans.composite_score</td><td>0 to 100</td></tr>
</table>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">1. Bonfire Opportunity (priority_score)</h2>

<p>Ranks state &amp; local bid opportunities. Composite of four sub-scores.</p>

<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px; overflow-x: auto;">SCORING_WEIGHTS = {
  revenue:       0.40,   // dollar value of the bid
  automation:    0.30,   // how amenable the work is to AI/automation
  repeatability: 0.20,   // how much of the solution is reusable
  ease:          0.10,   // ease of entry / proposal effort
}</pre>

<p><strong>Sub-score 1: Revenue weight</strong> (pure function of estimated_value in cents):</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">v &lt; $50k           : 20
$50k &lt;= v &lt; $500k  : 50
$500k &lt;= v &lt; $5M   : 80
$5M+               : 100</pre>

<p><strong>Sub-scores 2 to 4: Category seeded.</strong> Each Bonfire opp is enriched into one of 7 categories. Category seeds for ease/repeatability/automation (AI is constrained to seed plus/minus 25):</p>

<table cellpadding="5" border="1" style="border-collapse: collapse; font-size: 12.5px; border-color: #cbd5e0;">
<tr style="background: #ebf4ff;"><th>Category</th><th>Ease</th><th>Repeat</th><th>Automation</th><th>Product</th></tr>
<tr><td>Staffing</td><td>85</td><td>90</td><td>75</td><td>StaffMatch</td></tr>
<tr><td>Data &amp; Analytics</td><td>60</td><td>70</td><td>80</td><td>DataLens</td></tr>
<tr><td>Consulting</td><td>55</td><td>40</td><td>35</td><td>AdvisorAI</td></tr>
<tr><td>Compliance</td><td>40</td><td>75</td><td>65</td><td>ComplianceBot</td></tr>
<tr><td>Financial Services</td><td>45</td><td>65</td><td>60</td><td>BudgetSense</td></tr>
<tr><td>Education</td><td>70</td><td>80</td><td>70</td><td>EduPulse</td></tr>
<tr><td>IT Services</td><td>60</td><td>65</td><td>70</td><td>OpsBot</td></tr>
<tr><td>DEFAULT</td><td>50</td><td>50</td><td>50</td><td>(none)</td></tr>
</table>

<p><strong>Final composite:</strong></p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">priority_score = round(
    0.40 * revenue_weight
  + 0.30 * automation_potential
  + 0.20 * repeatability
  + 0.10 * ease_of_entry
)</pre>

<p><strong>Signal badges</strong> (derived, not weighted into score):</p>
<ul>
<li>HIGH_ROI: priority_score &gt;= 80 AND estimated_value &gt;= $500k</li>
<li>HIGH_AUTOMATION: automation_potential &gt;= 70</li>
<li>QUICK_WIN: ease_of_entry &gt;= 75 AND closes within 30 days</li>
<li>PRODUCTIZABLE: repeatability &gt;= 75 AND a recommended_product is set</li>
</ul>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">2. Bonfire Strategic Cluster (strategic_score)</h2>

<p>Produces &quot;build this AI product&quot; recommendations. Operates on top of Bonfire scoring.</p>

<p><strong>Step 1: Clustering key</strong>: <code>{aiCategory}|{valueBracket}</code>. Brackets:</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">v &lt; $250k    : sub-250k
v &lt; $1M      : 250k-1m
v &lt; $5M      : 1m-5m
v &gt;= $5M    : 5m+
v null       : unknown</pre>

<p><strong>Step 2: Standalone promotion.</strong> Any opp with priority_score &gt;= 80 OR value &gt;= $1M skips clustering and gets its own strategic recommendation. Cluster minimum size after grouping: 3.</p>

<p><strong>Step 3: strategic_score</strong> returned by GPT-4o-mini constrained to 0 to 100 from a structured prompt with the cluster aggregate revenue, AI-system spec, ROI estimate, business-viability narrative. Cache hash is SHA-256 of the cluster source-opp IDs; identical clusters within 14 days reuse the score.</p>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">3. Gov Contract Fit (fit_score) - fully deterministic</h2>

<p>Scores federal solicitations (SAM.gov) against &quot;building AI Systems.&quot; Zero LLM calls in the scorer.</p>

<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">WEIGHTS = {
  ai_alignment:    0.40,
  naics:           0.15,
  agency_maturity: 0.15,
  set_aside:       0.10,
  value_fit:       0.20,
}
fit_score = round(
    sub.ai_alignment    * 0.40
  + sub.naics           * 0.15
  + sub.agency_maturity * 0.15
  + sub.set_aside       * 0.10
  + sub.value_fit       * 0.20
)</pre>

<p><strong>Sub-score 1: AI Alignment (40%).</strong> 3-tier vocabulary scanned across title plus description (lowercased). Greedy <strong>longest-match-first</strong> with character-region masking: once a phrase matches and consumes those characters, shorter overlapping phrases cannot fire again on the same region. Prevents double-counting.</p>

<table cellpadding="5" border="1" style="border-collapse: collapse; font-size: 12px; border-color: #cbd5e0;">
<tr style="background: #ebf4ff;"><th align="left">Tier</th><th>Pts/hit</th><th align="left">Vocabulary</th></tr>
<tr><td>HIGH</td><td>22</td><td>artificial intelligence, " ai ", a.i., machine learning, " ml ", deep learning, neural network, computer vision, natural language, " nlp ", generative ai, large language model, " llm ", foundation model, predictive analytics, ai/ml, ai system, algorithm development, data science platform, autonomous system, cognitive computing, rpa, robotic process</td></tr>
<tr><td>MEDIUM</td><td>9</td><td>data analytics platform, data analytics, data platform, analytics platform, data pipeline, data warehouse, data lake, business intelligence, " bi ", automation, modernization, digital transformation, cloud migration, cloud platform, sensor fusion, analytics, data integration, data governance, workflow automation, decision support, forecasting, optimization model, simulation, modeling and simulation</td></tr>
<tr><td>LOW</td><td>3</td><td>software engineering, systems integration, it services, cybersecurity, devops, application development, cloud services, database</td></tr>
</table>

<p>Subtotal capped at 100. Empty input returns 0.</p>

<p><strong>Sub-score 2: NAICS (15%).</strong> First 6 digits of source_data.naicsCode looked up:</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">541511 : 100   // Custom Computer Programming
541512 : 95    // Computer Systems Design
541513 : 90    // Computer Facilities Management
541519 : 85    // Other Computer Related
541715 : 80    // R&amp;D in Physical/Engineering/Life Sciences
518210 : 80    // Computing Infrastructure / Data Processing
541330 : 70    // Engineering Services
541618 : 65    // Other Management Consulting
611420 : 60    // Computer Training
611430 : 55    // Professional Training
541611 : 50    // Administrative Management Consulting
541990 : 35    // Other Professional/Scientific/Tech
others : 0</pre>

<p><strong>Sub-score 3: Agency Maturity (15%).</strong> Substring match (case-insensitive) against source_data.fullParentPathName. First rule wins. Unknown/null returns 30 (neutral floor).</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12px; overflow-x: auto;">DARPA / "defense advanced research"           : 100
AFRL / "air force research laboratory"        : 95
ARL / "army research laboratory"              : 95
"space development agency" / "space force"    : 90
"naval research" / "office of naval research" : 90
NASA                                          : 90
NGA / "national geospatial-intelligence"      : 90
DOE / "department of energy"                  : 85
NIH                                           : 85
VA / "veterans"                               : 80
NSF / "national science foundation"           : 80
NIST                                          : 80
DHS                                           : 75
DoD                                           : 70
GSA                                           : 65
DOT / NHTSA                                   : 60
HHS / CDC                                     : 60
DOJ / FBI                                     : 60
Treasury / State                              : 55
unknown                                       : 30</pre>

<p><strong>Sub-score 4: Set-Aside (10%).</strong> Lookup against source_data.typeOfSetAside:</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12px;">SBIR, STTR              : 100
IEE                     : 90
8A, 8AN, EDWOSB         : 85
WOSB, HZC, HZS          : 80
SBA, SBP, SDVOSBC,
SDVOSBS                 : 75
VSA, VSS                : 70
BICiv                   : 60
NONE                    : 35 (full-and-open neutral)
unknown code            : 40</pre>

<p><strong>Sub-score 5: Value Fit (20%).</strong> Sweet-spot curve over USD value. Null returns 50.</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">null or 0       : 50
v &lt; $50k        : 25
v &lt; $250k       : 60
v &lt; $1M         : 85
v &lt; $5M         : 100   (sweet-spot peak)
v &lt; $25M        : 85
v &lt; $100M       : 55
v &gt;= $100M     : 30</pre>

<p><strong>Signal badges:</strong></p>
<ul>
<li>AI_CORE: ai_alignment &gt;= 60</li>
<li>PRIME_NAICS: naics &gt;= 85</li>
<li>AI_BUYER: agency_maturity &gt;= 90</li>
<li>SET_ASIDE: set_aside &gt;= 75 AND set-aside not NONE</li>
<li>SWEET_SPOT: value_fit &gt;= 85</li>
<li>HIGH_FIT: ai_alignment &gt;= 70 AND naics &gt;= 80</li>
</ul>

<p><strong>Recommended action:</strong></p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">fit &gt;= 75 AND ai &gt;= 50              : BID
fit &gt;= 55                            : WATCH
naics &gt;= 70 AND ai &lt; 30             : PARTNER
else                                  : IGNORE</pre>

<p><strong>Digest filter:</strong> Only contracts with fit_score &gt;= GOV_CONTRACT_MIN_FIT_SCORE (default 50) surface in the daily digest.</p>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">4. Strategic Keyword Intelligence (strategic_score)</h2>

<p>Scores every term in the keyword cloud across 9 strategic axes. Drives Procurement Mode, Venture Discovery, Operational Pain, Convergence, Strategic Composite views.</p>

<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">WEIGHTS = {
  convergence:        0.22,
  commercialization:  0.18,
  procurement:        0.14,
  operational_pain:   0.12,
  modernization:      0.10,
  venture:            0.08,
  research_velocity:  0.06,
  regulated_boost:    0.05,
  strategic_rarity:   0.05,
}</pre>

<p><strong>Channel to axis map</strong> (drives convergence + procurement sub-scores):</p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">ai_news           : news
gov_contract      : procurement
grant             : procurement
bonfire           : procurement
ai_job            : hiring
investment        : capital
freelance         : demand
research          : research
bonfire_strategic : strategic</pre>

<p><strong>Commercialization stage ladder:</strong></p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">unknown / research_only / early_signal /
commercializing / production_ready / mainstream</pre>

<p><strong>Strategic priority classifier:</strong></p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">score &gt;= 75 AND convergence &gt;= 50 : critical
score &gt;= 60                          : high
score &gt;= 40                          : standard
else                                  : low</pre>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">5. Deep Research Daily Topic Ranker (composite_score)</h2>

<p>Picks the highest-rated topic for the automatic daily Deep Research run. Deterministic; the LLM runs inside Deep Research itself, not in the picker.</p>

<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px;">WEIGHTS = {
  recurring_frequency: 0.40,   // log-scaled occurrence_count
  research_momentum:   0.30,   // research_topics.momentum_score
  opportunity_value:   0.15,   // sum of recent (30d) opp $ mentioning topic
  coverage_freshness:  0.15,   // inverse penalty if covered &lt; 14d ago
}
RECENT_DAYS         = 30
COVERAGE_WINDOW_DAYS = 14
TOP_RELATIONSHIPS    = 20
MAX_CANDIDATES       = 50</pre>

<p><strong>Stopwords</strong> filtered from candidates: the, and, for, with, inc, llc, corp, co, services, service, solutions, systems, group, data, platform, tool, software, system, company.</p>

<p><strong>Per-candidate sub-scores:</strong></p>
<pre style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; font-family: monospace; font-size: 12.5px; overflow-x: auto;">// 1. recurring_frequency (log-scaled vs corpus max)
recurringScore = min(100, round(
  log(occurrenceCount + 1) / log(maxOccurrence + 1) * 100
));

// 2. research_momentum (best lexical overlap with research_topics)
momentumScore = max(
  research_topics where name.includes(candidate) OR candidate.includes(name)
  -&gt; topic.momentumScore  // capped at 100
);

// 3. opportunity_value (sum of recent opp $ mentioning candidate)
valueSum   = sum(opp.value for opp in recent_30d if mentions(opp, candidate));
valueScore = min(100, round(valueSum / maxValue * 100));

// 4. coverage_freshness (penalty if we covered this topic already)
freshnessScore = 100;
for each report covered_within_14d_with_matching_term:
  daysAgo = floor((now - report.createdAt) / 1 day);
  penalty = max(0, 100 - round(daysAgo / 14 * 100));
  freshnessScore = min(freshnessScore, 100 - penalty);

composite = round(
    recurringScore * 0.40
  + momentumScore  * 0.30
  + valueScore     * 0.15
  + freshnessScore * 0.15
);</pre>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">Shared invariants &amp; replication checklist</h2>

<ol>
<li><strong>All weights sum to 1.0.</strong> Every engine asserts this at module load.</li>
<li><strong>Composite formula is always</strong> <code>round(sum of sub_score_i times weight_i)</code>.</li>
<li><strong>Sub-scores persist alongside the composite</strong> so the &quot;why&quot; is inspectable.</li>
<li><strong>No LLM in the score path itself.</strong> Bonfire uses an LLM to fill seed-clamped sub-scores; everything else is pure deterministic.</li>
<li><strong>Idempotent re-scoring</strong> via a content hash (sha-1 of inputs).</li>
<li><strong>Filter thresholds live separately from scores</strong> so they can be tuned without re-scoring. Examples: GOV_CONTRACT_MIN_FIT_SCORE = 50, BONFIRE_DIGEST_MIN_CLOSE_DAYS = 10, Bonfire digest excludes id &lt; 100 (seed) and source = usa_spending (awarded).</li>
<li><strong>Greedy longest-match-first vocab evaluation</strong> for overlapping phrases. Reference: govContractScoring.service.js scoreAiAlignment().</li>
<li><strong>Substring matching is case-insensitive</strong> across all engines.</li>
</ol>

<h2 style="color: #1a365d; font-size: 17px; margin: 28px 0 8px;">Source files (for direct reference)</h2>

<ul style="font-family: monospace; font-size: 13px;">
<li>backend/src/bonfire/bonfire.scoring.js + bonfire.constants.js</li>
<li>backend/src/bonfire/bonfireStrategist.service.js</li>
<li>backend/src/govContracts/govContractScoring.service.js</li>
<li>backend/src/govContracts/govContractScoring.backfill.js</li>
<li>backend/src/oied/strategicKeywordIntelligence.service.js</li>
<li>backend/src/oied/strategicKeywordDictionaries.js</li>
<li>backend/src/deepResearch/dailyTopicRanker.service.js</li>
</ul>

<p>All weights and constants in this document were captured directly from prod source at send time. The shared invariants section is the load-bearing contract for replication.</p>

</div>`;

const BODY_TEXT = `Opportunity Pulse / Scoring & Ranking Reference

Five independent scoring engines. All deterministic. All weights sum to 1.0.

================================================================
1. BONFIRE OPPORTUNITY (priority_score 0 to 100)
================================================================
priority_score = round(
    0.40 * revenue_weight
  + 0.30 * automation_potential
  + 0.20 * repeatability
  + 0.10 * ease_of_entry
)

Revenue weight by estimated_value (cents):
  v < $50k       : 20
  $50k to $500k  : 50
  $500k to $5M   : 80
  $5M+           : 100

Sub-scores 2 to 4 are seeded by category heuristic and clamped to
seed plus/minus 25 by the AI response.
Category seeds (ease/repeat/automation):
  Staffing             85/90/75   (product: StaffMatch)
  Data & Analytics     60/70/80   (DataLens)
  Consulting           55/40/35   (AdvisorAI)
  Compliance           40/75/65   (ComplianceBot)
  Financial Services   45/65/60   (BudgetSense)
  Education            70/80/70   (EduPulse)
  IT Services          60/65/70   (OpsBot)
  DEFAULT              50/50/50

Signals (derived):
  HIGH_ROI         : priority >= 80 AND value >= $500k
  HIGH_AUTOMATION  : automation >= 70
  QUICK_WIN        : ease >= 75 AND closes <= 30d
  PRODUCTIZABLE    : repeat >= 75 AND product set

================================================================
2. STRATEGIC CLUSTER (strategic_score 0 to 100)
================================================================
Cluster key: {aiCategory}|{valueBracket}
Brackets: <$250k=sub-250k, <$1M=250k-1m, <$5M=1m-5m, $5M+=5m+, null=unknown
Standalone if priority >= 80 OR value >= $1M
Cluster minimum size: 3
strategic_score: AI-returned, clamped 0 to 100, sha-256 cached 14 days

================================================================
3. GOV CONTRACT FIT (fit_score 0 to 100) - fully deterministic
================================================================
fit_score = round(
    0.40 * ai_alignment     (keyword density vs AI vocab)
  + 0.15 * naics            (procurement-vehicle code lookup)
  + 0.15 * agency_maturity  (buyer track-record for AI work)
  + 0.10 * set_aside        (small-biz / SBIR / 8a etc.)
  + 0.20 * value_fit        (sweet-spot curve)
)

AI Alignment: 3-tier vocab (HIGH=22 pts, MEDIUM=9, LOW=3 per match)
with greedy longest-match-first + region-masking dedup, capped at 100.

NAICS (first 6 digits of source_data.naicsCode):
  541511=100  541512=95  541513=90  541519=85  541715=80
  518210=80   541330=70  541618=65  611420=60  611430=55
  541611=50   541990=35  others=0

Agency Maturity (substring match, first wins):
  DARPA=100  AFRL/ARL=95  Space Force/Navy/NASA/NGA=90
  DOE/NIH=85  VA/NSF/NIST=80  DHS=75  DoD=70  GSA=65
  DOT/NHTSA=60  HHS/CDC=60  DOJ/FBI=60  Treasury/State=55
  unknown=30

Set-Aside (typeOfSetAside lookup):
  SBIR/STTR=100  IEE=90  8A/8AN/EDWOSB=85
  WOSB/HZC/HZS=80  SBA/SBP/SDVOSBC/SDVOSBS=75
  VSA/VSS=70  BICiv=60  NONE=35  unknown=40

Value Fit (USD):
  null=50  <$50k=25  <$250k=60  <$1M=85  <$5M=100
  <$25M=85  <$100M=55  $100M+=30

Signals:
  AI_CORE       : ai >= 60
  PRIME_NAICS   : naics >= 85
  AI_BUYER      : agency >= 90
  SET_ASIDE     : sa >= 75 AND set-aside not NONE
  SWEET_SPOT    : value >= 85
  HIGH_FIT      : ai >= 70 AND naics >= 80

Action:
  fit >= 75 AND ai >= 50              : BID
  fit >= 55                            : WATCH
  naics >= 70 AND ai < 30             : PARTNER
  else                                  : IGNORE

Digest filter: only contracts with fit >= 50 surface in daily digest.

================================================================
4. STRATEGIC KEYWORD INTELLIGENCE (strategic_score 0 to 100)
================================================================
WEIGHTS:
  convergence       0.22    (cross-axis breadth)
  commercialization 0.18    (research-to-product transition)
  procurement       0.14    (vocab + gov_contract channel)
  operational_pain  0.12    (pain vocab + compliance + hiring + research)
  modernization     0.10    (modernization vocab + procurement overlap)
  venture           0.08    (AI tools + emerging_ai + investments)
  research_velocity 0.06    (research intensity * freshness)
  regulated_boost   0.05    (bonus if regulated_domains tag present)
  strategic_rarity  0.05    (log-inverse frequency vs corpus max)

Channel to axis map:
  ai_news=news  gov_contract/grant/bonfire=procurement
  ai_job=hiring  investment=capital  freelance=demand
  research=research  bonfire_strategic=strategic

Commercialization stages: unknown -> research_only -> early_signal ->
                          commercializing -> production_ready -> mainstream

Priority:
  score >= 75 AND convergence >= 50 : critical
  score >= 60                       : high
  score >= 40                       : standard
  else                              : low

================================================================
5. DEEP RESEARCH TOPIC RANKER (composite_score 0 to 100)
================================================================
composite = round(
    0.40 * recurring_frequency (log-scaled occurrence_count)
  + 0.30 * research_momentum   (arXiv momentum, lexical overlap)
  + 0.15 * opportunity_value   (sum of opp $ mentioning topic, 30d)
  + 0.15 * coverage_freshness  (inverse penalty if covered <14d ago)
)

Constants: RECENT_DAYS=30, COVERAGE_WINDOW_DAYS=14,
           TOP_RELATIONSHIPS=20, MAX_CANDIDATES=50

Stopwords filtered: the, and, for, with, inc, llc, corp, co, services,
service, solutions, systems, group, data, platform, tool, software,
system, company

================================================================
SHARED INVARIANTS
================================================================
- All weights sum to 1.0 (enforced at module load)
- Composite = round(sum of sub_score_i * weight_i)
- Sub-scores persist alongside composite (inspectable)
- No LLM in score path itself (LLM in Bonfire only fills seed-clamped sub-scores)
- Idempotent re-scoring via content hash
- Filter thresholds separate from scores
- Greedy longest-match-first vocab evaluation prevents double-counting
- Substring matching is case-insensitive across all engines

================================================================
SOURCE FILES
================================================================
backend/src/bonfire/bonfire.scoring.js + bonfire.constants.js
backend/src/bonfire/bonfireStrategist.service.js
backend/src/govContracts/govContractScoring.service.js
backend/src/govContracts/govContractScoring.backfill.js
backend/src/oied/strategicKeywordIntelligence.service.js
backend/src/oied/strategicKeywordDictionaries.js
backend/src/deepResearch/dailyTopicRanker.service.js`;

(async () => {
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY required');

  // Belt and suspenders: strip any em-dash (U+2014) or en-dash (U+2013) that
  // might have slipped through the source. The em-dash hook should have
  // blocked the write, so this is paranoia, but the preflight will still
  // hard-fail if anything reaches it.
  const cleanedHtml = BODY_HTML.replace(/—/g, '/').replace(/–/g, '-');
  const cleanedText = BODY_TEXT.replace(/—/g, '/').replace(/–/g, '-');

  const html = cleanedHtml + SIG_HTML;
  const text = cleanedText + '\n\n' + SIG_TEXT;

  validateBeforeSend(html, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: {
      user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
      pass: process.env.MANDRILL_API_KEY,
    },
  });

  const info = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: TO,
    bcc: 'ali@colaberry.com',
    replyTo: 'ali@colaberry.com',
    subject: SUBJECT,
    html,
    text,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });

  console.log('Sent.');
  console.log('Mandrill ID:', info.messageId);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
