// Lazy-load pdf-parse to avoid native canvas handle in test environments
let pdfParse;
function getPdfParse() {
  if (!pdfParse) pdfParse = require('pdf-parse');
  return pdfParse;
}
const { getAIClient } = require('../analysis/ai.client');
const { RESUME_EXTRACTION_SYSTEM_PROMPT, buildResumeExtractionPrompt } = require('./resumeUpload.prompts');
const logger = require('../logging/logger');

const MAX_TEXT_LENGTH = 8000;

/**
 * Extract profile data from a PDF resume buffer using AI.
 * Returns extracted data, merged profile, and list of changes.
 */
async function extractProfileFromResume(pdfBuffer, existingProfileData = {}) {
  // 1. Parse PDF to text
  let pdfData;
  try {
    pdfData = await getPdfParse()(pdfBuffer);
  } catch (err) {
    logger.error('PDF parsing failed', { error: err.message });
    throw new Error('Could not read this PDF. Please try a different file or enter your skills manually.');
  }

  const rawText = (pdfData.text || '').trim();
  if (!rawText || rawText.length < 50) {
    throw new Error('The PDF appears to be empty or contains too little text. Please try a different file.');
  }

  // 2. Truncate to keep tokens reasonable
  const truncatedText = rawText.substring(0, MAX_TEXT_LENGTH);

  // 3. Call OpenAI for structured extraction
  let extractedData;
  try {
    const aiClient = getAIClient();
    const userPrompt = buildResumeExtractionPrompt(truncatedText);
    const { content, tokensUsed } = await aiClient.chat(
      RESUME_EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 1000, temperature: 0.2 }
    );

    extractedData = JSON.parse(content);
    logger.info('Resume extraction completed', { tokensUsed, skillCount: extractedData.skills?.length || 0 });
  } catch (err) {
    logger.error('AI resume extraction failed', { error: err.message });
    throw new Error('Failed to extract profile data from resume. Please try again or enter your skills manually.');
  }

  // 4. Validate and normalize extracted data
  extractedData = normalizeExtractedData(extractedData);

  // 5. Intelligent merge with existing profile data
  const { mergedProfileData, changes } = mergeProfileData(existingProfileData, extractedData);

  return { extractedData, mergedProfileData, changes };
}

/**
 * Normalize extracted data to ensure valid types and values.
 */
function normalizeExtractedData(data) {
  const normalized = {};

  if (data.professionalTitle && typeof data.professionalTitle === 'string') {
    normalized.professionalTitle = data.professionalTitle.trim();
  }

  if (data.industry && typeof data.industry === 'string') {
    normalized.industry = data.industry.trim();
  }

  if (Array.isArray(data.skills)) {
    normalized.skills = data.skills
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 30);
  }

  const validLevels = ['entry', 'mid', 'senior', 'executive'];
  if (data.experienceLevel && validLevels.includes(data.experienceLevel)) {
    normalized.experienceLevel = data.experienceLevel;
  }

  if (Array.isArray(data.certifications)) {
    normalized.certifications = data.certifications
      .filter((c) => typeof c === 'string' && c.trim())
      .map((c) => c.trim())
      .slice(0, 20);
  }

  if (data.yearsOfExperience != null && typeof data.yearsOfExperience === 'number') {
    normalized.yearsOfExperience = data.yearsOfExperience;
  }

  if (data.summary && typeof data.summary === 'string') {
    normalized.summary = data.summary.trim();
  }

  return normalized;
}

/**
 * Merge extracted data with existing profile data.
 * - Array fields: union-merge (add new items, keep existing)
 * - Scalar fields: only overwrite if currently empty
 * - Never overwrite user-preference fields (goals, companySize, budgetRange, preferredLocations)
 */
function mergeProfileData(existing, extracted) {
  const merged = { ...existing };
  const changes = [];

  // Scalar fields — only fill if empty
  const scalarFields = ['professionalTitle', 'industry', 'experienceLevel'];
  for (const field of scalarFields) {
    if (extracted[field] && !existing[field]) {
      merged[field] = extracted[field];
      changes.push({ field, action: 'added', value: extracted[field] });
    }
  }

  // Array fields — union merge
  const arrayFields = ['skills', 'certifications'];
  for (const field of arrayFields) {
    if (Array.isArray(extracted[field]) && extracted[field].length > 0) {
      const existingArr = Array.isArray(existing[field]) ? existing[field] : [];
      const existingLower = new Set(existingArr.map((s) => s.toLowerCase()));
      const newItems = extracted[field].filter((item) => !existingLower.has(item.toLowerCase()));

      if (newItems.length > 0) {
        merged[field] = [...existingArr, ...newItems];
        changes.push({ field, action: 'merged', newCount: newItems.length, newItems });
      } else {
        merged[field] = existingArr;
      }
    }
  }

  // Store summary if no existing one
  if (extracted.summary && !existing.summary) {
    merged.summary = extracted.summary;
    changes.push({ field: 'summary', action: 'added' });
  }

  // Store yearsOfExperience if not set
  if (extracted.yearsOfExperience != null && existing.yearsOfExperience == null) {
    merged.yearsOfExperience = extracted.yearsOfExperience;
    changes.push({ field: 'yearsOfExperience', action: 'added', value: extracted.yearsOfExperience });
  }

  // Never touch: goals, companySize, budgetRange, preferredLocations
  return { mergedProfileData: merged, changes };
}

module.exports = { extractProfileFromResume, mergeProfileData, normalizeExtractedData };
