// OIED — Related AI Tools for cross-channel keyword search.
//
// When Ali searches "Healthcare" on My Opportunities, this surfaces
// AI tools designed for healthcare alongside the opportunity results.
// Tools stay in their own table (AiTool) — we do NOT migrate them
// into opportunities. This is a sibling query to keep the cross-
// channel search UX unified without polluting the data model.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { AiTool } = require('../models');

const MAX = 10;

async function getRelatedTools({ q, max = MAX } = {}) {
  if (!q || !String(q).trim()) return { tools: [], count: 0, q: '' };
  if (!AiTool) return { tools: [], count: 0, q };

  const needle = `%${String(q).trim()}%`;

  try {
    const rows = await AiTool.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: needle } },
          { description: { [Op.iLike]: needle } },
          { category: { [Op.iLike]: needle } },
          { subcategory: { [Op.iLike]: needle } },
          // tags is TEXT[] in postgres; ANY(tags) ILIKE pattern matching.
          // Use a raw fragment via Sequelize literal-ish to keep this
          // ORM-friendly: the simpler @> operator requires exact match,
          // so we fall back to converting the array to text and ILIKE.
        ],
      },
      order: [
        ['trendingScore', 'DESC NULLS LAST'],
        ['mentionCount7d', 'DESC NULLS LAST'],
      ],
      limit: max,
      attributes: [
        'id', 'name', 'slug', 'description', 'category', 'subcategory',
        'tags', 'trendingScore', 'mentionCount7d', 'sentimentScore',
        'logoUrl', 'website',
      ],
    });

    // Second pass to also catch tag matches (postgres array ILIKE is
    // awkward in Sequelize; cleanest fallback is to fetch a wider pool
    // and filter in JS when the keyword wasn't matched by the first
    // query). Skip this when we already hit `max` from the first pass.
    let extra = [];
    if (rows.length < max) {
      const seen = new Set(rows.map((r) => r.id));
      const wide = await AiTool.findAll({
        order: [['trendingScore', 'DESC NULLS LAST']],
        limit: 200,
        attributes: ['id', 'name', 'slug', 'description', 'category', 'subcategory',
          'tags', 'trendingScore', 'mentionCount7d', 'sentimentScore',
          'logoUrl', 'website'],
      });
      const lc = String(q).trim().toLowerCase();
      extra = wide.filter((r) => {
        if (seen.has(r.id)) return false;
        const tags = Array.isArray(r.tags) ? r.tags : [];
        return tags.some((t) => String(t).toLowerCase().includes(lc));
      }).slice(0, max - rows.length);
    }

    const all = [...rows, ...extra].slice(0, max).map((r) => {
      const d = r.toJSON ? r.toJSON() : r;
      return {
        id: d.id,
        name: d.name,
        slug: d.slug,
        category: d.category,
        subcategory: d.subcategory,
        tags: Array.isArray(d.tags) ? d.tags : [],
        summary: d.description ? String(d.description).slice(0, 200) : null,
        trending_score: d.trendingScore != null ? Number(d.trendingScore) : null,
        mention_count_7d: d.mentionCount7d != null ? Number(d.mentionCount7d) : 0,
        sentiment_score: d.sentimentScore != null ? Number(d.sentimentScore) : null,
        logo_url: d.logoUrl || null,
        source_url: d.website || null,
      };
    });

    return { tools: all, count: all.length, q };
  } catch (e) {
    logger.warn('relatedTools: query failed', { q, error: e.message });
    return { tools: [], count: 0, q, error: e.message };
  }
}

module.exports = { getRelatedTools, MAX };
