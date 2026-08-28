import { Prisma } from "@prisma/client";

export const PASSWORD_SALT_ROUNDS = 10;

export const isUniqueConstraintError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

export const hasUniqueConstraintField = (error: unknown, fieldName: string): boolean => {
  if (!isUniqueConstraintError(error)) {
    return false;
  }

  const target = error.meta?.target;
  const normalizedFieldName = fieldName.toLowerCase();

  if (Array.isArray(target)) {
    return target.some((field) => String(field).toLowerCase() === normalizedFieldName);
  }

  return String(target).toLowerCase().includes(normalizedFieldName);
};
