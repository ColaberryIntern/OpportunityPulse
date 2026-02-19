'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await queryInterface.bulkInsert('users', [
      {
        email: 'admin@opportunitypulse.com',
        password_hash: passwordHash,
        name: 'System Admin',
        company: 'Opportunity Pulse',
        email_verified: true,
        role_id: 1, // admin role
        created_at: new Date(),
        updated_at: new Date(),
      },
    ], {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@opportunitypulse.com' }, {});
  },
};
