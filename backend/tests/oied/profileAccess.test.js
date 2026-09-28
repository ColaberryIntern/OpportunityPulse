// Route-level access test for the per-org business profile.
//
// Every customer account currently lives in org 1 with Colaberry (registration
// never assigns an organization), so a non-admin reading or writing "their"
// profile would read or overwrite Colaberry's. These routes are admin-only
// until customers get their own organizations.

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const SECRET = 'profile-access-test-secret-minimum-32-chars';
const API_KEY = 'k'.repeat(48);

// Stub every controller the router wires up: this test is about the gate in
// front of the handlers, not the handlers. Any handler that runs replies 200.
function mockStubController() {
  return new Proxy({}, {
    get: (_target, name) => (req, res) => res.status(200).json({ handler: String(name) }),
  });
}
jest.mock('../../src/oied/oied.controller', () => mockStubController());
jest.mock('../../src/oied/intelligence.controller', () => mockStubController());
jest.mock('../../src/oied/partner.controller', () => mockStubController());
jest.mock('../../src/oied/research.controller', () => mockStubController());

let app;
beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
  process.env.OIED_INTELLIGENCE_API_KEY = API_KEY;
  const router = require('../../src/oied/oied.routes');
  app = express();
  app.use(express.json());
  app.use('/api/v1/oied', router);
});

afterAll(() => {
  delete process.env.OIED_INTELLIGENCE_API_KEY;
});

const tokenFor = (role) => jwt.sign({ userId: 7, email: 'u@example.com', role }, SECRET);
const PROFILE = '/api/v1/oied/profile';
const BODY = { services: ['AI'], industries: ['Government'] };

describe('GET /oied/profile', () => {
  it('lets an admin read the profile', async () => {
    const res = await request(app).get(PROFILE).set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getMyProfile');
  });

  it('lets the intelligence bridge API key read it (authenticates as admin)', async () => {
    const res = await request(app).get(PROFILE).set('Authorization', `Bearer ${API_KEY}`);
    expect(res.status).toBe(200);
  });

  it('refuses a customer (consultant) with 403 — the org-1 profile is Colaberry\'s', async () => {
    const res = await request(app).get(PROFILE).set('Authorization', `Bearer ${tokenFor('consultant')}`);
    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it('refuses an anonymous request with 401', async () => {
    const res = await request(app).get(PROFILE);
    expect(res.status).toBe(401);
  });
});

describe.each(['post', 'patch'])('%s /oied/profile', (method) => {
  it('lets an admin save the profile', async () => {
    const res = await request(app)[method](PROFILE)
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send(BODY);
    expect(res.status).toBe(200);
  });

  ['consultant', 'auditor', 'devops'].forEach((role) => {
    it(`refuses ${role} with 403 and never reaches the handler`, async () => {
      const res = await request(app)[method](PROFILE)
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .send(BODY);
      expect(res.status).toBe(403);
      expect(res.body.handler).toBeUndefined();
    });
  });

  it('refuses a token with no role', async () => {
    const token = jwt.sign({ userId: 7 }, SECRET);
    const res = await request(app)[method](PROFILE)
      .set('Authorization', `Bearer ${token}`)
      .send(BODY);
    expect(res.status).toBe(401);
  });

  it('refuses a forged token', async () => {
    const forged = jwt.sign({ userId: 7, role: 'admin' }, 'some-other-secret-that-is-long-enough');
    const res = await request(app)[method](PROFILE)
      .set('Authorization', `Bearer ${forged}`)
      .send(BODY);
    expect(res.status).toBe(401);
  });
});
