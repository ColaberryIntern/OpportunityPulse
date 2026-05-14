// OIED unified-tool channels — pure derivation from (type, source).
//
// Every opportunity in the unified `opportunities` table maps to exactly
// one channel for UI grouping. Channel is NOT stored in the DB; it's
// computed at envelope time so a new source ingester only needs to land
// rows with the right (type, source) and they automatically appear in
// the right channel bucket.
//
// 7 channels. Order matters for tie-breaking when a single (type, source)
// is mentioned by more than one rule (none today; defensive for future).

const CHANNELS = [
  {
    key: 'strategic',
    label: 'Strategic Patterns',
    icon: '🎯',
    color: 'purple',
    types: ['bonfire_strategic'],
    sources: [],
    description: 'Synthesized clusters across multiple Bonfire opportunities — productize, do not bid as one.',
  },
  {
    key: 'bonfire',
    label: 'Bonfire',
    icon: '🔥',
    color: 'orange',
    types: ['bonfire'],
    sources: ['bonfire'],
    description: 'State and local procurement portals (Bonfire vendor hub).',
  },
  {
    key: 'government',
    label: 'Government',
    icon: '🏛',
    color: 'blue',
    types: ['gov_contract', 'grant'],
    sources: ['sam_gov', 'usa_spending', 'grants_gov'],
    description: 'Federal contracts, grants, and government procurement.',
  },
  {
    key: 'talent',
    label: 'Talent',
    icon: '👥',
    color: 'cyan',
    types: ['ai_job'],
    sources: ['usajobs', 'remote_ok', 'adzuna', 'jobicy', 'remotive', 'himalayas', 'mock_jobs'],
    description: 'AI hiring demand and workforce signals.',
  },
  {
    key: 'private-sector',
    label: 'News',
    icon: '🧠',
    color: 'gray',
    types: ['ai_news'],
    sources: ['devto', 'google_news', 'hacker_news'],
    description: 'Corporate AI activity, vendor news, and partnership signals.',
  },
  {
    key: 'freelance',
    label: 'Freelance',
    icon: '💼',
    color: 'green',
    types: ['freelance'],
    sources: ['freelancer'],
    description: 'AI freelance projects and demand trends.',
  },
  {
    key: 'capital',
    label: 'Capital',
    icon: '💰',
    color: 'amber',
    types: ['investment'],
    sources: ['funding_news', 'mock_investments'],
    description: 'Investment opportunities, funding rounds, and capital allocation.',
  },
  {
    key: 'research',
    label: 'Research',
    icon: '🔬',
    color: 'indigo',
    types: ['research'],
    sources: ['arxiv', 'semantic_scholar', 'huggingface_papers', 'papers_with_code', 'research_blogs'],
    description: 'AI research papers, benchmarks, technical breakthroughs, and emerging capabilities.',
  },
];

const UNKNOWN_CHANNEL = {
  key: 'unknown',
  label: 'Other',
  icon: '·',
  color: 'gray',
  description: 'Source not yet mapped to a channel.',
};

// Pure: takes an opp (or row) with type + source, returns the matching
// channel descriptor. Falls back to "unknown" if no rule matches.
function getChannelForOpp(opp) {
  if (!opp) return UNKNOWN_CHANNEL;
  const type = String(opp.type || '').toLowerCase();
  const source = String(opp.source || '').toLowerCase();
  for (const ch of CHANNELS) {
    if (ch.types.includes(type)) return ch;
  }
  // Source-only fallback for any future row with an unrecognized type.
  for (const ch of CHANNELS) {
    if (ch.sources.includes(source)) return ch;
  }
  return UNKNOWN_CHANNEL;
}

// Returns just the channel key (string) — convenient for filters.
function getChannelKey(opp) {
  return getChannelForOpp(opp).key;
}

// Match-by-key lookup; used by UI components and the channel-filter logic.
function getChannelByKey(key) {
  if (!key) return UNKNOWN_CHANNEL;
  const k = String(key).toLowerCase();
  return CHANNELS.find((ch) => ch.key === k) || UNKNOWN_CHANNEL;
}

// All channels ordered for display. The UI picks its own slice; this
// preserves a stable canonical order so the dashboard grid is consistent.
function listChannels() {
  return CHANNELS.slice();
}

// Used by the My Opportunities filter and the dashboard summary endpoint.
// Returns the (type[], source[]) Sequelize-friendly tuple for a given
// channel key. Empty strings/undefined → no filter.
function whereForChannel(key) {
  if (!key) return null;
  const ch = getChannelByKey(key);
  if (ch.key === 'unknown') return null;
  return {
    types: ch.types.slice(),
    sources: ch.sources.slice(),
  };
}

module.exports = {
  CHANNELS,
  UNKNOWN_CHANNEL,
  getChannelForOpp,
  getChannelKey,
  getChannelByKey,
  listChannels,
  whereForChannel,
};
