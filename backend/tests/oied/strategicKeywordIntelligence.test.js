// Strategic Intelligence Overlay — pure-logic unit tests.

const intel = require('../../src/oied/strategicKeywordIntelligence.service');
const dict = require('../../src/oied/strategicKeywordDictionaries');

describe('strategicKeywordDictionaries', () => {
  test('every category has at least one phrase', () => {
    for (const [k, phrases] of Object.entries(dict.STRATEGIC_DICTIONARIES)) {
      expect(Array.isArray(phrases)).toBe(true);
      expect(phrases.length).toBeGreaterThan(0);
      // Sample sanity: all entries are non-empty strings
      for (const p of phrases.slice(0, 3)) {
        expect(typeof p).toBe('string');
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });

  test('CATEGORY_PRIORITY lists every category exactly once', () => {
    const cats = Object.keys(dict.STRATEGIC_DICTIONARIES).sort();
    const prio = [...dict.CATEGORY_PRIORITY].sort();
    expect(cats).toEqual(prio);
  });

  test('categoriesFor returns multiple categories for words in overlap zones', () => {
    // "compliance" should hit operational_pain + procurement_language +
    // compliance_pressure + regulated_domains
    const cats = dict.categoriesFor('compliance');
    expect(cats).toEqual(expect.arrayContaining([
      'operational_pain', 'compliance_pressure',
    ]));
    expect(cats.length).toBeGreaterThanOrEqual(2);
  });

  test('categoriesFor handles substring matching ("data compliance" → compliance)', () => {
    const cats = dict.categoriesFor('data compliance');
    expect(cats.length).toBeGreaterThan(0);
  });

  test('dominantCategory prioritizes procurement_language over emerging_ai', () => {
    const dom = dict.dominantCategory(['emerging_ai', 'procurement_language', 'infrastructure']);
    expect(dom).toBe('procurement_language');
  });

  test('normalizeWord lowercases and collapses whitespace', () => {
    expect(dict.normalizeWord('  Federal   Compliance  ')).toBe('federal compliance');
    expect(dict.normalizeWord(null)).toBe('');
  });

  test('categoriesFor returns [] for non-strategic words', () => {
    expect(dict.categoriesFor('zzzz')).toEqual([]);
    expect(dict.categoriesFor('')).toEqual([]);
  });
});

describe('strategicKeywordIntelligence — WEIGHTS', () => {
  test('WEIGHTS sum to 1.0', () => {
    const sum = Object.values(intel.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.0001);
  });
  test('WEIGHTS has all 9 expected axes', () => {
    expect(Object.keys(intel.WEIGHTS).sort()).toEqual([
      'commercialization', 'convergence', 'modernization',
      'operational_pain', 'procurement', 'regulated_boost',
      'research_velocity', 'strategic_rarity', 'venture',
    ]);
  });
});

describe('strategicKeywordIntelligence — sub-scorers', () => {
  test('scoreConvergence rewards distinct strategic axes', () => {
    const zero = intel.scoreConvergence({ channelCounts: {} });
    expect(zero.score).toBe(0);

    const onlyResearch = intel.scoreConvergence({ channelCounts: { research: 10 } });
    const fiveAxes = intel.scoreConvergence({
      channelCounts: { research: 3, gov_contract: 5, ai_job: 2, investment: 1, ai_news: 4 },
    });
    expect(fiveAxes.score).toBeGreaterThan(onlyResearch.score);
    expect(fiveAxes.axes.length).toBeGreaterThanOrEqual(4);
  });

  test('scoreProcurement is boosted by procurement vocabulary AND gov counts', () => {
    const inVocab = intel.scoreProcurement({
      word: 'rfp', channelCounts: { gov_contract: 0 },
      categories: ['procurement_language'],
    });
    expect(inVocab).toBeGreaterThanOrEqual(25);

    const withGov = intel.scoreProcurement({
      word: 'modernization', channelCounts: { gov_contract: 10 },
      categories: ['procurement_language'],
    });
    expect(withGov).toBeGreaterThan(inVocab);
  });

  test('scoreCommercialization penalizes research-only words', () => {
    const researchOnly = intel.scoreCommercialization({
      categories: [],
      channelCounts: { research: 20 },
    });
    expect(researchOnly).toBeLessThanOrEqual(25);

    const researchPlusProc = intel.scoreCommercialization({
      categories: ['commercialization_signals'],
      channelCounts: { research: 5, gov_contract: 10, ai_job: 3 },
    });
    expect(researchPlusProc).toBeGreaterThan(researchOnly);
  });

  test('scoreOperationalPain combines pain + compliance + hiring + research', () => {
    const inPain = intel.scoreOperationalPain({
      categories: ['operational_pain', 'compliance_pressure'],
      channelCounts: { ai_job: 5, research: 3 },
    });
    expect(inPain).toBeGreaterThanOrEqual(80);

    const nothing = intel.scoreOperationalPain({ categories: [], channelCounts: {} });
    expect(nothing).toBe(0);
  });

  test('scoreVenture is high for AI tools + emerging_ai + automation_categories', () => {
    const strong = intel.scoreVenture({
      toolCount: 20,
      categories: ['emerging_ai', 'automation_categories'],
      channelCounts: { investment: 3, ai_news: 8 },
    });
    expect(strong).toBeGreaterThanOrEqual(70);
  });

  test('scoreResearchVelocity falls off with age', () => {
    const fresh = intel.scoreResearchVelocity({
      channelCounts: { research: 10 }, avgAgeDays: 2,
    });
    const stale = intel.scoreResearchVelocity({
      channelCounts: { research: 10 }, avgAgeDays: 60,
    });
    expect(fresh).toBeGreaterThan(stale);
  });

  test('scoreRegulatedBoost is zero without regulated_domains tag', () => {
    expect(intel.scoreRegulatedBoost({ categories: [] })).toBe(0);
    const single = intel.scoreRegulatedBoost({ categories: ['regulated_domains'] });
    expect(single).toBeGreaterThanOrEqual(50);
    const overlap = intel.scoreRegulatedBoost({
      categories: ['regulated_domains', 'compliance_pressure', 'procurement_language'],
    });
    expect(overlap).toBeGreaterThan(single);
  });

  test('scoreStrategicRarity is highest for rare words', () => {
    const rare = intel.scoreStrategicRarity({ matchCount: 3, maxMatchInCorpus: 1000 });
    const common = intel.scoreStrategicRarity({ matchCount: 950, maxMatchInCorpus: 1000 });
    expect(rare).toBeGreaterThan(common);
  });
});

describe('strategicKeywordIntelligence — composite + classification', () => {
  test('scoreKeyword on "compliance" with procurement signal scores high', () => {
    const out = intel.scoreKeyword({
      word: 'compliance',
      matchCount: 50, toolCount: 5, totalMentions: 60,
      channelCounts: { gov_contract: 10, ai_job: 5, research: 3, ai_news: 8 },
      sentimentScore: 0, avgAgeDays: 4,
    }, { maxMatchInCorpus: 2000 });
    expect(out.strategic_score).toBeGreaterThanOrEqual(40);
    expect(out.strategic_tags).toEqual(expect.arrayContaining(['operational_pain', 'compliance_pressure']));
    // "compliance" doesn't substring-match anything in PROCUREMENT_LANGUAGE
    // (rfp / sow / far / gsa / etc.), so the dominant category falls to
    // operational_pain (next in CATEGORY_PRIORITY after procurement_language).
    expect(out.strategic_category).toBe('operational_pain');
    expect(['critical', 'high', 'standard']).toContain(out.strategic_priority);
  });

  test('scoreKeyword on a generic word like "ai" scores LOW strategically', () => {
    const out = intel.scoreKeyword({
      word: 'ai',
      matchCount: 2000, toolCount: 50, totalMentions: 3000,
      channelCounts: { ai_news: 1500, ai_job: 400 },
      sentimentScore: 0.2, avgAgeDays: 2,
    }, { maxMatchInCorpus: 2000 });
    expect(out.sub_scores.strategic_rarity).toBeLessThanOrEqual(10);
    expect(out.strategic_score).toBeLessThan(70);
  });

  test('classifyCommercializationStage maps sub-scores to stage labels', () => {
    expect(intel.classifyCommercializationStage({
      commercializationScore: 80, procurementScore: 60,
      researchVelocityScore: 40, ventureScore: 50,
    })).toBe('mainstream');

    expect(intel.classifyCommercializationStage({
      commercializationScore: 0, procurementScore: 0,
      researchVelocityScore: 0, ventureScore: 0,
    })).toBe('unknown');

    expect(intel.classifyCommercializationStage({
      commercializationScore: 0, procurementScore: 0,
      researchVelocityScore: 60, ventureScore: 0,
    })).toBe('early_signal');
  });

  test('classifyStrategicPriority promotes to critical when convergence is strong', () => {
    expect(intel.classifyStrategicPriority({ strategicScore: 80, convergenceScore: 60 })).toBe('critical');
    expect(intel.classifyStrategicPriority({ strategicScore: 65, convergenceScore: 10 })).toBe('high');
    expect(intel.classifyStrategicPriority({ strategicScore: 45, convergenceScore: 5 })).toBe('standard');
    expect(intel.classifyStrategicPriority({ strategicScore: 15, convergenceScore: 0 })).toBe('low');
  });

  test('enrichKeywords handles snake_case AND camelCase row shapes', () => {
    const enriched = intel.enrichKeywords([
      {
        word: 'compliance', matchCount: 30, tool_count: 2, totalMentions: 30,
        channel_counts: { gov_contract: 8, ai_news: 5 }, avgAgeDays: 5,
      },
    ]);
    expect(enriched.length).toBe(1);
    expect(enriched[0].strategic_score).toBeGreaterThan(0);
  });

  test('summarizeEnriched produces aggregate stats', () => {
    const rows = [
      { word: 'compliance', matchCount: 20, toolCount: 0, totalMentions: 20,
        channelCounts: { gov_contract: 5 }, avgAgeDays: 3 },
      { word: 'modernization', matchCount: 15, toolCount: 0, totalMentions: 15,
        channelCounts: { gov_contract: 3, bonfire: 2 }, avgAgeDays: 4 },
    ];
    const summary = intel.summarizeEnriched(intel.enrichKeywords(rows));
    expect(summary.count).toBe(2);
    expect(typeof summary.avg_strategic_score).toBe('number');
    expect(summary.by_priority).toBeDefined();
    expect(summary.by_stage).toBeDefined();
    expect(summary.weights).toEqual(intel.WEIGHTS);
  });
});
