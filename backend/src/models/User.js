const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    interests: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    profileData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'profile_data',
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'email_verified',
    },
    verificationToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'verification_token',
    },
    resetToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reset_token',
    },
    resetTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reset_token_expiry',
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2, // consultant
      field: 'role_id',
      references: {
        model: 'user_roles',
        key: 'id',
      },
    },
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.passwordHash) {
          const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
          user.passwordHash = await bcrypt.hash(user.passwordHash, rounds);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('passwordHash')) {
          const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
          user.passwordHash = await bcrypt.hash(user.passwordHash, rounds);
        }
      },
    },
  });

  User.prototype.validatePassword = async function (password) {
    return bcrypt.compare(password, this.passwordHash);
  };

  User.prototype.toSafeJSON = function () {
    const values = { ...this.get() };
    delete values.passwordHash;
    delete values.verificationToken;
    delete values.resetToken;
    delete values.resetTokenExpiry;
    return values;
  };

  User.associate = (models) => {
    User.belongsTo(models.UserRole, { foreignKey: 'role_id', as: 'role' });
    User.hasMany(models.Content, { foreignKey: 'user_id', as: 'content' });
    User.hasMany(models.UserActivity, { foreignKey: 'user_id', as: 'activities' });
    User.hasMany(models.Feedback, { foreignKey: 'user_id', as: 'feedback' });
    User.hasMany(models.Subscription, { foreignKey: 'user_id', as: 'subscriptions' });
    User.hasOne(models.AlertPreference, { foreignKey: 'user_id', as: 'alertPreference' });
    User.hasOne(models.BehaviorProfile, { foreignKey: 'user_id', as: 'behaviorProfile' });
    User.hasMany(models.ForumPost, { foreignKey: 'user_id', as: 'forumPosts' });
    User.hasMany(models.Comment, { foreignKey: 'user_id', as: 'comments' });
  };

  return User;
};
