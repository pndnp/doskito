import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();
let activePrisma: PrismaClient = defaultPrisma;

export const prisma = defaultPrisma;

/** Подмена активного клиента — используется тестами для изолированной БД. */
export function setPrismaClient(client: PrismaClient): void {
  activePrisma = client;
}

export function getPrisma(): PrismaClient {
  return activePrisma;
}

export function resetPrismaClient(): void {
  activePrisma = defaultPrisma;
}
