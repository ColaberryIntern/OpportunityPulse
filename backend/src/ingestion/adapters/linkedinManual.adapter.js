const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

/**
 * LinkedIn Manual Import adapter — accepts bulk JSON import
 * of freelance project postings from LinkedIn.
 *
 * LinkedIn has no public jobs API, so this adapter processes
 * manually provided data via dataSource.config.importData.
 *
 * Expected importData format:
 * [
 *   {
 *     id: "linkedin-12345",
 *     title: "AI/ML Engineer Needed",
 *     description: "Looking for...",
 *     url: "https://linkedin.com/jobs/...",
 *     budget: 5000,
 *     skills: ["Python", "TensorFlow"],
 *     company: "Acme Corp",
 *     location: "Remote",
 *     postedAt: "2026-02-15T00:00:00Z"
 *   }
 * ]
 */
class LinkedInManualAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
  }

  async fetch() {
    const config = this.dataSource.config || {};
    const importData = config.importData || [];

    logger.info(`LinkedIn Manual: ${importData.length} records to import`);
    return importData;
  }

  transform(rawRecords) {
    return rawRecords.map((record) => {
      const sourceId = record.id || record.url || `linkedin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const skills = (record.skills || []).filter(Boolean);

      return {
        type: OPPORTUNITY_TYPES.FREELANCE,
        source: 'linkedin',
        sourceId: String(sourceId),
        title: (record.title || 'Untitled LinkedIn Project').substring(0, 500),
        description: (record.description || '').substring(0, 2000),
        sourceUrl: record.url || null,
        status: 'active',
        category: 'Freelance',
        tags: skills.slice(0, 10),
        location: record.location || 'Remote',
        value: record.budget || null,
        publishedAt: record.postedAt ? new Date(record.postedAt) : new Date(),
        expiresAt: null,
        sourceData: {
          platform: 'linkedin',
          budget: record.budget || null,
          company: record.company || null,
          skills,
          seniority: record.seniority || null,
          employmentType: record.employmentType || 'contract',
        },
      };
    });
  }
}

module.exports = LinkedInManualAdapter;
