// Research Intelligence Phase 1 — Semantic Scholar adapter.
//
// Semantic Scholar's Graph API is keyless for low volume (an API key just
// raises the rate limit). We query recent AI papers and get richer metadata
// than arXiv: citation counts, author objects, venue, fields of study.
//
// API: https://api.semanticscholar.org/graph/v1/paper/search
// Keyless rate limit is ~100 req / 5 min — we make a few queries per run.
// If config.apiKey is set we send it as x-api-key for the higher tier.
//
// Failure modes:
//   - 429 rate-limited → throw (Source Health classifies as upstream_unavailable)
//   - timeout / 5xx → throw
//   - one query 4xx → logged, skipped, others continue

const BaseAdapter = require('../base.adapter');
const logger = require('../../../logging/logger');

const S2_SEARCH_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const REQUEST_TIMEOUT_MS = 20000;
const FIELDS = [
  'paperId', 'externalIds', 'title', 'abstract', 'url', 'venue',
  'year', 'publicationDate', 'citationCount', 'influentialCitationCount',
  'fieldsOfStudy', 'authors',
].join(',');
// Queries picked to surface the "intelligent filtering" high-priority topics
// from the expansion plan without over-fetching.
const DEFAULT_QUERIES = [
  'large language model agents',
  'multi-agent systems LLM',
  'retrieval augmented generation',
  'AI reasoning benchmark',
];
const DEFAULT_PER_QUERY = 25;

class SemanticScholarAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.queries = config.queries || DEFAULT_QUERIES;
    this.perQuery = config.perQuery || DEFAULT_PER_QUERY;
    this.apiKey = config.apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY || null;
  }

  async _runQuery(query) {
    // Only papers from the last ~2 years stay relevant for an opportunity feed.
    const thisYear = new Date().getFullYear();
    const url = `${S2_SEARCH_API}?query=${encodeURIComponent(query)}`
      + `&limit=${this.perQuery}&fields=${FIELDS}&year=${thisYear - 1}-${thisYear}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Semantic Scholar returned ${res.status} for "${query}": ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      const papers = Array.isArray(json.data) ? json.data : [];
      logger.info(`Semantic Scholar "${query}": ${papers.length} papers.`);
      return papers;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Semantic Scholar timed out after ${REQUEST_TIMEOUT_MS}ms for "${query}".`);
      }
      throw error;
    }
  }

  async fetch() {
    let all = [];
    for (const query of this.queries) {
      try {
        const papers = await this._runQuery(query);
        all = all.concat(papers);
        // Polite spacing for the keyless tier.
        await new Promise((r) => setTimeout(r, 1500));
      } catch (error) {
        logger.error(`Semantic Scholar failed for "${query}": ${error.message}`);
      }
    }
    const seen = new Set();
    const unique = [];
    for (const p of all) {
      if (!p.paperId || seen.has(p.paperId)) continue;
      seen.add(p.paperId);
      unique.push(p);
    }
    logger.info(`Semantic Scholar fetch complete: ${all.length} total, ${unique.length} unique.`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((p) => {
      const authors = Array.isArray(p.authors) ? p.authors.map((a) => a.name).filter(Boolean) : [];
      // Prefer the arXiv ID as the cross-source identity hint when present,
      // but keep the S2 paperId as our sourceId (unique within source='semantic_scholar').
      const arxivId = p.externalIds && p.externalIds.ArXiv ? p.externalIds.ArXiv : null;
      return {
        type: 'research',
        source: 'semantic_scholar',
        sourceId: String(p.paperId),
        title: (p.title || 'Untitled').slice(0, 500),
        description: (p.abstract || '').slice(0, 2000),
        sourceUrl: p.url || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
        status: 'active',
        category: (p.fieldsOfStudy && p.fieldsOfStudy[0]) || 'Computer Science',
        tags: Array.isArray(p.fieldsOfStudy) ? p.fieldsOfStudy.slice(0, 10) : [],
        // citationCount is a meaningful "value" proxy for research — it's what
        // the channel summary card will roll up. Real scoring comes later.
        value: typeof p.citationCount === 'number' ? p.citationCount : null,
        publishedAt: p.publicationDate ? new Date(p.publicationDate)
          : (p.year ? new Date(`${p.year}-01-01`) : null),
        expiresAt: null,
        sourceData: {
          authors,
          institution: null,
          citationCount: p.citationCount ?? null,
          influentialCitationCount: p.influentialCitationCount ?? null,
          publishedDate: p.publicationDate || (p.year ? String(p.year) : null),
          venue: p.venue || null,
          researchType: 'paper',
          domains: Array.isArray(p.fieldsOfStudy) ? p.fieldsOfStudy : [],
          arxivId,
          semanticScholarId: p.paperId,
        },
      };
    });
  }
}

module.exports = SemanticScholarAdapter;
