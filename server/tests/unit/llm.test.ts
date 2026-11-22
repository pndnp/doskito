import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLLMResponse, LLMProvider } from '../../src/services/llm.js';
import type { LlmUsage } from '../../src/services/llm.js';

const VALID_LLM_RESPONSE = {
  title: 'Подготовка релиза',
  priority: 'high',
  dueDate: '2026-11-20',
  tags: ['release', 'planning'],
  subTasks: [{ title: 'Согласовать релиз' }, { title: 'Подготовить ченджлог' }],
};

function fakeFetch(responsesSpec: Array<{ status?: number; body: unknown }>): {
  fetchImpl: typeof fetch;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  let index = 0;
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url, init });
    const response = responsesSpec[index];
    index += 1;
    const status = response?.status ?? 200;
    const body =
      status === 200 ? JSON.stringify(response?.body ?? {}) : JSON.stringify({ error: 'failed' });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('нормализация: обязательный title, fallback priority/dueDate, ограничение подзадач', () => {
  const { fields, subTasksTruncated } = normalizeLLMResponse({
    title: '  Задача  ',
    priority: 'unknown',
    dueDate: '31.12.2026',
    tags: ['a', '', 'b', 'b', 42, 'c'],
    subTasks: Array.from({ length: 12 }, (_, index) => ({ title: `Подзадача ${index + 1}` })),
  });
  assert.equal(fields.title, 'Задача');
  assert.equal(fields.priority, 'medium');
  assert.equal(fields.dueDate, null);
  assert.deepEqual(fields.tags, ['a', 'b', 'c']);
  assert.equal(fields.subTasks.length, 10);
  assert.equal(subTasksTruncated, true);
});

test('нормализация отклоняет ответ без title', () => {
  assert.throws(() => normalizeLLMResponse({ priority: 'high' }), /title/);
  assert.throws(() => normalizeLLMResponse('строка'), /объект/);
});

test('LLMProvider повторяет попытку при invalid JSON и 5xx, максимум 2 попытки', async () => {
  const usage: LlmUsage[] = [];
  const log = (entry: LlmUsage) => usage.push(entry);
  const delays: number[] = [];
  const callsBeforeSleeps: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
    callsBeforeSleeps.push(success.calls.length);
  };

  // Попытка 1: invalid JSON, попытка 2: валидный ответ
  const success = fakeFetch([
    { body: { choices: [{ message: { content: 'не JSON' } }] } },
    { body: { choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }] } },
  ]);
  const provider1 = new LLMProvider({ fetchImpl: success.fetchImpl, log, sleep });
  const result = await provider1.parse('Подготовить релиз к пятнице');
  assert.equal(result.fields.title, 'Подготовка релиза');
  assert.equal(success.calls.length, 2);
  assert.deepEqual(delays, [250]);
  assert.deepEqual(callsBeforeSleeps, [1]);
  assert.equal(usage.length, 2); // логируется каждая успешная попытка
  assert.equal(usage.at(-1)?.attempt, 2);
  assert.equal(usage.at(-1)?.promptTokens, null);

  // Обе попытки с 5xx → LLMUnavailableError
  const failing = fakeFetch([
    { status: 500, body: null },
    { status: 503, body: null },
  ]);
  const provider2 = new LLMProvider({ fetchImpl: failing.fetchImpl, log, sleep });
  await assert.rejects(provider2.parse('текст'), /LLM недоступна/);
  assert.equal(failing.calls.length, 2);
  assert.deepEqual(delays, [250, 250]);
});

test('request body содержит system/user messages, JSON response format и ключ', async () => {
  const previousKey = process.env.NEURALDEEP_API_KEY;
  process.env.NEURALDEEP_API_KEY = 'test-key';
  const { fetchImpl, calls } = fakeFetch([
    { body: { choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }] } },
  ]);
  const provider = new LLMProvider({ fetchImpl });
  await provider.parse('Подготовить релиз');
  process.env.NEURALDEEP_API_KEY = previousKey;
  const init = calls[0]?.init as RequestInit;
  const body = JSON.parse(init.body as string) as {
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string };
  };
  assert.equal(body.response_format.type, 'json_object');
  const roles = body.messages.map((message) => message.role);
  assert.deepEqual(roles, ['system', 'user']);
  assert.equal(body.messages[1]?.content, 'Подготовить релиз');
  const headers = new Headers(init.headers as ConstructorParameters<typeof Headers>[0]);
  const auth = headers.get('authorization') ?? '';
  assert.ok(auth.startsWith('Bearer '), `authorization должен быть Bearer-токеном: ${auth}`);
  assert.ok(auth.length > 'Bearer '.length, 'токен не должен быть пустым');
});
