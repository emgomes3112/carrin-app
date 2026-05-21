import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { UserAlreadyExistsError } from './errors/user-already-exists-error.js';
import { InvalidCredentialsError } from './errors/credentials-invalid-error.js';
import { Prisma } from '@prisma/client';

export class AuthService {
  async register(data: any) {
    const userWithSameEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userWithSameEmail) {
      throw new UserAlreadyExistsError('E-mail already exists.');
    }

    const userWithSamePhone = await prisma.user.findUnique({
      where: { phone: data.phone },
    });

    if (userWithSamePhone) {
      throw new UserAlreadyExistsError('Phone already exists.');
    }

    const userWithSameCpf = await prisma.user.findUnique({
      where: { documentCpf: data.documentCpf },
    });

    if (userWithSameCpf) {
      throw new UserAlreadyExistsError('CPF already exists.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

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

    return user;
  }

  async authenticate({ email, password }: any) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const doesPasswordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!doesPasswordMatch) {
      throw new InvalidCredentialsError();
    }

    return user;
  }
}
