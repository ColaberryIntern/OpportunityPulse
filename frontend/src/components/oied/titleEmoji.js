// v9.8.1: per-row emoji rules for the channel-bucket strip on keyword
// search results. Each rule is [regex, emoji]. First match wins, so put
// the more specific rules first. Falls back to the channel's icon when
// nothing matches.

const RULES = [
  // Transport / vehicles
  [/\brail(road|way)?\b|\btrain\b|\blocomotive/i, '🚂'],
  [/\baviat(ion|or)|\baircraft\b|\bairline\b|\bairport\b|\bflight\b|\bdrone/i, '✈️'],
  [/\bautomotive\b|\bvehicle\b|\bcar\b|\bcars\b|\bevs?\b|\belectric vehicle/i, '🚗'],
  [/\bshipping\b|\bmaritime\b|\bvessel\b|\bport authority/i, '🚢'],
  [/\btransit\b|\btransport(ation)?\b|\bbus\b|\bsubway\b/i, '🚆'],

  // Health / pharma / bio
  [/\bhospital\b|\bclinic(al)?\b|\bpatient\b|\bpharma|\bdrug\b|\bvaccin|\bmedic(al|are|aid)|\bnurs|\btherap|\bdiagnos|\bcardio|\bsurg|\bhealth/i, '🏥'],
  [/\bbiotech\b|\bgenom|\blife scien|\bmolecul/i, '🧬'],

  // Finance / capital
  [/\bbank(ing)?\b|\bfinanc(e|ial|ing)\b|\binsuran|\bfintech\b|\binvest|\bcapital\b|\bventur|\bfunding|\bbudget|\bipo\b|\bequity\b|\bmoney\b|\$\d/i, '💰'],
  [/\baccount(ing|ant)|\baudit|\btax/i, '🧾'],

  // Government / defense
  [/\bdepartment of the (army|navy|air force|defense)\b|\bdefense\b|\bmilitary\b|\barmy\b|\bnavy\b|\bmarines?\b|\bwarfighter|\bweapon|\bcombat|\bsoldier|\bveterans?\b/i, '🪖'],
  [/\bgovernment\b|\bagency\b|\bfederal\b|\bmunicipal\b|\bstate of\b|\bcity of\b|\bcounty\b|\bdepartment\b|\boffice of\b|\bcommission\b|\bauthority\b|\bcomptroller/i, '🏛️'],

  // Construction / real estate
  [/\bconstruction\b|\brenovation\b|\brebuild|\bbuilding\b|\bfacility\b|\binfrastructure\b|\bretrofit/i, '🏗️'],
  [/\breal estate\b|\bproperty\b|\bhousing\b|\bapartment|\bmortgage/i, '🏠'],

  // Energy / climate / utilities
  [/\boil\b|\bgas\b|\bpetrol|\brefiner/i, '🛢️'],
  [/\benergy\b|\bpower\b|\bgrid\b|\butility\b|\bsolar\b|\bwind\b|\brenewabl/i, '⚡'],
  [/\bclimate\b|\bsustainab|\bcarbon\b|\bgreen\b|\bemission|\benvironment/i, '🌱'],
  [/\bmining\b|\bmineral\b|\bextract/i, '⛏️'],

  // Compliance / legal
  [/\bcompliance\b|\bregulat|\blegal\b|\blawsuit\b|\battorney|\bcourt\b|\bjudge\b|\blawyer|\bgovernance/i, '⚖️'],

  // Education
  [/\beducation\b|\bschool\b|\buniversity\b|\bcollege\b|\bacademic\b|\bstudent\b|\bcurriculum\b|\bedtech/i, '🎓'],

  // Agriculture / food
  [/\bagricultur|\bagtech\b|\bfarm|\blivestock\b|\bcrop\b|\bfood production/i, '🌾'],
  [/\brestaurant\b|\bhotel\b|\bhospitality\b|\btravel\b|\btourism\b/i, '🍽️'],

  // Retail / commerce
  [/\bretail\b|\be-?commerce\b|\bstore\b|\bshop\b|\bcpg\b|\bconsumer goods\b|\bfashion\b/i, '🛍️'],

  // Tech-flavored
  [/\bclaude\b|\banthropic\b/i, '🧠'],
  [/\bopenai\b|\bgpt\b|\bchatgpt\b/i, '💬'],
  [/\baws\b|\bazure\b|\bgcp\b|\bcloud\b/i, '☁️'],
  [/\bcybersecur|\bsecurity\b|\bencryption\b|\bvulnerab|\bbreach\b|\bphishing/i, '🔒'],
  [/\bsoftware\b|\bsaas\b|\bapi\b|\bcoding\b|\bcoder\b|\bprogramming/i, '💻'],
  [/\bartificial intelligence\b|\bai \b|\bai-\b|\bmachine learning\b|\bml \b|\bdeep learning|\bllm\b|\bagentic\b|\bagent\b/i, '🤖'],

  // Manufacturing / industrial
  [/\bmanufactur|\bfactor(y|ies)|\bplant\b|\bindustrial\b|\bsupply chain\b|\blogistics\b|\bwarehous/i, '🏭'],

  // Telecom / network
  [/\btelecom|\btelecommunic|\bbroadband\b|\b5g\b|\b4g\b|\bwireless\b|\bnetwork(ing)?\b/i, '📡'],

  // Media / entertainment
  [/\bgaming\b|\bvideo game\b|\bstreaming\b|\bnetflix\b|\bhollywood\b|\bentertain|\bcinema|\bfilm\b|\bpodcast|\bmusic\b/i, '🎬'],

  // Marketing / advertising
  [/\bmarketing\b|\badvert|\badtech\b|\bcampaign\b|\bbrand\b|\bsocial media/i, '📣'],

  // Data / analytics
  [/\banalytics\b|\bdata scien|\bbusiness intelligence\b|\bdata visual|\bdashboard/i, '📊'],

  // Staffing / talent / HR
  [/\bstaffing\b|\bworkforce\b|\bhuman resources\b|\bhr \b|\brecruit|\btalent\b|\bhiring/i, '👥'],

  // Generic role / job titles fallback
  [/\bengineer\b|\bdeveloper\b|\barchitect\b|\bdesigner\b|\banalyst\b/i, '🛠️'],
  [/\bresearch(er)?\b|\bscientist\b/i, '🔬'],
];

export function emojiForTitle(title, fallback = '•') {
  if (!title) return fallback;
  for (const [re, emoji] of RULES) {
    if (re.test(title)) return emoji;
  }
  return fallback;
}
