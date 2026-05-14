// Research Intelligence Phase 1 — HuggingFace Papers adapter.
//
// HuggingFace's "Daily Papers" surface is the best signal for *trending
// applied* AI — papers the practitioner community is actually upvoting and
// implementing, as opposed to raw arXiv volume.
//
// API: https://huggingface.co/api/daily_papers — keyless JSON. Returns
// recent days' curated papers with upvote counts + the underlying arXiv id.
//
// Failure modes:
//   - timeout / 5xx → throw (Source Health handles)
//   - shape drift (HF changes the JSON) → defensive field access, 0 results

const BaseAdapter = require('../base.adapter');
const logger = require('../../../logging/logger');

const HF_DAILY_PAPERS_API = 'https://huggingface.co/api/daily_papers';
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_LIMIT = 100;

class HuggingFacePapersAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.limit = config.limit || DEFAULT_LIMIT;
  }

  async fetch() {
    const url = `${HF_DAILY_PAPERS_API}?limit=${this.limit}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'OpportunityPulse/1.0 (research ingestion)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HuggingFace Papers returned ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      const items = Array.isArray(json) ? json : [];
      logger.info(`HuggingFace Papers: ${items.length} trending papers retrieved.`);
      return items;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`HuggingFace Papers timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      }
      throw error;
    }
  }

  transform(rawRecords) {
    const out = [];
    for (const item of rawRecords) {
      // HF wraps the paper under .paper; be defensive about shape drift.
      const paper = item.paper || item;
      const arxivId = paper.id || paper.arxivId || null;
      if (!arxivId) continue; // no stable id → skip
      const authors = Array.isArray(paper.authors)
        ? paper.authors.map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean)
        : [];
      const upvotes = typeof paper.upvotes === 'number' ? paper.upvotes
        : (typeof item.numUpvotes === 'number' ? item.numUpvotes : null);
      out.push({
        type: 'research',
        source: 'huggingface_papers',
        sourceId: String(arxivId),
        title: (paper.title || 'Untitled').slice(0, 500),
        description: (paper.summary || paper.abstract || '').slice(0, 2000),
        sourceUrl: `https://huggingface.co/papers/${arxivId}`,
        status: 'active',
        category: 'Trending AI',
        tags: Array.isArray(paper.tags) ? paper.tags.slice(0, 10) : [],
        // Upvotes are HF's community-traction signal — used as the "value"
        // roll-up for the channel card, same way citationCount is for S2.
        value: upvotes,
        publishedAt: (item.publishedAt || paper.publishedAt)
          ? new Date(item.publishedAt || paper.publishedAt) : null,
        expiresAt: null,
        sourceData: {
          authors,
          institution: null,
          citationCount: null,
          upvotes,
          publishedDate: item.publishedAt || paper.publishedAt || null,
          researchType: 'trending_paper',
          domains: Array.isArray(paper.tags) ? paper.tags : [],
          paperPdf: `https://arxiv.org/pdf/${arxivId}`,
          arxivId,
          githubRepo: paper.githubRepo || null,
        },
      });
    }
    logger.info(`HuggingFace Papers transform: ${out.length} papers with stable ids.`);
    return out;
  }
}

module.exports = HuggingFacePapersAdapter;
