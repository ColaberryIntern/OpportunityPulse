const { AlertPreference } = require('../models');

const DEFAULT_PREFERENCES = {
  govContracts: true,
  aiJobs: true,
  investments: true,
  grants: true,
  aiNews: true,
  preferredActionTypes: ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'],
  minScore: 0,
  emailNotify: false,
  inAppNotify: true,
  digestFrequency: 'weekly',
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

async function getPreferences(userId) {
  const prefs = await AlertPreference.findOne({ where: { userId } });

  if (!prefs) {
    return { ...DEFAULT_PREFERENCES, userId, isDefault: true };
  }

  return prefs;
}

async function updatePreferences(userId, data) {
  const allowedFields = ['govContracts', 'aiJobs', 'investments', 'grants', 'aiNews', 'preferredActionTypes', 'minScore', 'emailNotify', 'inAppNotify', 'digestFrequency'];
  const updates = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  if (updates.minScore !== undefined) {
    const score = parseInt(updates.minScore, 10);
    if (isNaN(score) || score < 0 || score > 100) {
      throw new AppError('minScore must be between 0 and 100.', 400);
    }
    updates.minScore = score;
  }

  if (updates.digestFrequency !== undefined) {
    const validFreqs = ['daily', 'weekly', 'biweekly', 'monthly'];
    if (!validFreqs.includes(updates.digestFrequency)) {
      throw new AppError('digestFrequency must be one of: daily, weekly, biweekly, monthly.', 400);
    }
  }

  let prefs = await AlertPreference.findOne({ where: { userId } });

  if (prefs) {
    await prefs.update(updates);
  } else {
    prefs = await AlertPreference.create({ userId, ...DEFAULT_PREFERENCES, ...updates });
  }

  return prefs;
}

module.exports = {
  getPreferences,
  updatePreferences,
  DEFAULT_PREFERENCES,
  AppError,
};
