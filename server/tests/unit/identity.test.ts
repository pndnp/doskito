import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSlug, generateUniqueSlug, hashColor } from '../../src/lib/identity.js';

test('generateSlug создаёт строчный буквенно-цифровой slug из 8 символов', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateSlug(), /^[a-z0-9]{8}$/);
  }
});

test('generateUniqueSlug повторяет генерацию при коллизии и ограничивает попытки', async () => {
  const occupied = new Set<string>();
  const first = await generateUniqueSlug(async (slug) => {
    occupied.add(slug);
    return occupied.size === 1;
  });
  assert.equal(occupied.size, 2);
  assert.match(first, /^[a-z0-9]{8}$/);

  await assert.rejects(
    generateUniqueSlug(async () => true, { maxAttempts: 3 }),
    /Не удалось сгенерировать уникальный slug/,
  );
});

test('hashColor детерминирован и возвращает HSL с hue в диапазоне 0–359', () => {
  for (const name of ['Аня', 'Иван', '', '👩‍💻 Разработчик']) {
    const color = hashColor(name);
    assert.equal(color, hashColor(name));
    const match = /^hsl\((\d+), 65%, 60%\)$/.exec(color);
    assert.ok(match);
    assert.ok(Number(match[1]) >= 0 && Number(match[1]) < 360);
  }
});
