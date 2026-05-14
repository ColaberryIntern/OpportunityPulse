// Research Intelligence Phase 1 — arXiv adapter.
//
// arXiv exposes a keyless Atom feed via its export API. We query the
// cs.AI / cs.LG / cs.CL categories for recent papers, dedupe by arXiv ID,
// and normalize into the unified Opportunity shape with type='research'.
//
// API: http://export.arxiv.org/api/query — no auth, rate-limited politely
// (arXiv asks for ≤1 request / 3 sec; we do a handful of category queries
// per run on the daily cron, well within bounds).
//
// Failure modes:
//   - upstream timeout / 5xx → throw (Source Health classifies + retries)
//   - malformed XML → that category yields 0, other categories continue
//   - one category 4xx → logged, skipped, others continue

const BaseAdapter = require('../base.adapter');
const logger = require('../../../logging/logger');

const ARXIV_API = 'http://export.arxiv.org/api/query';
const REQUEST_TIMEOUT_MS = 20000;
// cs.AI = Artificial Intelligence, cs.LG = Machine Learning,
// cs.CL = Computation & Language (NLP/LLMs), cs.MA = Multiagent Systems.
const DEFAULT_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.MA'];
const DEFAULT_PER_CATEGORY = 40;

// Minimal Atom-feed field extractor. arXiv's feed is well-formed and
// predictable; a full XML parser is overkill for the handful of fields
// we need. Each <entry> is matched, then per-field regexes pull values.
function parseAtomEntries(xml) {
  const entries = [];
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const block of entryBlocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim().replace(/\s+/g, ' ') : null;
    };
    const id = pick('id'); // e.g. http://arxiv.org/abs/2505.01234v1
    if (!id) continue;
    const arxivId = (id.match(/abs\/([^v\s]+)/) || [])[1] || id;
    const authors = [];
    const authorBlocks = block.match(/<author>[\s\S]*?<\/author>/g) || [];
    for (const ab of authorBlocks) {
      const nm = ab.match(/<name>([\s\S]*?)<\/name>/);
      if (nm) authors.push(nm[1].trim());
    }
    const categories = [];
    const catMatches = block.match(/<category[^>]*term="([^"]+)"/g) || [];
    for (const cm of catMatches) {
      const t = cm.match(/term="([^"]+)"/);
      if (t) categories.push(t[1]);
    }
    const pdfMatch = block.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
    entries.push({
      arxivId,
      absUrl: id.replace(/v\d+$/, ''),
      pdfUrl: pdfMatch ? pdfMatch[1] : null,
      title: pick('title'),
      summary: pick('summary'),
      published: pick('published'),
      updated: pick('updated'),
      authors,
      categories,
    });
  }
  return entries;
}

class ArxivAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.categories = config.categories || DEFAULT_CATEGORIES;
    this.perCategory = config.perCategory || DEFAULT_PER_CATEGORY;
  }

  async _fetchCategory(category) {
    // sortBy=submittedDate&sortOrder=descending → newest papers first.
    const url = `${ARXIV_API}?search_query=cat:${encodeURIComponent(category)}`
      + `&sortBy=submittedDate&sortOrder=descending&max_results=${this.perCategory}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/atom+xml', 'User-Agent': 'OpportunityPulse/1.0 (research ingestion)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`arXiv API returned ${res.status} for cat:${category}: ${body.slice(0, 200)}`);
      }
      const xml = await res.text();
      const entries = parseAtomEntries(xml);
      logger.info(`arXiv cat:${category}: ${entries.length} papers retrieved.`);
      return entries;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`arXiv request timed out after ${REQUEST_TIMEOUT_MS}ms for cat:${category}.`);
      }
      throw error;
    }
  }

  async fetch() {
    let all = [];
    for (const category of this.categories) {
      try {
        const entries = await this._fetchCategory(category);
        all = all.concat(entries);
        // Polite spacing — arXiv asks for ≤1 req / 3 sec.
        await new Promise((r) => setTimeout(r, 3200));
      } catch (error) {
        logger.error(`arXiv failed for cat:${category}: ${error.message}`);
        // Continue to next category — one failure doesn't sink the run.
      }
    }
    // Dedupe by arXiv ID (a paper can be cross-listed in multiple categories).
    const seen = new Set();
    const unique = [];
    for (const e of all) {
      if (!e.arxivId || seen.has(e.arxivId)) continue;
      seen.add(e.arxivId);
      unique.push(e);
    }
    logger.info(`arXiv fetch complete: ${all.length} total, ${unique.length} unique.`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((p) => ({
      type: 'research',
      source: 'arxiv',
      sourceId: String(p.arxivId),
      title: (p.title || 'Untitled').slice(0, 500),
      description: (p.summary || '').slice(0, 2000),
      sourceUrl: p.absUrl || `https://arxiv.org/abs/${p.arxivId}`,
      status: 'active',
      category: p.categories[0] || 'cs.AI',
      tags: p.categories.slice(0, 10),
      value: null,
      publishedAt: p.published ? new Date(p.published) : null,
      expiresAt: null,
      // Research-specific fields land in sourceData per the expansion plan's
      // suggested schema. Scoring (novelty/commercial/etc.) is added later
      // by the classification layer into aiAnalysis, not here.
      sourceData: {
        authors: p.authors,
        institution: null,
        citationCount: null,
        publishedDate: p.published || null,
        updatedDate: p.updated || null,
        researchType: 'paper',
        domains: p.categories,
        paperPdf: p.pdfUrl,
        arxivId: p.arxivId,
      },
    }));
  }
}

module.exports = ArxivAdapter;
