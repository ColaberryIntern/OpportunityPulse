// v4: user_profiles was renamed to organization_profiles. This file is kept
// only so any straggling `require('./models/UserProfile')` import resolves
// to the same model definition.
module.exports = require('./OrganizationProfile');
