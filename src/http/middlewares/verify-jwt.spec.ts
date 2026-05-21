import { test, expect, describe } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { verifyJwt } from './verify-jwt.js';

describe('Verify JWT Middleware', () => {
  test('should verify valid token', async () => {
    app.get('/test-jwt', { onRequest: [verifyJwt] }, async (request, reply) => {
      return reply.status(200).send({ ok: true, user: request.user });
    });

    await app.ready();

    const token = app.jwt.sign({ userType: 'CLIENT' }, { sub: '123' });

    const response = await request(app.server)
      .get('/test-jwt')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, user: { userType: 'CLIENT', sub: '123', iat: expect.any(Number) } });
  });

  test('should reject missing token', async () => {
    await app.ready();
    const response = await request(app.server).get('/test-jwt');
    expect(response.status).toBe(401);
  });

  test('should reject invalid token', async () => {
    await app.ready();
    const response = await request(app.server)
        .get('/test-jwt')
        .set('Authorization', `Bearer invalid-token`);
    expect(response.status).toBe(401);
  });
});
