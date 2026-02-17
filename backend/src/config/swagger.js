const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Opportunity Pulse API',
      version: '1.0.0',
      description: 'AI-powered platform for government contracts, AI jobs, and investment opportunities',
      contact: { name: 'Opportunity Pulse Team' },
    },
    servers: [
      { url: '/api/v1', description: 'API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    './src/docs/api-schemas.js',
    './src/auth/auth.routes.js',
    './src/roleManager/role.routes.js',
    './src/dashboard/dashboard.routes.js',
    './src/contentManager/content.routes.js',
    './src/search/search.routes.js',
    './src/opportunities/opportunity.routes.js',
    './src/ingestion/ingestion.routes.js',
    './src/analysis/analysis.routes.js',
    './src/alerts/alert.routes.js',
    './src/public/public.routes.js',
    './src/alertPreferences/alertPref.routes.js',
    './src/feedbackManager/feedback.routes.js',
    './src/forums/forum.routes.js',
    './src/server.js',
  ],
};

module.exports = swaggerJsdoc(options);
