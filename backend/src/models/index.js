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
// Deep Research Phase 2 — versioning, correlation, monetization, AI logs, briefings.
const ReportVersion = require('./ReportVersion')(sequelize);
const SignalCorrelation = require('./SignalCorrelation')(sequelize);
const MonetizationModel = require('./MonetizationModel')(sequelize);
const AiProviderLog = require('./AiProviderLog')(sequelize);
const BriefingSubscription = require('./BriefingSubscription')(sequelize);
// Deep Research Phase 3 — execution intelligence.
const VentureLifecycleEvent = require('./VentureLifecycleEvent')(sequelize);
const ExecutionReadiness = require('./ExecutionReadiness')(sequelize);
const MvpPlan = require('./MvpPlan')(sequelize);
const LaunchStrategy = require('./LaunchStrategy')(sequelize);
const DeploymentReadiness = require('./DeploymentReadiness')(sequelize);
const ExecutionQueueItem = require('./ExecutionQueueItem')(sequelize);
// Deep Research Phase 4 — portfolio + capacity intelligence.
const PortfolioScore = require('./PortfolioScore')(sequelize);
const ResourceCapacitySnapshot = require('./ResourceCapacitySnapshot')(sequelize);
const VentureDependency = require('./VentureDependency')(sequelize);
const InfrastructureOverlap = require('./InfrastructureOverlap')(sequelize);
const RoiForecast = require('./RoiForecast')(sequelize);
const ConfidenceHistory = require('./ConfidenceHistory')(sequelize);
const ReassessmentEvent = require('./ReassessmentEvent')(sequelize);
const VentureTemplate = require('./VentureTemplate')(sequelize);
// Deep Research Phase 5 — temporal + ecosystem intelligence.
const TemporalSnapshot = require('./TemporalSnapshot')(sequelize);
const EcosystemMetric = require('./EcosystemMetric')(sequelize);
const VentureTrajectory = require('./VentureTrajectory')(sequelize);
const DecisionAccuracy = require('./DecisionAccuracy')(sequelize);
const PredictiveCapacity = require('./PredictiveCapacity')(sequelize);
const DriftAlert = require('./DriftAlert')(sequelize);
const SignalHistory = require('./SignalHistory')(sequelize);
const DependencyEdge = require('./DependencyEdge')(sequelize);
// Deep Research Phase 6 — adaptive strategic operations.
const AdaptiveRefreshRun = require('./AdaptiveRefreshRun')(sequelize);
const RefreshHistory = require('./RefreshHistory')(sequelize);
const InterventionRecommendation = require('./InterventionRecommendation')(sequelize);
const StrategicRecommendation = require('./StrategicRecommendation')(sequelize);
const VentureHealthHistory = require('./VentureHealthHistory')(sequelize);
const ForecastAccuracy = require('./ForecastAccuracy')(sequelize);
const OperationalDrift = require('./OperationalDrift')(sequelize);
const DependencyReview = require('./DependencyReview')(sequelize);
// Deep Research Phase 7 — traceability + opportunity action intelligence.
const OpportunityTraceability = require('./OpportunityTraceability')(sequelize);
const CustomResearchRun = require('./CustomResearchRun')(sequelize);
const PursuitWorkspace = require('./PursuitWorkspace')(sequelize);
const OpportunityRelationship = require('./OpportunityRelationship')(sequelize);
const JustificationRecord = require('./JustificationRecord')(sequelize);
const OpportunityGraphEdge = require('./OpportunityGraphEdge')(sequelize);
const ProposalAccelerationAsset = require('./ProposalAccelerationAsset')(sequelize);
const ClusterDrilldown = require('./ClusterDrilldown')(sequelize);
// Deep Research Phase 8 — pursuit activation + strategic capture intelligence.
const PursuitActivation = require('./PursuitActivation')(sequelize);
const ReviewQueueHandoff = require('./ReviewQueueHandoff')(sequelize);
const ProposalReadinessScore = require('./ProposalReadinessScore')(sequelize);
const VentureConflict = require('./VentureConflict')(sequelize);
const CaptureStrategy = require('./CaptureStrategy')(sequelize);
const OpportunityExpansion = require('./OpportunityExpansion')(sequelize);
const ResearchRevenueLink = require('./ResearchRevenueLink')(sequelize);
const SubmissionReadinessArtifact = require('./SubmissionReadinessArtifact')(sequelize);
// Deep Research Phase 9 — submission readiness + compliance intelligence.
const RfpAttachment = require('./RfpAttachment')(sequelize);
const ProposalArtifact = require('./ProposalArtifact')(sequelize);
const ComplianceMatrix = require('./ComplianceMatrix')(sequelize);
const ComplianceMatrixItem = require('./ComplianceMatrixItem')(sequelize);
const SubmissionPackage = require('./SubmissionPackage')(sequelize);
const ProposalTimelineEvent = require('./ProposalTimelineEvent')(sequelize);
const ComplianceGap = require('./ComplianceGap')(sequelize);
const ParallelDraftJob = require('./ParallelDraftJob')(sequelize);
// Deep Research Phase 10 — operational scalability + execution infrastructure.
const WorkerJob = require('./WorkerJob')(sequelize);
const ProposalExecutionQueue = require('./ProposalExecutionQueue')(sequelize);
const ArtifactLifecycleEvent = require('./ArtifactLifecycleEvent')(sequelize);
const SlaEvent = require('./SlaEvent')(sequelize);
const QueueMetric = require('./QueueMetric')(sequelize);
const StorageAsset = require('./StorageAsset')(sequelize);
const ExecutionFailure = require('./ExecutionFailure')(sequelize);
const OperationalMetric = require('./OperationalMetric')(sequelize);

