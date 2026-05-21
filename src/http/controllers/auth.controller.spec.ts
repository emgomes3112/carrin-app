import { test, expect, vi, describe, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('Register Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 409 if e-mail already exists', async () => {
    // Make sure fastify is ready before testing
    await app.ready();

    // Mock prisma to return an existing user with the same email
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'existing-id',
      email: 'johndoe@example.com',
      name: 'John Doe',
      passwordHash: 'hashed-password',
      phone: '123456789',
      documentCpf: '12345678901',
      userType: 'CLIENT',
      avatarUrl: null,
      averageRating: 5 as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app.server)
      .post('/auth/register')
      .send({
        name: 'John Doe',
        email: 'johndoe@example.com',
        password: 'password123',
        phone: '987654321',
        documentCpf: '10987654321',
        userType: 'CLIENT',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'E-mail already exists.' });
  });
});
