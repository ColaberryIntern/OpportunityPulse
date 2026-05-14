// Research Intelligence Phase 1 — adapter transform + classification tests.
//
// fetch() hits live APIs so it's not unit-tested here; transform() is pure
// and is the contract that matters for the unified opportunities table.

const ArxivAdapter = require('../../src/ingestion/adapters/research/arxiv.adapter');
const SemanticScholarAdapter = require('../../src/ingestion/adapters/research/semanticScholar.adapter');
const HuggingFacePapersAdapter = require('../../src/ingestion/adapters/research/huggingFacePapers.adapter');
const PapersWithCodeAdapter = require('../../src/ingestion/adapters/research/papersWithCode.adapter');
const ResearchBlogRssAdapter = require('../../src/ingestion/adapters/research/researchBlogRss.adapter');
const { classifyByRules } = require('../../src/actionEngine/classification.rules');

const fakeDataSource = (name) => ({ name, config: {} });

describe('ArxivAdapter.transform', () => {
  const adapter = new ArxivAdapter(fakeDataSource('arxiv'));
  it('normalizes an arXiv entry into the research Opportunity shape', () => {
    const [opp] = adapter.transform([{
      arxivId: '2505.01234',
      absUrl: 'http://arxiv.org/abs/2505.01234',
      pdfUrl: 'http://arxiv.org/pdf/2505.01234',
      title: 'Memory-Augmented Multi-Agent Systems',
      summary: 'We present a new approach to agent memory.',
      published: '2026-05-01T00:00:00Z',
      authors: ['A. Researcher', 'B. Scientist'],
      categories: ['cs.AI', 'cs.MA'],
    }]);
    expect(opp.type).toBe('research');
    expect(opp.source).toBe('arxiv');
    expect(opp.sourceId).toBe('2505.01234');
    expect(opp.title).toMatch(/Memory-Augmented/);
    expect(opp.sourceData.authors).toEqual(['A. Researcher', 'B. Scientist']);
    expect(opp.sourceData.paperPdf).toBe('http://arxiv.org/pdf/2505.01234');
    expect(opp.sourceData.domains).toEqual(['cs.AI', 'cs.MA']);
    expect(opp.publishedAt).toBeInstanceOf(Date);
  });
});

describe('SemanticScholarAdapter.transform', () => {
  const adapter = new SemanticScholarAdapter(fakeDataSource('semantic_scholar'));
  it('maps citationCount into value and preserves the arXiv cross-id', () => {
    const [opp] = adapter.transform([{
      paperId: 's2-abc123',
      externalIds: { ArXiv: '2505.09999' },
      title: 'Retrieval-Augmented Reasoning',
      abstract: 'RAG meets chain-of-thought.',
      url: 'https://www.semanticscholar.org/paper/abc123',
      venue: 'NeurIPS',
      year: 2026,
      publicationDate: '2026-04-15',
      citationCount: 241,
      influentialCitationCount: 30,
      fieldsOfStudy: ['Computer Science'],
      authors: [{ name: 'C. Author' }],
    }]);
    expect(opp.type).toBe('research');
    expect(opp.source).toBe('semantic_scholar');
    expect(opp.sourceId).toBe('s2-abc123');
    expect(opp.value).toBe(241);
    expect(opp.sourceData.citationCount).toBe(241);
    expect(opp.sourceData.arxivId).toBe('2505.09999');
    expect(opp.sourceData.venue).toBe('NeurIPS');
  });
  it('handles missing optional fields without throwing', () => {
    const [opp] = adapter.transform([{ paperId: 's2-bare', title: 'Bare Paper' }]);
    expect(opp.value).toBeNull();
    expect(opp.sourceData.arxivId).toBeNull();
    expect(opp.publishedAt).toBeNull();
  });
});

