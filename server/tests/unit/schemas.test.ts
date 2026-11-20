import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boardSchema,
  parseStoredJson,
  parsedDraftSchema,
  parsedFieldsSchema,
  taskSchema,
} from '../../src/schemas.js';

const timestamps = {
  createdAt: '2026-11-19T12:00:00.000Z',
  updatedAt: '2026-11-19T12:00:00.000Z',
};

test('общие Board/Task/Draft Zod-схемы принимают валидные доменные объекты', () => {
  const board = boardSchema.parse({
    id: 'board-id',
    slug: 'a7f3b9c1',
    name: ' Моя доска ',
    color: '#B69CFF',
    columns: [{ id: 'todo', title: 'Сделать', order: 0 }],
    deletedAt: null,
    ...timestamps,
  });
  assert.equal(board.name, 'Моя доска');

  const task = taskSchema.parse({
    id: 'task-id',
    boardId: board.id,
    title: 'Подготовить релиз',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-11-20',
    tags: ['release'],
    order: 0,
    ...timestamps,
  });
  assert.equal(task.priority, 'high');

  const draft = parsedDraftSchema.parse({
    id: 'draft-id',
    boardId: board.id,
    clientId: '9f43a510-eb58-4f95-a957-892bfc980a25',
    rawText: 'Подготовить релиз',
    parsedFields: {
      title: 'Подготовить релиз',
      priority: 'high',
      dueDate: null,
      tags: [],
      subTasks: [],
    },
    status: 'PENDING',
    expiresAt: '2026-11-19T12:30:00.000Z',
    finalizedTaskIds: [],
    ...timestamps,
  });
  assert.equal(draft.status, 'PENDING');
});

test('Task-схема отклоняет неверные enum, дату, теги и границы title', () => {
  const task = {
    id: 'task-id',
    boardId: 'board-id',
    title: 'Задача',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    tags: [],
    order: 0,
    ...timestamps,
  };
  for (const patch of [
    { title: '' },
    { title: 'a'.repeat(201) },
    { status: 'unknown' },
    { priority: 'urgent' },
    { dueDate: '20.11.2026' },
    { dueDate: '2026-02-30' },
    { tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`) },
    { tags: ['same', 'same'] },
    { tags: ['a'.repeat(31)] },
  ]) {
    assert.equal(taskSchema.safeParse({ ...task, ...patch }).success, false, JSON.stringify(patch));
  }
});

test('Draft-схема ограничивает список десятью непустыми подзадачами', () => {
  const parsedFields = {
    title: 'Задача',
    priority: 'medium',
    dueDate: null,
    tags: [],
    subTasks: [],
  };
  assert.equal(
    parsedFieldsSchema.safeParse({ ...parsedFields, subTasks: [{ title: '' }] }).success,
    false,
  );
  assert.equal(
    parsedFieldsSchema.safeParse({
      ...parsedFields,
      subTasks: Array.from({ length: 11 }, () => ({ title: 'Подзадача' })),
    }).success,
    false,
  );
});

test('parseStoredJson не пропускает повреждённый или невалидный JSON', () => {
  assert.throws(() => parseStoredJson('{broken', parsedFieldsSchema), /некорректный JSON/);
  assert.throws(() => parseStoredJson('{}', parsedFieldsSchema));
});
