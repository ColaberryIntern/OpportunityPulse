// Public entrypoint for the scraper. Exposed only via the admin route and the
// scheduler — nothing else in the codebase should require this module directly.

const { runScrape } = require('./runner');
const { isScraperEnabled } = require('./config');

module.exports = {
  runScrape,
  isScraperEnabled,
};
