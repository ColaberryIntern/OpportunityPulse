// Submission Readiness Engine — canonical document type registry.
//
// Each entry has a stable `key` (stored in documents.type), a UI label,
// a category (evergreen vs platform-specific), platforms whose checklist
// references it, and a `generatable` flag (v0.3) — true when AI can
// fully produce the doc. Hard-no's (W-9, COI, agency-issued certs, surety
// bonds) must be obtained externally; the UI hides the Generate button
// for those.

const TYPES = [
  // ---- Evergreen (cross-platform) ----
  { key: 'w9',                       label: 'W-9 (Tax Form)',                  category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'], generatable: false },
  { key: 'capability_statement',     label: 'Capability Statement',            category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'], generatable: true  },
  { key: 'coi',                      label: 'Certificate of Insurance (COI)',  category: 'evergreen', platforms: ['sam_gov', 'bonfire'],            generatable: false },
  { key: 'past_performance',         label: 'Past Performance Summary',        category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'], generatable: true  },
  { key: 'key_staff_resume',         label: 'Key Staff Resume / CV',           category: 'evergreen', platforms: ['sam_gov', 'grants_gov'],          generatable: false },
  { key: 'naics_list',               label: 'NAICS Code List',                 category: 'evergreen', platforms: ['sam_gov', 'bonfire'],            generatable: true  },
  { key: 'references',               label: 'References List',                 category: 'evergreen', platforms: ['sam_gov', 'grants_gov', 'bonfire'], generatable: true  },
  { key: 'cert_8a',                  label: '8(a) Certification',              category: 'evergreen', platforms: ['sam_gov'],                       generatable: false },
  { key: 'cert_hubzone',             label: 'HUBZone Certification',           category: 'evergreen', platforms: ['sam_gov'],                       generatable: false },
  { key: 'cert_wosb',                label: 'WOSB Certification',              category: 'evergreen', platforms: ['sam_gov'],                       generatable: false },
  { key: 'cert_sdvosb',              label: 'SDVOSB Certification',            category: 'evergreen', platforms: ['sam_gov'],                       generatable: false },
  { key: 'cert_mwbe_dbe',            label: 'MWBE / DBE Certification',        category: 'evergreen', platforms: ['bonfire'],                       generatable: false },
  { key: 'sam_registration',         label: 'SAM.gov Registration (UEI/CAGE)', category: 'evergreen', platforms: ['sam_gov'],                       generatable: false },
  { key: 'banking_ach',              label: 'Banking / ACH Info',              category: 'evergreen', platforms: ['sam_gov', 'grants_gov'],          generatable: false },

  // ---- Bonfire-specific per-submission templates (re-usable) ----
  { key: 'cover_letter_template',           label: 'Cover Letter Template',         category: 'bonfire', platforms: ['bonfire'], generatable: true },
  { key: 'technical_response_template',     label: 'Technical Response Template',   category: 'bonfire', platforms: ['bonfire'], generatable: true },
  { key: 'pricing_response_template',       label: 'Pricing Response Template',     category: 'bonfire', platforms: ['bonfire'], generatable: true },

  // ---- v0.2 — additional types AI commonly detects in Bonfire / SAM RFPs ----
  { key: 'cert_bid_bond',          label: 'Bid Bond',                         category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: false },
  { key: 'cert_payment_bond',      label: 'Payment Bond',                     category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: false },
  { key: 'cert_performance_bond',  label: 'Performance Bond',                 category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: false },
  { key: 'cert_prevailing_wage',   label: 'Davis-Bacon / Prevailing Wage Cert', category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: true  },
  { key: 'eeo_statement',          label: 'EEO / Non-Discrimination Statement', category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: true  },
  { key: 'proof_of_licensure',     label: 'Proof of Professional Licensure',  category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: false },
  { key: 'safety_program',         label: 'Safety Program / OSHA Record',     category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: true  },
  { key: 'cybersecurity_assessment', label: 'Cybersecurity Assessment / SOC 2', category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: false },
  { key: 'site_visit_acknowledgment', label: 'Site Visit Acknowledgment',     category: 'bonfire',   platforms: ['bonfire'], generatable: true },
  { key: 'addendum_acknowledgment',   label: 'Addendum / Q&A Acknowledgment', category: 'bonfire',   platforms: ['bonfire'], generatable: true },
  { key: 'no_collusion_affidavit', label: 'Non-Collusion Affidavit',          category: 'evergreen', platforms: ['sam_gov', 'bonfire'], generatable: true  },

  // ---- Catch-all for anything we haven't categorized ----
  { key: 'other',                    label: 'Other',                           category: 'evergreen', platforms: [], generatable: false },
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

function isGeneratable(key) {
  const t = TYPE_BY_KEY.get(String(key));
  return !!(t && t.generatable);
}

function getGeneratableKeys() {
  return TYPES.filter((t) => t.generatable).map((t) => t.key);
}

module.exports = {
  TYPES,
  TYPE_KEYS,
  TYPE_BY_KEY,
  isValidType,
  labelFor,
  listForPlatform,
  isGeneratable,
  getGeneratableKeys,
};
