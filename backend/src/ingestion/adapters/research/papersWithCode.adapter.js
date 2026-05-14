// Research Intelligence Phase 2.5 — Papers With Code adapter.
//
// Papers With Code surfaces papers that have *working implementations* —
// the strongest "buildable" signal in the research corpus. Its public API
// is keyless. We pull the recent papers list; each record carries the
// arXiv id + the linked GitHub repo when one exists.
//
// API: https://paperswithcode.com/api/v1/papers/?ordering=-published
// Keyless, paginated. We take the first page or two on the daily/tick cron.
//
// Failure modes:
//   - timeout / 5xx → throw (Source Health classifies + retries)
//   - shape drift → defensive field access, skip malformed rows

const BaseAdapter = require('../base.adapter');
const logger = require('../../../logging/logger');

const PWC_API = 'https://paperswithcode.com/api/v1/papers/';
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_PAGES = 2;
const PER_PAGE = 50;

class PapersWithCodeAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.pages = config.pages || DEFAULT_PAGES;
  }

  async _fetchPage(page) {
    const url = `${PWC_API}?ordering=-published&page=${page}&items_per_page=${PER_PAGE}`;
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
        throw new Error(`Papers With Code returned ${res.status} (page ${page}): ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      const results = Array.isArray(json.results) ? json.results : [];
      logger.info(`Papers With Code page ${page}: ${results.length} papers.`);
      return results;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Papers With Code timed out after ${REQUEST_TIMEOUT_MS}ms (page ${page}).`);
      }
      throw error;
    }
  }

  async fetch() {
    let all = [];
    for (let page = 1; page <= this.pages; page += 1) {
      try {
        const results = await this._fetchPage(page);
        all = all.concat(results);
        if (results.length < PER_PAGE) break; // last page
        await new Promise((r) => setTimeout(r, 1200)); // polite spacing
      } catch (error) {
        logger.error(`Papers With Code failed on page ${page}: ${error.message}`);
        if (page === 1) throw error; // page-1 failure = real outage, surface it
        break; // later-page failure → keep what we have
      }
    }
    // Dedupe by paper id.
    const seen = new Set();
    const unique = [];
    for (const p of all) {
      const id = p.id || p.arxiv_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(p);
    }
    logger.info(`Papers With Code fetch complete: ${all.length} total, ${unique.length} unique.`);
    return unique;
  }

  transform(rawRecords) {
    const out = [];
    for (const p of rawRecords) {
      const id = p.id || p.arxiv_id;
      if (!id) continue;
      const arxivId = p.arxiv_id || null;
      out.push({
        type: 'research',
        source: 'papers_with_code',
        sourceId: String(id),
        title: (p.title || 'Untitled').slice(0, 500),
        description: (p.abstract || '').slice(0, 2000),
        sourceUrl: p.url_abs || (arxivId ? `https://arxiv.org/abs/${arxivId}` : `https://paperswithcode.com/paper/${id}`),
        status: 'active',
        category: 'Implemented Research',
        tags: [],
        value: null,
        publishedAt: p.published ? new Date(p.published) : null,
        expiresAt: null,
        sourceData: {
          authors: Array.isArray(p.authors) ? p.authors : [],
          institution: null,
          citationCount: null,
          publishedDate: p.published || null,
          researchType: 'implemented_paper',
          domains: [],
          arxivId,
          paperPdf: p.url_pdf || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
          // Papers With Code's killer signal: a linked, runnable implementation.
          githubRepo: p.repository_url || null,
          papersWithCodeId: id,
        },
      });
    }
    return out;
  }
}

module.exports = PapersWithCodeAdapter;
