import { BadRequestException } from '@nestjs/common';

export function validatePasswordOrThrow(password?: string) {
  const nextPassword = password?.trim() ?? '';

  if (
    nextPassword.length < 8 ||
    !/\d/.test(nextPassword) ||
    !/[A-Z]/.test(nextPassword)
  ) {
    throw new BadRequestException(
      'La contrasena debe tener 8 caracteres, 1 numero y 1 mayuscula',
    );
  }

  return nextPassword;
}
