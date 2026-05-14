const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    dialectOptions: config.dialectOptions || {},
  }
);

// Import model definitions
const UserRole = require('./UserRole')(sequelize);
const User = require('./User')(sequelize);
const Content = require('./Content')(sequelize);
const Dashboard = require('./Dashboard')(sequelize);
const Subscription = require('./Subscription')(sequelize);
const UserActivity = require('./UserActivity')(sequelize);
const Feedback = require('./Feedback')(sequelize);
const DataSource = require('./DataSource')(sequelize);
const Opportunity = require('./Opportunity')(sequelize);
const IngestionLog = require('./IngestionLog')(sequelize);
const Alert = require('./Alert')(sequelize);
const AnalysisRun = require('./AnalysisRun')(sequelize);
const AlertPreference = require('./AlertPreference')(sequelize);
const ForumPost = require('./ForumPost')(sequelize);
const Comment = require('./Comment')(sequelize);
const ApiKey = require('./ApiKey')(sequelize);
const Webhook = require('./Webhook')(sequelize);
const WebhookDelivery = require('./WebhookDelivery')(sequelize);
const BehaviorProfile = require('./BehaviorProfile')(sequelize);
const SavedOpportunity = require('./SavedOpportunity')(sequelize);
const Notification = require('./Notification')(sequelize);
const PersonalMatch = require('./PersonalMatch')(sequelize);
const AiTool = require('./AiTool')(sequelize);
const AiToolMention = require('./AiToolMention')(sequelize);
const OpportunityAction = require('./OpportunityAction')(sequelize);
const AiDomain = require('./AiDomain')(sequelize);
const AiCapability = require('./AiCapability')(sequelize);
const StrategicIntent = require('./StrategicIntent')(sequelize);
const MonetizationAngle = require('./MonetizationAngle')(sequelize);
const MaturityPhase = require('./MaturityPhase')(sequelize);
const GeographicTag = require('./GeographicTag')(sequelize);
const MetaSignal = require('./MetaSignal')(sequelize);
const StrategicCluster = require('./StrategicCluster')(sequelize);
const OpportunityClassification = require('./OpportunityClassification')(sequelize);
const OpportunityMultiTag = require('./OpportunityMultiTag')(sequelize);
const ToolSignal = require('./ToolSignal')(sequelize);
const FreelanceTrendSnapshot = require('./FreelanceTrendSnapshot')(sequelize);
const BonfireOpportunity = require('./BonfireOpportunity')(sequelize);
const BonfireOpportunityTag = require('./BonfireOpportunityTag')(sequelize);
const BonfirePipeline = require('./BonfirePipeline')(sequelize);
const BonfireAgency = require('./BonfireAgency')(sequelize);
const BonfireStrategicOpportunity = require('./BonfireStrategicOpportunity')(sequelize);
const KeywordTrend = require('./KeywordTrend')(sequelize);
const Document = require('./Document')(sequelize);
const OpportunityAttachment = require('./OpportunityAttachment')(sequelize);
const OpportunityFitScore = require('./OpportunityFitScore')(sequelize);
const OpportunityOutput = require('./OpportunityOutput')(sequelize);
const OpportunityEvent = require('./OpportunityEvent')(sequelize);
// v4: user_profiles renamed → organization_profiles. UserProfile is kept as
// an alias so legacy imports (some tests, older controllers) keep working —
// it points at the same model definition as OrganizationProfile.
const OrganizationProfile = require('./OrganizationProfile')(sequelize);
const UserProfile = OrganizationProfile;
const Organization = require('./Organization')(sequelize);
const Bundle = require('./Bundle')(sequelize);
const WinProbabilityHistory = require('./WinProbabilityHistory')(sequelize);
const TriggerLog = require('./TriggerLog')(sequelize);
const UsageMetric = require('./UsageMetric')(sequelize);
const ExecutionPlan = require('./ExecutionPlan')(sequelize);
// Research Intelligence Phase 2.3 — author + topic aggregation tables.
const ResearchAuthor = require('./ResearchAuthor')(sequelize);
const ResearchTopic = require('./ResearchTopic')(sequelize);
// Phase 3c — research relationship graph edges.
const ResearchRelationship = require('./ResearchRelationship')(sequelize);
// Deep Research Intelligence Engine — venture intelligence tables.
const DeepResearchReport = require('./DeepResearchReport')(sequelize);
const VentureIdea = require('./VentureIdea')(sequelize);
const ProjectGenerationJob = require('./ProjectGenerationJob')(sequelize);
const DailyResearchScan = require('./DailyResearchScan')(sequelize);

const models = {
  UserRole,
  User,
  Content,
  Dashboard,
  Subscription,
  UserActivity,
  Feedback,
  DataSource,
  Opportunity,
  IngestionLog,
  Alert,
  AnalysisRun,
  AlertPreference,
  ForumPost,
  Comment,
  ApiKey,
  Webhook,
  WebhookDelivery,
  BehaviorProfile,
  SavedOpportunity,
  Notification,
  PersonalMatch,
  AiTool,
  AiToolMention,
  OpportunityAction,
  AiDomain,
  AiCapability,
  StrategicIntent,
  MonetizationAngle,
  MaturityPhase,
  GeographicTag,
  MetaSignal,
  StrategicCluster,
  OpportunityClassification,
  OpportunityMultiTag,
  ToolSignal,
  FreelanceTrendSnapshot,
  BonfireOpportunity,
  BonfireOpportunityTag,
  BonfirePipeline,
  BonfireAgency,
  BonfireStrategicOpportunity,
  KeywordTrend,
  Document,
  OpportunityAttachment,
  OpportunityFitScore,
  OpportunityOutput,
  OpportunityEvent,
  UserProfile,
  OrganizationProfile,
  Organization,
  Bundle,
  WinProbabilityHistory,
  TriggerLog,
  UsageMetric,
  ExecutionPlan,
  ResearchAuthor,
  ResearchTopic,
  ResearchRelationship,
  DeepResearchReport,
  VentureIdea,
  ProjectGenerationJob,
  DailyResearchScan,
};

// Set up associations
Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
