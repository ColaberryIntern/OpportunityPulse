import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, USER_EMAIL, USER_PASSWORD } from './k6-config.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

function login() {
  const res = http.post(`${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'login successful': (r) => r.status === 200 });
  const body = JSON.parse(res.body);
  return body.data?.accessToken;
}

export default function () {
  const token = login();
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  group('Dashboard', () => {
    const res = http.get(`${BASE_URL}/api/v1/dashboard/stats`, { headers });
    check(res, { 'dashboard stats 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Opportunities', () => {
    const res = http.get(`${BASE_URL}/api/v1/opportunities?page=1&limit=10`, { headers });
    check(res, { 'opportunities 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Search', () => {
    const res = http.get(`${BASE_URL}/api/v1/search?q=technology&page=1&limit=10`, { headers });
    check(res, { 'search 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Recommendations', () => {
    const res = http.get(`${BASE_URL}/api/v1/recommendations?limit=5`, { headers });
    check(res, { 'recommendations 200': (r) => r.status === 200 });
    sleep(1);
  });

  group('Notifications', () => {
    const res = http.get(`${BASE_URL}/api/v1/notifications/unread-count`, { headers });
    check(res, { 'notifications 200': (r) => r.status === 200 });
    sleep(1);
  });

  sleep(2);
}
