// Pure-logic tests for the deterministic gov contract fit scorer.

const {
  scoreGovContract,
  scoreAiAlignment,
  scoreNaics,
  scoreAgencyMaturity,
  scoreSetAside,
  scoreValueFit,
  WEIGHTS,
} = require('../../src/govContracts/govContractScoring.service');

describe('WEIGHTS', () => {
  test('sums to 1.0', () => {
    const s = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(s - 1)).toBeLessThan(0.0001);
  });
});

describe('scoreAiAlignment', () => {
  test('high-signal AI title scores meaningfully', () => {
    // "machine learning" (HIGH 22) + "analytics platform" (MEDIUM 9) = 31
    // after greedy dedup of overlapping vocab. That's enough to surface.
    expect(scoreAiAlignment('Enterprise Machine Learning Analytics Platform', '')).toBeGreaterThanOrEqual(30);
  });
  test('no AI terms scores 0', () => {
    expect(scoreAiAlignment('Janitorial Services - Building 7', '')).toBe(0);
  });
  test('cap at 100', () => {
    const title = 'AI ML LLM NLP foundation model neural network deep learning';
    const description = 'computer vision generative ai large language model machine learning ai system';
    expect(scoreAiAlignment(title, description)).toBeLessThanOrEqual(100);
  });
  test('medium signal counts strictly less than high', () => {
    // "Data Analytics Platform" → MEDIUM only (9). "Machine Learning Platform"
    // → HIGH "machine learning" (22). ML must beat the pure analytics term.
    const data = scoreAiAlignment('Data Analytics Platform', '');
    const ml = scoreAiAlignment('Machine Learning Platform', '');
    expect(data).toBeLessThan(ml);
  });
});

describe('scoreNaics', () => {
  test('541511 is top fit', () => { expect(scoreNaics('541511')).toBe(100); });
  test('541715 R&D scores high', () => { expect(scoreNaics('541715')).toBe(80); });
  test('unknown NAICS scores 0', () => { expect(scoreNaics('999999')).toBe(0); });
  test('null NAICS scores 0', () => { expect(scoreNaics(null)).toBe(0); });
  test('takes only the first 6 digits (handles padded codes)', () => {
    expect(scoreNaics('5415110000')).toBe(100);
  });
});

describe('scoreAgencyMaturity', () => {
  test('DARPA scores max', () => {
    expect(scoreAgencyMaturity('DEPT OF DEFENSE.DARPA')).toBe(100);
  });
  test('AFRL matches by substring', () => {
    expect(scoreAgencyMaturity('DEPT OF DEFENSE.DEPT OF THE AIR FORCE.AIR FORCE RESEARCH LABORATORY.FA8750')).toBe(95);
  });
  test('unknown agency returns neutral floor', () => {
    expect(scoreAgencyMaturity('SOME LOCAL TOWN')).toBe(30);
  });
  test('null agency returns neutral floor', () => {
    expect(scoreAgencyMaturity(null)).toBe(30);
  });
});

describe('scoreSetAside', () => {
  test('SBIR scores max', () => { expect(scoreSetAside('SBIR')).toBe(100); });
  test('8A scores high', () => { expect(scoreSetAside('8A')).toBe(85); });
  test('NONE is neutral', () => { expect(scoreSetAside('NONE')).toBe(35); });
  test('null is neutral', () => { expect(scoreSetAside(null)).toBe(35); });
  test('unrecognized code maps to small positive', () => {
    expect(scoreSetAside('ZZZ')).toBe(40);
  });
});

describe('scoreValueFit', () => {
  test('sweet spot $1M-$5M is peak', () => {
    expect(scoreValueFit(2_000_000)).toBe(100);
  });
  test('tiny value scores low', () => {
    expect(scoreValueFit(10_000)).toBe(25);
  });
  test('mega value scores low', () => {
    expect(scoreValueFit(500_000_000)).toBe(30);
  });
  test('null value is neutral mid', () => {
    expect(scoreValueFit(null)).toBe(50);
  });
});

describe('scoreGovContract — end-to-end', () => {
  test('real prod row: NHTSA biomechanics R&D (NAICS 541715) scores moderate', () => {
    const out = scoreGovContract({
      title: 'Experimental and Mathematical Biomechanics Injury Research',
      description: 'Engineering R&D for vehicle injury modeling',
      value: null,
      source_data: {
        naicsCode: '541715',
        typeOfSetAside: 'NONE',
        fullParentPathName: 'TRANSPORTATION, DEPARTMENT OF.NATIONAL HIGHWAY TRAFFIC SAFETY ADMINISTRATION.693JJ9 NHTSA OFFICE OF ACQUISTION',
      },
    });
    // R&D NAICS + DOT/NHTSA agency + no AI keywords + NONE set-aside
    // = composite in the 30-50 range. NOT a "high AI fit" — that's correct,
    // because the title doesn't actually describe an AI build.
    expect(out.fit_score).toBeGreaterThanOrEqual(30);
    expect(out.fit_score).toBeLessThanOrEqual(50);
    expect(out.signals).not.toContain('AI_CORE');
  });

  test('real prod row: AFRL Networking The Fight scores well', () => {
    const out = scoreGovContract({
      title: 'NETWORKING THE FIGHT',
      description: 'AI/ML and autonomous decision support for tactical networks',
      value: 5_000_000,
      source_data: {
        naicsCode: '541715',
        typeOfSetAside: 'NONE',
        fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE AIR FORCE.AIR FORCE MATERIEL COMMAND.AIR FORCE RESEARCH LABORATORY.FA8750  AFRL RIK',
      },
    });
    expect(out.fit_score).toBeGreaterThanOrEqual(55);
    expect(out.signals).toContain('AI_BUYER');
  });

  test('SBIR with AI title scores very high', () => {
    const out = scoreGovContract({
      title: 'NASA SBIR/STTR FY 2026 AI/ML Foundation Models for Earth Observation',
      description: 'Develop machine learning foundation models',
      value: 750_000,
      source_data: {
        naicsCode: '541715',
        typeOfSetAside: 'SBIR',
        fullParentPathName: 'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION.NASA',
      },
    });
    expect(out.fit_score).toBeGreaterThanOrEqual(75);
    expect(out.signals).toContain('AI_CORE');
    expect(out.signals).toContain('SET_ASIDE');
    expect(out.recommended_action).toBe('BID');
  });

  test('Janitorial services scores low', () => {
    const out = scoreGovContract({
      title: 'Janitorial Services - Building 7',
      description: 'Daily cleaning, trash removal, restroom maintenance.',
      value: 200_000,
      source_data: {
        naicsCode: '561720',
        typeOfSetAside: 'SBA',
        fullParentPathName: 'GENERAL SERVICES ADMINISTRATION',
      },
    });
    expect(out.fit_score).toBeLessThan(40);
    expect(out.recommended_action).toBe('IGNORE');
  });

  test('handles missing source_data gracefully', () => {
    const out = scoreGovContract({ title: 'AI Platform', description: '' });
    expect(out.fit_score).toBeGreaterThan(0);
    expect(out.sub_scores).toBeDefined();
  });
});
