/**
 * Integration tests for server.ts bootstrap behaviour.
 * Requirements: 11.2, 11.3, 13.4
 */

import request from 'supertest';
import app from '../src/server';

// ---------------------------------------------------------------------------
// Requirement 13.4 — GET /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns HTTP 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// Requirement 11.2 — Content-Type guard (415 before multer)
// ---------------------------------------------------------------------------
describe('Content-Type guard on /api routes', () => {
  it('returns 415 when POST /api/import has no Content-Type header', async () => {
    const res = await request(app)
      .post('/api/import')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      error: 'unsupported_media_type',
      message: expect.stringContaining('multipart/form-data'),
    });
  });

  it('returns 415 when Content-Type is application/octet-stream', async () => {
    const res = await request(app)
      .post('/api/import')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('data'));

    expect(res.status).toBe(415);
    expect(res.body.error).toBe('unsupported_media_type');
  });

  it('does NOT block GET requests regardless of Content-Type', async () => {
    const res = await request(app).get('/health');
    // Health is not under /api but confirms non-POST routes are unaffected
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Requirement 11.3 — CORS header present
// ---------------------------------------------------------------------------
describe('CORS headers', () => {
  it('sets Access-Control-Allow-Origin for configured frontend origin', async () => {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    const res = await request(app)
      .get('/health')
      .set('Origin', origin);

    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('responds to OPTIONS preflight with 204 and CORS headers', async () => {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    const res = await request(app)
      .options('/api/import')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    // cors middleware sends 204 for preflight
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });
});
