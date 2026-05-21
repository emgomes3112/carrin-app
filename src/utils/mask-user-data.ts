import type { User } from '@prisma/client';

export function maskUserData(user: User): Omit<User, 'passwordHash' | 'phone' | 'documentCpf'> & { phone: string, documentCpf: string } {
  const { passwordHash, ...userWithoutPassword } = user;

  let maskedPhone = userWithoutPassword.phone;
  if (maskedPhone && maskedPhone.length > 4) {
    const lastFour = maskedPhone.slice(-4);
    maskedPhone = `(***) *****-${lastFour}`;
  }

  let maskedCpf = userWithoutPassword.documentCpf;
  if (maskedCpf && maskedCpf.length === 11) {
    maskedCpf = `***.***.***-**`;
  }

  return {
    ...userWithoutPassword,
    phone: maskedPhone,
    documentCpf: maskedCpf,
  };
}
