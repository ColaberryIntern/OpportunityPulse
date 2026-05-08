// Submission Readiness Engine — canonical document type registry.
//
// Each entry has a stable `key` (stored in documents.type), a UI label,
// a category (evergreen vs platform-specific), and the platforms whose
// submission checklist references it. Adding a new type here is the
// only change needed when a new evergreen-doc category is required —
// the schema stores `type` as a free-form STRING(60).

const TYPES = [
  // ---- Evergreen (cross-platform) ----
  { key: 'w9',                       label: 'W-9 (Tax Form)',                  category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'] },
  { key: 'capability_statement',     label: 'Capability Statement',            category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'] },
  { key: 'coi',                      label: 'Certificate of Insurance (COI)',  category: 'evergreen', platforms: ['sam_gov', 'bonfire'] },
  { key: 'past_performance',         label: 'Past Performance Summary',        category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'] },
  { key: 'key_staff_resume',         label: 'Key Staff Resume / CV',           category: 'evergreen', platforms: ['sam_gov', 'grants_gov'] },
  { key: 'naics_list',               label: 'NAICS Code List',                 category: 'evergreen', platforms: ['sam_gov', 'bonfire'] },
  { key: 'references',               label: 'References List',                 category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'] },
  { key: 'cert_8a',                  label: '8(a) Certification',              category: 'evergreen', platforms: ['sam_gov'] },
  { key: 'cert_hubzone',             label: 'HUBZone Certification',           category: 'evergreen', platforms: ['sam_gov'] },
  { key: 'cert_wosb',                label: 'WOSB Certification',              category: 'evergreen', platforms: ['sam_gov'] },
  { key: 'cert_sdvosb',              label: 'SDVOSB Certification',            category: 'evergreen', platforms: ['sam_gov'] },
  { key: 'cert_mwbe_dbe',            label: 'MWBE / DBE Certification',        category: 'evergreen', platforms: ['bonfire'] },
  { key: 'sam_registration',         label: 'SAM.gov Registration (UEI/CAGE)', category: 'evergreen', platforms: ['sam_gov'] },
  { key: 'banking_ach',              label: 'Banking / ACH Info',              category: 'evergreen', platforms: ['sam_gov', 'grants_gov'] },

  // ---- Bonfire-specific per-submission templates (re-usable) ----
  { key: 'cover_letter_template',           label: 'Cover Letter Template',         category: 'bonfire', platforms: ['bonfire'] },
  { key: 'technical_response_template',     label: 'Technical Response Template',   category: 'bonfire', platforms: ['bonfire'] },
  { key: 'pricing_response_template',       label: 'Pricing Response Template',     category: 'bonfire', platforms: ['bonfire'] },

  // ---- Catch-all for anything we haven't categorized ----
  { key: 'other',                    label: 'Other',                           category: 'evergreen', platforms: [] },
];

const TYPE_KEYS = TYPES.map((t) => t.key);
const TYPE_BY_KEY = new Map(TYPES.map((t) => [t.key, t]));

function isValidType(key) {
  return TYPE_BY_KEY.has(String(key));
}

function labelFor(key) {
  const t = TYPE_BY_KEY.get(String(key));
  return t ? t.label : String(key);
}

function listForPlatform(platform) {
  return TYPES.filter((t) => t.platforms.includes(platform));
}

module.exports = {
  TYPES,
  TYPE_KEYS,
  TYPE_BY_KEY,
  isValidType,
  labelFor,
  listForPlatform,
};
