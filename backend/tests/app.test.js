const request = require('supertest');
const createApp = require('../src/app');

describe('HTTP foundation', () => {
  const app = createApp();

  test('returns a health response', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'Nexora-api',
    });
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  test('uses the central not-found response for unknown routes', async () => {
    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('does not require authentication for unknown API routes', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('rejects malformed JSON with a client error', async () => {
    const response = await request(app)
      .post('/api/missing')
      .set('Content-Type', 'application/json')
      .send('{invalid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});
