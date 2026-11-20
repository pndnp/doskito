import { expect, test } from 'vitest';

test('integration test environment is configured', () => {
  expect(import.meta.env.MODE).toBe('test');
});
