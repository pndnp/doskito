import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { MockEventSource } from './event-source';

type DomMatchers = {
  toBeInTheDocument(): void;
  toBeDisabled(): void;
  toHaveFocus(): void;
  toHaveTextContent(text: string | RegExp): void;
  toHaveAttribute(attr: string, value?: unknown): void;
  toHaveValue(value?: string | string[] | number | null): void;
};

declare module 'vitest' {
  // Параметр должен совпадать с сигнатурой Assertion из Vitest 4.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends DomMatchers {}
}

expect.extend(matchers);

vi.stubGlobal('EventSource', MockEventSource);

afterEach(() => {
  cleanup();
  MockEventSource.instances.length = 0;
});
