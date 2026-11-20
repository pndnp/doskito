import { randomInt } from 'node:crypto';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_SLUG_LENGTH = 8;
const DEFAULT_MAX_ATTEMPTS = 10;

export interface SlugOptions {
  length?: number;
  maxAttempts?: number;
}

export function generateSlug(length = DEFAULT_SLUG_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('Длина slug должна быть положительным целым числом');
  }
  return Array.from({ length }, () => SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]).join('');
}

export async function generateUniqueSlug(
  isTaken: (slug: string) => Promise<boolean>,
  options: SlugOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('Число попыток должно быть положительным целым числом');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = generateSlug(options.length);
    if (!(await isTaken(slug))) return slug;
  }
  throw new Error('Не удалось сгенерировать уникальный slug');
}

export function hashColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 60%)`;
}