describe('HuggingFacePapersAdapter.transform', () => {
  const adapter = new HuggingFacePapersAdapter(fakeDataSource('huggingface_papers'));
  it('unwraps the .paper shape and maps upvotes into value', () => {
    const [opp] = adapter.transform([{
      publishedAt: '2026-05-08T00:00:00Z',
      paper: {
        id: '2505.07777',
        title: 'Trending Agent Benchmark',
        summary: 'A new benchmark for autonomous agents.',
        upvotes: 88,
        authors: ['D. Author'],
        tags: ['agents', 'benchmark'],
      },
    }]);
    expect(opp.type).toBe('research');
    expect(opp.source).toBe('huggingface_papers');
    expect(opp.sourceId).toBe('2505.07777');
    expect(opp.value).toBe(88);
    expect(opp.sourceData.upvotes).toBe(88);
    expect(opp.sourceUrl).toBe('https://huggingface.co/papers/2505.07777');
  });
  it('skips records with no stable id', () => {
    const out = adapter.transform([{ paper: { title: 'No ID Paper' } }]);
    expect(out).toEqual([]);
  });
});

describe('PapersWithCodeAdapter.transform', () => {
  const adapter = new PapersWithCodeAdapter(fakeDataSource('papers_with_code'));
  it('maps the linked GitHub repo into sourceData.githubRepo', () => {
    const [opp] = adapter.transform([{
      id: 'pwc-xyz',
      arxiv_id: '2505.04444',
      title: 'Implemented Agent Framework',
      abstract: 'Comes with code.',
      url_abs: 'https://paperswithcode.com/paper/xyz',
      url_pdf: 'https://arxiv.org/pdf/2505.04444',
      published: '2026-05-03',
      authors: ['E. Coder'],
      repository_url: 'https://github.com/x/agent-framework',
    }]);
    expect(opp.type).toBe('research');
    expect(opp.source).toBe('papers_with_code');
    expect(opp.sourceData.githubRepo).toBe('https://github.com/x/agent-framework');
    expect(opp.sourceData.arxivId).toBe('2505.04444');
  });
  it('skips records with no id', () => {
    expect(adapter.transform([{ title: 'No ID' }])).toEqual([]);
  });
});

describe('ResearchBlogRssAdapter.transform', () => {
  const adapter = new ResearchBlogRssAdapter(fakeDataSource('research_blogs'));
  it('normalizes an RSS item, strips HTML, tags the lab', () => {
    const [opp] = adapter.transform([{
      link: 'https://openai.com/blog/some-post',
      title: 'A Research Post',
      contentSnippet: '<p>Some <b>HTML</b> content.</p>',
      isoDate: '2026-05-07T00:00:00Z',
      creator: 'OpenAI Research',
      _lab: 'OpenAI',
      _feedUrl: 'https://openai.com/blog/rss.xml',
    }]);
    expect(opp.type).toBe('research');
    expect(opp.source).toBe('research_blogs');
    expect(opp.sourceId).toBe('https://openai.com/blog/some-post');
    expect(opp.description).toBe('Some HTML content.');
    expect(opp.category).toBe('OpenAI');
    expect(opp.sourceData.researchType).toBe('corporate_research');
    expect(opp.sourceData.institution).toBe('OpenAI');
  });
});

describe('classifyByRules — research type (Phase 1)', () => {
  it('on-topic research with a GitHub repo → BUILD', () => {
    const r = classifyByRules({
      type: 'research',
      title: 'Multi-Agent Orchestration for Enterprise AI',
      description: 'A framework for LLM orchestration.',
      tags: ['agents'],
      sourceData: { githubRepo: 'https://github.com/x/y', domains: ['cs.MA'] },
    });
    expect(r.actionType).toBe('BUILD');
  });
  it('on-topic research with high citation traction → BUILD', () => {
    const r = classifyByRules({
      type: 'research',
      title: 'Retrieval systems for reasoning',
      description: '',
      tags: [],
      sourceData: { citationCount: 120, domains: [] },
    });
    expect(r.actionType).toBe('BUILD');
  });
  it('on-topic but early-stage research → PARTNER', () => {
    const r = classifyByRules({
      type: 'research',
      title: 'Early work on AI observability',
      description: '',
      tags: [],
      sourceData: { citationCount: 2, domains: [] },
    });
    expect(r.actionType).toBe('PARTNER');
  });
  it('off-topic research → IGNORE (still surfaced in channel, just not actionable)', () => {
    const r = classifyByRules({
      type: 'research',
      title: 'Quantum chromodynamics lattice simulation',
      description: 'Physics paper unrelated to applied AI.',
      tags: ['physics'],
      sourceData: { domains: ['hep-lat'] },
    });
    expect(r.actionType).toBe('IGNORE');
  });
});
