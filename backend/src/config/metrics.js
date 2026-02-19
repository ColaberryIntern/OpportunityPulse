const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register, prefix: 'op_' });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'op_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'op_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'op_active_connections',
  help: 'Number of active connections',
  registers: [register],
});

module.exports = { register, httpRequestDuration, httpRequestTotal, activeConnections };
