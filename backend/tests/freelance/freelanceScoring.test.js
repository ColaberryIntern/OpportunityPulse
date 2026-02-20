const {
  computeFreelanceScore,
  scoreBudget,
  scoreClientReliability,
  scoreLowCompetition,
  scoreRecurringPotential,
  scoreSaasConversion,
  scoreStrategicAlignment,
} = require('../../src/freelance/freelanceScoring.service');

describe('Freelance Scoring Service', () => {
  describe('scoreBudget', () => {
    it('should return 0 for budget < $500', () => {
      expect(scoreBudget(0)).toBe(0);
      expect(scoreBudget(100)).toBe(0);
      expect(scoreBudget(499)).toBe(0);
    });

    it('should return 1 for budget >= $20,000', () => {
      expect(scoreBudget(20000)).toBe(1);
      expect(scoreBudget(50000)).toBe(1);
    });

    it('should return linear value between 0-1 for $500-$20k', () => {
      const score = scoreBudget(10250);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('should handle null/undefined', () => {
      expect(scoreBudget(null)).toBe(0);
      expect(scoreBudget(undefined)).toBe(0);
    });
  });

  describe('scoreClientReliability', () => {
    it('should return 0 for no rating data', () => {
      expect(scoreClientReliability({})).toBe(0);
    });

    it('should score high for 5-star with many reviews', () => {
      const score = scoreClientReliability({ clientRating: 5, clientReviews: 100 });
      expect(score).toBeGreaterThan(0.9);
    });

    it('should blend rating and review count', () => {
      const highRating = scoreClientReliability({ clientRating: 5, clientReviews: 0 });
      const balanced = scoreClientReliability({ clientRating: 5, clientReviews: 50 });
      expect(balanced).toBeGreaterThan(highRating);
    });

    it('should handle Freelancer.com field names', () => {
      const score = scoreClientReliability({ client_rating: 4.5, client_reviews: 20 });
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('scoreLowCompetition', () => {
    it('should return 1 for < 5 proposals', () => {
      expect(scoreLowCompetition({ proposals: 0 })).toBe(1);
      expect(scoreLowCompetition({ proposals: 4 })).toBe(1);
    });

    it('should return 0 for >= 50 proposals', () => {
      expect(scoreLowCompetition({ proposals: 50 })).toBe(0);
      expect(scoreLowCompetition({ proposals: 100 })).toBe(0);
    });

    it('should handle bid_count field', () => {
      expect(scoreLowCompetition({ bid_count: 3 })).toBe(1);
    });

    it('should return linear value between 5-50', () => {
      const score = scoreLowCompetition({ proposals: 27 });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe('scoreRecurringPotential', () => {
    it('should return 1 for retainer', () => {
      expect(scoreRecurringPotential({ projectType: 'retainer' })).toBe(1.0);
    });

    it('should return 0.8 for ongoing', () => {
      expect(scoreRecurringPotential({ projectType: 'ongoing' })).toBe(0.8);
    });

    it('should return 0.2 for one-off', () => {
      expect(scoreRecurringPotential({ projectType: 'one-off' })).toBe(0.2);
    });

    it('should return default 0.3 for unknown type', () => {
      expect(scoreRecurringPotential({})).toBe(0.3);
    });
  });

  describe('scoreSaasConversion', () => {
    it('should normalize 0-100 to 0-1', () => {
      expect(scoreSaasConversion({ saasConversionPotential: 50 })).toBe(0.5);
      expect(scoreSaasConversion({ saasConversionPotential: 100 })).toBe(1);
      expect(scoreSaasConversion({ saasConversionPotential: 0 })).toBe(0);
    });

    it('should handle missing data', () => {
      expect(scoreSaasConversion({})).toBe(0);
    });
  });

  describe('scoreStrategicAlignment', () => {
    it('should return 0.5 when no user preferences', () => {
      expect(scoreStrategicAlignment({ skills: ['Python'] }, null)).toBe(0.5);
      expect(scoreStrategicAlignment({ skills: ['Python'] }, {})).toBe(0.5);
    });

    it('should return high score for matching skills', () => {
      const score = scoreStrategicAlignment(
        { skills: ['Python', 'TensorFlow', 'NLP'] },
        { preferredSkills: ['Python', 'TensorFlow', 'NLP'] }
      );
      expect(score).toBe(1);
    });

    it('should return low score for no overlap', () => {
      const score = scoreStrategicAlignment(
        { skills: ['Java', 'Spring'] },
        { preferredSkills: ['Python', 'TensorFlow'] }
      );
      expect(score).toBe(0);
    });

    it('should handle case-insensitive matching', () => {
      const score = scoreStrategicAlignment(
        { skills: ['python', 'TENSORFLOW'] },
        { preferredSkills: ['Python', 'TensorFlow'] }
      );
      expect(score).toBe(1);
    });
  });

  describe('computeFreelanceScore', () => {
    it('should return a score between 0-100', () => {
      const opp = {
        value: 10000,
        sourceData: { clientRating: 4.5, clientReviews: 20, proposals: 10 },
        aiAnalysis: { projectType: 'ongoing', saasConversionPotential: 60, skills: ['Python'] },
      };
      const { score } = computeFreelanceScore(opp);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle missing data gracefully', () => {
      const opp = { sourceData: {}, aiAnalysis: {} };
      const { score, components } = computeFreelanceScore(opp);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(components).toBeDefined();
      expect(components.budget).toBe(0);
    });

    it('should return higher scores for better opportunities', () => {
      const good = {
        value: 15000,
        sourceData: { clientRating: 5, clientReviews: 50, proposals: 3 },
        aiAnalysis: { projectType: 'retainer', saasConversionPotential: 80, skills: ['LLM'] },
      };
      const bad = {
        value: 200,
        sourceData: { clientRating: 1, clientReviews: 0, proposals: 100 },
        aiAnalysis: { projectType: 'one-off', saasConversionPotential: 5 },
      };
      const goodScore = computeFreelanceScore(good);
      const badScore = computeFreelanceScore(bad);
      expect(goodScore.score).toBeGreaterThan(badScore.score);
    });
  });
});
