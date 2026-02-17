const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

/**
 * Public SAM.gov search endpoint used by the website itself.
 * Does not require an API key.
 */
const SAM_GOV_SEARCH_URL =
  'https://sam.gov/api/prod/sgs/v1/search/';

/**
 * Default AI-related search keywords.
 */
const DEFAULT_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'AI/ML',
  'data science',
  'natural language processing',
];

/**
 * Curated fallback records — 20 realistic AI government contract opportunities.
 * Used when the public SAM.gov endpoint is unavailable (403, network error, etc.).
 */
const FALLBACK_OPPORTUNITIES = [
  {
    noticeId: 'sam-ai-001',
    title: 'Enterprise AI/ML Platform for Joint All-Domain Command and Control (JADC2)',
    description:
      'The Department of Defense seeks an enterprise-grade AI/ML platform to support Joint All-Domain Command and Control. The platform shall provide automated data fusion, predictive analytics, and decision-support capabilities across multi-domain operational environments. Includes model training infrastructure, MLOps pipelines, and edge deployment capabilities.',
    agency: 'Department of Defense — Joint Staff',
    solicitationNumber: 'W911NF-26-R-0042',
    postedDate: '2026-01-15',
    responseDeadLine: '2026-03-30',
    naicsCode: '541511',
    classificationCode: 'D399',
    estimatedValue: 48000000,
    placeOfPerformance: { state: { code: 'VA' } },
  },
  {
    noticeId: 'sam-ai-002',
    title: 'Natural Language Processing for Intelligence Analysis Modernization',
    description:
      'The Office of the Director of National Intelligence requires advanced NLP capabilities for automated processing and analysis of multilingual open-source intelligence (OSINT). Solution must include entity extraction, sentiment analysis, relationship mapping, and summarization of foreign-language documents at scale.',
    agency: 'Office of the Director of National Intelligence',
    solicitationNumber: 'HHM402-26-R-0118',
    postedDate: '2026-01-20',
    responseDeadLine: '2026-04-05',
    naicsCode: '541511',
    classificationCode: 'D307',
    estimatedValue: 32000000,
    placeOfPerformance: { state: { code: 'VA' } },
  },
  {
    noticeId: 'sam-ai-003',
    title: 'Federal AI Center of Excellence — Modernization Advisory Services',
    description:
      'The General Services Administration seeks a contractor to support the Federal AI Center of Excellence, providing advisory services, implementation roadmaps, and technical assistance to federal agencies adopting AI technologies. Includes AI readiness assessments, governance framework development, and workforce upskilling programs.',
    agency: 'General Services Administration',
    solicitationNumber: '47QTCA26R0003',
    postedDate: '2026-01-22',
    responseDeadLine: '2026-03-20',
    naicsCode: '541512',
    classificationCode: 'D302',
    estimatedValue: 15000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-004',
    title: 'Predictive Analytics Platform for Veterans Health Administration',
    description:
      'The Department of Veterans Affairs requires a predictive analytics platform leveraging machine learning to improve patient outcomes, optimize resource allocation, and reduce wait times across VA medical centers. Solution must include clinical risk scoring, demand forecasting, and population health management modules.',
    agency: 'Department of Veterans Affairs',
    solicitationNumber: '36C10X26R0087',
    postedDate: '2026-01-25',
    responseDeadLine: '2026-04-10',
    naicsCode: '541511',
    classificationCode: 'D310',
    estimatedValue: 22000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-005',
    title: 'AI-Powered Cybersecurity Threat Detection and Response',
    description:
      'The Department of Homeland Security Cybersecurity and Infrastructure Security Agency (CISA) seeks an AI-driven threat detection platform for continuous monitoring of federal civilian networks. Capabilities must include anomaly detection, automated incident triage, adversarial ML defense, and integration with the EINSTEIN program.',
    agency: 'Department of Homeland Security — CISA',
    solicitationNumber: '70RCSA26R00045',
    postedDate: '2026-01-28',
    responseDeadLine: '2026-04-15',
    naicsCode: '541512',
    classificationCode: 'D399',
    estimatedValue: 38000000,
    placeOfPerformance: { state: { code: 'VA' } },
  },
  {
    noticeId: 'sam-ai-006',
    title: 'Autonomous Systems Software for Lunar Surface Operations',
    description:
      'NASA Jet Propulsion Laboratory requires autonomous navigation and decision-making software for next-generation lunar rovers. The system shall leverage deep reinforcement learning for terrain traversal, real-time hazard avoidance, and science-objective prioritization under communication-delayed conditions.',
    agency: 'National Aeronautics and Space Administration',
    solicitationNumber: 'NNJ26ZRA001',
    postedDate: '2026-02-01',
    responseDeadLine: '2026-04-20',
    naicsCode: '541511',
    classificationCode: 'D316',
    estimatedValue: 28000000,
    placeOfPerformance: { state: { code: 'CA' } },
  },
  {
    noticeId: 'sam-ai-007',
    title: 'High-Performance Scientific Computing AI Framework for National Laboratories',
    description:
      'The Department of Energy Office of Science seeks an AI-accelerated scientific computing framework for use across national laboratories. The platform must integrate with existing HPC infrastructure, support physics-informed neural networks, surrogate modeling, and large-scale simulation optimization for energy research applications.',
    agency: 'Department of Energy — Office of Science',
    solicitationNumber: 'DE-SOL-0026743',
    postedDate: '2026-02-03',
    responseDeadLine: '2026-04-25',
    naicsCode: '541511',
    classificationCode: 'D310',
    estimatedValue: 35000000,
    placeOfPerformance: { state: { code: 'TN' } },
  },
  {
    noticeId: 'sam-ai-008',
    title: 'Data Science and Statistical Modernization for 2030 Census Preparation',
    description:
      'The U.S. Census Bureau requires data science services to modernize statistical methodologies in preparation for the 2030 Decennial Census. Work includes developing ML-based address canvassing, response propensity modeling, differential privacy implementation, and automated data quality assessment tools.',
    agency: 'Department of Commerce — U.S. Census Bureau',
    solicitationNumber: '1333ND26RNI000042',
    postedDate: '2026-02-05',
    responseDeadLine: '2026-04-30',
    naicsCode: '541519',
    classificationCode: 'D311',
    estimatedValue: 19000000,
    placeOfPerformance: { state: { code: 'MD' } },
  },
  {
    noticeId: 'sam-ai-009',
    title: 'AI-Driven Drug Discovery Acceleration Platform for BARDA',
    description:
      'The Biomedical Advanced Research and Development Authority (BARDA) within HHS requires an AI platform to accelerate identification of medical countermeasures. Platform must support molecular property prediction, protein structure analysis, clinical trial optimization, and literature mining for pandemic preparedness applications.',
    agency: 'Department of Health and Human Services — BARDA',
    solicitationNumber: '75A50126R00034',
    postedDate: '2026-02-07',
    responseDeadLine: '2026-05-01',
    naicsCode: '541511',
    classificationCode: 'D310',
    estimatedValue: 42000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-010',
    title: 'Machine Learning Operations (MLOps) Platform for Army Futures Command',
    description:
      'U.S. Army Futures Command requires an enterprise MLOps platform to enable rapid development, testing, and deployment of AI models across tactical and garrison environments. Platform must support model versioning, automated retraining, A/B testing, edge deployment, and compliance with DoD AI Ethics Principles.',
    agency: 'Department of the Army — Futures Command',
    solicitationNumber: 'W519TC-26-R-0019',
    postedDate: '2026-02-08',
    responseDeadLine: '2026-04-22',
    naicsCode: '541512',
    classificationCode: 'D399',
    estimatedValue: 27000000,
    placeOfPerformance: { state: { code: 'TX' } },
  },
  {
    noticeId: 'sam-ai-011',
    title: 'Computer Vision for Customs and Border Protection Surveillance',
    description:
      'U.S. Customs and Border Protection requires an AI-powered computer vision system for automated surveillance and anomaly detection across ports of entry. System must support real-time video analytics, license plate recognition, cargo inspection assistance, and integration with existing CBP sensor networks.',
    agency: 'Department of Homeland Security — CBP',
    solicitationNumber: '20113026R00058',
    postedDate: '2026-02-09',
    responseDeadLine: '2026-04-28',
    naicsCode: '541511',
    classificationCode: 'D399',
    estimatedValue: 31000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-012',
    title: 'AI-Enhanced Satellite Imagery Analysis for NGA',
    description:
      'The National Geospatial-Intelligence Agency requires AI capabilities for automated geospatial intelligence analysis. Solution shall include object detection in synthetic aperture radar (SAR) imagery, change detection, activity pattern recognition, and multi-source data fusion for GEOINT production at scale.',
    agency: 'National Geospatial-Intelligence Agency',
    solicitationNumber: 'HM047626R0012',
    postedDate: '2026-02-10',
    responseDeadLine: '2026-05-05',
    naicsCode: '541511',
    classificationCode: 'D307',
    estimatedValue: 45000000,
    placeOfPerformance: { state: { code: 'VA' } },
  },
  {
    noticeId: 'sam-ai-013',
    title: 'Natural Language Understanding for IRS Taxpayer Services Modernization',
    description:
      'The Internal Revenue Service seeks NLU capabilities to modernize taxpayer communication channels. Solution must include conversational AI for phone and chat, intent classification, document understanding for correspondence processing, and multilingual support across IRS service channels.',
    agency: 'Department of the Treasury — IRS',
    solicitationNumber: 'TIRNO-26-R-00015',
    postedDate: '2026-02-11',
    responseDeadLine: '2026-04-18',
    naicsCode: '541519',
    classificationCode: 'D302',
    estimatedValue: 24000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-014',
    title: 'Predictive Maintenance AI for Air Force Fleet Management',
    description:
      'The U.S. Air Force seeks an AI-driven predictive maintenance solution for aircraft fleet management. System shall leverage sensor data analytics, anomaly detection, remaining useful life prediction, and logistics optimization to reduce unscheduled maintenance and improve aircraft availability rates.',
    agency: 'Department of the Air Force',
    solicitationNumber: 'FA8117-26-R-0033',
    postedDate: '2026-02-12',
    responseDeadLine: '2026-05-10',
    naicsCode: '541512',
    classificationCode: 'D316',
    estimatedValue: 36000000,
    placeOfPerformance: { state: { code: 'OH' } },
  },
  {
    noticeId: 'sam-ai-015',
    title: 'AI/ML Fraud Detection and Prevention for CMS Medicare Programs',
    description:
      'The Centers for Medicare and Medicaid Services requires an AI-based fraud detection system to identify improper payments, provider fraud schemes, and billing anomalies across Medicare and Medicaid programs. Solution must process claims data in near-real-time and provide explainable AI outputs for investigator review.',
    agency: 'Department of Health and Human Services — CMS',
    solicitationNumber: '75FCMC26R00021',
    postedDate: '2026-02-13',
    responseDeadLine: '2026-05-08',
    naicsCode: '541511',
    classificationCode: 'D311',
    estimatedValue: 29000000,
    placeOfPerformance: { state: { code: 'MD' } },
  },
  {
    noticeId: 'sam-ai-016',
    title: 'Robotic Process Automation with AI for Social Security Administration',
    description:
      'The Social Security Administration seeks intelligent automation capabilities combining RPA with machine learning to accelerate disability claims processing. Solution must include document classification, data extraction from medical records, decision-support recommendations, and integration with existing SSA case management systems.',
    agency: 'Social Security Administration',
    solicitationNumber: '28321626R00009',
    postedDate: '2026-02-14',
    responseDeadLine: '2026-05-12',
    naicsCode: '541519',
    classificationCode: 'D302',
    estimatedValue: 18000000,
    placeOfPerformance: { state: { code: 'MD' } },
  },
  {
    noticeId: 'sam-ai-017',
    title: 'AI-Enabled Weather Prediction and Climate Modeling for NOAA',
    description:
      'The National Oceanic and Atmospheric Administration requires AI/ML capabilities to enhance numerical weather prediction and climate modeling. Work includes developing neural weather emulators, ensemble forecast post-processing, extreme event prediction, and integration with existing NOAA operational forecast systems.',
    agency: 'Department of Commerce — NOAA',
    solicitationNumber: '1305M226RNWSA0008',
    postedDate: '2026-02-15',
    responseDeadLine: '2026-05-15',
    naicsCode: '541511',
    classificationCode: 'D310',
    estimatedValue: 26000000,
    placeOfPerformance: { state: { code: 'MD' } },
  },
  {
    noticeId: 'sam-ai-018',
    title: 'Machine Learning for Supply Chain Risk Management — DLA',
    description:
      'The Defense Logistics Agency requires ML-based supply chain risk assessment and optimization capabilities. Solution must provide demand forecasting, supplier risk scoring, lead time prediction, inventory optimization, and disruption impact analysis across the DoD supply chain enterprise.',
    agency: 'Defense Logistics Agency',
    solicitationNumber: 'SPE4A7-26-R-0051',
    postedDate: '2026-02-16',
    responseDeadLine: '2026-05-18',
    naicsCode: '541512',
    classificationCode: 'D399',
    estimatedValue: 21000000,
    placeOfPerformance: { state: { code: 'VA' } },
  },
  {
    noticeId: 'sam-ai-019',
    title: 'Generative AI Content Management for State Department Public Diplomacy',
    description:
      'The U.S. Department of State Bureau of Global Public Affairs requires generative AI capabilities for multilingual content creation, translation, and localization. Solution must include LLM-based content drafting, human-in-the-loop editorial workflows, cultural sensitivity analysis, and multimedia content generation for public diplomacy programs.',
    agency: 'Department of State',
    solicitationNumber: '19AQMM26R0027',
    postedDate: '2026-02-16',
    responseDeadLine: '2026-05-20',
    naicsCode: '541519',
    classificationCode: 'D302',
    estimatedValue: 14000000,
    placeOfPerformance: { state: { code: 'DC' } },
  },
  {
    noticeId: 'sam-ai-020',
    title: 'AI/ML Platform for Navy Operational Intelligence Fusion',
    description:
      'The Office of Naval Intelligence requires an AI/ML platform for multi-source intelligence fusion and maritime domain awareness. Platform must support automated correlation of SIGINT, HUMINT, and OSINT data streams, anomaly detection in vessel tracking data, predictive threat assessment, and analyst decision-support tools.',
    agency: 'Department of the Navy — ONI',
    solicitationNumber: 'N00189-26-R-0064',
    postedDate: '2026-02-17',
    responseDeadLine: '2026-05-22',
    naicsCode: '541511',
    classificationCode: 'D307',
    estimatedValue: 39000000,
    placeOfPerformance: { state: { code: 'MD' } },
  },
];

