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
