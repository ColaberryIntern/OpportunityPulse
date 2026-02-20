'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add momentum columns to ai_tools
    await queryInterface.addColumn('ai_tools', 'github_acceleration_score', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
    });

    await queryInterface.addColumn('ai_tools', 'funding_score', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
    });

    await queryInterface.addColumn('ai_tools', 'enterprise_signal_score', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
    });

    await queryInterface.addColumn('ai_tools', 'social_velocity_score', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
    });

    await queryInterface.addColumn('ai_tools', 'composite_momentum_score', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
    });

    await queryInterface.addColumn('ai_tools', 'momentum_stage', {
      type: Sequelize.STRING(20),
      defaultValue: 'emerging',
    });

    await queryInterface.addColumn('ai_tools', 'open_source', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });

    await queryInterface.addColumn('ai_tools', 'github_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    await queryInterface.addColumn('ai_tools', 'domain_focus', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('ai_tools', 'capability_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ai_capabilities', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('ai_tools', 'launch_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    // Create tool_signals table
    await queryInterface.createTable('tool_signals', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      ai_tool_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'ai_tools', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      signal_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      signal_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },
      signal_delta: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      source_data: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('ai_tools', ['composite_momentum_score'], {
      name: 'idx_ai_tools_composite_momentum',
    });

    await queryInterface.addIndex('ai_tools', ['momentum_stage'], {
      name: 'idx_ai_tools_momentum_stage',
    });

    await queryInterface.addIndex('ai_tools', ['capability_id'], {
      name: 'idx_ai_tools_capability_id',
    });

    await queryInterface.addIndex('tool_signals', ['ai_tool_id'], {
      name: 'idx_tool_signals_tool_id',
    });

    await queryInterface.addIndex('tool_signals', ['signal_type'], {
      name: 'idx_tool_signals_type',
    });

    await queryInterface.addIndex('tool_signals', ['created_at'], {
      name: 'idx_tool_signals_created_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tool_signals', 'idx_tool_signals_created_at');
    await queryInterface.removeIndex('tool_signals', 'idx_tool_signals_type');
    await queryInterface.removeIndex('tool_signals', 'idx_tool_signals_tool_id');
    await queryInterface.removeIndex('ai_tools', 'idx_ai_tools_capability_id');
    await queryInterface.removeIndex('ai_tools', 'idx_ai_tools_momentum_stage');
    await queryInterface.removeIndex('ai_tools', 'idx_ai_tools_composite_momentum');

    await queryInterface.dropTable('tool_signals');

    await queryInterface.removeColumn('ai_tools', 'launch_date');
    await queryInterface.removeColumn('ai_tools', 'capability_id');
    await queryInterface.removeColumn('ai_tools', 'domain_focus');
    await queryInterface.removeColumn('ai_tools', 'github_url');
    await queryInterface.removeColumn('ai_tools', 'open_source');
    await queryInterface.removeColumn('ai_tools', 'momentum_stage');
    await queryInterface.removeColumn('ai_tools', 'composite_momentum_score');
    await queryInterface.removeColumn('ai_tools', 'social_velocity_score');
    await queryInterface.removeColumn('ai_tools', 'enterprise_signal_score');
    await queryInterface.removeColumn('ai_tools', 'funding_score');
    await queryInterface.removeColumn('ai_tools', 'github_acceleration_score');
  },
};
