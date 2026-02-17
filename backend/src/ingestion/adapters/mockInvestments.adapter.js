const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');

/**
 * Deterministic set of 10 AI startup investment records for development and testing.
 * Always returns the same records in the same order.
 */
const MOCK_INVESTMENTS = [
  {
    id: 'inv-anth-001',
    startup: 'Anthropic',
    round: 'Series D',
    amount: 2000000000,
    valuation: 18000000000,
    leadInvestor: 'Google',
    otherInvestors: ['Salesforce Ventures', 'Zoom Ventures', 'Spark Capital'],
    sector: 'AI Safety & Large Language Models',
    description: 'Anthropic raised $2B Series D to advance AI safety research and scale Claude model development.',
    headquarters: 'San Francisco, CA',
    foundedYear: 2021,
    announcedDate: '2026-01-15',
    url: 'https://example.com/investments/anthropic-series-d',
  },
  {
    id: 'inv-cohr-002',
    startup: 'Cohere',
    round: 'Series C',
    amount: 500000000,
    valuation: 5500000000,
    leadInvestor: 'Inovia Capital',
    otherInvestors: ['NVIDIA', 'Oracle', 'Salesforce Ventures'],
    sector: 'Enterprise NLP',
    description: 'Cohere secured $500M Series C to expand enterprise AI language model deployment and multilingual capabilities.',
    headquarters: 'Toronto, Canada',
    foundedYear: 2019,
    announcedDate: '2026-01-20',
    url: 'https://example.com/investments/cohere-series-c',
  },
  {
    id: 'inv-mstrl-003',
    startup: 'Mistral',
    round: 'Series B',
    amount: 600000000,
    valuation: 6000000000,
    leadInvestor: 'Andreessen Horowitz',
    otherInvestors: ['Lightspeed Venture Partners', 'BPI France', 'General Catalyst'],
    sector: 'Open-Weight Language Models',
    description: 'Mistral raised $600M Series B to build open-weight frontier models and expand European AI infrastructure.',
    headquarters: 'Paris, France',
    foundedYear: 2023,
    announcedDate: '2026-01-25',
    url: 'https://example.com/investments/mistral-series-b',
  },
  {
    id: 'inv-perp-004',
    startup: 'Perplexity',
    round: 'Series B',
    amount: 250000000,
    valuation: 3000000000,
    leadInvestor: 'IVP',
    otherInvestors: ['NEA', 'Databricks Ventures', 'Jeff Bezos'],
    sector: 'AI-Powered Search',
    description: 'Perplexity raised $250M to expand its AI-driven answer engine and build real-time knowledge infrastructure.',
    headquarters: 'San Francisco, CA',
    foundedYear: 2022,
    announcedDate: '2026-01-28',
    url: 'https://example.com/investments/perplexity-series-b',
  },
  {
    id: 'inv-rnwy-005',
    startup: 'Runway',
    round: 'Series D',
    amount: 450000000,
    valuation: 4500000000,
    leadInvestor: 'General Atlantic',
    otherInvestors: ['Google', 'NVIDIA', 'Felicis Ventures'],
    sector: 'Generative Video AI',
    description: 'Runway secured $450M Series D to advance generative video models and creative AI tools for filmmakers.',
    headquarters: 'New York, NY',
    foundedYear: 2018,
    announcedDate: '2026-02-01',
    url: 'https://example.com/investments/runway-series-d',
  },
  {
    id: 'inv-stab-006',
    startup: 'Stability AI',
    round: 'Series B',
    amount: 200000000,
    valuation: 1500000000,
    leadInvestor: 'Coatue Management',
    otherInvestors: ['Lightspeed Venture Partners', 'O\'Shaughnessy Ventures'],
    sector: 'Open-Source Generative AI',
    description: 'Stability AI raised $200M to continue development of open-source image, audio, and language generation models.',
    headquarters: 'London, UK',
    foundedYear: 2019,
    announcedDate: '2026-02-03',
    url: 'https://example.com/investments/stability-series-b',
  },
  {
    id: 'inv-char-007',
    startup: 'Character AI',
    round: 'Series A',
    amount: 150000000,
    valuation: 1000000000,
    leadInvestor: 'Andreessen Horowitz',
    otherInvestors: ['SV Angel', 'Nat Friedman'],
    sector: 'Conversational AI Companions',
    description: 'Character AI raised $150M Series A to scale its conversational AI platform with millions of user-created characters.',
    headquarters: 'Palo Alto, CA',
    foundedYear: 2021,
    announcedDate: '2026-02-05',
    url: 'https://example.com/investments/character-ai-series-a',
  },
  {
    id: 'inv-infl-008',
    startup: 'Inflection',
    round: 'Series B',
    amount: 1300000000,
    valuation: 4000000000,
    leadInvestor: 'Microsoft',
    otherInvestors: ['Reid Hoffman', 'Bill Gates', 'NVIDIA'],
    sector: 'Personal AI Assistants',
    description: 'Inflection raised $1.3B Series B for its personal AI assistant Pi, focusing on empathetic, helpful conversation.',
    headquarters: 'Palo Alto, CA',
    foundedYear: 2022,
    announcedDate: '2026-02-07',
    url: 'https://example.com/investments/inflection-series-b',
  },
  {
    id: 'inv-adpt-009',
    startup: 'Adept',
    round: 'Series B',
    amount: 350000000,
    valuation: 2500000000,
    leadInvestor: 'General Catalyst',
    otherInvestors: ['Spark Capital', 'Addition', 'Greylock'],
    sector: 'AI Action Models',
    description: 'Adept raised $350M to build action-oriented AI models that can operate software tools on behalf of users.',
    headquarters: 'San Francisco, CA',
    foundedYear: 2022,
    announcedDate: '2026-02-09',
    url: 'https://example.com/investments/adept-series-b',
  },
  {
    id: 'inv-xai-010',
    startup: 'xAI',
    round: 'Series E',
    amount: 6000000000,
    valuation: 50000000000,
    leadInvestor: 'Sequoia Capital',
    otherInvestors: ['Andreessen Horowitz', 'Fidelity', 'Kingdom Holdings'],
    sector: 'Frontier AI Research',
    description: 'xAI raised $6B Series E to accelerate development of Grok and expand AI compute infrastructure.',
    headquarters: 'Austin, TX',
    foundedYear: 2023,
    announcedDate: '2026-02-12',
    url: 'https://example.com/investments/xai-series-e',
  },
];

/**
 * MockInvestmentsAdapter — returns a deterministic set of 10 AI startup investment records.
 * Intended for development, testing, and demo purposes.
 */
class MockInvestmentsAdapter extends BaseAdapter {
  /**
   * Fetch mock investment records.
   * @returns {Promise<Array>} Deterministic array of 10 raw investment records.
   */
  async fetch() {
    return MOCK_INVESTMENTS;
  }

  /**
   * Transform raw investment records into Opportunity model shape.
   * @param {Array} rawRecords
   * @returns {Array}
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const tags = [
        record.round,
        record.sector,
        record.leadInvestor,
        ...record.otherInvestors,
      ];

      return {
        type: OPPORTUNITY_TYPES.INVESTMENT,
        source: 'mock_investments',
        sourceId: record.id,
        title: `${record.startup} — ${record.round} ($${(record.amount / 1e6).toFixed(0)}M)`,
        description: record.description,
        sourceUrl: record.url,
        status: 'active',
        category: record.sector,
        tags,
        location: record.headquarters,
        value: record.amount,
        publishedAt: record.announcedDate ? new Date(record.announcedDate) : null,
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = MockInvestmentsAdapter;