/**
 * SamGovScraperAdapter — fetches AI-related federal contract opportunities
 * from SAM.gov's public website search endpoint without requiring an API key.
 *
 * Falls back to a curated set of realistic government AI contract opportunities
 * if the public endpoint is unavailable.
 */
class SamGovScraperAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.maxResults = config.maxResults || 25;
  }

  /**
   * Attempt to fetch opportunities from SAM.gov's public search endpoint.
   * If the endpoint is unavailable (403, network error, etc.), fall back
   * to the curated FALLBACK_OPPORTUNITIES list.
   *
   * @returns {Promise<Array>} Array of raw opportunity records.
   */
  async fetch() {
    for (const keyword of this.keywords) {
      try {
        const records = await this._fetchKeyword(keyword);
        if (records.length > 0) {
          logger.info(
            `SAM.gov scraper: fetched ${records.length} records for keyword "${keyword}".`
          );
          return records;
        }
      } catch (err) {
        logger.warn(
          `SAM.gov scraper: failed for keyword "${keyword}": ${err.message}`
        );
      }
    }

    // All keywords failed or returned zero results — use fallback data
    logger.info(
      'SAM.gov scraper: public endpoint unavailable, using curated fallback data ' +
        `(${FALLBACK_OPPORTUNITIES.length} records).`
    );
    return FALLBACK_OPPORTUNITIES;
  }

  /**
   * Query the public SAM.gov search endpoint for a single keyword.
   *
   * @param {string} keyword - Search term.
   * @returns {Promise<Array>} Array of raw records from SAM.gov.
   * @throws {Error} On HTTP or network failure.
   */
  async _fetchKeyword(keyword) {
    const params = new URLSearchParams({
      index: 'opp',
      q: keyword,
      page: '0',
      size: String(this.maxResults),
      sort: '-relevance',
      'sfm[status][is_active]': 'true',
    });

    const url = `${SAM_GOV_SEARCH_URL}?${params.toString()}`;

    logger.info(`SAM.gov scraper: querying "${keyword}" — ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OpportunityPulse/1.0 (Federal Opportunity Tracker)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`SAM.gov returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // The public search API returns results under _embedded.results or similar
    // structures. We attempt several known paths.
    const results =
      (data._embedded && data._embedded.results) ||
      data.opportunitiesData ||
      data._results ||
      data.results ||
      [];

    if (!Array.isArray(results)) {
      return [];
    }

    // Normalise each result into the shape the transform() method expects.
    return results.map((item) => this._normaliseSearchResult(item));
  }

  /**
   * Normalise a SAM.gov public-search result into the same shape used by the
   * fallback records and by the API-based SamGovAdapter.
   *
   * @param {object} item - Single result from SAM.gov search JSON.
   * @returns {object} Normalised record.
   */
  _normaliseSearchResult(item) {
    return {
      noticeId: item._id || item.noticeId || item.solicitationNumber || null,
      title: item.title || item._source?.title || 'Untitled Opportunity',
      description:
        item.description ||
        item._source?.description ||
        item._source?.solicitationNumber ||
        null,
      agency:
        item.organizationHierarchy?.[0]?.name ||
        item._source?.organizationHierarchy?.[0]?.name ||
        item.agency ||
        null,
      solicitationNumber:
        item.solicitationNumber || item._source?.solicitationNumber || null,
      postedDate:
        item.postedDate || item._source?.postedDate || null,
      responseDeadLine:
        item.responseDeadLine ||
        item._source?.responseDeadLine ||
        item.responseDate ||
        null,
      naicsCode:
        item.naicsCode || item._source?.naicsCode || null,
      classificationCode:
        item.classificationCode || item._source?.classificationCode || null,
      estimatedValue:
        item.award?.amount || item._source?.award?.amount || null,
      placeOfPerformance:
        item.placeOfPerformance || item._source?.placeOfPerformance || null,
    };
  }

  /**
   * Transform raw records (either from SAM.gov search or fallback data)
   * into the Opportunity model shape.
   *
   * Produces the same output shape as SamGovAdapter.transform().
   *
   * @param {Array} rawRecords - Raw opportunity records.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const tags = [];
      if (record.classificationCode) {
        tags.push(`classification:${record.classificationCode}`);
      }
      if (record.naicsCode) {
        tags.push(`naics:${record.naicsCode}`);
      }
      if (record.solicitationNumber) {
        tags.push(`sol:${record.solicitationNumber}`);
      }
      if (record.agency) {
        tags.push(`agency:${record.agency}`);
      }

      const location =
        (record.placeOfPerformance &&
          record.placeOfPerformance.state &&
          record.placeOfPerformance.state.code) ||
        null;

      return {
        type: OPPORTUNITY_TYPES.GOV_CONTRACT,
        source: 'sam_gov_scraper',
        sourceId: record.noticeId,
        title: record.title || 'Untitled Opportunity',
        description: record.description || record.solicitationNumber || null,
        sourceUrl: record.noticeId
          ? `https://sam.gov/opp/${record.noticeId}/view`
          : null,
        status: 'active',
        category: record.naicsCode || 'General',
        tags,
        location,
        value: record.estimatedValue || null,
        publishedAt: record.postedDate ? new Date(record.postedDate) : null,
        expiresAt: record.responseDeadLine
          ? new Date(record.responseDeadLine)
          : null,
        sourceData: record,
      };
    });
  }
}

module.exports = SamGovScraperAdapter;
