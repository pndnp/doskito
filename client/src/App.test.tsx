import { expect, test } from 'vitest';
import { App } from './App';

test('App exports a React component', () => {
  expect(App).toBeTypeOf('function');
});