// Deep Research Phase 11 — multi-tenant governance + operational auditability.
const AuditEvent = require('./AuditEvent')(sequelize);
const EventLineage = require('./EventLineage')(sequelize);
const WorkflowAssignment = require('./WorkflowAssignment')(sequelize);
const SlaAcknowledgement = require('./SlaAcknowledgement')(sequelize);
const TenantSettings = require('./TenantSettings')(sequelize);
const OperatorPermission = require('./OperatorPermission')(sequelize);
const GovernanceEvent = require('./GovernanceEvent')(sequelize);
const ObservabilityStream = require('./ObservabilityStream')(sequelize);

// Deep Research Phase 12 — cross-phase tenant backfill + LLM provenance hardening.
const PromptProvenance = require('./PromptProvenance')(sequelize);
const AssetMigration = require('./AssetMigration')(sequelize);
const RbacCoverage = require('./RbacCoverage')(sequelize);
const GovernanceIntegrity = require('./GovernanceIntegrity')(sequelize);
const SlaEmailEvent = require('./SlaEmailEvent')(sequelize);
const AuditArchive = require('./AuditArchive')(sequelize);
const PermissionCache = require('./PermissionCache')(sequelize);
const StreamMetric = require('./StreamMetric')(sequelize);

// Deep Research Phase 13 — cross-phase provenance completion + governance consistency.
const CrossProvenance = require('./CrossProvenance')(sequelize);
const OperationalLineage = require('./OperationalLineage')(sequelize);
const GovernanceDrift = require('./GovernanceDrift')(sequelize);
const ApprovalLineage = require('./ApprovalLineage')(sequelize);
const ReplayEvent = require('./ReplayEvent')(sequelize);
const PermissionIntegrity = require('./PermissionIntegrity')(sequelize);
const StreamIntegrity = require('./StreamIntegrity')(sequelize);
const GovernanceConsistency = require('./GovernanceConsistency')(sequelize);

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
  ReportVersion,
  SignalCorrelation,
  MonetizationModel,
  AiProviderLog,
  BriefingSubscription,
  VentureLifecycleEvent,
  ExecutionReadiness,
  MvpPlan,
  LaunchStrategy,
  DeploymentReadiness,
  ExecutionQueueItem,
  PortfolioScore,
  ResourceCapacitySnapshot,
  VentureDependency,
  InfrastructureOverlap,
  RoiForecast,
  ConfidenceHistory,
  ReassessmentEvent,
  VentureTemplate,
  TemporalSnapshot,
  EcosystemMetric,
  VentureTrajectory,
  DecisionAccuracy,
  PredictiveCapacity,
  DriftAlert,
  SignalHistory,
  DependencyEdge,
  AdaptiveRefreshRun,
  RefreshHistory,
  InterventionRecommendation,
  StrategicRecommendation,
  VentureHealthHistory,
  ForecastAccuracy,
  OperationalDrift,
  DependencyReview,
  OpportunityTraceability,
  CustomResearchRun,
  PursuitWorkspace,
  OpportunityRelationship,
  JustificationRecord,
  OpportunityGraphEdge,
  ProposalAccelerationAsset,
  ClusterDrilldown,
  PursuitActivation,
  ReviewQueueHandoff,
  ProposalReadinessScore,
  VentureConflict,
  CaptureStrategy,
  OpportunityExpansion,
  ResearchRevenueLink,
  SubmissionReadinessArtifact,
  RfpAttachment,
  ProposalArtifact,
  ComplianceMatrix,
  ComplianceMatrixItem,
  SubmissionPackage,
  ProposalTimelineEvent,
  ComplianceGap,
  ParallelDraftJob,
  WorkerJob,
  ProposalExecutionQueue,
  ArtifactLifecycleEvent,
  SlaEvent,
  QueueMetric,
  StorageAsset,
  ExecutionFailure,
  OperationalMetric,
  // Phase 11
  AuditEvent,
  EventLineage,
  WorkflowAssignment,
  SlaAcknowledgement,
  TenantSettings,
  OperatorPermission,
  GovernanceEvent,
  ObservabilityStream,
  // Phase 12
  PromptProvenance,
  AssetMigration,
  RbacCoverage,
  GovernanceIntegrity,
  SlaEmailEvent,
  AuditArchive,
  PermissionCache,
  StreamMetric,
  // Phase 13
  CrossProvenance,
  OperationalLineage,
  GovernanceDrift,
  ApprovalLineage,
  ReplayEvent,
  PermissionIntegrity,
  StreamIntegrity,
  GovernanceConsistency,
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
