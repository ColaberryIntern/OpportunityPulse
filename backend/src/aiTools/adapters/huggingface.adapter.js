const logger = require('../../logging/logger');

const HF_API = 'https://huggingface.co/api';

/**
 * Fetch popular AI tools/models from HuggingFace.
 *
 * Searches across multiple categories for high-engagement models and spaces.
 * Free API, no authentication required.
 *
 * @returns {Array<{name, fullName, description, website, vendor, source, sourceId, sourceUrl, likes, downloads, pipelineTag}>}
 */
async function fetchHuggingFaceAiTools() {
  try {
    const searches = [
      { endpoint: 'models', params: 'sort=likes&direction=-1&limit=30', label: 'top-models' },
      { endpoint: 'models', params: 'sort=downloads&direction=-1&limit=20&pipeline_tag=text-generation', label: 'text-gen' },
      { endpoint: 'models', params: 'sort=downloads&direction=-1&limit=20&pipeline_tag=image-to-text', label: 'image-text' },
      { endpoint: 'models', params: 'sort=likes&direction=-1&limit=15&search=agent', label: 'agents' },
      { endpoint: 'models', params: 'sort=likes&direction=-1&limit=15&search=chat', label: 'chat' },
    ];

    const allTools = [];

    for (const { endpoint, params, label } of searches) {
      try {
        const url = `${HF_API}/${endpoint}?${params}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'OpportunityPulse/1.0' },
        });

        if (!response.ok) {
          logger.warn('HuggingFace API error', { status: response.status, label });
          continue;
        }

        const items = await response.json();
        for (const item of items) {
          allTools.push({
            name: item.id?.split('/').pop() || item.modelId || item.id,
            fullName: item.id || item.modelId,
            description: item.description || item.cardData?.description || `${item.id} — a HuggingFace ${item.pipeline_tag || 'AI'} model`,
            website: `https://huggingface.co/${item.id}`,
            vendor: item.author || item.id?.split('/')[0] || 'HuggingFace',
            source: 'huggingface',
            sourceId: `hf_${(item.id || '').replace(/\//g, '_')}`,
            sourceUrl: `https://huggingface.co/${item.id}`,
            likes: item.likes || 0,
            downloads: item.downloads || 0,
            pipelineTag: item.pipeline_tag || null,
            tags: (item.tags || []).slice(0, 10),
          });
        }

        // Respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (queryErr) {
        logger.warn('HuggingFace query error', { label, error: queryErr.message });
      }
    }

    // Deduplicate by sourceId
    const seen = new Set();
    return allTools.filter(t => {
      if (seen.has(t.sourceId)) return false;
      seen.add(t.sourceId);
      return true;
    });
  } catch (error) {
    logger.error('HuggingFace fetch error', { error: error.message });
    return [];
  }
}

module.exports = { fetchHuggingFaceAiTools };
