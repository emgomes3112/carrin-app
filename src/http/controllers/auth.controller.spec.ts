import { test, expect, vi, describe, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';

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
    await app.ready();

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
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'CLIENT',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'E-mail already exists.' });
  });

  test('should return 409 if phone already exists', async () => {
    await app.ready();

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // email check
      .mockResolvedValueOnce({
        id: 'existing-id',
        email: 'other@example.com',
        name: 'John Doe',
        passwordHash: 'hashed-password',
        phone: '11987654321',
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
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'CLIENT',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'Phone already exists.' });
  });

  test('should return 409 if CPF already exists', async () => {
    await app.ready();

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // email check
      .mockResolvedValueOnce(null) // phone check
      .mockResolvedValueOnce({
        id: 'existing-id',
        email: 'other@example.com',
        name: 'John Doe',
        passwordHash: 'hashed-password',
        phone: '11987654322',
        documentCpf: '10987654321',
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
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'CLIENT',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'CPF already exists.' });
  });

  test('should block registration of ADMIN users via public route', async () => {
    await app.ready();
    const response = await request(app.server)
      .post('/auth/register')
      .send({
        name: 'John Admin',
        email: 'admin@example.com',
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'ADMIN',
      });
    expect(response.status).toBe(400);
  });

  test('should successfully register a CLIENT user and mask data', async () => {
    await app.ready();

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce({
      id: 'new-id',
      email: 'new@example.com',
      name: 'New Client',
      passwordHash: 'hashed-password',
      phone: '11987654321',
      documentCpf: '10987654321',
      userType: 'CLIENT',
      avatarUrl: null,
      averageRating: 5 as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app.server)
      .post('/auth/register')
      .send({
        name: 'New Client',
        email: 'new@example.com',
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'CLIENT',
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toBeDefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.documentCpf).toBe('***.***.***-**');
    expect(response.body.user.phone).toBe('(***) *****-4321');
  });

  test('should successfully register a PARTNER user', async () => {
    await app.ready();

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce({
      id: 'partner-id',
      email: 'partner@example.com',
      name: 'Partner User',
      passwordHash: 'hashed-password',
      phone: '11987654321',
      documentCpf: '10987654321',
      userType: 'PARTNER',
      avatarUrl: null,
      averageRating: 5 as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app.server)
      .post('/auth/register')
      .send({
        name: 'Partner User',
        email: 'partner@example.com',
        password: 'Password123',
        phone: '11987654321',
        documentCpf: '10987654321',
        userType: 'PARTNER',
        bankAgency: '1234',
        bankAccount: '12345-6',
        pixKey: 'pix@example.com',
      });

    expect(response.status).toBe(201);
  });
});

describe('Login Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return JWT token and masked user on success', async () => {
    await app.ready();

    const password = 'Password123';
    const passwordHash = await bcrypt.hash(password, 1);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'valid-id',
      email: 'valid@example.com',
      name: 'Valid User',
      passwordHash,
      phone: '11987654321',
      documentCpf: '10987654321',
      userType: 'CLIENT',
      avatarUrl: null,
      averageRating: 5 as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app.server)
      .post('/auth/login')
      .send({
        email: 'valid@example.com',
        password: password,
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user).toBeDefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.documentCpf).toBe('***.***.***-**');
  });

  test('should return 401 on wrong credentials', async () => {
    await app.ready();

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const response = await request(app.server)
      .post('/auth/login')
      .send({
        email: 'notfound@example.com',
        password: 'WrongPassword123',
      });

    expect(response.status).toBe(401);
  });
});
