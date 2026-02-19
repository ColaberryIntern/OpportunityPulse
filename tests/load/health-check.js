import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './k6-config.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 users
    { duration: '1m', target: 20 },    // stay at 20 users
    { duration: '30s', target: 50 },   // ramp up to 50 users
    { duration: '1m', target: 50 },    // stay at 50
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
    http_req_failed: ['rate<0.01'],   // less than 1% errors
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
  sleep(1);
}
