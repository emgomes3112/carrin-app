import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { maskUserData } from '../../utils/mask-user-data.js';
import { Prisma } from '@prisma/client';

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const registerBodySchema = z.object({
    name: z.string(),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string(),
    documentCpf: z.string(),
    userType: z.enum(['CLIENT', 'PARTNER']),
    avatarUrl: z.string().url().optional(),

    // Partner specific fields
    bankAgency: z.string().optional(),
    bankAccount: z.string().optional(),
    pixKey: z.string().optional(),
  }).refine(data => {
    if (data.userType === 'PARTNER') {
      return data.bankAgency && data.bankAccount && data.pixKey;
    }
    return true;
  }, {
    message: "Bank details (agency, account, pixKey) are required for partners.",
    path: ["userType"],
  });

  const data = registerBodySchema.parse(request.body);

  const userWithSameEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (userWithSameEmail) {
    return reply.status(409).send({ message: 'E-mail already exists.' });
  }

  const userWithSamePhone = await prisma.user.findUnique({
    where: { phone: data.phone },
  });

  if (userWithSamePhone) {
    return reply.status(409).send({ message: 'Phone already exists.' });
  }

  const userWithSameCpf = await prisma.user.findUnique({
    where: { documentCpf: data.documentCpf },
  });

  if (userWithSameCpf) {
    return reply.status(409).send({ message: 'CPF already exists.' });
  }

  const passwordHash = await bcrypt.hash(data.password, 6);

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          phone: data.phone,
          documentCpf: data.documentCpf,
          userType: data.userType,
          avatarUrl: data.avatarUrl ?? null,
        },
      });

      if (data.userType === 'PARTNER') {
        await tx.partnerProfile.create({
          data: {
            id: createdUser.id,
            bankAgency: data.bankAgency!,
            bankAccount: data.bankAccount!,
            pixKey: data.pixKey!,
          },
        });
      }

      return createdUser;
    });

    const maskedUser = maskUserData(user);

    return reply.status(201).send({ user: maskedUser });
  } catch (err) {
      console.error(err);
      return reply.status(500).send({ message: 'Internal server error.' });
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authenticateBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const { email, password } = authenticateBodySchema.parse(request.body);

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    return reply.status(400).send({ message: 'Invalid credentials.' });
  }

  const doesPasswordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!doesPasswordMatch) {
    return reply.status(400).send({ message: 'Invalid credentials.' });
  }

  const token = await reply.jwtSign(
    {
      userType: user.userType,
    },
    {
      sign: {
        sub: user.id,
      },
    },
  );

  const maskedUser = maskUserData(user);

  return reply.status(200).send({
    token,
    user: maskedUser
  });
}
