import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { maskUserData } from '../../utils/mask-user-data.js';
import { AuthService } from '../../services/auth.service.js';
import { UserAlreadyExistsError } from '../../services/errors/user-already-exists-error.js';
import { InvalidCredentialsError } from '../../services/errors/credentials-invalid-error.js';
import { env } from '../../env.js';

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const registerBodySchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8).regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    phone: z.string().min(10).max(15), // Basic validation, adjust regex for specific country if needed
    documentCpf: z.string().length(11).regex(/^\d+$/, 'CPF must contain only digits'),
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

  const parsed = registerBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({ message: 'Validation error.', issues: JSON.parse(parsed.error.message) });
  }

  const data = parsed.data;

  try {
    const authService = new AuthService();
    const user = await authService.register(data);

    const maskedUser = maskUserData(user);

    return reply.status(201).send({ user: maskedUser });
  } catch (err) {
    if (err instanceof UserAlreadyExistsError) {
      return reply.status(409).send({ message: err.message });
    }
    console.error(err);
    return reply.status(500).send({ message: 'Internal server error.' });
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authenticateBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = authenticateBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({ message: 'Validation error.', issues: JSON.parse(parsed.error.message) });
  }

  const { email, password } = parsed.data;

  try {
    const authService = new AuthService();
    const user = await authService.authenticate({ email, password });

    const token = await reply.jwtSign(
      {
        userType: user.userType,
      },
      {
        sign: {
          sub: user.id,
          expiresIn: env.JWT_EXPIRES_IN,
        },
      },
    );

    const maskedUser = maskUserData(user);

    return reply.status(200).send({
      token,
      user: maskedUser
    });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return reply.status(401).send({ message: err.message });
    }
    console.error(err);
    return reply.status(500).send({ message: 'Internal server error.' });
  }
}
